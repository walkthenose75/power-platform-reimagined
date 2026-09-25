#Requires -Version 5.1
<#
  Generic synthetic-data loader: load CSVs into Dataverse from a synthetic-data manifest.
  Loads in loadOrder, resolves lookups, is type-aware, and idempotent by key. Requires `az login`.

  Usage:
    ./scripts/load-synthetic-data.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -ManifestPath workspaces/<pilot>/synthetic-data/manifest.json

  Manifest entities (superset of the manifest schema; extra fields are optional):
    { "logicalName":"inv_inventoryitem", "file":"inv_inventoryitem.csv", "keyColumn":"inv_itemname",
      "loadOrder":2,
      "columnMap": { "CsvHeader":"inv_logicalname", ... },       # optional: CSV header -> column logical name
      "relationships":[
        { "column":"CategoryKey", "targetEntity":"inv_itemcategory",
          "targetKey":"inv_categoryname", "navigationProperty":"inv_CategoryId" } ] }

  If a CSV header already equals the Dataverse column logical name, columnMap is not needed.
  CSV columns named in a relationship's "column" are resolved to a lookup bind, not set directly.
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$ManifestPath
)
$ErrorActionPreference = "Stop"
$EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
if (-not (Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }
$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$csvDir = Split-Path -Parent (Resolve-Path $ManifestPath)
if (Test-Path (Join-Path $csvDir "csv")) { $csvDir = Join-Path $csvDir "csv" }
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw "No token. Run: az login --tenant <target-tenant>" }
$base = "$EnvironmentUrl/api/data/v9.2"
$h = @{ Authorization = "Bearer $token"; "OData-Version"="4.0"; "Content-Type"="application/json"; "Prefer"="return=representation" }
function GetDv($u) { Invoke-RestMethod -Uri $u -Headers $h }

# Resolve set name + primary id + attribute types for a logical entity (cached).
$meta = @{}
function EntityMeta($logical) {
  if ($meta.ContainsKey($logical)) { return $meta[$logical] }
  $e = GetDv "$base/EntityDefinitions(LogicalName='$logical')?`$select=EntitySetName,PrimaryIdAttribute"
  $attrs = @{}
  (GetDv "$base/EntityDefinitions(LogicalName='$logical')/Attributes?`$select=LogicalName,AttributeType").value |
    ForEach-Object { $attrs[$_.LogicalName] = $_.AttributeType }
  $m = [pscustomobject]@{ Set = $e.EntitySetName; PrimaryId = $e.PrimaryIdAttribute; Types = $attrs }
  $meta[$logical] = $m; return $m
}
function Coerce($type, $value) {
  if ($null -eq $value -or "$value" -eq "") { return $null }
  switch ("$type") {
    "Integer"  { return [int]$value }
    "BigInt"   { return [int64]$value }
    "Decimal"  { return [double]$value }
    "Double"   { return [double]$value }
    "Money"    { return [double]$value }
    "Boolean"  { return [bool]([string]$value -match '^(1|true|yes)$') }
    default    { return "$value" }
  }
}

$total = 0
foreach ($ent in ($manifest.entities | Sort-Object loadOrder)) {
  $logical = $ent.logicalName
  $m = EntityMeta $logical
  $csvPath = Join-Path $csvDir $ent.file
  if (-not (Test-Path $csvPath)) { Write-Host "[WARN] CSV not found: $($ent.file)" -ForegroundColor Yellow; continue }
  $rows = Import-Csv $csvPath
  $colMap = @{}; if ($ent.columnMap) { $ent.columnMap.PSObject.Properties | ForEach-Object { $colMap[$_.Name] = $_.Value } }
  $rels = @{}; foreach ($r in @($ent.relationships)) { if ($r) { $rels[$r.column] = $r } }
  $keyLogical = $ent.keyColumn

  # existing keys for idempotency
  $existing = @{}
  if ($keyLogical) { (GetDv "$base/$($m.Set)?`$select=$keyLogical").value | ForEach-Object { if ($_.$keyLogical) { $existing[[string]$_.$keyLogical] = $true } } }

  $added = 0
  foreach ($row in $rows) {
    $rec = @{}
    $keyValue = $null
    foreach ($p in $row.PSObject.Properties) {
      $header = $p.Name; $value = $p.Value
      if ($rels.ContainsKey($header)) {
        $rel = $rels[$header]
        if ("$value" -ne "") {
          $tm = EntityMeta $rel.targetEntity
          $found = (GetDv "$base/$($tm.Set)?`$select=$($tm.PrimaryId)&`$filter=$($rel.targetKey) eq '$([uri]::EscapeDataString($value))'").value
          if ($found.Count -gt 0) { $rec["$($rel.navigationProperty)@odata.bind"] = "/$($tm.Set)($($found[0].$($tm.PrimaryId)))" }
          else { Write-Host "  [WARN] lookup '$value' not found in $($rel.targetEntity)" -ForegroundColor Yellow }
        }
        continue
      }
      $logicalCol = if ($colMap.ContainsKey($header)) { $colMap[$header] } else { $header }
      if (-not $m.Types.ContainsKey($logicalCol)) { continue }  # skip columns not on the table
      $rec[$logicalCol] = Coerce $m.Types[$logicalCol] $value
      if ($logicalCol -eq $keyLogical) { $keyValue = [string]$value }
    }
    if ($keyValue -and $existing.ContainsKey($keyValue)) { Write-Host "  [SKIP] $keyValue" -ForegroundColor Yellow; continue }
    Invoke-RestMethod -Uri "$base/$($m.Set)" -Method Post -Headers $h -Body ($rec | ConvertTo-Json -Depth 8) | Out-Null
    $added++; $total++
  }
  $count = (GetDv "$base/$($m.Set)?`$count=true&`$top=1").'@odata.count'
  Write-Host "[OK] $logical : +$added (total $count)" -ForegroundColor Green
}
Write-Host "`n[DONE] loaded $total new row(s)" -ForegroundColor Cyan
