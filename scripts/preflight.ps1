#Requires -Version 5.1
<#
  Phase 2 (Prepare) readiness gate for the Power Platform Reimagined kit.
  Verifies the machine, the TARGET environment, the SOURCE (per entry mode), and the
  enablement/licensing blockers BEFORE building, so the build never stalls mid-stream.
  Read-only. Prints PASS / WARN / FAIL per check.

  Usage:
    # Read everything from the wizard brief (recommended):
    ./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json

    # Or target only:
    ./scripts/preflight.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com

    # Or target + explicit source (tenant/repo/zip):
    ./scripts/preflight.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -SourceEnvironmentUrl https://<src>.crm.dynamics.com -SourceSolutionName <unique>
#>
param(
  [string]$EnvironmentUrl,
  [string]$IntakePath,
  [string]$SourceEnvironmentUrl,
  [string]$SourceSolutionName,
  [string]$SourceRepositoryUrl,
  [string]$SourceRevision,
  [string]$SourceZipPath,
  [switch]$SkipLicenseCheck
)
$ErrorActionPreference = "Continue"
$fail = 0; $warn = 0
function Say($status, $name, $detail) {
  $color = @{ PASS = "Green"; WARN = "Yellow"; FAIL = "Red" }[$status]
  Write-Host ("[{0}] {1}" -f $status, $name) -ForegroundColor $color -NoNewline
  if ($detail) { Write-Host "  $detail" -ForegroundColor DarkGray } else { Write-Host "" }
  if ($status -eq "FAIL") { $script:fail++ } elseif ($status -eq "WARN") { $script:warn++ }
}
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Get-Token($resource) {
  if (-not (Have az)) { return $null }
  return az account get-access-token --resource $resource --query accessToken -o tsv 2>$null
}

