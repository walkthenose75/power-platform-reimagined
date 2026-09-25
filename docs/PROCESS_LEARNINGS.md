# Process Learnings (Reusable Kit)

Captured while running the Virtual Rounding pilot. These generalize to any SE reimagining a
Power Platform solution and should feed the `reimagine-power-platform` skill and docs.

## Real-run findings — Inventory pilot (solution-zip, 30 MB, Copilot Studio agents)

A second real run — a **30.74 MB** enterprise solution zip (canvas app + **2 Copilot Studio
agents** + 2 Dataverse tables) — surfaced and drove these fixes:

- **Intake Submit must never fail silently.** The success box rendered off-screen, so Submit
  "did nothing." Fixed: `submit()` shows a Saving… indicator, wraps `buildPayload` and the fetch
  in try/catch, renders the real error, disables the button while saving, and scrolls the result
  into view. Server now sends `Cache-Control: no-store` so a stale wizard is never used.
- **KICKOFF.md must reflect the operator's inputs.** The doc only showed entry mode/source/agents
  and pointed to `intake.json`, so a rich narrative + target + intent looked "lost." Fixed: added
  an **Operator inputs** section (target, synthetic prefs, keep/change/drop, feature ideas,
  Solution Hub metadata + full narrative).
- **Discovery must inventory Copilot Studio agents.** `analyze-artifacts.ps1` handled `.msapp`
  canvas apps and flow `definition.json` but **silently dropped the two Copilot Studio agents** —
  which were the whole point of the solution. Fixed: it now finds `bot.xml`, lists each agent
  (schema/display name), and notes that deep topic/action/knowledge discovery routes to the
  Advisor/Author specialists so agents are never dropped.
- **Dedupe canvas screens.** `pac canvas unpack` emits both `*.fx.yaml` and legacy `*.pa.yaml`,
  so every screen was reported twice. Fixed: prefer `.fx.yaml`, include a `.pa.yaml` only when no
  `.fx.yaml` exists, and show a clean screen name.
- **Fixed: the source zip no longer gets copied twice.** The wizard uploads + unpacks to
  `inbox/<pilot>/` (zip + `unpacked/`); `start --zip` now **moves** that staged zip (and its
  unpack) into `workspaces/<pilot>/evidence/source/` and clears the inbox staging dir, so there is
  a single copy in the self-contained workspace. A standalone CLI zip (outside `inbox/`) is still
  **copied**, never disturbed. Preflight accepts either the inbox path or the workspace evidence
  copy.

## Discovery depth — UNPACK the real packages, not just the docs (CRITICAL)

The single biggest miss on the pilot: I first reconstructed behavior from **README/docs + setup
scripts + schema only**, and the reimagined app came out as a faithful data model and UI **shell
that didn't actually do anything**. Fix: **download, unpack, and analyze the actual artifacts.**

- **Canvas apps:** the repo's `*.zip` app exports contain a `.msapp` (and often **embedded
  flows**). Unpack the app to Power Fx and read the screens' `OnSelect`/`Patch`/`.Run(...)`:
  ```
  Expand-Archive App_export.zip -DestinationPath out
  pac canvas unpack --msapp out\...\*.msapp --sources out\src   # Power Fx YAML
  ```
- **Flows:** read each `definition.json` (embedded in the app package and/or standalone flow
  zips). Capture triggers, connector actions, Graph/HTTP calls, and the exact field writes.
- **Reconstruct behavior from evidence**, then map every real action to the target. On the pilot
  the real actions were: browse by location, **set/clear patient name** (`Patch`), **Join**
  (`Launch(MeetingLink)`), **Invite family** (`ShareMeetingLink.Run` → email + `SharedWith+1` +
  `LastShare`), **Reset** (`ResetMeetingLink.Run` → Graph creates a new Teams meeting + clear
  patient + `SharedWith=0` + `LastReset`). See `workspaces/<pilot>/generated/current-state/behavior.md`.
- **Parity check before "done":** every source user action must have a working target
  equivalent (real data writes with visible UI changes), or be explicitly listed as a follow-up
  (e.g., real invite email via Office 365 connector; real Graph meeting via a flow).
