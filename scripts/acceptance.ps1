#Requires -Version 5.1
<#
  Post-build acceptance check ("definition of done") for the Power Platform Reimagined kit.
  One command, one verdict: is the reimagined solution actually complete on the target env?
  Read-only against Dataverse (az token). Prints PASS / WARN / FAIL and ACCEPTED / NOT ACCEPTED.

  Checks:
    1. Solution complete   - tables + code app (type 300) + connection references present
    2. Gap scan clean      - no custom <prefix>_ tables stranded outside the solution
    3. Data seeded         - every <prefix>_ table has rows (reports counts)
    4. App deployed        - code app is a solution component (optionally: play URL reachable)
    5. Publication clean   - sanitization scan finds no secrets/tenant IDs (if -PublicationPath)

  Usage:
    ./scripts/acceptance.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -SolutionUnique VirtualRounding -Prefix sh `
        -AppUrl https://apps.powerapps.com/play/e/<env>/app/<app> `
        -PublicationPath workspaces/<pilot>/publication
    ./scripts/acceptance.ps1 -IntakePath workspaces/<pilot>/intake.json -SolutionUnique <name> -Prefix <p>
#>
param(
  [string]$EnvironmentUrl,
  [string]$IntakePath,
  [Parameter(Mandatory = $true)][string]$SolutionUnique,
  [string]$Prefix,
  [string]$AppUrl,
  [string]$PublicationPath
)
$ErrorActionPreference = "Continue"
$fail = 0; $warn = 0
function Say($status, $name, $detail) {
  $color = @{ PASS = "Green"; WARN = "Yellow"; FAIL = "Red" }[$status]
  Write-Host ("[{0}] {1}" -f $status, $name) -ForegroundColor $color -NoNewline
  if ($detail) { Write-Host "  $detail" -ForegroundColor DarkGray } else { Write-Host "" }
  if ($status -eq "FAIL") { $script:fail++ } elseif ($status -eq "WARN") { $script:warn++ }
}

if ($IntakePath -and -not $EnvironmentUrl) {
  if (-not (Test-Path $IntakePath)) { Write-Host "Intake file not found: $IntakePath" -ForegroundColor Red; exit 1 }
  try { $intake = Get-Content -Raw $IntakePath | ConvertFrom-Json; $EnvironmentUrl = "$($intake.target.environmentUrl)" } catch {}
}
if (-not $EnvironmentUrl) { Write-Host "Provide -EnvironmentUrl or -IntakePath (with target.environmentUrl)." -ForegroundColor Red; exit 1 }

$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv 2>$null
if (-not $token) { Write-Host "No access token. Run: az login --tenant <target-tenant>" -ForegroundColor Red; exit 1 }
$base = "$EnvironmentUrl/api/data/v9.2"
$h = @{ Authorization = "Bearer $token"; "OData-Version" = "4.0" }
function Get-Dv($u) { Invoke-RestMethod -Uri $u -Headers $h }

Write-Host "`n== Solution: $SolutionUnique ==" -ForegroundColor Cyan
$sol = Get-Dv "$base/solutions?`$filter=uniquename eq '$SolutionUnique'&`$select=solutionid,friendlyname,ismanaged"
if ($sol.value.Count -eq 0) { Say FAIL "Solution exists" "no unmanaged solution '$SolutionUnique' in $EnvironmentUrl"; Write-Host "`nNOT ACCEPTED" -ForegroundColor Red; exit 1 }
$sid = $sol.value[0].solutionid
Say PASS "Solution exists" "$($sol.value[0].friendlyname) (managed=$($sol.value[0].ismanaged))"

$comps = (Get-Dv "$base/solutioncomponents?`$filter=_solutionid_value eq $sid&`$select=componenttype,objectid").value
$countType = { param($t) @($comps | Where-Object { [int]$_.componenttype -eq $t }).Count }
$tables = & $countType 1; $apps = & $countType 300; $connrefs = & $countType 10163; $flows = & $countType 29; $agents = & $countType 10225

