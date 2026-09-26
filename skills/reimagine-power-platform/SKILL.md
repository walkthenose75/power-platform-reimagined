---
name: reimagine-power-platform
description: >
  Discover, document, modernize, rebuild, and package an existing Power Platform
  solution as a reusable unmanaged demo solution. Use this skill whenever the user
  asks to reimagine, assess, document, modernize, migrate, or catalog a Power
  Platform solution, drops in a solution ZIP, points to a solution repository, or
  asks to prepare GitHub or Solution HUB assets—even if they do not name this skill.
  Triggers: reimagine solution, assess solution, solution ZIP, modernize canvas app,
  convert SharePoint to Dataverse, build code app, Solution HUB.
---

# Reimagine a Power Platform Solution

Run an evidence-backed, gated workflow from source intake through an installable unmanaged solution and Solution HUB publication bundle.

## Prerequisites

- Node.js 20 or newer and repository dependencies installed.
- Power Platform CLI for solution export, unpacking, packing, and environment operations.
- Authenticated access to any tenant, SharePoint site, repository, or API explicitly included in scope.
- Relevant specialist agents or skills for each discovered workload.
- A clean target environment before installation validation.
- **Recommended models:** run the build phases with the strongest agentic **coding** model available (Claude Sonnet-class); use a high-**reasoning** model (GPT-5 / o-series) for the architecture and plan-mode gates. Pick the strongest models the selected harness offers.

## Non-negotiable boundaries

- Existing canvas apps are read-only source evidence. Build target custom experiences as code apps.
- Evaluate model-driven apps case by case.
- Do not retrieve or persist source business rows. Use schema and approved non-identifying aggregates only.
- Build and publish unmanaged solutions.
- **Everything the kit builds goes into ONE named unmanaged solution.** Create the solution FIRST
  (`scripts/ensure-solution.ps1`), then create every component inside it — tables, the code app,
  cloud flows, connectors (as **connection references**), choices, and environment variables.
  Nothing may be left in the Default solution. After building, prove it with
  `scripts/audit-solution.ps1`; the app and connection references are the ones most often forgotten.
- A live demo is optional; clean installation and customization are required.
- Local read-only work may proceed on autopilot. Stop for the approval gates in this workflow.

## Workflow

### 1. Kick off intake

The operator's only action is to open `KICKOFF.md` and say **"Reimagine this Power Platform
solution."** From here **you (the agent) run every command** — the operator only completes
interactive browser sign-ins and approves the gates. Do these **first moves in order**:

**a. Ingest the source (if not already).** The intake **wizard creates the workspace with
`intake.json` + `KICKOFF.md` but does NOT ingest the source** — so a workspace existing does not
mean it is ready. If `solution-model.json` or `evidence/` is missing, ingest now (this moves the
inbox ZIP into the workspace, unpacks it, and scaffolds the model):

```powershell
npm run reimagine -- start --name "<pilot-name>" --zip "<solution.zip>" --output "workspaces/<pilot>"
npm run reimagine -- start --name "<pilot-name>" --inbox "<inbox-directory>" --output "workspaces/<pilot>"
npm run reimagine -- start --name "<pilot-name>" --repo "<repository-url>" --revision "<branch-or-tag>" --output "workspaces/<pilot>"
```

`KICKOFF.md`'s **"Ingest the source"** block has the exact command with paths already filled in.
For a tenant source not yet exported, first run
`scripts/export-source-solution.ps1 -IntakePath <workspace>/intake.json` (or the applicable
lifecycle specialist). If the workspace is already ingested (the CLI `start` path), skip this.

**b. Establish the sign-ins.** Run the connect helper — it signs `pac` + `az` (and `gh` for
publishing) into the **target** env. **You run the command; the operator just completes the browser
prompts** (this is how "the operator never runs a command themselves" holds):

```powershell
./scripts/connect.ps1 -IntakePath workspaces/<pilot>/intake.json
```

**c. Run the readiness gate (preflight)** before any tenant mutation (tools, auth to the target
env, maker role, code-apps feature, license):

```powershell
./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json
```

It checks the machine, the **target** environment, the **source** (tenant auth + solution exists /
repo+revision reachable / uploaded ZIP present), and the enablement and licensing blockers. Resolve
every `FAIL` (re-run `connect.ps1` for auth FAILs); review the `WARN` checkpoints (code-apps
enablement is admin-gated and has a propagation delay).

