#Requires -Version 5.1
<#
  Ensure a deployed code app is a component of the target unmanaged solution.
  Run this right AFTER `pac code push` (which does NOT reliably add the app itself).
  Idempotent. Requires `az login` to the target tenant.

  Usage:
    ./scripts/add-app-to-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -SolutionUnique VirtualRounding -AppId <code-app-id>

  Get <code-app-id> from the `pac code push` output URL (.../app/<id>) or `pac code list`.
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$SolutionUnique,
  [Parameter(Mandatory = $true)][string]$AppId
)
$ErrorActionPreference = "Stop"
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw "No access token. Run: az login --tenant <target-tenant>" }
$baseUrl = "$EnvironmentUrl/api/data/v9.2"
$h = @{ Authorization = "Bearer $token"; "OData-Version" = "4.0"; "Content-Type" = "application/json" }
function Get-Dv($u) { Invoke-RestMethod -Uri $u -Headers $h }

$sol = Get-Dv "$baseUrl/solutions?`$filter=uniquename eq '$SolutionUnique'&`$select=solutionid"
if ($sol.value.Count -eq 0) { throw "Solution '$SolutionUnique' not found." }
$sid = $sol.value[0].solutionid

$already = Get-Dv "$baseUrl/solutioncomponents?`$filter=_solutionid_value eq $sid and componenttype eq 300 and objectid eq $AppId&`$select=solutioncomponentid"
if ($already.value.Count -gt 0) {
  Write-Host "[SKIP] code app $AppId is already in '$SolutionUnique'" -ForegroundColor Yellow
  return
}

# Code apps only get a canvasapps record once known to a solution; confirm it resolves.
$ca = Get-Dv "$baseUrl/canvasapps?`$filter=canvasappid eq $AppId&`$select=name,displayname"
if ($ca.value.Count -eq 0) {
  Write-Host "[WARN] No canvasapps record for $AppId yet. Add once via portal (Solutions > $SolutionUnique > Add existing > App); after that this script keeps it in sync." -ForegroundColor Yellow
}

$body = @{ ComponentType = 300; ComponentId = $AppId; SolutionUniqueName = $SolutionUnique; AddRequiredComponents = $false } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "$baseUrl/AddSolutionComponent" -Method Post -Headers $h -Body $body | Out-Null
  Write-Host "[OK] added code app $AppId to '$SolutionUnique'" -ForegroundColor Green
} catch {
  $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }
  Write-Host "[FAIL] could not add app via API: $msg" -ForegroundColor Red
  Write-Host "       Fallback: Solutions > $SolutionUnique > Add existing > App > the code app." -ForegroundColor DarkGray
  exit 2
}
