#Requires -Version 5.1
<#
  Build a Copilot Studio agent as code and deploy it INTO a solution (hands-off).
  Scaffolds a new-experience CliCopilot agent (GitHub Copilot harness), injects full multi-line
  instructions into settings.mcs.yml, packs it into the target unmanaged solution, and imports it.

  Usage:
    ./scripts/build-agent.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
        -Name "Inventory Assistant" -PublisherPrefix inv -Solution InventoryTracking `
        -InstructionsFile workspaces/<pilot>/generated/agent-instructions.md

  Requires `pac` authenticated to the target env (pac auth create / connect.ps1).
  After this, the one-time manual last mile (Dataverse MCP tool + connection, publish, channel,
  embed) is in AGENT_BUILD.md.
#>
param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$PublisherPrefix,
  [Parameter(Mandatory = $true)][string]$Solution,
  [string]$InstructionsFile,
  [string]$Instructions,
  [string]$ProjectDir
)
$ErrorActionPreference = "Stop"
if (-not (Get-Command pac -ErrorAction SilentlyContinue)) { throw "pac not found. Run: npm run doctor" }
if ($InstructionsFile) {
  if (-not (Test-Path $InstructionsFile)) { throw "Instructions file not found: $InstructionsFile" }
  $Instructions = (Get-Content $InstructionsFile -Raw).TrimEnd()
}
if (-not $Instructions) { throw "Provide -InstructionsFile or -Instructions." }
if (-not $ProjectDir) { $ProjectDir = Join-Path (Get-Location) ("agent-" + ($Name -replace '[^a-zA-Z0-9]+','-').ToLower()) }
New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null
$settingsPath = Join-Path $ProjectDir "settings.mcs.yml"

# 1. Scaffold with a single-line seed (multi-line instructions break the CLI arg parser).
Write-Host "== Scaffolding CliCopilot agent (GitHub Copilot harness) ==" -ForegroundColor Cyan
$seed = "Placeholder instructions - replaced from the instructions file."
if (Test-Path $settingsPath) {
  Write-Host "[SKIP] agent workspace already scaffolded at $ProjectDir" -ForegroundColor Yellow
} else {
  pac copilot init --name $Name --publisher-prefix $PublisherPrefix --instructions $seed `
    --authoring-mode cli-copilot --project-dir $ProjectDir --environment $EnvironmentUrl
  if ($LASTEXITCODE -ne 0) { throw "pac copilot init failed." }
}

# 2. Inject full multi-line instructions into settings.mcs.yml as a YAML block scalar.
Write-Host "== Injecting instructions ==" -ForegroundColor Cyan
$indent = ' ' * 12
$block = ($Instructions -split "`r?`n" | ForEach-Object { ($indent + $_).TrimEnd() }) -join "`n"
$yaml = Get-Content $settingsPath -Raw
$yaml = [System.Text.RegularExpressions.Regex]::Replace($yaml, '(?m)^\s{10}value: .*$', "          value: |-`n$block", 1)
Set-Content -Path $settingsPath -Value $yaml -Encoding UTF8 -NoNewline
Write-Host "[OK] instructions written to settings.mcs.yml" -ForegroundColor Green

# 3. Pack into the target solution (output-path is a directory; the inner zip is <solution>.zip).
Write-Host "`n== Packing the agent into solution '$Solution' ==" -ForegroundColor Cyan
$packDir = Join-Path $ProjectDir "pack"
if (Test-Path $packDir) { Remove-Item $packDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $packDir | Out-Null
pac copilot pack --publisher-prefix $PublisherPrefix --solution-name $Solution --project-dir $ProjectDir --output-path $packDir
if ($LASTEXITCODE -ne 0) { throw "pac copilot pack failed." }
$zip = Get-ChildItem $packDir -Recurse -File -Filter *.zip | Where-Object { $_.Length -gt 0 } | Select-Object -First 1
if (-not $zip) { throw "pack produced no zip." }
Write-Host "[OK] packed -> $($zip.FullName)" -ForegroundColor Green

# 4. Import into the environment (adds the agent to the solution).
Write-Host "`n== Importing into the environment (adds the agent to '$Solution') ==" -ForegroundColor Cyan
pac solution import --path $zip.FullName --environment $EnvironmentUrl --publish-changes true
if ($LASTEXITCODE -ne 0) { throw "pac solution import failed." }

Write-Host "`n[DONE] Agent '$Name' built as code and imported into '$Solution'." -ForegroundColor Green
Write-Host "Next (one-time, manual): add the Dataverse MCP tool + authorize the connection, then publish + choose a channel. See AGENT_BUILD.md." -ForegroundColor Cyan