Then read `KICKOFF.md` and validate the workspace. Intake approval must establish the source, full
dependency boundary, permitted APIs, owner, and publication intent.

Intake approval must establish the source, full dependency boundary, permitted APIs, owner, and publication intent.

### 2. Discover specialists and route work

Inspect the available specialist agents and skills at execution time. Prefer the closest workload specialist over general implementation:

| Workload | Route |
|---|---|
| Copilot Studio guidance, review, troubleshooting | Advisor |
| Copilot Studio YAML | Author |
| Copilot Studio clone, pull, push, publish | Manage |
| Copilot Studio evaluation and chat testing | Test |
| Canvas apps | Read-only analysis; never use a canvas builder |
| Code apps | Code-app architect plus creation, connector, and deployment workflows |
| Dataverse and model-driven apps | Dataverse and model-app specialists |
| Power Automate | Flow discovery, build, diagnostics, and lifecycle capabilities |
| Security review | Dedicated security-review capability |

Give each specialist a bounded objective, evidence inputs, output contract, and stop condition. Do not include credentials or source rows. Record specialist provenance and centrally validate every result.

When Copilot Studio or Microsoft 365 Copilot agents are in scope, honor the **agent authoring harness** recorded at intake (`target.agents.harness` in `intake.json`, echoed in `KICKOFF.md`):

- **Standard harness:** the full Copilot Studio skill set is available — multi-agent authoring (Advisor, Author, Manage, Test), clone/pull/push/publish, and background evaluation and chat testing.
- **GitHub Copilot harness:** single-agent and interactive — do not spawn autonomous sub-agents or background runs; drive the skills as guided prompts and treat publish and batch evaluation as manual, operator-confirmed steps.

### 3. Discover the dependency closure

Classify assets as solution-owned, referenced, or environment-adjacent. Discover Dataverse, SharePoint, canvas apps, model-driven apps, code apps, flows, Copilot Studio agents, connectors, environment variables, custom connectors, APIs, and dynamic dependencies.

**Capture full table fidelity.** For every Dataverse (or SharePoint) table, record **all** columns
with their types — including `image`, `file`, choice, and lookup — in the component metadata. The
reimagined tables must recreate **every** source column; dropping one (e.g., an item image) is a
regression, not a reimagining. Note any column you deliberately drop as an explicit decision.

Populate `solution-model.json`. Record access failures and unsupported artifacts in `unknowns`; never fill gaps with plausible content.

**Model authoring quick-reference (avoid `$defs` trips).** Every `component`, `decision`,
`claim`, and `featureOpportunity` **requires `evidenceIds`** pointing to real `evidence` entries
(`kind`: export-artifact | api-result | repository-artifact | aggregate-profile |
owner-confirmation). Required fields:
- `component`: `id, name, workload, kind, scope, evidenceIds` (+ optional `metadata`).
- `decision`: `id, title, status, decision, rationale, evidenceIds`.
- `featureOpportunity`: `id, title, origin, problem, personas, scores{value,effort,risk,strategicFit,demoValue: 1–5}, disposition, evidenceIds`.
- `evidence`: `id, kind, locator, collectedAt, collector`.
For a **new-concept** (greenfield) there is no source evidence — run
`npm run reimagine -- plan-scaffold --workspace <ws>` to seed a **valid** draft (an
`owner-confirmation` evidence entry `evidence:intake-brief` + the target-surface decision), then
cite `evidence:intake-brief` on the components/features you add. Run `npm run reimagine -- validate`
after edits.

Stop at the discovery gate with coverage, evidence quality, and blockers.

### 4. Reconstruct intent

Generate current-state inventories, architecture, lineage, permissions, connections, user journeys, business rules, formulas, automation branches, agent behavior, integrations, and failure paths.

**Unpack the real artifacts — do not rely on docs alone.** Run the discovery adapter to extract
real behavior automatically:

```powershell
./scripts/analyze-artifacts.ps1 -SourcePath workspaces/<pilot>/evidence/source-repository `
    -OutFile workspaces/<pilot>/generated/current-state/behavior-evidence.md
