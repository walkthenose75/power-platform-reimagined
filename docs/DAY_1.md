# Day 1 — Start Here

This kit turns an old Power Platform solution (or a brand‑new idea) into a modern, installable
demo — with the AI doing **most** of the work and you making a handful of decisions.

Two choices decide whether that promise holds. Get them right first:

> **1. Run it in an _agentic_ harness** — one where the AI can run terminal commands and edit
> files (VS Code Copilot **Agent mode**, or a Copilot CLI). **Not** plain Ask/Chat.
>
> **2. Use a frontier model** — **Claude Sonnet 4.5** as the everyday driver (step up to
> **Claude Opus** for the hardest reasoning). GPT‑5 / o‑series is a fine alternative for the
> planning gates.
>
> In plain chat with a weak model, the AI can't run your build and the experience quietly
> degrades into copy‑paste. Don't start there.

## The 4 things to get right (TL;DR)

1. **Install the tools** — Node 22+, Git, .NET, `pac`, `az`, VS Code + an AI agent extension.
2. **Use an agentic harness** — VS Code Copilot **Agent mode** (or Copilot CLI).
3. **Pick a frontier model** — Claude Sonnet 4.5 (Opus for hard reasoning).
4. **Run** `npm install` then `npm run intake`.

---

## 1. Install the tools

Quick list (full checklist + versions in [PREREQUISITES.md](PREREQUISITES.md)):

- **Node.js 22+**, **Git**, **.NET SDK 8+**
- **Power Platform CLI** (`pac`): `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`
- **Azure CLI** (`az`): <https://aka.ms/installazurecli>
- **VS Code** with an AI agent extension (GitHub Copilot + Copilot Chat, or the Copilot SDK /
  Claude Code extension) **and** Power Platform Tools.

One‑shot check — after `npm install`, run the **prerequisites doctor**:

```powershell
npm run doctor
```

It verifies tools + versions, your **VS Code extensions**, and repo dependencies, and prints the
exact fix for anything missing. Green here means your machine is ready.

> **Two gates, in order.** `npm run doctor` = *"is my machine set up?"* (now, no sign‑in). After
> intake, `./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json` = *"can I build
> this pilot?"* (env auth, source, code‑apps enablement, license).

## 2. Use an agentic harness (this matters most)

The kit expects the AI to **act** — run `pac`/`az`/`npm`, edit files, and load the
`reimagine-power-platform` skill. That only happens in an **agentic** harness:

| Harness | How to be in it | Notes |
|---|---|---|
| **VS Code Copilot — Agent mode** | Open the Copilot Chat view → set the mode dropdown to **Agent** | Runs terminal commands + edits files. Recommended. |
| **Copilot SDK / Claude Code** | The extension's agent view | Agentic; same idea. |
| **Copilot CLI** | Terminal | Agentic in the shell. |
| ~~Plain Ask / Chat~~ | — | **Avoid** — can't run your build; you fall back to copy‑paste. |

This maps to the wizard's **authoring harness** question: *Standard harness* = an agentic harness
(full skill set, sub‑agents, background runs); *GitHub Copilot harness* = single‑agent and
interactive (no background runs — fine, just plan for it).

## 3. Pick your model (don't skip this)

Match the model to the work. For hours of multi‑step, tool‑heavy building, sustained
**agentic‑coding reliability** matters most:

| Phase | Use |
|---|---|
| Build (code app, Dataverse, flows, packaging) | **Claude Sonnet 4.5** — best sustained tool‑use + coding |
| Discovery + architecture gate + new‑concept plan mode | **Claude Opus** (or **GPT‑5 / o‑series**) for the hardest reasoning |
| Quick edits / chat | A fast model is fine |

- **Set it:** in the VS Code Copilot Chat model picker, choose **Claude Sonnet 4.5** (or the
  strongest model your harness offers).
- **Don't model‑hop mid‑run** — one strong model is the more reliable choice.
- **Durable rule** (names change): *the strongest agentic‑coding model, in a tool‑capable harness.*

## 4. Run it

```powershell
npm install
npm run doctor      # verify your machine is ready (tools, extensions, deps)
npm run intake      # opens the guided intake wizard in your browser
```

Fill the wizard (one screen at a time), then **Submit**. It writes
`workspaces/<pilot>/intake.json` and `KICKOFF.md`.

Then do the **one** thing you run yourself: open `workspaces/<pilot>/KICKOFF.md` in Copilot
(**Agent mode**, frontier model) and say:

> **"Reimagine this Power Platform solution."**

Copilot takes it from there — it ingests the source (or, for a new concept, plans it with you),
then builds, reviews, and publishes, stopping only at the approval gates.

## What happens next — you only do 5 things

Across the 8‑phase journey ([REIMAGINE_PROCESS.md](REIMAGINE_PROCESS.md)) you personally:

1. Run the intake wizard.
2. Complete a couple of sign‑ins.
3. Approve the target plan.
4. Click through the app in your tenant.
5. Approve publish.

Everything else is automated, and the AI stops at the gates for your call.

## Before the build — run the readiness gate

Right after intake, have the agent (or you) run the Phase‑2 gate so nothing stalls the build:

```powershell
./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json
```

It checks your machine, the **target** env, the **source** (tenant sign‑in + solution exists /
repo reachable / uploaded ZIP present), and the **enablement + licensing** blockers. Resolve
every `FAIL` before building.

## When you're stuck

- **`403 CodeAppOperationNotAllowedInEnvironment`** on first push → code apps aren't enabled on
  the env (admin toggle + a few minutes to propagate). See
  [CODE_APP_BUILD_RUNBOOK.md](CODE_APP_BUILD_RUNBOOK.md#p1-enable-code-apps-in-the-target-environment-required).
- **Auth points at the wrong tenant** → `pac auth create --environment <url>` and
  `az login --tenant <target-tenant>`; the source may be a *different* tenant than the target.
- **More gotchas** → [PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md).

## Related

- [PREREQUISITES.md](PREREQUISITES.md) — full install + accounts/roles/licensing checklist
- [REIMAGINE_PROCESS.md](REIMAGINE_PROCESS.md) — the 8‑phase journey and gates
- [CODE_APP_BUILD_RUNBOOK.md](CODE_APP_BUILD_RUNBOOK.md) — the code‑app build sequence (Fluent UI 2 default)
- [OPERATOR_WORKFLOW.md](OPERATOR_WORKFLOW.md) — stage‑by‑stage operator guide
