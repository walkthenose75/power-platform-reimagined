#Requires -Version 5.1
<#
  Read a SharePoint site's DOCUMENT LIBRARIES via Microsoft Graph (device-code sign-in) and emit a
  normalized docs schema JSON for `reimagine knowledge-plan`. Read-only metadata by default (name,
  size, type, path). Optionally downloads the files into the gitignored workspace for sanitization.

  Usage:
    ./scripts/read-sharepoint-docs.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> `
        [-Library "<library display name>"] [-DownloadDir <path>] [-OutFile <path>] [-Tenant <id>]

  Then:
    npm run reimagine -- knowledge-plan --schema <OutFile> --workspace <workspace>
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$Library,
  [string]$DownloadDir,
  [string]$OutFile,
  [string]$Tenant = "organizations",
  [string]$AccessToken
)
$ErrorActionPreference = "Stop"
$token = $AccessToken
if (-not $token) {
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
}
$h = @{ Authorization = "Bearer $token" }
$graph = "https://graph.microsoft.com/v1.0"

# System libraries that aren't business content (still readable if named explicitly via -Library).
$SystemLibraries = @('Site Assets', 'Style Library', 'Form Templates', 'Site Pages', 'Preservation Hold Library', 'Teams Wiki Data', 'Documents_Internal')

# --- Resolve the site id from the URL ---
$u = [Uri]$SiteUrl
$hostname = $u.Host
$sitePath = $u.AbsolutePath.TrimEnd('/')
$siteRef = if ($sitePath) { "${hostname}:${sitePath}" } else { $hostname }
$site = Invoke-RestMethod -Uri "$graph/sites/$siteRef" -Headers $h
$siteId = $site.id

# --- Enumerate document libraries (drives) ---
$drives = (Invoke-RestMethod "$graph/sites/$siteId/drives?`$select=id,name,driveType,webUrl&`$top=200" -Headers $h).value |
  Where-Object { $_.driveType -eq "documentLibrary" }
if ($Library) { $drives = @($drives | Where-Object { $_.name -eq $Library }) }
else { $drives = @($drives | Where-Object { $SystemLibraries -notcontains $_.name }) }
if (-not $drives) { throw "No matching document libraries found on $SiteUrl." }

# --- Recurse a drive, collecting file items (with folder-relative path) ---
function Get-DriveFiles($driveId, $itemId) {
  $acc = @()
  $url = "$graph/drives/$driveId/items/$itemId/children?`$select=id,name,size,file,folder,webUrl,lastModifiedDateTime,parentReference&`$top=200"
  do {
    $resp = Invoke-RestMethod -Uri $url -Headers $h
    foreach ($it in $resp.value) {
      if ($it.folder) { $acc += Get-DriveFiles $driveId $it.id }
      elseif ($it.file) {
        $rel = ""
        if ($it.parentReference.path) { $rel = (($it.parentReference.path -replace '.*root:', '').TrimStart('/')) }
        $ext = [System.IO.Path]::GetExtension($it.name).TrimStart('.').ToLower()
        $acc += [pscustomobject]@{ name = $it.name; path = $rel; size = [long]$it.size; mimeType = $it.file.mimeType; extension = $ext; lastModified = "$($it.lastModifiedDateTime)"; webUrl = $it.webUrl; driveId = $driveId; itemId = $it.id }
      }
    }
    $url = $resp.'@odata.nextLink'
  } while ($url)
  return , $acc
}

$outLibraries = @()
foreach ($d in $drives) {
  $files = Get-DriveFiles $d.id "root"
  Write-Host "  [library] $($d.name): $($files.Count) file(s)" -ForegroundColor DarkGray

  if ($DownloadDir) {
    foreach ($f in $files) {
      $rel = if ($f.path) { Join-Path $f.path $f.name } else { $f.name }
      $dest = Join-Path (Join-Path $DownloadDir $d.name) $rel
      New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
      Invoke-WebRequest -Uri "$graph/drives/$($f.driveId)/items/$($f.itemId)/content" -Headers $h -OutFile $dest | Out-Null
    }
    Write-Host "    downloaded $($files.Count) file(s) -> $(Join-Path $DownloadDir $d.name)" -ForegroundColor DarkGray
  }

  # Project to public schema fields (drop internal driveId/itemId).
  $pub = @($files | ForEach-Object { @{ name = $_.name; path = $_.path; size = $_.size; mimeType = $_.mimeType; extension = $_.extension; lastModified = $_.lastModified; webUrl = $_.webUrl } })
  $outLibraries += @{ name = $d.name; url = $d.webUrl; files = $pub }
}

if (-not $OutFile) { $OutFile = "sharepoint-docs.json" }
$json = @{ site = $SiteUrl; libraries = $outLibraries } | ConvertTo-Json -Depth 12
# Write UTF-8 WITHOUT a BOM (PS 5.1 `Set-Content -Encoding UTF8` adds a BOM that JSON.parse rejects).
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutFile), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "`n[OK] wrote docs schema for $($outLibraries.Count) library(ies) -> $OutFile" -ForegroundColor Green
Write-Host "Next: npm run reimagine -- knowledge-plan --schema `"$OutFile`" --workspace <workspace>" -ForegroundColor Cyan
