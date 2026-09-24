# Architecture

## Purpose

The toolkit turns heterogeneous Power Platform evidence into a consistent, reviewable model and uses that model to drive documentation, architecture decisions, rebuilding, validation, and publication.

It deliberately separates deterministic extraction and validation from generative interpretation:

- deterministic utilities collect, normalize, validate, compare, and sanitize;
- AI specialists reconstruct behavior, recommend options, draft artifacts, and implement workload-specific changes;
- human approval gates resolve intent, scope, architecture, mutation, and publication decisions.

## Architectural layers

### 1. Intake

An assessment begins with a user-provided pilot name and one source:

- **Tenant source:** an installed solution in a Power Platform environment. The preferred path combines API metadata with a local exported and unpacked snapshot.
- **Repository source:** unpacked solution artifacts or exported packages in GitHub. An optional connected environment enriches runtime and dependency evidence.

The source choice never changes the canonical output contract. It changes evidence coverage and confidence.

### 2. Discovery adapters

Adapters enumerate solution-owned components, referenced dependencies, and environment-adjacent candidates. Supported workload families include:

- Dataverse tables, columns, relationships, choices, security, apps, and solution metadata;
- canvas apps as read-only source evidence;
- model-driven apps;
- Power Apps code apps;
- Power Automate cloud flows and child flows;
- Copilot Studio agents, topics, actions, knowledge, and connected agents;
- SharePoint sites, lists, libraries, columns, and permissions;
- connection references, environment variables, custom connectors, APIs, and external services.

Adapters return evidence records and normalized components. They do not emit final narrative conclusions.

### 3. Canonical solution model

`schemas/solution-model.schema.json` is the source-of-truth contract. Every material claim links to evidence and carries a confidence state:

- `observed`: directly supported by an artifact or API result;
- `inferred`: reasoned from available evidence but not confirmed;
- `owner-confirmed`: explicitly validated by a solution owner;
- `unknown`: unavailable, unsupported, ambiguous, or access-blocked.

The model distinguishes:

- source capabilities being preserved;
- intentional redesigns;
- approved net-new features;
- deferred feature opportunities.

Generated prose and diagrams are projections of this model, not independent sources of truth.

### 4. Recommendation and decision layer

Current-state findings and confirmed journeys feed two related processes:

1. **Feature ideation:** candidate features are scored for value, effort, risk, strategic fit, licensing, security, and demo impact.
2. **Target design:** capabilities are retained, redesigned, replaced, consolidated, or retired.

Canvas apps never become target canvas apps. Their capabilities become code-app requirements. Model-driven apps are retained or redesigned when native platform strengths justify them.

Architecture decisions capture alternatives, rationale, evidence, consequences, and acceptance criteria.

### 5. Synthetic data

Synthetic data is designed from confirmed scenarios and approved target behavior. The workflow may use schema and non-identifying aggregates, but it does not persist source rows.

The published dataset includes:

- stable synthetic identifiers;
- CSV files for human review and version control;
- a manifest defining entities, load order, relationships, counts, scenarios, and files;
- optional fictitious sample documents;
- an import-ready package or deterministic loader.

Small-group aggregates and other potentially identifying profiles are suppressed.

### 6. Build and validation

Specialist agents or skills implement bounded workload changes. The orchestrator validates their outputs against:

- the canonical model;
- approved architecture decisions;
- selected feature scope;
- security and sanitization rules;
- functional and deployment acceptance criteria.

The release target is an unmanaged solution. Validation occurs in a clean demo environment and covers import, connections, configuration, data loading, demonstration, and customization.

### 7. Publication

GitHub is the versioned distribution source. Solution HUB is the catalog and presentation layer. A hosted live demo is optional.

Publication outputs pass a deterministic sensitive-data scan and a human review before release.

## Specialist routing

The orchestrator discovers available capabilities at execution time and chooses the closest specialist:

| Workload | Preferred specialist behavior |
|---|---|
| Copilot Studio design/review/troubleshooting | Advisor |
| Copilot Studio YAML | Author |
| Copilot Studio clone/push/pull/publish | Manage |
| Copilot Studio evaluation and chat testing | Test |
| Canvas source analysis | Read-only inspection only; never a builder |
| Code-app architecture and implementation | Code-app architect and code-app workflows |
| Dataverse/model-driven | Dataverse and model-app specialists |
| Power Automate | Flow discovery, build, diagnostic, and lifecycle tools |
| Security review | Dedicated security-review capability |
| Cross-solution acceptance | Orchestrator |

Specialist output is evidence, not automatic approval. The orchestrator records provenance and verification.

## Trust boundaries

- Credentials remain in approved authentication stores and never enter artifacts.
- Private evidence stays below `workspaces/` and is excluded from source control by default.
- Row-level source data is not copied into the project.
- Only reviewed synthetic content can enter publication assets.
- Tenant IDs, environment URLs, identities, secrets, and customer configuration are prohibited in published assets.
- External mutation requires an explicit mutation gate even when local execution is on autopilot.

## Extensibility

Add a workload by defining:

1. discovery prerequisites and permissions;
2. deterministic evidence and component mappings;
3. confidence and unsupported-case behavior;
4. specialist routing;
5. generated documentation projections;
6. validation fixtures and acceptance tests.

Unsupported assets remain explicit gaps. The system must never manufacture success-shaped output for unavailable evidence.
