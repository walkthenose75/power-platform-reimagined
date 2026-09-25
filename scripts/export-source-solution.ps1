#Requires -Version 5.1
<#
  Tenant source: one-button export + seed. Exports the named solution from the SOURCE environment
  as unmanaged and seeds the assessment workspace from it (so tenant matches the repo/zip on-ramp).

  Reads the wizard brief with -IntakePath, or take explicit params.

  Usage:
    ./scripts/export-source-solution.ps1 -IntakePath workspaces/<pilot>/intake.json
    ./scripts/export-source-solution.ps1 -EnvironmentUrl https://<src>.crm.dynamics.com `
        -SolutionName <unique> -Name "<Pilot>" -Output workspaces/<pilot>
#>
param(
  [string]$IntakePath,
  [string]$EnvironmentUrl,
  [string]$SolutionName,
  [string]$Name,
  [string]$Output
)
$ErrorActionPreference = "Stop"
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Slug([string]$v) {
  return (($v.ToLower() -replace "[^a-z0-9]+", "-") -replace "^-+|-+$", "")
}

if ($IntakePath) {
  if (-not (Test-Path $IntakePath)) { throw "Intake file not found: $IntakePath" }
  $intake = Get-Content -Raw $IntakePath | ConvertFrom-Json
  if ("$($intake.entryMode)" -ne "tenant") { throw "This helper is for tenant-source pilots (entryMode='tenant'); got '$($intake.entryMode)'." }
  if (-not $EnvironmentUrl) { $EnvironmentUrl = "$($intake.source.environmentUrl)" }
  if (-not $SolutionName) { $SolutionName = "$($intake.source.solutionName)" }
  if (-not $Name) { $Name = "$($intake.pilotName)" }
  if (-not $Output) { $Output = "workspaces/$(Split-Path -Leaf (Split-Path -Parent (Resolve-Path $IntakePath)))" }
}
if (-not $EnvironmentUrl -or -not $SolutionName) { throw "Provide -IntakePath, or -EnvironmentUrl and -SolutionName." }
if (-not $Name) { $Name = $SolutionName }
$slug = Slug $Name
if (-not $Output) { $Output = "workspaces/$slug" }
if (-not (Have pac)) { throw "Power Platform CLI (pac) not found. Run: npm run doctor" }

# Confirm the active pac profile targets the SOURCE environment (export uses the active profile).
$srcHost = ([Uri]$EnvironmentUrl).Host
$auth = pac auth list 2>&1 | Out-String
$activeLine = ($auth -split "`n") | Where-Object { $_ -match '^\s*\[\d+\]\s+\*' }
if (-not ($activeLine -and $activeLine -match [regex]::Escape($srcHost))) {
  Write-Host "The active pac profile does not target the source env ($srcHost)." -ForegroundColor Yellow
  Write-Host "Authenticate to the SOURCE tenant first, then re-run:" -ForegroundColor Yellow
  Write-Host "  pac auth create --environment $EnvironmentUrl" -ForegroundColor Yellow
  throw "Source pac auth not active."
}

$inboxDir = Join-Path "inbox" $slug
New-Item -ItemType Directory -Force -Path $inboxDir | Out-Null
$zip = Join-Path $inboxDir "$SolutionName.zip"

Write-Host "Exporting '$SolutionName' (unmanaged) from $EnvironmentUrl ..." -ForegroundColor Cyan
pac solution export --path $zip --name $SolutionName --managed false --environment $EnvironmentUrl --overwrite true
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip)) { throw "pac solution export failed. Confirm the solution name and that you're signed in to the source tenant." }
Write-Host "Exported -> $zip" -ForegroundColor Green

Write-Host "Seeding the workspace from the export ..." -ForegroundColor Cyan
npm run reimagine -- start --name "$Name" --zip "$zip" --output "$Output"
if ($LASTEXITCODE -ne 0) { throw "Workspace seed failed (npm run reimagine -- start)." }

Write-Host "`nDone. Next:" -ForegroundColor Green
Write-Host "  npm run status --workspace $Output" -ForegroundColor Green