Write-Host "`n== 1. Solution complete ==" -ForegroundColor Cyan
if ($tables -gt 0) { Say PASS "Tables in solution" "$tables" } else { Say FAIL "Tables in solution" "none - the data model must live in the solution" }
if ($apps -gt 0) { Say PASS "Code app in solution" "$apps (component type 300)" } else { Say FAIL "Code app in solution" "not found - add it: Solutions > $SolutionUnique > Add existing > App (or add-app-to-solution.ps1)" }
if ($agents -gt 0) { Say PASS "Copilot Studio agent(s)" "$agents (component type 10225)" }
if ($connrefs -gt 0) { Say PASS "Connection reference(s)" "$connrefs" } else { Say WARN "Connection reference(s)" "none (fine only if the app uses no connectors)" }
if ($flows -gt 0) { Say PASS "Cloud flow(s)" "$flows" } else { Say WARN "Cloud flow(s)" "none (fine if none were built)" }

# resolve custom tables for gap scan + counts
$entities = (Get-Dv "$base/EntityDefinitions?`$select=SchemaName,EntitySetName,MetadataId,IsCustomEntity").value

Write-Host "`n== 2. Gap scan ==" -ForegroundColor Cyan
if ($Prefix) {
  $inSol = @{}; ($comps | Where-Object { [int]$_.componenttype -eq 1 }) | ForEach-Object { $inSol[$_.objectid.ToLower()] = $true }
  $custom = $entities | Where-Object { $_.IsCustomEntity -and $_.SchemaName -like "${Prefix}_*" }
  $missing = $custom | Where-Object { -not $inSol[$_.MetadataId.ToLower()] }
  if ($missing) { foreach ($m in $missing) { Say FAIL "Table not in solution" "$($m.SchemaName) exists but is NOT in '$SolutionUnique'" } }
  else { Say PASS "No stranded tables" "every '${Prefix}_' table is in the solution" }
} else { Say WARN "Gap scan" "pass -Prefix to scan for custom tables outside the solution" }

Write-Host "`n== 3. Data seeded ==" -ForegroundColor Cyan
if ($Prefix) {
  $seedTables = $entities | Where-Object { $_.IsCustomEntity -and $_.SchemaName -like "${Prefix}_*" -and $_.EntitySetName }
  $total = 0
  foreach ($e in ($seedTables | Sort-Object SchemaName)) {
    try {
      $r = Get-Dv "$base/$($e.EntitySetName)?`$count=true&`$top=1"
      $c = [int]$r.'@odata.count'; $total += $c
      if ($c -gt 0) { Say PASS "Rows: $($e.SchemaName)" "$c" } else { Say WARN "Rows: $($e.SchemaName)" "0 (empty - intentional?)" }
    } catch { Say WARN "Rows: $($e.SchemaName)" "count failed: $($_.Exception.Message)" }
  }
  if ($total -eq 0) { Say FAIL "Demo data present" "no rows across '${Prefix}_' tables - seed synthetic data before calling it done" }
  else { Say PASS "Demo data present" "$total row(s) total" }
} else { Say WARN "Data seeded" "pass -Prefix to count rows in the reimagined tables" }

if ($AppUrl) {
  Write-Host "`n== 4. App reachable ==" -ForegroundColor Cyan
  try {
    $resp = Invoke-WebRequest -Uri $AppUrl -Method Head -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
    Say PASS "Play URL reachable" "HTTP $($resp.StatusCode)"
  } catch {
    $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -in 301,302,303,307,308,401,403) { Say PASS "Play URL reachable" "HTTP $code (redirect/sign-in - expected)" }
    else { Say WARN "Play URL reachable" "could not confirm ($($_.Exception.Message)) - open it in the tenant browser profile to verify render" }
  }
}

if ($PublicationPath) {
  Write-Host "`n== 5. Publication clean ==" -ForegroundColor Cyan
  if (Test-Path $PublicationPath) {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    & npm --prefix $repoRoot run reimagine -- scan --path $PublicationPath 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Say PASS "Sanitization scan" "no secrets/tenant IDs in $PublicationPath" }
    else { Say FAIL "Sanitization scan" "findings in $PublicationPath - run 'npm run reimagine -- scan --path $PublicationPath' and fix before publishing" }
  } else { Say WARN "Sanitization scan" "path not found: $PublicationPath" }
}

Write-Host ""
if ($fail -gt 0) { Write-Host "NOT ACCEPTED: $fail blocker(s), $warn warning(s). Fix the FAILs above. See docs/TROUBLESHOOTING.md." -ForegroundColor Red; exit 1 }
elseif ($warn -gt 0) { Write-Host "ACCEPTED (with $warn warning(s) to review)." -ForegroundColor Yellow }
else { Write-Host "ACCEPTED: the reimagined solution is complete and demo-ready." -ForegroundColor Green }
