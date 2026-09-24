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
- Model-driven apps: retain case-by-case / replace
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

## Backlog (v2, from user feedback)

- **`.zip` browse button (Step 2 Source):** replace the free-text path with a file browse button;
  on Next, copy the chosen `.zip` into the working directory (`inbox/`) and unzip, then continue.
  Browsers can't move a local file by path — receive the uploaded file server-side and write it,
  or integrate a VS Code file picker.
- **Explain "Dependency boundary" (Step 2):** add plain-language help under each option
  (full closure = solution + all dependencies; directly referenced = one hop; solution-owned =
  packaged components only).
