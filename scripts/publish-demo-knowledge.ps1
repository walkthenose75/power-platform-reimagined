#Requires -Version 5.1
<#
  Provision a portable DEMO SharePoint knowledge library and upload publishable (synthetic/sanitized)
  files to it, so a reimagined agent can be grounded on demo-tenant content -- never customer content.
  SharePoint bridge capability 3. Pairs with `reimagine demo-knowledge` (which plans + guides) and
  `scripts/read-sharepoint-docs.ps1` (which can verify the upload).

  Safety: unless -SkipScan, refuses to upload if `reimagine scan` finds anything in -SourceDir.

  Usage:
    ./scripts/publish-demo-knowledge.ps1 [-SiteUrl https://<tenant>.sharepoint.com/sites/<site>] `
        -LibraryName "Reimagined Demo Knowledge" -SourceDir <folder> [-OutFile <result.json>]
#>
param(
  [string]$SiteUrl,
  [string]$LibraryName = "Reimagined Demo Knowledge",
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [string]$OutFile,
  [string]$Tenant = "organizations",
  [string]$AccessToken,
  [switch]$SkipScan
)
$ErrorActionPreference = "Stop"
$SourceDir = (Resolve-Path $SourceDir).Path
$repoRoot = Split-Path $PSScriptRoot -Parent
$files = @(Get-ChildItem -Recurse -File $SourceDir)
if (-not $files) { throw "No files in $SourceDir." }

# --- Sanitizer gate (never publish un-sanitized content) ---
if (-not $SkipScan) {
  Push-Location $repoRoot
  try {
    & npm run reimagine -- scan --path "$SourceDir" | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "Sanitizer found sensitive content in $SourceDir - refusing to publish. Redact/replace, then retry (or pass -SkipScan if you're certain)." }
  } finally { Pop-Location }
  Write-Host "[OK] sanitizer gate passed" -ForegroundColor Green
}

# --- Sign in (Sites.Manage.All: create library + upload) ---
$token = $AccessToken
if (-not $token) {
  $clientId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"   # Microsoft Graph Command Line Tools (public client)
  $scope = "https://graph.microsoft.com/Sites.Manage.All offline_access"
  $dc = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/devicecode" -Body @{ client_id = $clientId; scope = $scope }
  Write-Host ""; Write-Host $dc.message -ForegroundColor Cyan; Write-Host ""
  $token = $null; $deadline = (Get-Date).AddSeconds([int]$dc.expires_in)
  do {
    Start-Sleep ([int]$dc.interval)
    try { $r = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$Tenant/oauth2/v2.0/token" -Body @{ grant_type = "urn:ietf:params:oauth:grant-type:device_code"; client_id = $clientId; device_code = $dc.device_code } -ErrorAction Stop; $token = $r.access_token }
    catch { $e = $null; try { $e = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { }; if ($e -eq "authorization_pending") { continue }; if ($e -eq "slow_down") { Start-Sleep 5; continue }; throw "Device-code sign-in failed: $($_.ErrorDetails.Message)" }
  } until ($token -or (Get-Date) -gt $deadline)
  if (-not $token) { throw "Device-code sign-in timed out." }
}
$hj = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$hg = @{ Authorization = "Bearer $token" }
$graph = "https://graph.microsoft.com/v1.0"

# --- Resolve site (default: tenant root) ---
if ($SiteUrl) {
  $u = [Uri]$SiteUrl; $sitePath = $u.AbsolutePath.TrimEnd('/')
  $siteRef = if ($sitePath) { "$($u.Host):${sitePath}" } else { $u.Host }
  $site = Invoke-RestMethod "$graph/sites/$siteRef" -Headers $hg
} else {
  $site = Invoke-RestMethod "$graph/sites/root" -Headers $hg
}
$siteId = $site.id
Write-Host "Site: $($site.webUrl)" -ForegroundColor Cyan

# --- Find or create the demo library ---
$lists = (Invoke-RestMethod "$graph/sites/$siteId/lists?`$select=id,displayName,list&`$top=200" -Headers $hg).value
$lib = $lists | Where-Object { $_.displayName -eq $LibraryName -and $_.list.template -eq 'documentLibrary' } | Select-Object -First 1
if (-not $lib) {
  $body = @{ displayName = $LibraryName; list = @{ template = "documentLibrary" } } | ConvertTo-Json -Depth 6
  $lib = Invoke-RestMethod -Method Post -Uri "$graph/sites/$siteId/lists" -Headers $hj -Body $body
  Start-Sleep 4
  Write-Host "[OK] created library '$LibraryName'" -ForegroundColor Green
} else {
  Write-Host "[OK] reusing existing library '$LibraryName'" -ForegroundColor Green
}
$drive = Invoke-RestMethod "$graph/sites/$siteId/lists/$($lib.id)/drive" -Headers $hg
$driveId = $drive.id

# --- Upload files (preserve folder structure) ---
$uploaded = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($SourceDir.Length).TrimStart('\', '/') -replace '\\', '/'
  $enc = [Uri]::EscapeDataString($rel) -replace '%2F', '/'
  $item = Invoke-RestMethod -Method Put -Uri "$graph/drives/$driveId/root:/${enc}:/content" -Headers $hg -InFile $f.FullName -ContentType "application/octet-stream"
  Write-Host "  [OK] uploaded $rel" -ForegroundColor Green
  $uploaded += @{ name = $f.Name; relPath = $rel; webUrl = $item.webUrl }
}

# --- Result ---
$result = @{ site = $site.webUrl; library = $LibraryName; libraryUrl = $drive.webUrl; fileCount = $uploaded.Count; files = $uploaded }
if (-not $OutFile) { $OutFile = "demo-knowledge-result.json" }
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutFile), ($result | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "`n[OK] uploaded $($uploaded.Count) file(s) to '$LibraryName'" -ForegroundColor Green
Write-Host "Library URL: $($drive.webUrl)" -ForegroundColor Cyan
Write-Host "Result: $OutFile" -ForegroundColor Cyan
Write-Host "Next: ground the agent - invoke the add-knowledge skill with the library URL above." -ForegroundColor Cyan
