#Requires -Version 5.1
<#
  Ensure a deployed Power Apps CODE APP is a component of the target unmanaged solution.
  Run right AFTER `pac code push`. Idempotent. Requires `az login` to the target tenant.

  Why this exists: code apps are stored as `canvasapp` records (`canvasapptype = 4`) and appear in a
  solution as component **type 300**; the component `objectid` IS the `canvasappid`. Proven on a
  probe app (pac 2.12.2): a code app deployed with `pac code push` has **no canvasapp record** until
  it's added to a solution via the maker portal (**Add existing > App**) — so `pac code push
  --solutionName`, the `AddSolutionComponent` Web API, and `pac solution add-solution-component` all
  fail to add it ("CanvasApp ... does not exist"). Once the record exists (portal), this script
  RESOLVES it (by `-AppName` or `-AppId`) and VERIFIES/keeps its solution membership. If a record
  DOES exist but isn't in the target solution, it adds it via AddSolutionComponent.

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
  [int]$RetrySeconds = 12
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
  Write-Host "[ACTION REQUIRED] The code app has no Dataverse 'canvasapp' record yet, so it can't be added by API." -ForegroundColor Yellow
  Write-Host "  In current tooling this is expected: 'pac code push' (even with --solutionName), the AddSolutionComponent" -ForegroundColor DarkGray
  Write-Host "  Web API, and 'pac solution add-solution-component' all fail until the record exists — and the record is" -ForegroundColor DarkGray
  Write-Host "  created when you add the app ONCE via the maker portal:" -ForegroundColor DarkGray
  Write-Host "     make.powerapps.com > Solutions > $SolutionUnique > Add existing > App > select the code app." -ForegroundColor Cyan
  Write-Host "  Then re-run this script (with -AppName '<display name>') to VERIFY it's a component (type 300)." -ForegroundColor DarkGray
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
