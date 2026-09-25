#Requires -Version 5.1
<#
  One-shot connect: establish the sign-ins the reimagine workflow needs — Power Platform (pac),
  Azure (az, for the Dataverse Web API), and GitHub (gh, for publishing). Interactive: run it in
  your terminal. Complements `npm run doctor` (machine) and preflight (readiness).

  Usage:
    ./scripts/connect.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com [-Tenant <tenant-id>]
    ./scripts/connect.ps1 -IntakePath workspaces/<pilot>/intake.json
#>
param(
  [string]$EnvironmentUrl,
  [string]$IntakePath,
  [string]$Tenant
)
$ErrorActionPreference = "Continue"
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if ($IntakePath) {
  if (-not (Test-Path $IntakePath)) { Write-Host "Intake file not found: $IntakePath" -ForegroundColor Red; exit 1 }
  $intake = Get-Content -Raw $IntakePath | ConvertFrom-Json
  if (-not $EnvironmentUrl -and $intake.target.environmentUrl) { $EnvironmentUrl = "$($intake.target.environmentUrl)" }
}
if (-not $EnvironmentUrl) { Write-Host "Provide -EnvironmentUrl or -IntakePath (with target.environmentUrl)." -ForegroundColor Red; exit 1 }
$targetHost = ([Uri]$EnvironmentUrl).Host

Write-Host "`n== Power Platform (pac) ==" -ForegroundColor Cyan
if (-not (Have pac)) { Write-Host "[MISSING] pac - dotnet tool install --global Microsoft.PowerApps.CLI.Tool" -ForegroundColor Red }
else {
  $auth = pac auth list 2>&1 | Out-String
  $active = ($auth -split "`n") | Where-Object { $_ -match '^\s*\[\d+\]\s+\*' }
  if ($active -and $active -match [regex]::Escape($targetHost)) { Write-Host "[OK] pac already targets $targetHost" -ForegroundColor Green }
  elseif ($auth -match [regex]::Escape($targetHost)) {
    Write-Host "[..] pac profile exists but isn't active - selecting it" -ForegroundColor Yellow
    pac auth select --environment $EnvironmentUrl
  } else {
    Write-Host "[..] creating a pac auth profile (a browser window will open)" -ForegroundColor Yellow
    pac auth create --environment $EnvironmentUrl
  }
}

Write-Host "`n== Azure (az) ==" -ForegroundColor Cyan
if (-not (Have az)) { Write-Host "[MISSING] az - https://aka.ms/installazurecli" -ForegroundColor Red }
else {
  $token = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv 2>$null
  if ($token) { Write-Host "[OK] az has a token for $targetHost" -ForegroundColor Green }
  else {
    Write-Host "[..] signing in to Azure (a browser window will open)" -ForegroundColor Yellow
    if ($Tenant) { az login --tenant $Tenant | Out-Null } else { az login | Out-Null }
    $token2 = az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv 2>$null
    if ($token2) { Write-Host "[OK] az token acquired for $targetHost" -ForegroundColor Green }
    else { Write-Host "[FAIL] still no token - the source/target may be a different tenant; re-run with -Tenant <id>" -ForegroundColor Red }
  }
}

Write-Host "`n== GitHub (gh) ==" -ForegroundColor Cyan
if (-not (Have gh)) { Write-Host "[MISSING] gh - https://cli.github.com (needed only to publish)" -ForegroundColor Yellow }
else {
  gh auth status 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "[OK] gh is signed in" -ForegroundColor Green }
  else { Write-Host "[..] signing in to GitHub" -ForegroundColor Yellow; gh auth login }
}

Write-Host "`nNext: run the readiness gate  ->  ./scripts/preflight.ps1 -IntakePath <workspace>/intake.json" -ForegroundColor Cyan
