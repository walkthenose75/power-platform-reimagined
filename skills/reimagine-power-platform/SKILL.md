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

## Non-negotiable boundaries

- Existing canvas apps are read-only source evidence. Build target custom experiences as code apps.
- Evaluate model-driven apps case by case.
- Do not retrieve or persist source business rows. Use schema and approved non-identifying aggregates only.
- Build and publish unmanaged solutions.
- A live demo is optional; clean installation and customization are required.
- Local read-only work may proceed on autopilot. Stop for the approval gates in this workflow.

## Workflow

### 1. Kick off intake

If a workspace does not exist, run one of:

```powershell
npm run reimagine -- start --name "<pilot-name>" --zip "<solution.zip>" --output "workspaces/<pilot>"
npm run reimagine -- start --name "<pilot-name>" --inbox "<inbox-directory>" --output "workspaces/<pilot>"
npm run reimagine -- start --name "<pilot-name>" --repo "<repository-url>" --revision "<branch-or-tag>" --output "workspaces/<pilot>"
```

Read `KICKOFF.md` and validate the workspace. For a tenant source that has not been exported, use the applicable lifecycle specialist to export it first.

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

### 3. Discover the dependency closure

Classify assets as solution-owned, referenced, or environment-adjacent. Discover Dataverse, SharePoint, canvas apps, model-driven apps, code apps, flows, Copilot Studio agents, connectors, environment variables, custom connectors, APIs, and dynamic dependencies.

Populate `solution-model.json`. Record access failures and unsupported artifacts in `unknowns`; never fill gaps with plausible content.

Stop at the discovery gate with coverage, evidence quality, and blockers.

### 4. Reconstruct intent

Generate current-state inventories, architecture, lineage, permissions, connections, user journeys, business rules, formulas, automation branches, agent behavior, integrations, and failure paths.

**Unpack the real artifacts — do not rely on docs alone.** For each canvas app, expand its export
`.zip`, then `pac canvas unpack --msapp <file> --sources <dir>` and read the screens'
`OnSelect`/`Patch`/`.Run(...)` logic. For each flow (embedded in the app package and standalone
zips), read `definition.json` for triggers, connector actions, Graph/HTTP calls, and exact field
writes. Record the concrete user actions and their data effects in a behavior document. A UI that
looks right but performs no real actions is an incomplete reimagining.

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

Produce architecture decisions, current-to-target traceability, selected-feature traceability, migration waves, coexistence, rollback, and acceptance criteria. Stop at the architecture gate.

### 7. Design synthetic data

Create a compact, coherent demo narrative with fictitious personas, relationships, lifecycle states, and purposeful edge cases. Do not derive rows from source content.

Generate reviewable CSV files, a manifest conforming to `schemas/synthetic-data-manifest.schema.json`, optional fictitious sample documents, and an import-ready package or loader. Validate integrity and repeatability. Stop at the synthetic-data gate.

### 8. Build after mutation approval

After explicit authorization, route implementation to workload specialists:

- custom experiences become code apps;
- approved model-driven experiences remain model-driven;
- build Dataverse, flows, agents, integrations, security, and configuration;
- use supported connection references and environment variables;
- export unpacked source and an unmanaged solution package.

Do not create target canvas apps.

### 9. Validate

Use workload test specialists first. Then import into a clean environment, configure connections and settings, load synthetic data, and run acceptance tests. Verify security, accessibility, failure behavior, teardown, and customization.

An import failure blocks release.

### 10. Package and publish

Generate GitHub and Solution HUB assets from approved artifacts. Include install, configuration, demo, customization, architecture, screenshots, diagrams, metadata, and optional video guidance.

Run:

```powershell
npm run reimagine -- scan --path "<publication-directory>"
```

Any finding blocks publication. Require human publication approval.

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
| [Solution model schema](../../schemas/solution-model.schema.json) | Producing or validating canonical evidence |
| [Synthetic data schema](../../schemas/synthetic-data-manifest.schema.json) | Designing publication data |

## Post-Run Reflection

After completing a multi-step workflow, follow [core section 5](../core/SKILL.md#5-post-run-reflection).
