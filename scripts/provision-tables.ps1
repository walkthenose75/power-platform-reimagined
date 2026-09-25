#Requires -Version 5.1
<#
  Generic Dataverse table provisioner: create tables, columns, and lookups INSIDE a solution
  from a JSON spec. Read/idempotent-ish (skips what exists). Requires `az login` to the tenant.

  Usage:
    ./scripts/provision-tables.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -Solution <SolutionUnique> -SpecFile <tables.json>

  Spec shape (tables.json):
  {
    "tables": [
      { "schemaName":"inv_ItemCategory", "displayName":"Item Category", "collectionName":"Item Categories",
        "primaryColumn": { "schemaName":"inv_CategoryName", "displayName":"Category Name" } },
      { "schemaName":"inv_InventoryItem", "displayName":"Inventory Item", "collectionName":"Inventory Items",
        "primaryColumn": { "schemaName":"inv_ItemName", "displayName":"Item Name" },
        "columns": [
          { "type":"money",   "schemaName":"inv_CostPerItem",     "displayName":"Cost Per Item" },
          { "type":"int",     "schemaName":"inv_OnHandCount",     "displayName":"On Hand Count" },
          { "type":"int",     "schemaName":"inv_ReorderThreshold","displayName":"Reorder Threshold" },
          { "type":"string",  "schemaName":"inv_Sku",             "displayName":"SKU", "maxLength":100 },
          { "type":"memo",    "schemaName":"inv_Notes",           "displayName":"Notes" },
          { "type":"boolean", "schemaName":"inv_Active",          "displayName":"Active" },
          { "type":"datetime","schemaName":"inv_LastCounted",     "displayName":"Last Counted" },
          { "type":"decimal", "schemaName":"inv_Weight",          "displayName":"Weight" }
        ],
        "lookups": [
          { "schemaName":"inv_CategoryId", "displayName":"Category", "target":"inv_itemcategory",
            "relationshipName":"inv_ItemCategory_InventoryItem", "menuLabel":"Inventory Items" }
        ] }
    ]
  }
  Column types: string, memo, int, decimal, money, boolean, datetime.
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$Solution,
  [Parameter(Mandatory = $true)][string]$SpecFile
)
$ErrorActionPreference = "Stop"
$EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
if (-not (Test-Path $SpecFile)) { throw "Spec file not found: $SpecFile" }
$spec = Get-Content $SpecFile -Raw | ConvertFrom-Json
$token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv
if (-not $token) { throw "No token. Run: az login --tenant <target-tenant>" }
$base = "$EnvironmentUrl/api/data/v9.2"
$h = @{ Authorization = "Bearer $token"; "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; "MSCRM.SolutionUniqueName"=$Solution }
function Label($t) { @{ "@odata.type"="Microsoft.Dynamics.CRM.Label"; LocalizedLabels=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.LocalizedLabel"; Label=$t; LanguageCode=1033 }) } }
function EntityExists($logical) { try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$logical')?`$select=LogicalName" -Headers $h | Out-Null; return $true } catch { return $false } }
function AttrExists($entity, $logical) { try { Invoke-RestMethod -Uri "$base/EntityDefinitions(LogicalName='$entity')/Attributes(LogicalName='$logical')?`$select=LogicalName" -Headers $h | Out-Null; return $true } catch { return $false } }
function PostJson($url, $obj) { Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body ($obj | ConvertTo-Json -Depth 20) -ContentType "application/json" }
function Retry($script) { for ($i=0; $i -lt 6; $i++) { try { & $script; return } catch { if ("$($_)" -match '0x80040216|SQL|deadlock' -and $i -lt 5) { Start-Sleep 6 } else { throw } } } }

function ColumnMeta($c) {
  $sn = $c.schemaName; $dn = if ($c.displayName) { $c.displayName } else { $sn }
  $req = @{ Value = if ($c.required) { "ApplicationRequired" } else { "None" } }
  switch ("$($c.type)".ToLower()) {
    "string"   { return @{ "@odata.type"="Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; MaxLength=[int]($(if ($c.maxLength) { $c.maxLength } else { 200 })); FormatName=@{Value="Text"} } }
    "memo"     { return @{ "@odata.type"="Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; MaxLength=[int]($(if ($c.maxLength) { $c.maxLength } else { 2000 })) } }
    "int"      { return @{ "@odata.type"="Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; Format="None"; MinValue=-2147483648; MaxValue=2147483647 } }
    "decimal"  { return @{ "@odata.type"="Microsoft.Dynamics.CRM.DecimalAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; Precision=2; MinValue=-100000000000; MaxValue=100000000000 } }
    "money"    { return @{ "@odata.type"="Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; PrecisionSource=2 } }
    "boolean"  { return @{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; OptionSet=@{ "@odata.type"="Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"; TrueOption=@{ Value=1; Label=(Label "Yes") }; FalseOption=@{ Value=0; Label=(Label "No") } } } }
    "datetime" { return @{ "@odata.type"="Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName=$sn; DisplayName=(Label $dn); RequiredLevel=$req; Format="DateAndTime"; DateTimeBehavior=@{ Value="UserLocal" } } }
    default    { throw "Unknown column type '$($c.type)' for $sn" }
  }
}

foreach ($t in $spec.tables) {
  $logical = $t.schemaName.ToLower()
  if (EntityExists $logical) { Write-Host "[SKIP] table $($t.schemaName)" -ForegroundColor Yellow }
  else {
    $primary = $t.primaryColumn
    PostJson "$base/EntityDefinitions" @{
      "@odata.type"="Microsoft.Dynamics.CRM.EntityMetadata"; SchemaName=$t.schemaName;
      DisplayName=(Label $t.displayName); DisplayCollectionName=(Label $(if ($t.collectionName) { $t.collectionName } else { $t.displayName }));
      OwnershipType="UserOwned"; HasActivities=$false; HasNotes=$false;
      Attributes=@(@{ "@odata.type"="Microsoft.Dynamics.CRM.StringAttributeMetadata"; SchemaName=$primary.schemaName;
        RequiredLevel=@{Value="ApplicationRequired"}; MaxLength=200; FormatName=@{Value="Text"}; DisplayName=(Label $(if ($primary.displayName) { $primary.displayName } else { $primary.schemaName })); IsPrimaryName=$true })
    } | Out-Null
    Write-Host "[OK] table $($t.schemaName)" -ForegroundColor Green
  }
  foreach ($c in @($t.columns)) {
    if (-not $c) { continue }
    if (AttrExists $logical $c.schemaName.ToLower()) { Write-Host "  [SKIP] $($c.schemaName)" -ForegroundColor Yellow; continue }
    Retry { PostJson "$base/EntityDefinitions(LogicalName='$logical')/Attributes" (ColumnMeta $c) | Out-Null }
    Write-Host "  [OK] +$($c.schemaName)" -ForegroundColor Green
  }
  foreach ($lk in @($t.lookups)) {
    if (-not $lk) { continue }
    if (AttrExists $logical $lk.schemaName.ToLower()) { Write-Host "  [SKIP] lookup $($lk.schemaName)" -ForegroundColor Yellow; continue }
    Retry { PostJson "$base/RelationshipDefinitions" @{
      "@odata.type"="Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"; SchemaName=$lk.relationshipName;
      ReferencedEntity=$lk.target; ReferencingEntity=$logical;
      Lookup=@{ "@odata.type"="Microsoft.Dynamics.CRM.LookupAttributeMetadata"; SchemaName=$lk.schemaName; DisplayName=(Label $(if ($lk.displayName) { $lk.displayName } else { $lk.schemaName })); RequiredLevel=@{Value="None"} };
      AssociatedMenuConfiguration=@{ Behavior="UseCollectionName"; Group="Details"; Order=10000; Label=(Label $(if ($lk.menuLabel) { $lk.menuLabel } else { $t.displayName })) };
      CascadeConfiguration=@{ Assign="NoCascade"; Delete="RemoveLink"; Merge="NoCascade"; Reparent="NoCascade"; Share="NoCascade"; Unshare="NoCascade" }
    } | Out-Null }
    Write-Host "  [OK] lookup $($lk.schemaName)" -ForegroundColor Green
  }
}

Write-Host "`nPublishing customizations..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$base/PublishAllXml" -Method Post -Headers $h -Body '{}' -ContentType "application/json" | Out-Null
Write-Host "[DONE] tables provisioned in $Solution" -ForegroundColor Green