```

It unpacks every canvas `.msapp` to Power Fx and reads the screens'
`OnSelect`/`Patch`/`.Run(...)` logic, and summarizes each flow `definition.json` (triggers,
connector actions, Graph/HTTP calls) — including flows embedded in app packages. Review the
generated `behavior-evidence.md`, then map every real action to the target. A UI that looks right
but performs no real actions is an incomplete reimagining.

Mark claims observed, inferred, owner-confirmed, or unknown. Ask the owner to confirm material inferences before target design.

### 5. Ideate and select features

Accept ideas from the builder and owner. Recommend evidence-backed opportunities based on pain points, missing capabilities, accessibility, automation, analytics, AI, platform capabilities, and demo value.

For every candidate, capture:

- origin and supporting evidence;
- affected personas and expected value;
- effort, risk, strategic fit, and demo value scores from 1 to 5;
- dependencies, licensing, security, and data impact;
- acceptance criteria;
- disposition: candidate, include now, backlog, or rejected.

Keep baseline behavior separate from net-new functionality. Stop at the feature-selection gate to approve a bounded build set and prioritized backlog.

### 6. Design the target

Map each current capability to retain, redesign, replace, consolidate, or retire. Convert canvas behavior into code-app requirements. Evaluate model-driven apps on native fit. Assess each SharePoint list or library before moving it to Dataverse.

**SharePoint lists → Dataverse (the bridge).** For a SharePoint-backed source, read the list schema
and map it to Dataverse tables — read-only, **schema only** (no list rows; synthetic data is generated
later):

```powershell
./scripts/read-sharepoint-list.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> [-ListName "<list>"] -OutFile <ws>/generated/current-state/sharepoint-schema.json
npm run reimagine -- sharepoint-map --schema <ws>/generated/current-state/sharepoint-schema.json --prefix <p> --workspace <ws>
```

The reader signs in with a **Microsoft Graph device code** (Sites.Read.All) and the mapper writes a
`tables.json` (for `provision-tables.ps1`) + a source→target **column map** + the **decisions** it
took. Type map: Title→**primary**; text→string; multi-line→memo; number→int/decimal; currency→money;
choice→**choice**; multi-choice→choice *(+decision)*; yes/no→boolean; date/datetime→datetime;
**person→text (display name)** *(no real user link; synthesize names)*; **lookup→Dataverse lookup only
if the referenced list is also in scope** (referenced table is provisioned first; otherwise flatten to
text); calculated/rollup→**skipped** (recompute in the app); hyperlink→string; picture→image;
attachments→file. **Review the decisions** (simplifications) before building; then provision the tables
and generate synthetic data.

**Reimagine means better, not just a CRUD list.** Default the code app to strong UX patterns:
**master–detail** (a list plus a detail panel that shows every field, including images/files),
**actionable dashboards** (rows click through to detail and expose primary actions — e.g., a
low‑stock list where each row can Reorder), and Fluent 2 components (DataGrid with row activation,
Drawer/Card detail, Image). A flat, read‑mostly table that loses source screens (e.g., an item
detail screen with an image) is a downgrade. Preserve source screens' intent and raise the bar.

Produce architecture decisions, current-to-target traceability, selected-feature traceability, migration waves, coexistence, rollback, and acceptance criteria. Stop at the architecture gate.

### 7. Design synthetic data

Create a compact, coherent demo narrative with fictitious personas, relationships, lifecycle states, and purposeful edge cases. **Match the intake industry** (`publish.solutionHub.industry`): a Providers pilot gets clinical/medical supplies, not generic office/breakroom items. Do not derive rows from source content.

Generate reviewable CSV files (keyed to the **target** schema — Dataverse logical names or a `columnMap`), a manifest conforming to `schemas/synthetic-data-manifest.schema.json`, optional fictitious sample documents, and an import-ready package or loader (`scripts/load-synthetic-data.ps1`). Validate integrity and repeatability. Stop at the synthetic-data gate.

### 8. Build after mutation approval

Build **solution-first** and keep **everything** in the one named unmanaged solution.

1. **Create the container first:** `scripts/ensure-solution.ps1` (publisher + unmanaged solution).
   Derive the names from the pilot (Dataverse rules): **`Prefix`** = 2–8 **lowercase alphanumeric**
   (e.g. *Biomedical Equipment Maintenance* → `bem`); **`SolutionUnique`** = **PascalCase, no
   spaces** and immutable (`BiomedicalEquipmentMaintenance`); `SolutionFriendly` = the display name;
   `PublisherUnique`/`PublisherFriendly` = a demo publisher (e.g. `bemdemo` / "BEM Demo"). Never leak
   the kit's "reimagine" branding into these names.
2. **Tables/choices:** create with the `MSCRM.SolutionUniqueName=<solution>` header so they land in it. Use `scripts/provision-tables.ps1 -SpecFile <tables.json>` (generic: tables, columns, lookups; types include `image`/`file` and **`choice`** — give a `choice` column an `options: ["Open","In Progress","Done"]` array). Model **status/priority/category** as `choice` columns (not free text). **Recreate every source column** captured in discovery — including images/files — so the reimagined app keeps full fidelity.
3. **Experiences:** implement custom experiences as **code apps** (never target canvas apps);
   retain or redesign approved model-driven experiences. Build the code-app UI with **Fluent UI 2**
   (`@fluentui/react-components` v9) by default — `FluentProvider`, Fluent components and
   `@fluentui/react-icons`, and **Teams theme sync** (light/dark/high-contrast) when packaged as a
   tab — unless intake selects a custom design system. See [Code app build runbook](../../docs/CODE_APP_BUILD_RUNBOOK.md).
4. **Deploy + add the app:** `pac code push --solutionName <solution>` deploys it, then **add the
   code app to the solution ONCE via the maker portal** (Solutions → `<solution>` → **Add existing →
   App**). This is *proven necessary* (pac 2.12.2): a code app is a `canvasapp` record
   (`canvasapptype = 4`, solution component **type 300**) that **doesn't exist until the portal adds
   it**, so `pac code push --solutionName`, the `AddSolutionComponent` API, and
   `pac solution add-solution-component` all fail to add it. Then run
   `scripts/add-app-to-solution.ps1 -EnvironmentUrl <env> -SolutionUnique <solution> -AppName "<display name>"`
   to **verify** it's a component (type 300). *(Dataverse tables/choices/agent land automatically via
   the `MSCRM.SolutionUniqueName` header — only the code app needs this one portal click.)*
5. **Connectors/flows/config:** add connectors as **connection references** in the solution;
   create flows and environment variables in the solution.
5a. **Agents (do not skip):** when Copilot Studio / M365 Copilot agents are in scope, **build them
   as code**, don't just document them. Compose tailored instructions (from discovery + intake
   industry + the target tables + tasks) into a file, then
   `scripts/build-agent.ps1 -InstructionsFile <file> -Solution <solution> -PublisherPrefix <prefix>`
   — it scaffolds a new‑experience **CliCopilot** agent (`pac copilot init --authoring-mode
   cli-copilot`, Sonnet model / GitHub Copilot harness), packs it (`pac copilot pack --solution-name`),
   and imports it **into the solution**. Then generate `AGENT_BUILD.md`
   (`npm run reimagine -- agent-guide`) for the one‑time manual last mile — add the **Dataverse MCP
   tool + authorize the connection**, publish, choose a channel, and embed in the code app (OAuth
   consent is inherently manual). Default agents to the **GitHub Copilot harness**.
6. **Synthetic data:** load with `scripts/load-synthetic-data.ps1 -ManifestPath <manifest>` — it
   is manifest-driven, resolves lookups by target key, is type-aware, and idempotent. Key the CSVs
   to the **target** schema (Dataverse logical names or a `columnMap`).
7. **Verify:** run `scripts/audit-solution.ps1 -Prefix <prefix>`. Every table, the app, flows, and
   connection references must appear, and the gap scan must be clean. Fix any gap before continuing.
8. **Export:** unpacked source and the unmanaged solution package.

Do not create target canvas apps.

**Record what you can't automate.** Whenever a step cannot be done programmatically (admin toggle,
interactive OAuth consent, Copilot Studio publish, tenant admin approval, Entra app registration,
CSP edit, licensing, sharing, Solution Hub form), do **not** silently skip it — append it to
`solution-model.json` under `manualSteps` (`{ title, why, where, steps }`). The kit already knows the
common ones (see the manual-steps catalog); record anything new you hit. In the **GitHub Copilot
harness**, treat publish and connector-action setup as manual by default.

### 9. Validate

Use workload test specialists first. Then import into a clean environment, configure connections and settings, load synthetic data, and run acceptance tests. Verify security, accessibility, failure behavior, teardown, and customization.

Run the **acceptance check** (definition of done) and require an `ACCEPTED` verdict before release:

```powershell
./scripts/acceptance.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
    -SolutionUnique <Solution> -Prefix <prefix> -AppUrl <play-url> `
    -PublicationPath workspaces/<pilot>/publication
```

