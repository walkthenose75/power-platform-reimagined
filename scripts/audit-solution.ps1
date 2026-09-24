#Requires -Version 5.1
<#
  Everything-in-the-solution audit. Lists every component in the target unmanaged solution,
  and (prefix-based) flags custom TABLES that exist in the environment but were NOT added to the
  solution -- the classic "built it but forgot to add it" gap. Read-only.

  Usage:
    ./scripts/audit-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -SolutionUnique VirtualRounding -Prefix sh
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$SolutionUnique,
  [string]$Prefix
)
$ErrorActionPreference = "Stop"
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw "No access token. Run: az login --tenant <target-tenant>" }
$baseUrl = "$EnvironmentUrl/api/data/v9.2"
$h = @{ Authorization = "Bearer $token"; "OData-Version" = "4.0" }
function Get-Dv($u) { Invoke-RestMethod -Uri $u -Headers $h }

$typeNames = @{
  1 = "Table"; 2 = "Column"; 9 = "Choice (global)"; 20 = "Security Role"; 29 = "Cloud flow / Workflow";
  59 = "Chart"; 60 = "Form"; 61 = "Web Resource"; 62 = "Site Map"; 70 = "Field Security Profile";
  80 = "Model-driven app"; 300 = "Canvas/Code app"; 371 = "Connector"; 372 = "Connector";
  380 = "Environment Variable (def)"; 381 = "Environment Variable (value)"; 10163 = "Connection Reference"
}

$sol = Get-Dv "$baseUrl/solutions?`$filter=uniquename eq '$SolutionUnique'&`$select=solutionid,friendlyname,ismanaged"
if ($sol.value.Count -eq 0) { throw "Solution '$SolutionUnique' not found." }
$sid = $sol.value[0].solutionid
Write-Host "`nSolution: $($sol.value[0].friendlyname)  ($SolutionUnique)  managed=$($sol.value[0].ismanaged)" -ForegroundColor Cyan

$comps = (Get-Dv "$baseUrl/solutioncomponents?`$filter=_solutionid_value eq $sid&`$select=componenttype,objectid").value
Write-Host "Total components: $($comps.Count)" -ForegroundColor Cyan

# resolve table names for type 1
$entities = (Get-Dv "$baseUrl/EntityDefinitions?`$select=LogicalName,SchemaName,MetadataId,IsCustomEntity").value
$metaToName = @{}; foreach ($e in $entities) { $metaToName[$e.MetadataId.ToLower()] = $e.SchemaName }

Write-Host "`n== In the solution ==" -ForegroundColor Cyan
$byType = $comps | Group-Object componenttype | Sort-Object { [int]$_.Name }
foreach ($g in $byType) {
  $t = [int]$g.Name; $label = $typeNames[$t]; if (-not $label) { $label = "Type $t" }
  $names = @()
  if ($t -eq 1) { $names = $g.Group | ForEach-Object { $metaToName[$_.objectid.ToLower()] } | Where-Object { $_ } }
  $suffix = if ($names.Count) { " -> " + (($names | Sort-Object) -join ", ") } else { "" }
  Write-Host ("  {0,-28} {1}{2}" -f $label, $g.Count, $suffix)
}

# category presence hints
$has = { param($t) @($comps | Where-Object { [int]$_.componenttype -eq $t }).Count }
Write-Host "`n== Coverage hints ==" -ForegroundColor Cyan
if ((& $has 1) -gt 0) { Write-Host "  [OK] Tables present" -ForegroundColor Green } else { Write-Host "  [WARN] No tables in solution" -ForegroundColor Yellow }
if ((& $has 300) -gt 0) { Write-Host "  [OK] App present (canvas/code)" -ForegroundColor Green } else { Write-Host "  [WARN] No app in solution - if you built a code app, add it: Solutions > $SolutionUnique > Add existing > App" -ForegroundColor Yellow }
if ((& $has 29) -gt 0) { Write-Host "  [OK] Cloud flow(s) present" -ForegroundColor Green } else { Write-Host "  [INFO] No cloud flows in solution (fine if none were built)" -ForegroundColor DarkGray }
if ((& $has 10163) -gt 0) { Write-Host "  [OK] Connection reference(s) present" -ForegroundColor Green } else { Write-Host "  [INFO] No connection references (fine if no connectors used)" -ForegroundColor DarkGray }

# prefix-based gap scan for TABLES
if ($Prefix) {
  Write-Host "`n== Gap scan: custom '${Prefix}_' tables NOT in solution ==" -ForegroundColor Cyan
  $inSol = @{}; ($comps | Where-Object { [int]$_.componenttype -eq 1 }) | ForEach-Object { $inSol[$_.objectid.ToLower()] = $true }
  $custom = $entities | Where-Object { $_.IsCustomEntity -and $_.SchemaName -like "${Prefix}_*" }
  $missing = $custom | Where-Object { -not $inSol[$_.MetadataId.ToLower()] }
  if ($missing) {
    foreach ($m in $missing) { Write-Host "  [GAP] $($m.SchemaName) exists but is NOT in the solution" -ForegroundColor Red }
    Write-Host "  Fix: recreate with MSCRM.SolutionUniqueName header, or add via portal/AddSolutionComponent." -ForegroundColor DarkGray
    exit 2
  } else {
    Write-Host "  [OK] every '${Prefix}_' table is in the solution" -ForegroundColor Green
  }
}
Write-Host ""
