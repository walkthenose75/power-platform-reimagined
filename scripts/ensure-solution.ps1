#Requires -Version 5.1
<#
  Solution-first: create the publisher + unmanaged solution BEFORE building anything, so every
  component can be created inside it. Idempotent. Requires `az login` to the target tenant.

  After this, create all components with the header  MSCRM.SolutionUniqueName=<SolutionUnique>
  (tables, choices), push code apps with  --solutionName <SolutionUnique>, and add flows /
  connection references to the same solution. Then run audit-solution.ps1 to verify.

  Usage:
    ./scripts/ensure-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -PublisherUnique smartterhealth -PublisherFriendly "Smartter Health" -Prefix sh `
        -SolutionUnique VirtualRounding -SolutionFriendly "Virtual Rounding"
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$PublisherUnique,
  [Parameter(Mandatory = $true)][string]$PublisherFriendly,
  [Parameter(Mandatory = $true)][string]$Prefix,
  [int]$OptionValuePrefix = 20000,
  [Parameter(Mandatory = $true)][string]$SolutionUnique,
  [Parameter(Mandatory = $true)][string]$SolutionFriendly
)
$ErrorActionPreference = "Stop"
if ($SolutionUnique -match '\s') { throw "SolutionUnique must not contain spaces (unique names are immutable). Use PascalCase." }

$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw "No access token. Run: az login --tenant <target-tenant>" }
$baseUrl = "$EnvironmentUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; "Prefer" = "return=representation" }
function Get-Dv($u) { Invoke-RestMethod -Uri $u -Headers $headers }
function Post-Dv($u, $o) { Invoke-RestMethod -Uri $u -Method Post -Headers $headers -Body ($o | ConvertTo-Json -Depth 12) -ContentType "application/json" }

$pub = Get-Dv "$baseUrl/publishers?`$filter=uniquename eq '$PublisherUnique'&`$select=publisherid"
if ($pub.value.Count -gt 0) {
  $publisherId = $pub.value[0].publisherid
  Write-Host "[SKIP] publisher '$PublisherUnique' exists" -ForegroundColor Yellow
} else {
  $publisherId = (Post-Dv "$baseUrl/publishers" @{
      uniquename = $PublisherUnique; friendlyname = $PublisherFriendly
      customizationprefix = $Prefix; customizationoptionvalueprefix = $OptionValuePrefix
    }).publisherid
  Write-Host "[OK] publisher '$PublisherUnique' (prefix '$Prefix') created" -ForegroundColor Green
}

$sol = Get-Dv "$baseUrl/solutions?`$filter=uniquename eq '$SolutionUnique'&`$select=solutionid"
if ($sol.value.Count -gt 0) {
  Write-Host "[SKIP] solution '$SolutionUnique' exists" -ForegroundColor Yellow
} else {
  Post-Dv "$baseUrl/solutions" @{
    uniquename = $SolutionUnique; friendlyname = $SolutionFriendly; version = "1.0.0.0"
    "publisherid@odata.bind" = "/publishers($publisherId)"
  } | Out-Null
  Write-Host "[OK] solution '$SolutionUnique' (display '$SolutionFriendly') created" -ForegroundColor Green
}

Write-Host "`nSolution-first ready. Build INTO '$SolutionUnique':" -ForegroundColor Cyan
Write-Host "  - tables/choices: send header  MSCRM.SolutionUniqueName=$SolutionUnique  on create" -ForegroundColor DarkGray
Write-Host "  - code app:       pac code push --solutionName $SolutionUnique   (then verify + add if missing)" -ForegroundColor DarkGray
Write-Host "  - flows/env vars/connection refs: create in this solution" -ForegroundColor DarkGray
Write-Host "  - verify:         ./scripts/audit-solution.ps1 -EnvironmentUrl $EnvironmentUrl -SolutionUnique $SolutionUnique" -ForegroundColor DarkGray
