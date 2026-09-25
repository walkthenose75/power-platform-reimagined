# Guided Intake App — Design Note

Origin: user idea during the Virtual Rounding pilot — "an app that runs in local browser to
capture everything we need from the user to make this a more guided process."

## Purpose

Replace ad-hoc chat Q&A with a structured, validated intake. The SE runs a local app, fills a
form, and the kit produces a single `intake.json` that seeds the assessment workspace and the
guided Copilot workflow.

## Key constraints / decisions

- **Standalone local web app, NOT a Power Apps code app.** It must run before any Power
  Platform environment or auth exists (it captures the target environment itself).
- **Writes to disk**, so it needs a tiny local server (Node http) with a submit endpoint;
  a pure static page can't persist files. Serve at `http://localhost:<port>`, POST → write
  `intake.json` into the chosen workspace.
- **Lean dependencies.** Prefer a single served HTML/JS form + small Node handler over a heavy
  SPA build. Reuse the kit's existing TS/Node toolchain and AJV validation.
- **Schema-backed.** Output validates against a new `schemas/intake.schema.json` and maps into
  the existing `solution-model.schema.json` (assessment, source) plus publication metadata.

## Entry modes (branch at the very start)

The app first asks *how the SE is starting*, then shows mode-specific questions:

1. **New concept (greenfield)** — a brand-new idea with no existing source. Skip discovery;
   capture the concept directly.
2. **Reimagine from `.zip`** — a downloaded solution export on disk.
3. **Reimagine from GitHub repo** — clone URL + revision (the Virtual Rounding path).
4. *(optional)* **Reimagine from tenant** — a live environment + installed solution.

This means the kit supports **both** "reimagine an existing solution" **and** "create a new
solution from a concept." Both converge on the same target build (code app + Dataverse +
Teams packaging) and the same publication pipeline (unmanaged solution + Solution HUB).

## Captured fields

### Shared (all modes)

- Pilot / solution name
- Target environment URL (+ optional GUID) and sign-in account/tenant
- Target surface: code app; Teams packaging (yes/no)
- Conversational agents: whether Copilot Studio and/or Microsoft 365 Copilot (declarative) agents
  are in scope, and — when either is — the **agent authoring harness** (Standard vs GitHub Copilot)
- Synthetic data: realism level + volume
- Sanitization confirmations (synthetic-only; scrub identifiers/secrets)
- Solution HUB metadata: title, industry, content types, technical areas, contributors, narrative
- **Additional details & assets**: freeform notes, reference links, pasted text (e.g., an
  existing catalog entry), and uploaded documents/screenshots — stored to the workspace and
  indexed in the intake manifest

### New concept mode

- Problem statement and business value
- Target users / personas
- Key capabilities and scenarios
- Data the app must manage (entities/relationships in plain language)
- Integrations needed (email, Teams, facilities system, FHIR, etc.)
- Success/acceptance criteria

### Reimagine modes (zip / repo / tenant)

- Source location (zip path, repo URL + revision + subfolder such as `v2`, or env + solution)
- Dependency boundary (full closure / referenced only / solution-owned)
- Known pain points and constraints
- What to keep vs. change vs. drop (parity vs. redesign hints)
- Feature ideas to consider

## Output

- `intake.json` (validated) in the target workspace
- Seeds `solution-model.json` (assessment + source) and `KICKOFF.md`
- Remaining reasoning (discovery, architecture, build) continues in the Copilot workflow

## Run experience (proposed)

```
npm run intake            # starts local server, opens browser
# fill form -> Submit -> writes workspaces/<pilot>/intake.json + KICKOFF.md
```

## Fits the process where?

Front door for **Stage 1 (Intake gate)** in the operator workflow. The `start` CLI remains for
users who prefer command-line intake; the app is the guided alternative that produces the same
artifacts.

## Status

Built (v1). Serves at `npm run intake`; writes a validated `intake.json` + `KICKOFF.md` per
pilot, runs machine preflight, and supports all four entry modes. Validated against the Virtual
Rounding pilot. Future: pre-fill from an existing repo, and richer preflight (env code-apps
enablement check once auth is present).

## Intake v2

- **`.zip` browse button (Step 2 Source):** implemented. The browser uploads the selected ZIP to
  the local intake server, which validates it, writes it to `inbox/<pilot>/`, and unpacks it with
  PAC CLI before the wizard proceeds. Uploads are limited to 100 MB; failures remove partial
  upload and unpack artifacts.
- **Explain "Dependency boundary" (Step 2):** implemented with plain-language labels and
  descriptions — "Everything it depends on", "Solution + one hop out", and "Only what's inside
  the solution" (values `full-closure` / `referenced-only` / `solution-owned`).
- **Conversational agents + harness (Step 3 Target):** when the solution includes Copilot Studio
  and/or Microsoft 365 Copilot (declarative) agents, the wizard asks which **authoring harness**
  to use. The choice is validated (harness required when an agent type is in scope) and written
  into `KICKOFF.md` so the workflow honors the harness's capabilities:
  - *Standard harness* — full Copilot Studio skill set: multi-agent authoring (Advisor, Author,
    Manage, Test), clone/pull/push/publish, and background evaluation and chat testing.
  - *GitHub Copilot harness* — single-agent and interactive: no autonomous sub-agents or
    background runs; publish and batch evaluation are manual, operator-confirmed steps.
- **Model-driven apps removed from Step 3 Target:** the target surface is always a code app, so
  the wizard no longer asks for a model-driven policy. Model-driven apps are still discovered as
  source evidence and evaluated case by case during the workflow — that is not an intake choice.
- **Teams personal tab kept with a tooltip:** the "Package as a Microsoft Teams personal tab"
  toggle stays, now with a hover/focus tooltip explaining that it also builds a Teams app package
  (manifest + icons) embedding the code app as a personal tab, and noting the CSP
  `frame-ancestors` requirement.
