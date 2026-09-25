#Requires -Version 5.1
<#
  Prerequisites doctor for the Power Platform Reimagined kit.
  Answers ONE question: "Is my machine set up to run this?" — tools, versions, VS Code
  extensions, and repo dependencies. NO environment or sign-in needed (that's the separate
  Phase-2 gate: scripts/preflight.ps1). Run this FIRST. Read-only.

  Usage:
    npm run doctor
    ./scripts/check-prereqs.ps1
    ./scripts/check-prereqs.ps1 -SkipExtensions
#>
param([switch]$SkipExtensions)
$ErrorActionPreference = "Continue"
$fail = 0; $warn = 0
function Say($status, $name, $detail) {
  $color = @{ PASS = "Green"; WARN = "Yellow"; FAIL = "Red" }[$status]
  Write-Host ("[{0}] {1}" -f $status, $name) -ForegroundColor $color -NoNewline
  if ($detail) { Write-Host "  $detail" -ForegroundColor DarkGray } else { Write-Host "" }
  if ($status -eq "FAIL") { $script:fail++ } elseif ($status -eq "WARN") { $script:warn++ }
}
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function VerGE([string]$have, [string]$min) {
  try { return [version]($have.Trim()) -ge [version]($min) } catch { return $false }
}

Write-Host "`n== Core tooling ==" -ForegroundColor Cyan
if (Have node) {
  $v = (node --version).TrimStart("v"); $major = [int]($v.Split(".")[0])
  if ($major -ge 22) { Say PASS "Node.js >= 22" "v$v" } else { Say FAIL "Node.js >= 22" "found v$v - install Node 22 LTS from https://nodejs.org" }
} else { Say FAIL "Node.js >= 22" "not found - https://nodejs.org (LTS)" }
if (Have npm) { Say PASS "npm" (npm --version) } else { Say FAIL "npm" "bundled with Node.js" }
if (Have git) { Say PASS "Git" ((git --version) -replace "git version ", "") } else { Say FAIL "Git" "not found - https://git-scm.com" }
if (Have dotnet) {
  $d = (dotnet --version 2>$null)
  if ($d -and (VerGE ($d.Split("-")[0]) "8.0.0")) { Say PASS ".NET SDK >= 8" $d }
  else { Say WARN ".NET SDK >= 8" "found '$d' - needed to install/update pac; https://dotnet.microsoft.com" }
} else { Say WARN ".NET SDK >= 8" "not found - needed to install pac (dotnet tool); https://dotnet.microsoft.com" }

Write-Host "`n== Power Platform / Azure CLIs ==" -ForegroundColor Cyan
if (Have pac) {
  $pv = $null
  try { $h = (pac help 2>&1 | Out-String); if ($h -match "Version:\s*([0-9]+\.[0-9]+\.[0-9]+)") { $pv = $Matches[1] } } catch {}
  if ($pv -and (VerGE $pv "2.12.0")) { Say PASS "Power Platform CLI (pac) >= 2.12" "v$pv" }
  elseif ($pv) { Say WARN "Power Platform CLI (pac)" "v$pv (< 2.12) - update: pac install latest  (or dotnet tool update --global Microsoft.PowerApps.CLI.Tool)" }
  else { Say PASS "Power Platform CLI (pac)" "installed (version unknown)" }
} else { Say FAIL "Power Platform CLI (pac)" "dotnet tool install --global Microsoft.PowerApps.CLI.Tool" }
if (Have az) {
  $av = $null
  try { $j = (az version -o json 2>$null | ConvertFrom-Json); $av = "$($j.'azure-cli')" } catch {}
  if ($av -and (VerGE $av "2.80.0")) { Say PASS "Azure CLI (az) >= 2.80" "v$av" }
  elseif ($av) { Say WARN "Azure CLI (az)" "v$av (< 2.80) - run: az upgrade" }
  else { Say PASS "Azure CLI (az)" "installed (version unknown)" }
} else { Say FAIL "Azure CLI (az)" "https://aka.ms/installazurecli" }

if (-not $SkipExtensions) {
  Write-Host "`n== VS Code + extensions ==" -ForegroundColor Cyan
  if (Have code) {
    $ext = ((code --list-extensions 2>$null) -join "`n").ToLower()
    if ($ext -match "microsoft-isvexptools.powerplatform-vscode") { Say PASS "Power Platform Tools extension" }
    else { Say WARN "Power Platform Tools extension" "code --install-extension microsoft-isvexptools.powerplatform-vscode" }
    if ($ext -match "github.copilot-chat" -or $ext -match "anthropic.claude-code") { Say PASS "AI agent extension" "Copilot Chat or Claude Code found" }
    else { Say WARN "AI agent extension" "install GitHub Copilot Chat (github.copilot-chat) or Claude Code (anthropic.claude-code)" }
  } else {
    Say WARN "VS Code 'code' CLI" "not on PATH - can't verify extensions. In VS Code: Command Palette > 'Shell Command: Install code command in PATH'"
  }
}

Write-Host "`n== Repo dependencies ==" -ForegroundColor Cyan
$repoRoot = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $repoRoot "node_modules")) { Say PASS "npm dependencies installed" }
else { Say WARN "npm dependencies" "run: npm install" }

Write-Host ""
if ($fail -gt 0) { Write-Host "PREREQS: $fail FAIL, $warn WARN - install the missing tools above, then re-run 'npm run doctor'." -ForegroundColor Red; exit 1 }
elseif ($warn -gt 0) { Write-Host "PREREQS: core is ready, with $warn warning(s) to review. Next: 'npm run intake'." -ForegroundColor Yellow }
else { Write-Host "PREREQS: all green. Next: 'npm run intake'." -ForegroundColor Green }