# --- Derive context from the intake brief when provided ---
$entryMode = $null; $teamsPackaging = $false
if ($IntakePath) {
  if (-not (Test-Path $IntakePath)) { Write-Host "Intake file not found: $IntakePath" -ForegroundColor Red; exit 1 }
  try { $intake = Get-Content -Raw $IntakePath | ConvertFrom-Json } catch { Write-Host "Could not parse intake JSON: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
  $entryMode = "$($intake.entryMode)"
  if (-not $EnvironmentUrl -and $intake.target.environmentUrl) { $EnvironmentUrl = "$($intake.target.environmentUrl)" }
  if ($intake.target.teamsPackaging) { $teamsPackaging = [bool]$intake.target.teamsPackaging }
  switch ($entryMode) {
    "tenant" {
      if (-not $SourceEnvironmentUrl -and $intake.source.environmentUrl) { $SourceEnvironmentUrl = "$($intake.source.environmentUrl)" }
      if (-not $SourceSolutionName -and $intake.source.solutionName) { $SourceSolutionName = "$($intake.source.solutionName)" }
    }
    "repository" {
      if (-not $SourceRepositoryUrl -and $intake.source.repository) { $SourceRepositoryUrl = "$($intake.source.repository)" }
      if (-not $SourceRevision -and $intake.source.revision) { $SourceRevision = "$($intake.source.revision)" }
    }
    "solution-zip" {
      if (-not $SourceZipPath -and $intake.source.zipPath) { $SourceZipPath = "$($intake.source.zipPath)" }
    }
  }
}
if (-not $EnvironmentUrl) { Write-Host "Provide -EnvironmentUrl or -IntakePath (with target.environmentUrl)." -ForegroundColor Red; exit 1 }

Write-Host "`n== Developer tooling ==" -ForegroundColor Cyan
if (Have node) {
  $v = (node --version).TrimStart("v"); $major = [int]($v.Split(".")[0])
  if ($major -ge 22) { Say PASS "Node.js >= 22" "v$v" } else { Say FAIL "Node.js >= 22" "found v$v (code apps need 22+)" }
} else { Say FAIL "Node.js" "not found" }
if (Have git) { Say PASS "Git" ((git --version)) } else { Say FAIL "Git" "not found" }
if (Have pac) { Say PASS "Power Platform CLI (pac)" } else { Say FAIL "Power Platform CLI (pac)" "dotnet tool install --global Microsoft.PowerApps.CLI.Tool" }
if (Have az)  { Say PASS "Azure CLI (az)" } else { Say FAIL "Azure CLI (az)" "needed for Dataverse Web API (table creation, audit)" }

Write-Host "`n== Target environment -> $EnvironmentUrl ==" -ForegroundColor Cyan
$targetHost = ([Uri]$EnvironmentUrl).Host
if (Have pac) {
  $auth = pac auth list 2>&1 | Out-String
  $activeLine = ($auth -split "`n") | Where-Object { $_ -match '^\s*\[\d+\]\s+\*' }
  if ($activeLine -and $activeLine -match [regex]::Escape($targetHost)) {
    Say PASS "pac active profile targets env" $targetHost
  } elseif ($auth -match [regex]::Escape($targetHost)) {
    Say WARN "pac profile exists but not active" "run: pac auth select (or pac auth create --environment $EnvironmentUrl)"
  } else {
    Say FAIL "pac profile for env" "run: pac auth create --environment $EnvironmentUrl"
  }
}
$token = Get-Token $EnvironmentUrl
if (Have az) {
  if ($token) { Say PASS "az token for env" } else { Say FAIL "az token for env" "run: az login --tenant <target-tenant>" }
}

Write-Host "`n== Dataverse access & role (target) ==" -ForegroundColor Cyan
$who = $null
if ($token) {
  $h = @{ Authorization = "Bearer $token"; "OData-Version" = "4.0" }
  try {
    $who = Invoke-RestMethod -Uri "$EnvironmentUrl/api/data/v9.2/WhoAmI" -Headers $h
    Say PASS "Dataverse reachable (WhoAmI)" "user $($who.UserId)"
    try {
      $roles = Invoke-RestMethod -Uri "$EnvironmentUrl/api/data/v9.2/systemusers($($who.UserId))/systemuserroles_association?`$select=name" -Headers $h
      $names = $roles.value.name
      if ($names -contains "System Administrator" -or $names -contains "System Customizer") {
        Say PASS "Maker role" (($names | Where-Object { $_ -match "System (Administrator|Customizer)" }) -join ", ")
      } else {
        Say WARN "Maker role" "no System Administrator/Customizer among: $($names -join ', ') (may block table creation)"
      }
    } catch { Say WARN "Maker role" "could not read roles: $($_.Exception.Message)" }
  } catch { Say FAIL "Dataverse reachable" $_.Exception.Message }
}

# --- Source readiness (per entry mode) ---
if ($SourceEnvironmentUrl) {
  Write-Host "`n== Source environment -> $SourceEnvironmentUrl ==" -ForegroundColor Cyan
  $sourceToken = $null
  if ($SourceEnvironmentUrl -eq $EnvironmentUrl) {
    Say PASS "Source is the target env" "no separate source sign-in needed"
    $sourceToken = $token
  } else {
    $sourceToken = Get-Token $SourceEnvironmentUrl
    if ($sourceToken) {
      Say PASS "az token for source env"
      $sh = @{ Authorization = "Bearer $sourceToken"; "OData-Version" = "4.0" }
      try {
        $swho = Invoke-RestMethod -Uri "$SourceEnvironmentUrl/api/data/v9.2/WhoAmI" -Headers $sh
        Say PASS "Source Dataverse reachable (WhoAmI)" "user $($swho.UserId)"
      } catch { Say FAIL "Source Dataverse reachable" $_.Exception.Message }
    } else {
      Say FAIL "az token for source env" "run: az login --tenant <source-tenant> (the source may be a DIFFERENT tenant than the target)"
    }
  }
  if ($SourceSolutionName -and $sourceToken) {
    $sh2 = @{ Authorization = "Bearer $sourceToken"; "OData-Version" = "4.0" }
    try {
      $sol = Invoke-RestMethod -Uri "$SourceEnvironmentUrl/api/data/v9.2/solutions?`$filter=uniquename eq '$SourceSolutionName'&`$select=friendlyname,ismanaged" -Headers $sh2
      if ($sol.value.Count -gt 0) {
        Say PASS "Source solution exists" "$($sol.value[0].friendlyname) (managed=$($sol.value[0].ismanaged))"
      } else {
        Say FAIL "Source solution exists" "no solution with uniquename '$SourceSolutionName' here (check the name and that you're signed in to the right tenant)"
      }
    } catch { Say WARN "Source solution check" "could not query solutions: $($_.Exception.Message)" }
  }
}
if ($SourceRepositoryUrl) {
  Write-Host "`n== Source repository ==" -ForegroundColor Cyan
  if (Have git) {
    $ref = if ($SourceRevision) { $SourceRevision } else { "HEAD" }
    $ls = git ls-remote $SourceRepositoryUrl $ref 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and $ls.Trim()) { Say PASS "Repo + revision reachable" "$SourceRepositoryUrl @ $ref" }
    elseif ($LASTEXITCODE -eq 0) { Say FAIL "Repo revision found" "'$ref' not found in $SourceRepositoryUrl (check the branch/tag)" }
    else { Say FAIL "Repo reachable" "git ls-remote failed (private repo? auth?): $($ls.Trim())" }
  } else { Say FAIL "Git" "not found (needed to clone the source)" }
}
if ($SourceZipPath) {
  Write-Host "`n== Source ZIP ==" -ForegroundColor Cyan
  if (Test-Path $SourceZipPath) {
    $len = (Get-Item $SourceZipPath).Length
    if ($len -gt 0) { Say PASS "Uploaded ZIP present" "$SourceZipPath ($([math]::Round($len/1KB)) KB)" }
    else { Say FAIL "Uploaded ZIP present" "file is empty: $SourceZipPath" }
  } else { Say FAIL "Uploaded ZIP present" "not found: $SourceZipPath (re-run the wizard upload)" }
}

