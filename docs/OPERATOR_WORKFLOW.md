# Operator Workflow

## Operating principles

- Work locally on autopilot where safe.
- Require approval before tenant mutation, deployment, publication, or any access expansion.
- Record evidence before interpretation.
- Keep observed, inferred, owner-confirmed, and unknown claims distinct.
- Use specialist agents for workload-specific work and validate their outputs centrally.
- Never copy source rows into project artifacts.

## Running the process: chat vs terminal

Run this as a **hybrid**. The two surfaces have different strengths:

| Do in Copilot chat (agent) | Do in the VS Code terminal (you) |
|---|---|
| Scaffolding, schema/UI generation, file edits | Interactive browser sign-ins: `pac auth create`, `az login` |
| Documentation, orchestration, validation | Admin-center toggles (e.g., enable code apps) |
| Non-interactive CLI (`init`, `build`, `push`, Web API scripts) | Quick one-off checks and retries during propagation waits |

Interactive credential/admin steps feel sluggish through chat because of the round-trip and
browser hand-off — run those directly in the terminal when the agent flags them. The guided
intake app exists to front-load these prerequisites so the agent flow isn't interrupted.

## Stage 1: Intake gate

Collect:

- pilot name;
- source type: solution ZIP, tenant, or repository;
- environment and solution identity, or repository URL and version;
- dependency boundary;
- permitted APIs and sites;
- source owner and intended audience;
- expected publication destination.

For a local export, drop one ZIP into an inbox or pass its path. For tenant sources, export the solution after authentication and ingest the resulting ZIP. For repository sources, pin a branch or tag. Kick off with:

```powershell
npm run reimagine -- start --name "Fabrikam Care Operations" --inbox .\inbox --output workspaces/fabrikam-care
```

The command preserves source provenance, creates the canonical model, validates intake, and writes `KICKOFF.md` for Copilot. Do not persist credentials or tokens.

## Stage 2: Discovery gate

Discover:

1. solution-owned components;
2. directly referenced dependencies;
3. environment-adjacent candidates.

Use the closest workload specialist for each bounded discovery task. Normalize evidence into the canonical solution model. Record unsupported formats, access failures, dynamic references, and missing dependencies as unknowns.

Run:

```powershell
npm run reimagine -- validate --workspace workspaces/fabrikam-care
```

The gate reviews coverage and unknowns, not narrative polish.

## Stage 3: Intent gate

Reconstruct:

- personas and user journeys;
- business rules and lifecycle states;
- formulas and app behavior;
- flow branches and failure handling;
- agent routing and grounding;
- permissions and ownership;
- integrations and data lineage.

Ask the owner to confirm material inferences. Update claim states rather than overwriting evidence history.

## Stage 4: Feature-selection gate

Accept builder and owner ideas and generate evidence-backed recommendations. Score every candidate consistently:

- user or business value;
- demo value;
- implementation effort;
- delivery and adoption risk;
- strategic fit;
- licensing impact;
- security and data impact;
- dependencies.

Select a bounded build set. Preserve the remainder in a ranked backlog. Keep baseline behavior separate from net-new scope.

## Stage 5: Architecture gate

Create:

- capability disposition map;
- canvas-to-code-app requirement map;
- model-driven retain/redesign decisions;
- SharePoint-to-Dataverse suitability decisions;
- target data and security model;
- integration and automation design;
- architecture decision records;
- current-to-target and feature traceability;
- migration waves, coexistence, rollback, and acceptance criteria.

Do not build until the target and selected feature set are approved.

## Stage 6: Synthetic-data gate

Design a small, coherent demo narrative with fictitious personas, realistic relationships, lifecycle states, and purposeful edge cases.

The workflow may use schema and approved non-identifying aggregates such as counts, ranges, null rates, cardinality, and status distributions. Suppress sensitive or small-group aggregates.

Generate:

- one reviewable CSV per Dataverse table;
- `synthetic-data-manifest.json`;
- optional fictitious sample documents;
- an import-ready package or loader.

Validate referential integrity, required values, choice values, load order, repeatability, scenario coverage, and source-data separation.

## Stage 7: Mutation gate and build

After explicit authorization:

- implement custom experiences as code apps;
- retain or redesign model-driven experiences as approved;
- create Dataverse tables and security;
- implement flows, agents, integrations, and configuration;
- package environment-specific settings correctly;
- export both unpacked source and an unmanaged solution.

Canvas builders are out of scope.

## Stage 8: Validation gate

Use workload-specific test specialists, then validate the integrated package in a clean environment:

1. import the unmanaged solution;
2. create or select connections;
3. apply environment configuration;
4. load synthetic data;
5. run functional and selected-feature acceptance tests;
6. verify security, accessibility, and failure behavior;
7. verify an SE can inspect and customize the solution;
8. remove the installation using documented teardown guidance.

## Stage 9: Publication gate

Prepare:

- GitHub README and release notes;
- unmanaged solution and unpacked source;
- installation, configuration, demo, and customization guides;
- synthetic data and loader;
- architecture diagrams and screenshots;
- Solution HUB title, industry, content types, technical areas, contributors, repository URL, optional live-demo URL, and narrative;
- optional presentation and video script.

Run:

```powershell
npm run reimagine -- scan --path workspaces/fabrikam-care/publication
```

Do not publish until the scan passes and a human approves the final assets.

## Recovery

| Condition | Required response |
|---|---|
| Source access fails | Record an access-blocked unknown; do not infer missing evidence |
| Repository lacks runtime configuration | Continue with reduced confidence and request optional environment enrichment |
| Unsupported component appears | Preserve its identity and dependency edges; add an adapter backlog item |
| Specialist output conflicts with evidence | Reject it, record the conflict, and rerun with the bounded evidence |
| Sensitive value is detected | Block publication, remove the value at its source, and scan again |
| Clean import fails | Treat the package as unreleasable; diagnose and repeat clean-environment validation |