- **Now automated:** `scripts/analyze-artifacts.ps1` performs this extraction (unpacks every
  `.msapp` to Power Fx, summarizes every flow `definition.json` incl. embedded ones) and writes
  `behavior-evidence.md`. Validated on the pilot: 2 canvas apps + 5 flow definitions extracted.

## Intake

- A **GitHub repository source** works well and gives strong *static* evidence (data schema
  from setup scripts, app inventory, flow zips, docs). It does **not** reveal runtime
  configuration (live connections, actual tenant/env values). Record these as `unknown` and
  request environment access only when needed.
- Older reference solutions often ship the data model as **PnP PowerShell** (`Add-PnPField`)
  rather than a packed solution — parse setup scripts for the authoritative schema.
- Repos may contain multiple versions (v1/v2). Confirm which version is the reimagination
  baseline before designing the target.

## Disambiguation

- Similarly named solutions can be **different products** (e.g., "Virtual Rounding" video
  visits vs. "Rounding for Patient Experience" Cloud for Healthcare). Don't merge them;
  confirm intent with the user and keep evidence separate.

## Target-platform facts (verified via Microsoft Learn, 2026-09)

- **Model-driven apps in Teams are deprecated** — no new apps can be added; existing stop
  working after 2026-05-01. Do not choose model-driven for a Teams target.
- **Canvas apps** have native "Add to Teams" but are excluded from our target pattern.
- **Code apps** have **no one-click "Add to Teams"** yet; surface them as a **custom Teams
  personal tab** (manifest `staticTabs.contentUrl` → code-app URL) with Teams JS SDK + SSO.
- Code app limitations to remember: public asset endpoint (use Conditional Access for IP
  control), no Secure Implicit Connections yet, no Power Platform Git integration, not in
  Power Apps for Windows, no PowerBIIntegration, no SharePoint forms integration.

## Build tooling — two CLIs, and how we adapted (IMPORTANT)