It verifies solution completeness (tables + app + connection references), a clean gap scan, seeded demo data, app reachability, and a clean publication sanitization scan.

An import failure blocks release.

### 10. Package and publish

Generate GitHub and Solution HUB (Solution City) assets from approved artifacts. Include install, configuration, demo, customization, architecture, screenshots, diagrams, metadata, and optional video guidance.

Assemble the bundle (README/docs, `SOLUTION_HUB.md` + `solution-hub.json` with the Solution City fields, and a sanitization scan) and confirm the Hub fields are **READY**:

```powershell
npm run reimagine -- package --workspace "workspaces/<pilot>"
npm run reimagine -- scan --path "workspaces/<pilot>/publication"
```

`package` writes `publication/` (the GitHub‑postable asset) and reports Solution City readiness (missing fields are flagged). It also generates **`MANUAL_STEPS.md`** — the UI/admin steps the agent could not automate (enablement, connections, agent publish + approval, Teams CSP, sharing, plus anything recorded in `manualSteps`), tailored to the intake and harness. Regenerate it standalone with `npm run reimagine -- manual-guide --workspace "workspaces/<pilot>"`. Any scan finding blocks publication. Require human publication approval, then `gh repo create <name> --public --source . --push`.

## Progress & gates (stay on rail — no drift)

