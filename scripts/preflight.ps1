#Requires -Version 5.1
<#
  Phase 2 (Prepare) preflight for the Power Platform Reimagined kit.
  Verifies the machine + target environment are ready BEFORE building, so the build
  never stalls mid-stream. Read-only. Prints PASS / WARN / FAIL per check.

  Usage:
    ./scripts/preflight.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl
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

Write-Host "`n== Developer tooling ==" -ForegroundColor Cyan
if (Have node) {
  $v = (node --version).TrimStart("v"); $major = [int]($v.Split(".")[0])
  if ($major -ge 22) { Say PASS "Node.js >= 22" "v$v" } else { Say FAIL "Node.js >= 22" "found v$v (code apps need 22+)" }
} else { Say FAIL "Node.js" "not found" }
if (Have git) { Say PASS "Git" ((git --version)) } else { Say FAIL "Git" "not found" }
if (Have pac) { Say PASS "Power Platform CLI (pac)" } else { Say FAIL "Power Platform CLI (pac)" "dotnet tool install --global Microsoft.PowerApps.CLI.Tool" }
if (Have az)  { Say PASS "Azure CLI (az)" } else { Say FAIL "Azure CLI (az)" "needed for Dataverse Web API (table creation, audit)" }

Write-Host "`n== Authentication -> $EnvironmentUrl ==" -ForegroundColor Cyan
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
$token = $null
if (Have az) {
  $token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv 2>$null
  if ($token) { Say PASS "az token for env" } else { Say FAIL "az token for env" "run: az login --tenant <target-tenant>" }
}

Write-Host "`n== Dataverse access & role ==" -ForegroundColor Cyan
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

Write-Host "`n== Code apps feature ==" -ForegroundColor Cyan
Say WARN "Code apps enabled on env" "no public API to confirm; verify in PPAC > Settings > Product > Features (or it will 403 on first 'pac code push', which is a propagation delay - retry)"

Write-Host ""
if ($fail -gt 0) { Write-Host "PREFLIGHT: $fail FAIL, $warn WARN - resolve failures before building." -ForegroundColor Red; exit 1 }
elseif ($warn -gt 0) { Write-Host "PREFLIGHT: ready, with $warn warning(s) to review." -ForegroundColor Yellow }
else { Write-Host "PREFLIGHT: all green - ready to build." -ForegroundColor Green }
