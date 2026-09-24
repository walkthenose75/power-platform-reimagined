# Power Platform Reimagined

Power Platform Reimagined is an evidence-backed workflow for understanding an existing Power Platform solution, designing a modern target, rebuilding it as an installable unmanaged solution, and preparing reusable GitHub and Solution HUB assets.

The toolkit is designed for Solution Engineers working in VS Code with Copilot. It combines:

- a guided AI workflow with explicit approval gates;
- deterministic schemas, validation, sanitization, and artifact generation;
- workload-specific specialist agents and skills;
- traceability from source evidence to target decisions;
- realistic synthetic demo data that does not copy source records.

## Target experience

1. Name a pilot and choose a solution ZIP, tenant, or GitHub source.
2. Discover the solution and its complete dependency closure.
3. Review evidence coverage, inferred behavior, and unknowns.
4. Confirm business intent and user journeys.
5. Propose, score, and select high-value new features.
6. Approve a target based on code apps, appropriate model-driven experiences, Dataverse, Power Automate, Copilot Studio, and justified supporting services.
7. Generate and approve a coherent synthetic demo dataset.
8. Build and validate an unmanaged solution in a clean environment.
9. Publish versioned GitHub assets and a Solution HUB submission bundle.

Existing canvas apps are documented as source artifacts only. Custom target experiences are Power Apps code apps. Existing model-driven apps are evaluated case by case.

## Current status

> **Resuming?** Start with [docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md) — it has the live
> repo/tenant state, learnings, and next steps.

The repository currently provides the reusable foundation:

- canonical solution-model and synthetic-data schemas;
- an assessment workspace initializer;
- schema validation and publication sanitization commands;
- the `reimagine-power-platform` guided skill;
- architecture and operator workflow documentation;
- tests for the deterministic core.

Pilot-specific discovery and rebuilding begin after a source solution is selected and the intake gate is approved.

## Quick start

Prerequisites:

- Node.js 20 or newer
- Power Platform CLI and environment access for tenant-based pilots
- VS Code with Copilot and the required Power Platform workload tools

```powershell
npm install
npm run check
npm run reimagine -- start --name "Fabrikam Care Operations" --zip .\inbox\FabrikamCare.zip --output workspaces/fabrikam-care
npm run reimagine -- validate --workspace workspaces/fabrikam-care
```

To point at GitHub instead:

```powershell
npm run reimagine -- start --name "Fabrikam Care Operations" --repo https://github.com/fabrikam/care-operations --revision main --output workspaces/fabrikam-care
```

If you prefer drag-and-drop, place exactly one ZIP in a local inbox directory:

```powershell
npm run reimagine -- start --name "Fabrikam Care Operations" --inbox .\inbox --output workspaces/fabrikam-care
```

After kickoff, open the generated `KICKOFF.md` in Copilot and ask: **Reimagine this Power Platform solution.**

Before publishing:

```powershell
npm run reimagine -- scan --path workspaces/fabrikam-care/publication
```

## Repository map

| Path | Purpose |
|---|---|
| `skills/reimagine-power-platform/` | Guided VS Code/Copilot workflow |
| `scripts/` | Env-aware PowerShell: preflight, solution-first creation, add-app-to-solution, everything-in-solution audit |
| `schemas/` | Versioned artifact contracts |
| `src/` | Deterministic CLI utilities |
| `tests/` | Validation and sanitization tests |
| `docs/ARCHITECTURE.md` | System design and trust boundaries |
| `docs/OPERATOR_WORKFLOW.md` | Stage-by-stage operator guide |
| `docs/PREREQUISITES.md` | Tooling, extensions, accounts, and licensing to set up first |
| `docs/CODE_APP_BUILD_RUNBOOK.md` | Concrete PAC-CLI code-app build sequence and preflights |
| `docs/PROCESS_LEARNINGS.md` | Reusable gotchas and adaptations captured during pilots |
| `docs/SESSION_HANDOFF.md` | Latest session state, learnings, and next steps (read when resuming) |
| `docs/INTAKE_APP_DESIGN.md` | Design for the guided local intake app |
| `workspaces/` | Local pilot evidence and generated artifacts; ignored by Git |

## Distribution contract

Each completed pilot should publish:

- unpacked solution source;
- an unmanaged solution package;
- guided installation and configuration instructions;
- reviewable CSV synthetic data plus an import-ready loader or package;
- architecture, user-journey, traceability, and customization documentation;
- demo script, diagrams, screenshots, and Solution HUB metadata;
- no secrets, source records, tenant-specific identifiers, or customer configuration.

See [Architecture](docs/ARCHITECTURE.md) and [Operator workflow](docs/OPERATOR_WORKFLOW.md) for the detailed design.