`solution-model.json` is the single source of truth for **where the pilot is**. Keep it current so
neither you nor the operator ever loses the thread:

- At any time, run `npm run status` (or `npm run reimagine`) to print the current stage, the
  pending gate, and the one next action. Use it to re-orient at the start of every session.
- When the operator approves a gate, record it: `npm run reimagine -- gate <stage> --workspace workspaces/<pilot>`.
  This appends to the `gates` ledger and advances `assessment.stage`.
- Stages, in order: `intake → discovery → intent → feature-selection → architecture →
  synthetic-data → build → validation → publication`. Do not skip a gate; do not mutate the
  tenant before the `build` gate is authorized.

## Output format

At every gate, report:

| Section | Content |
|---|---|
| Completed | Deterministic outputs and specialist results produced |
| Evidence | Artifact IDs and confidence |
| Unknowns | Access gaps, unsupported assets, and blockers |
| Decisions needed | Only choices required at the current gate |
| Next stage | Bounded actions after approval |

## Error handling

| Failure | Response |
|---|---|
| ZIP missing or inbox has multiple ZIPs | Stop and identify the exact source-selection problem |
| Git clone or revision fails | Preserve no partial success; report repository and revision error |
| Schema validation fails | Report every validation path and correct the producer |
| Source access fails | Record an access-denied unknown and reduce confidence |
| Unsupported workload appears | Preserve its identity and edges; add an adapter backlog item |
| Specialist conflicts with evidence | Reject the output and rerun with bounded evidence |
| Sensitive pattern is detected | Block publication, fix the originating artifact, and rescan |
| Clean import fails | Block release and diagnose the install path |

## References

| Reference | Load when |
|---|---|
| [Architecture](../../docs/ARCHITECTURE.md) | Designing adapters, trust boundaries, or extensions |
| [Operator workflow](../../docs/OPERATOR_WORKFLOW.md) | Executing or recovering a full pilot |
| [Environment scripts](../../scripts/README.md) | Preflight, solution-first creation, add-app-to-solution, and the everything-in-solution audit |
| [Solution model schema](../../schemas/solution-model.schema.json) | Producing or validating canonical evidence |
| [Synthetic data schema](../../schemas/synthetic-data-manifest.schema.json) | Designing publication data |

## Post-Run Reflection

After completing a multi-step workflow, follow [core section 5](../core/SKILL.md#5-post-run-reflection).