The `create-code-app` skill assumes the **npm-based Power Apps CLI** (`npx power-apps init/push`).
In this pilot that executable was **not present** (`npx power-apps` → "could not determine
executable to run"), because the scaffolded template no longer bundles `@microsoft/power-apps-cli`.
The machine did have the **Power Platform CLI (`pac`)**, so we adapted to the **`pac code` path**.

- **Detect which CLI is available** before building. Probe `node_modules/.bin` and
  `Get-Command pac`. Don't assume the npm CLI.
- `pac code` is **Preview** (`pac code [init|push|add-data-source|list|list-datasets|list-tables|run]`).
- Prereqs: **Node v22+** (we have v24), Git, and `pac` (dotnet global tool).
- Scaffold (`npx degit microsoft/PowerAppsCodeApps/templates/vite`) is CLI-agnostic and can
  run before the environment/auth is known.
- `pac code init` args: `--environment` (**GUID or absolute https URL**), `--displayName`,
  `--description`, `--buildPath`, `--appUrl`, `--logoPath`, `--region`. Writes `power.config.json`.
- `pac code push` args: `--environment`, **`--solutionName`** (associate the app with a
  Dataverse solution — key for our unmanaged-solution deliverable).
- **Prefer the environment URL over a user-typed GUID.** The GUID we were given
  (`db02e4be-e8d1-e733-...`) looked malformed (invalid version nibble); the org URL
  (`https://orgfd452920.crm.dynamics.com/`) is unambiguous and `pac` accepts it directly.

## Auth

- `pac auth list` shows profiles; the **active** one may not be the target env. Confirm the
  Active row matches the target before init/push.
- If the target env is missing, `pac auth create --environment <url>` (interactive browser).
  Then `pac auth select --index N` or re-run create sets it active.
- `init`, `push`, and `add-data-source` (table creation) are **environment mutations** — gate
  behind explicit user authorization; confirm before the live/production deploy.

## Solution packaging (deliverable link)

- Use `pac code push --solutionName <name>` to place the code app in an **unmanaged solution**,
  then `pac solution export`/unpack to produce the GitHub-ready artifact. This connects the
  build step directly to the publication stage.

## Solution naming & scope — build everything in the target solution

- Create the unmanaged solution **first**, on the **same environment** the SE will deploy to, and
  build **every** component inside it: Dataverse tables, the code app (`--solutionName`), and any
  flows/connections. Nothing should land in the Default solution.
- Name the solution as the **deliverable**, not the tooling. Do not leak the kit's "reimagine"
  branding into the final solution — the pilot briefly used `VirtualRoundingReimagined` and had to
  rename to display **"Virtual Rounding"** / unique **"VirtualRounding"**.
- Dataverse solution **unique names cannot contain spaces** — that's why a spaced name looks
  "squished." Use a clean PascalCase unique name with a friendly display name.
- A solution's unique name is **immutable**. To rename: create a new solution, move components via
  the `AddSolutionComponent` action (ComponentType=1 for tables, `DoNotIncludeSubcomponents=false`
  to bring columns/relationships), then delete the old container (unmanaged deletion keeps the
  components in the environment).

## Build conventions — Fluent UI 2 + models

- **UI system: Fluent UI 2 (`@fluentui/react-components` v9) by default.** Reimagined code apps
  live inside Power Apps and Teams, so Fluent 2 gives a first-party look, accessible (WCAG/ARIA)
  components, and **Teams theme sync** (light/dark/high-contrast) for the personal-tab surface.
  Wrap the root in `FluentProvider`; use `@fluentui/react-icons` and Fluent components
  (`DataGrid`, `Field`, `Dialog`). Avoid v8 (`@fluentui/react`) and Northstar. The Virtual
  Rounding pilot predates this (hand-rolled CSS); default new work to Fluent 2. Intake captures
  `target.uiSystem` (`fluent2` | `custom`).
- **Models:** drive the build phases with the strongest agentic **coding** model available
  (Claude Sonnet-class); use a high-**reasoning** model (GPT-5 / o-series) for the architecture
  and plan-mode gates. Pick the strongest models the selected harness offers; the GitHub Copilot
  harness is single-agent (no background runs).

## Mapping pattern: SharePoint list → Dataverse
- Text-flag columns that trigger flows (e.g., "Reset Room", "Share Externally") become proper
  **choice/boolean fields + status**, with logic moved into the app or flows.
- Flatten reference CSVs (Location/SubLocation) into **related Dataverse tables with lookups**.

## Code app ALM — the app is NOT inside the classic solution export (IMPORTANT)

Verified on the pilot: after `pac code push --solutionName VirtualRounding`, the exported
unmanaged solution contained **only the 3 Dataverse tables** (RootComponent type=1). The code
app is **not** emitted as a classic solution component, and there are **0 `canvasapps` records**
for it — the code app's registration/binary is managed by the Power Apps app service and
deployed via `pac code push`, not packaged by `pac solution export`.

Implication for the deliverable model:

- The **unmanaged solution** (`VirtualRounding.zip`) carries the **Dataverse schema** (tables,
  choices, relationships) — this is the portable data model.
- The **code app's ALM artifact is its source** (the Vite project in the repo). Deploy it with
  `pac code push`.
- Therefore an SE installs the demo in **three steps**: (1) import the unmanaged solution, (2)
  `pac code push` the app from source to their environment, (3) seed synthetic data.
- Honors "build everything in the solution" as far as the platform allows today: **all Dataverse
  artifacts are in the named unmanaged solution**; the app is reproducibly deployed from source.
- Re-check periodically — code app + solution ALM is evolving in preview; a future release may
  package the app as a solution component.

> **Correction (morning after pilot):** `pac code push --solutionName` did **not** auto-associate
> the code app in this preview, but the code app **can be added to the unmanaged solution
> manually** via the maker portal (**Solutions > select solution > Add existing > App > the code
> app**). On the pilot the user added it by hand. So the deliverable *can* contain both schema and
> app in one solution — the gap is only that `--solutionName` didn't do it automatically. Kit
> action: after push, verify solution membership and, if missing, add the app.
>
> **Automation (now solved):** a code app has **no `canvasapps` record until it's known to a
> solution**; once added, it appears as `canvasapps` (publisher-prefixed name) and solution
> component **type 300**. The kit adds it via `AddSolutionComponent` (ComponentType=300,
> ComponentId=appId) in `scripts/add-app-to-solution.ps1`, and `scripts/audit-solution.ps1`
> verifies membership + flags any component built but not added.

## Transient errors to retry (not real failures)

The pilot hit several transient errors where the correct response is **retry**, not redesign:

- **`pac code push` → `getaddrinfo ENOENT <env>.environment.api.powerplatform.com`**: transient
  DNS failure to the environment API. The same host resolved and pushed on immediate retry. Add
  automatic retry-with-backoff around `push`.
- **Table column create → `0x80040216 An unexpected error occurred`**: table metadata not ready
  immediately after creation. Retry with a short delay (the provisioning script does this) and
  add a settle pause after `New-Table`.
- **First `pac code push` after enabling code apps → `403 CodeAppOperationNotAllowedInEnvironment`**:
  enablement propagation delay (minutes), not a permanent block. Retry until it clears.

## Connectors in code apps (Office 365 example)

- **Delegated (OAuth) connections must be created interactively** in the maker portal — they
  can't be created headlessly (`pac connection create` only makes **service-principal**
  connections). The agent can do everything else; the user does the ~20-second sign-in.
