#Requires -Version 5.1
<#
  Read a SharePoint site's LIST schemas via Microsoft Graph (device-code sign-in) and emit a
  normalized schema JSON for `reimagine sharepoint-map`. Read-only — no list rows are read
  (schema only; synthetic data is generated later).

  Usage:
    ./scripts/read-sharepoint-list.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> `
        [-ListName "<display name>"] [-OutFile <path>] [-Tenant <tenant-id-or-domain>]

  Then:
    npm run reimagine -- sharepoint-map --schema <OutFile> --prefix <p> --workspace <workspace>
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$ListName,
  [string]$OutFile,
  [string]$Tenant = "organizations"
)
$ErrorActionPreference = "Stop"
# Microsoft Graph Command Line Tools — a Microsoft first-party PUBLIC client that supports the
# device-code flow and delegated Graph scopes (no app registration or secret needed).
$clientId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
$scope = "https://graph.microsoft.com/Sites.Read.All offline_access"

# --- Device-code sign-in (self-contained; no modules) ---
$dc = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/devicecode" -Body @{ client_id = $clientId; scope = $scope }
Write-Host ""
Write-Host $dc.message -ForegroundColor Cyan
Write-Host ""
$token = $null
$deadline = (Get-Date).AddSeconds([int]$dc.expires_in)
do {
  Start-Sleep ([int]$dc.interval)
  try {
    $r = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/token" -Body @{ grant_type = "urn:ietf:params:oauth:grant-type:device_code"; client_id = $clientId; device_code = $dc.device_code } -ErrorAction Stop
    $token = $r.access_token
  } catch {
    $err = $null; try { $err = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { }
    if ($err -eq "authorization_pending") { continue }
    if ($err -eq "slow_down") { Start-Sleep 5; continue }
    throw "Device-code sign-in failed: $($_.ErrorDetails.Message)"
  }
} until ($token -or (Get-Date) -gt $deadline)
if (-not $token) { throw "Device-code sign-in timed out." }
$h = @{ Authorization = "Bearer $token" }
$graph = "https://graph.microsoft.com/v1.0"

# --- Resolve the site id from the URL ---
$u = [Uri]$SiteUrl
$hostname = $u.Host
$sitePath = $u.AbsolutePath.TrimEnd('/')
$siteRef = if ($sitePath) { "${hostname}:${sitePath}" } else { $hostname }
$site = Invoke-RestMethod -Uri "$graph/sites/$siteRef" -Headers $h
$siteId = $site.id

# --- Enumerate custom lists (skip document libraries + hidden/system lists) ---
$lists = (Invoke-RestMethod "$graph/sites/$siteId/lists?`$select=id,name,displayName,list&`$top=200" -Headers $h).value |
  Where-Object { $_.list.template -eq "genericList" -and -not $_.list.hidden }
if ($ListName) { $lists = @($lists | Where-Object { $_.displayName -eq $ListName -or $_.name -eq $ListName }) }
if (-not $lists) { throw "No matching custom lists found on $SiteUrl." }
$listById = @{}; foreach ($x in $lists) { $listById[$x.id] = $x.displayName }

function Normalize-Column($c) {
  if ($c.readOnly -or $c.hidden) { return $null }   # skip system / read-only columns
  $o = @{ name = $c.name; displayName = $c.displayName; type = "unknown" }
  if ($c.required) { $o.required = $true }
  if ($c.calculated) { $o.type = "calculated" }
  elseif ($c.lookup) { $o.type = $(if ($c.lookup.allowMultipleValues) { "lookupmulti" } else { "lookup" }); if ($c.lookup.listId) { $o.lookupListId = $c.lookup.listId } }
  elseif ($c.personOrGroup) { $o.type = $(if ($c.personOrGroup.allowMultipleSelection) { "personmulti" } else { "person" }) }
  elseif ($c.choice) { $o.type = $(if ($c.choice.allowMultipleSelection) { "multichoice" } else { "choice" }); $o.choices = @($c.choice.choices) }
  elseif ($c.boolean) { $o.type = "boolean" }
  elseif ($c.currency) { $o.type = "currency" }
  elseif ($c.dateTime) { $o.type = $(if ("$($c.dateTime.format)" -eq "dateOnly") { "date" } else { "datetime" }) }
  elseif ($c.number) { $dp = "$($c.number.decimalPlaces)"; $o.type = "number"; $o.decimals = $(if ($dp -and $dp -ne "none" -and $dp -ne "0") { 2 } else { 0 }) }
  elseif ($c.text) { $o.type = $(if ($c.text.allowMultipleLines) { "note" } else { "text" }); if ($c.text.maxLength) { $o.maxLength = [int]$c.text.maxLength } }
  elseif ($c.hyperlinkOrPicture) { $o.type = $(if ($c.hyperlinkOrPicture.isPicture) { "image" } else { "hyperlink" }) }
  return $o
}

$outLists = @()
foreach ($l in $lists) {
  $cols = (Invoke-RestMethod "$graph/sites/$siteId/lists/$($l.id)/columns" -Headers $h).value
  $norm = @()
  foreach ($c in $cols) {
    $n = Normalize-Column $c
    if (-not $n) { continue }
    if ($n.lookupListId -and $listById.ContainsKey($n.lookupListId)) { $n.lookupList = $listById[$n.lookupListId] }
    $n.Remove("lookupListId")
    $norm += $n
  }
  Write-Host "  [list] $($l.displayName): $($norm.Count) mappable column(s)" -ForegroundColor DarkGray
  $outLists += @{ name = $l.name; displayName = $l.displayName; columns = $norm }
}

if (-not $OutFile) { $OutFile = "sharepoint-schema.json" }
@{ site = $SiteUrl; lists = $outLists } | ConvertTo-Json -Depth 12 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "`n[OK] wrote schema for $($outLists.Count) list(s) -> $OutFile" -ForegroundColor Green
Write-Host "Next: npm run reimagine -- sharepoint-map --schema `"$OutFile`" --prefix <p> --workspace <workspace>" -ForegroundColor Cyan