# --- Enablement & licensing ---
Write-Host "`n== Enablement & licensing ==" -ForegroundColor Cyan
Say WARN "Code apps enabled on env (REQUIRED)" "no API to confirm - verify NOW at https://admin.powerplatform.microsoft.com > Environments > <env> > Settings > Product > Features > 'Power Apps code apps' = On. If off, the first 'pac code push' returns 403; enabling takes minutes to propagate."
Say WARN "Admin rights to enable code apps" "flipping that toggle needs a Power Platform / Dynamics 365 / Environment admin (a PPAC/tenant admin role) - which may be a DIFFERENT person than the Dataverse 'System Administrator' above."
if (-not $SkipLicenseCheck) {
  $graphToken = Get-Token "https://graph.microsoft.com"
  if ($graphToken) {
    $gh = @{ Authorization = "Bearer $graphToken" }
    try {
      $lic = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/me/licenseDetails" -Headers $gh
      $plans = @()
      foreach ($l in $lic.value) { foreach ($p in $l.servicePlans) { if ($p.provisioningStatus -eq 'Success' -and $p.servicePlanName -match 'POWERAPPS|POWERFLOW|FLOW_') { $plans += $p.servicePlanName } } }
      $plans = $plans | Select-Object -Unique
      $premium = $plans | Where-Object { $_ -match 'POWERAPPS_PER_USER|POWERAPPS_PER_APP|POWERAPPS_PREMIUM' }
      if ($premium) { Say PASS "Power Apps license (you)" ($premium -join ", ") }
      elseif ($plans.Count -gt 0) { Say WARN "Power Apps license (you)" "found Power Platform plans ($($plans -join ', ')) but no clear Premium/per-user plan - code-app END USERS need Power Apps Premium" }
      else { Say WARN "Power Apps license (you)" "no Power Apps service plans on your account - code apps need Power Apps Premium for end users" }
    } catch { Say WARN "Power Apps license (you)" "couldn't read license via Graph (consent/permission) - verify Power Apps Premium in the M365 admin center" }
  } else {
    Say WARN "Power Apps license (you)" "no Graph token (az) - run 'az login', or verify Power Apps Premium in the M365 admin center"
  }
}

if ($teamsPackaging) {
  Write-Host "`n== Teams packaging (post-deploy reminder) ==" -ForegroundColor Cyan
  Say WARN "Teams tab CSP" "after deploy, add https://teams.microsoft.com and https://*.teams.microsoft.com to the App CSP frame-ancestors (PPAC > env > Settings > Product > Privacy + Security > Content security policy > App), or the Teams tab renders blank."
}

Write-Host ""
if ($fail -gt 0) { Write-Host "PREFLIGHT: $fail FAIL, $warn WARN - resolve failures before building. See docs/TROUBLESHOOTING.md." -ForegroundColor Red; exit 1 }
elseif ($warn -gt 0) { Write-Host "PREFLIGHT: ready, with $warn warning(s) to review." -ForegroundColor Yellow }
else { Write-Host "PREFLIGHT: all green - ready to build." -ForegroundColor Green }