- Add a connector to a code app: `pac code add-data-source --apiId shared_office365
  --connectionId <id>`. It generates a typed service (`Office365OutlookService.ts`) and adds a
  `connectionReferences` entry to `power.config.json` (portable — connector id only, no secret).
- Call it from JS: `Office365OutlookService.SendEmailV2({ To, Subject, Body, Importance })`.
  Results are `IOperationResult` (`success`, `data`, `error`) — check `success`.
- **Make it solution-aware:** create a `connectionreference` record with header
  `MSCRM.SolutionUniqueName=<solution>` (logical name needs the publisher prefix, e.g.
  `sh_office365outlook`). It appears as solution component **type 10163**.
- **Gotcha:** the Office 365 Outlook connector's generated **calendar** client does **not**
  expose an online-meeting **join URL**, so it can't create a usable Teams meeting. For a real
  Teams meeting link, use the Microsoft Teams connector or the **Graph app-auth pattern in a
  cloud flow** (`POST /communications/onlinemeetings`) — which is exactly what the original
  solution did (secret kept server-side in the flow, never in the client app).

## Kit backlog (improvements identified)

- **PREFLIGHT: verify code apps are ENABLED in the target environment before scaffolding.**
  The Virtual Rounding pilot hit `403 CodeAppOperationNotAllowedInEnvironment` on first
  `pac code push` — the local build succeeded but deploy was blocked because the environment
  did not have code apps turned on. Add an explicit preflight check + clear remediation.
- Add a discovery adapter/parser for **PnP PowerShell** setup scripts → canonical schema.
- Add a **Teams personal-tab packaging** helper (manifest generation for a deployed code-app URL).
  Implemented for the pilot (`teams/build-teams-package.ps1`). **Key gotcha:** the code app's App
  CSP `frame-ancestors` defaults to `'self' https://*.powerapps.com` and must be extended with
  `https://teams.microsoft.com` + `https://*.teams.microsoft.com` (PPAC > Privacy + Security >
  Content security policy > App) or the Teams tab renders blank.
- Add a **SharePoint-list-to-Dataverse** mapping template to the synthetic-data + schema stages.
- Add an **`az login` preflight** for the Dataverse Web API table-creation path (the add-dataverse
  skill authenticates via `az account get-access-token`, a separate login from `pac auth`).
- Add a **solution-container preflight**: create publisher + unmanaged solution up front and
  create every table/app inside it (requirement: reimagined solution must live in a named
  unmanaged solution, not Default).

### Intake wizard UX (from user feedback)

- **Step 2 Source — `.zip` browse button.** Replace the free-text "Path to solution .zip" with a
  **file browse button**. On Next, **copy the chosen `.zip` into the current VS Code working
  directory** (e.g. `inbox/`) and **unzip it**, then proceed. (Browsers can't move arbitrary local
  files by path, so the wizard server must receive the uploaded file and write it, or use a VS Code
  file-picker integration.)
- **Step 2 — explain "Dependency boundary."** The options are unclear. Add plain-language help
  text under each choice:
  - *Full closure (recommended)* — the solution **plus everything it depends on** (SharePoint
    lists, connections, child flows, custom connectors, external APIs, adjacent assets).
  - *Directly referenced only* — the solution **plus only what its components reference directly**
    (one hop); skips deeper/indirect dependencies.
  - *Solution-owned only* — **only the components packaged inside the solution**; fastest, misses
    external dependencies.
