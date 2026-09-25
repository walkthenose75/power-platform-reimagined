#Requires -Version 5.1
<#
  Ensure a deployed Power Apps CODE APP is a component of the target unmanaged solution.
  Run right AFTER `pac code push`. Idempotent. Requires `az login` to the target tenant.

  Why this exists: code apps are stored as `canvasapp` records (with `canvasapptype = 4`) and appear
  in a solution as component **type 300**. `pac code push --solutionName` does not always register
  the app, and the `canvasapp` record can lag the push by a few seconds. Also, the `appId` in the
  push URL (.../app/<appId>) is not guaranteed to equal the record's `canvasappid` (the value a
  solution component actually references). So this script **resolves the real `canvasappid`** (by id
  or by display name), **retries with backoff** until it appears, then adds it by that id and verifies.

  Usage:
    ./scripts/add-app-to-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -SolutionUnique <Name> -AppId <code-app-id>          # id from the `pac code push` URL
    ./scripts/add-app-to-solution.ps1 -EnvironmentUrl <url> `
        -SolutionUnique <Name> -AppName "<app display name>" # resolve by name instead
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$SolutionUnique,
  [string]$AppId,
  [string]$AppName,
  [int]$RetrySeconds = 60
)
$ErrorActionPreference = "Stop"
if (-not $AppId -and -not $AppName) { throw "Provide -AppId (from the push URL) and/or -AppName (the app's display name)." }
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw "No access token. Run: az login --tenant <target-tenant>" }
$baseUrl = "$EnvironmentUrl/api/data/v9.2"
$h = @{ Authorization = "Bearer $token"; "OData-Version" = "4.0"; "Content-Type" = "application/json" }
function Get-Dv($u) { Invoke-RestMethod -Uri $u -Headers $h }

$sol = Get-Dv "$baseUrl/solutions?`$filter=uniquename eq '$SolutionUnique'&`$select=solutionid"
if ($sol.value.Count -eq 0) { throw "Solution '$SolutionUnique' not found." }
$sid = $sol.value[0].solutionid

function Resolve-CanvasApp {
  # Returns the canvasapp record (with canvasappid) or $null. Code apps are canvasapptype = 4.
  if ($AppId) {
    $byId = Get-Dv "$baseUrl/canvasapps?`$filter=canvasappid eq $AppId&`$select=canvasappid,name,displayname,canvasapptype"
    if ($byId.value.Count -gt 0) { return $byId.value[0] }
  }
  if ($AppName) {
    $esc = $AppName.Replace("'", "''")
    $byName = Get-Dv "$baseUrl/canvasapps?`$filter=displayname eq '$esc'&`$select=canvasappid,name,displayname,canvasapptype"
    $codeApps = @($byName.value | Where-Object { $_.canvasapptype -eq 4 })
    if ($codeApps.Count -eq 1) { return $codeApps[0] }
    if ($codeApps.Count -gt 1) { Write-Host "[WARN] multiple code apps named '$AppName'; pass -AppId to disambiguate." -ForegroundColor Yellow; return $null }
    if ($byName.value.Count -eq 1) { return $byName.value[0] }
  }
  return $null
}

# The canvasapp record can lag `pac code push` — poll with backoff.
$app = $null
$deadline = (Get-Date).AddSeconds($RetrySeconds)
do {
  $app = Resolve-CanvasApp
  if ($app) { break }
  Start-Sleep 6
} while ((Get-Date) -lt $deadline)

if (-not $app) {
  Write-Host "[WARN] No canvasapp record resolved yet (id='$AppId' name='$AppName')." -ForegroundColor Yellow
  Write-Host "       Add once via portal: Solutions > $SolutionUnique > Add existing > App, then re-run to verify." -ForegroundColor DarkGray
  exit 2
}
$cid = $app.canvasappid
Write-Host "[..] resolved code app '$($app.displayname)' ($($app.name)) -> canvasappid $cid" -ForegroundColor Cyan

$already = Get-Dv "$baseUrl/solutioncomponents?`$filter=_solutionid_value eq $sid and componenttype eq 300 and objectid eq $cid&`$select=solutioncomponentid"
if ($already.value.Count -gt 0) {
  Write-Host "[SKIP] code app '$($app.displayname)' is already in '$SolutionUnique'" -ForegroundColor Yellow
  return
}

$body = @{ ComponentType = 300; ComponentId = $cid; SolutionUniqueName = $SolutionUnique; AddRequiredComponents = $false } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "$baseUrl/AddSolutionComponent" -Method Post -Headers $h -Body $body | Out-Null
} catch {
  $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }
  Write-Host "[FAIL] could not add app via API: $msg" -ForegroundColor Red
  Write-Host "       Fallback: Solutions > $SolutionUnique > Add existing > App > the code app." -ForegroundColor DarkGray
  exit 2
}

$verify = Get-Dv "$baseUrl/solutioncomponents?`$filter=_solutionid_value eq $sid and componenttype eq 300 and objectid eq $cid&`$select=solutioncomponentid"
if ($verify.value.Count -gt 0) {
  Write-Host "[OK] added code app '$($app.displayname)' to '$SolutionUnique' (component type 300)" -ForegroundColor Green
} else {
  Write-Host "[WARN] add reported success but membership not verified; check the portal." -ForegroundColor Yellow
  exit 2
}
