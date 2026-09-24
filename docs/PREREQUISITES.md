# Prerequisites Guide

Complete this checklist **before** starting a reimagination. Most failures we hit in practice
were missing prerequisites (code apps not enabled, wrong auth tenant), not code problems.

Reference versions below are what the pilot ran on; newer is generally fine.

## 1. Developer tooling (system)

| Tool | Min version | Verify | Install |
|---|---|---|---|
| Node.js | **v22+** (pilot: v24) | `node --version` | https://nodejs.org (LTS) |
| npm | bundled with Node | `npm --version` | — |
| Git | any (pilot: 2.55) | `git --version` | https://git-scm.com |
| .NET SDK | 8+ (pilot: 10.0.112) | `dotnet --version` | https://dotnet.microsoft.com |
| Power Platform CLI (`pac`) | 2.12+ | `pac help` | `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` |
| Azure CLI (`az`) | 2.80+ (pilot: 2.84) | `az version` | https://aka.ms/installazurecli |

`pac` is also bundled with the **Power Platform Tools** VS Code extension; the standalone
dotnet tool is recommended so the terminal `pac` works everywhere.

## 2. VS Code + extensions

An AI coding agent in VS Code drives this process. Any of these works: **GitHub Copilot +
Copilot Chat** (`github.copilot`, `github.copilot-chat`) or the **Copilot SDK / Claude Code**
extension (`anthropic.claude-code`).

| Extension | ID | Required? |
|---|---|---|
| AI coding agent (Copilot Chat or Copilot SDK) | `github.copilot-chat` / `anthropic.claude-code` | **Required** |
| Power Platform Tools | `microsoft-isvexptools.powerplatform-vscode` | **Required** |
| C# Dev Kit / .NET | `ms-dotnettools.csdevkit`, `ms-dotnettools.csharp` | Recommended |
| PowerShell | `ms-vscode.powershell` | Recommended |
| Azure CLI Tools | `ms-vscode.azurecli` | Recommended |
| Rainbow CSV (review synthetic data) | `mechatroner.rainbow-csv` | Optional |

Install from the command line, e.g.:

```
code --install-extension microsoft-isvexptools.powerplatform-vscode
```

## 3. Accounts, roles & licensing

- **Target Power Platform environment** you can build in (know its **URL**, e.g.
  `https://<org>.crm.dynamics.com/`).
- **Maker access** in that environment: **System Customizer** or **System Administrator**
  (required to create Dataverse tables).
- **Environment admin** (or a friendly one) to enable code apps — see section 4.
- **Power Apps Premium** license for end users who will run the code app.
- The **account for the target tenant**. It may differ from your `microsoft.com` account —
  `pac auth create` and `az login` must target the environment's tenant.

## 4. Environment settings

- **Enable Power Apps code apps** in the target environment (admin toggle). Steps and the
  propagation caveat are in [CODE_APP_BUILD_RUNBOOK.md](CODE_APP_BUILD_RUNBOOK.md#p1-enable-code-apps-in-the-target-environment-required).
  This is the single most common blocker (`403 CodeAppOperationNotAllowedInEnvironment`).

## 5. Authentication (run in the VS Code terminal)

These are interactive; run them yourself in the terminal (faster than through chat):

```
pac auth create --environment https://<org>.crm.dynamics.com/    # Power Platform
az login --tenant <target-tenant-id>                             # Dataverse Web API path
```

`pac auth list` / `az account show` confirm you're pointed at the **target** tenant, not your
default one.

## 6. One-shot verification

Run this and confirm every line prints a version:

```powershell
node --version; npm --version; git --version; dotnet --version; pac help | Select-Object -First 1; az version
```

## Related

- [CODE_APP_BUILD_RUNBOOK.md](CODE_APP_BUILD_RUNBOOK.md) — the build sequence and preflights
- [OPERATOR_WORKFLOW.md](OPERATOR_WORKFLOW.md) — end-to-end stages and the chat/terminal split
- [PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md) — gotchas discovered during the pilot
