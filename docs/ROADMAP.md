# Roadmap — kit ideas & backlog

Ideas for the Power Platform Reimagined kit that aren't scheduled yet. Each is a candidate, not a
commitment. Durable "why/how" background for shipped work lives in
[PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md); this file is the forward-looking wish list.

> Found something worth building while running a pilot? Add it here.

---

## Next up (designed — ready to build)

### SharePoint bridge — read‑only source ingestion

SharePoint isn't a target workload, but real solutions are SharePoint‑backed, so the kit needs to
**read** it. Three capabilities scoped; **all three are built + live‑validated — the bridge is
complete** (full design in [SESSION_HANDOFF.md](SESSION_HANDOFF.md)):

1. **Lists → Dataverse tables — ✅ BUILT.** `scripts/read-sharepoint-list.ps1` (Graph device‑code)
   reads a live list's schema; `src/sharepoint-map.ts` + `reimagine sharepoint-map` map it to a
   `tables.json` (for `provision-tables.ps1`) + a source→target column map + decisions
   (Title→primary, choice→choice, lookup→lookup when in scope, person→text, calculated→skip, …),
   **schema only → synthetic data**. 5 mapper tests.    ~~*Remaining: a live validation against a real
      SharePoint site.*~~ **Done** — the BME pilot ran a real SharePoint-backed source through this to Dataverse.
2. **Docs → agent knowledge — ✅ BUILT.** `scripts/read-sharepoint-docs.ps1` (Graph device‑code)
   enumerates a site's document libraries + files (recursing folders) and can download them into the
   gitignored workspace; `src/knowledge-plan.ts` + `reimagine knowledge-plan` classify each file
   against Copilot Studio's rules (supported types, 512 MB/file, 500 files/agent), skip images/media,
   and emit a `knowledge-plan.json` + a `KNOWLEDGE.md` guide (upload sanitized files, or native
   SharePoint via `add-knowledge`). **Sanitize‑first, no source content published.** 8 planner tests.
3. **Create a demo SharePoint site + upload sanitized knowledge — ✅ BUILT.**
   `src/demo-knowledge.ts` + `reimagine demo-knowledge` validate a folder of publishable
   (synthetic/sanitized) files against the same Copilot Studio rules and **refuse if `reimagine scan`
   finds anything**, writing a plan + a `DEMO_KNOWLEDGE.md` guide; `scripts/publish-demo-knowledge.ps1`
   (Graph device‑code, Sites.Manage.All) re‑runs the sanitizer gate, creates/reuses the demo library,
   uploads the files (preserving folders), and writes the library URL for grounding via `add-knowledge`.
   5 planner tests. Portable, carries **no customer content**.

---

## Ideas

### Attach additional context / source files at intake (PPTX, Word, Markdown, PDF, …)

**Status:** idea · **Applies to:** all entry modes (solution ZIP, tenant solution, new concept)

**Opportunity.** Today intake captures the structured brief plus (for a ZIP mode) a single solution
package. Real projects also come with **supporting documents** — a pitch deck, a requirements doc,
architecture notes, a process map, screenshots. Let the operator drop these into the workspace at
intake so they travel with the pilot. Two distinct uses:

1. **Context (ground the work).** Background decks/docs/notes the agent reads during discovery and
   plan mode to better understand intent, terminology, personas, and constraints — beyond what the
   solution artifacts reveal. (Especially valuable for **new-concept**, which otherwise has only the
   intake text.)
2. **Reimagination target.** A file may itself be the thing to reimagine — e.g., a **PPTX** pitch or
   a Word process doc the operator wants turned into a working code app + Dataverse + agent
   experience. The operator marks such a file "reimagine this," and it becomes a first-class source.

**Sketch.**
- Wizard: an **"Additional files"** multi-file drop zone (separate from the single solution ZIP),
  available in every entry mode, with a per-file intent toggle: **Context** vs **Reimagine this**.
- Files land in `workspaces/<pilot>/evidence/context/` (or `evidence/attachments/`), each recorded
  as an `evidence` entry (sha256 + collector) so they're **traceable and citable** in
  `solution-model.json` — reuse `repository-artifact`/`owner-confirmation`, or add an `attachment`
  evidence `kind`.
- Discovery/plan: extract text from `.md`/`.txt` directly and from `.docx`/`.pptx`/`.pdf` via
  parsers; summarize into the current-state / plan evidence. Files flagged "reimagine this" are
  added as source components with their own reconstruction.

**Considerations.**
- **Sanitization first.** Attachments can carry secrets, customer names, or tenant identifiers. They
  stay in the **gitignored** workspace, must pass the publication sanitization scan, and are **never
  published raw** — only sanitized, non-identifying derivations may inform published assets.
- **Parsers/size.** `.docx`/`.pptx`/`.pdf` need text extraction (add lightweight parsers or route to
  a specialist); reuse the upload size cap (per-file) and validate types.
- **Schema.** Likely a new intake field for the attachments list (+ per-file intent) and possibly a
  new evidence `kind`; keep both additive and schema-validated.
- **Provenance.** Record each file's role (context vs target) and hash so decisions can cite it and
  the sanitizer can account for it.

---

### Reimagine a Microsoft 365 (declarative) Copilot agent

**Status:** idea · **Applies to:** a new source type — the source *is* an agent

**Opportunity.** The kit reimagines *solutions* (Dataverse/SharePoint/canvas) into code apps +
Dataverse + a Copilot Studio agent. But increasingly the **source itself is an agent**: a **Microsoft
365 Copilot declarative agent** (a Teams app package — `manifest.json` + a declarative‑agent JSON with
instructions, conversation starters, capabilities, knowledge, and API‑plugin actions), or a **Copilot
Studio agent** already published to M365. Operators will want to assess and modernize these — e.g., move
a brittle declarative agent to a governed Copilot Studio agent grounded on Dataverse, split an
over‑scoped agent into connected agents, or rebuild it "as code" with real ALM.

**Sketch.**
- **New source adapter — read the agent.** *Declarative agent:* ingest the **Teams app package** (`.zip`)
  / M365 agent export and parse `manifest.json` + the declarative‑agent JSON to extract **instructions**,
  **conversation starters**, **capabilities** (WebSearch, OneDrive/SharePoint, Graph connectors, code
  interpreter, image gen), **knowledge** (SharePoint/Graph URLs), and **actions** (API plugins / OpenAPI).
  *Copilot Studio agent:* reuse the existing clone/pull (the `clone-agent` / `manage-agent` skills) to get
  its YAML (topics, triggers, knowledge, actions, auth mode).
- **Reuse the agent‑as‑code build.** The kit already authors Copilot Studio agents via `pac copilot`
  (`scripts/build-agent.ps1`, `src/agent-build.ts`, `reimagine agent-guide`) and knows the M365 vs Copilot
  Studio distinction (`intake.target.agents.m365Copilot`). Map extracted instructions/knowledge/actions →
  a reimagined Copilot Studio agent (or a cleaned declarative agent), grounded on the reimagined Dataverse
  via the Dataverse MCP tool (logical‑name instructions per AGENT_BUILD.md §8).
- **Decisions to record.** capability→feature mapping ("OneDrive/SharePoint knowledge → `add-knowledge` on
  the demo site"; "API plugin → connector action or MCP tool"); auth mode (integrated Entra/M365 SSO vs
  DirectLine — the kit already splits `chat-sdk` / `chat-directline`); consolidation/split of agents.

**Considerations.**
- **Two agent models.** Declarative (M365 Copilot: manifest + instructions + capabilities, hosted by M365)
  vs Copilot Studio (bot/YAML, generative orchestration) are different authoring models — be explicit about
  source→target (declarative→Studio is the common modernization; note when to keep declarative).
- **Auth + grounding.** M365 agents use integrated Entra auth; grounding on Dataverse needs the MCP tool +
  the GA/Preview feature toggle + logical‑name instructions (AGENT_BUILD.md §8). The last mile is interactive.
- **No customer content.** Source instructions/knowledge may carry tenant identifiers or customer data —
  sanitize; publish only synthetic/non‑identifying instructions + demo knowledge.
- **Testing.** Reuse `create-eval-set` / `run-eval` (in‑product Copilot Studio evaluation) to confirm the
  reimagined agent behaves like the source on representative prompts.

---

### Reimagine an Azure‑hosted solution

**Status:** idea · **Applies to:** a new source type — an Azure workload

**Opportunity.** Many "solutions" worth reimagining live in **Azure**, not Power Platform: a web app +
Azure SQL + Functions/Logic Apps + APIM + Service Bus, defined by **Bicep/ARM** or just a running
**resource group**. Operators want two things: (a) **assess** the Azure architecture and (b) decide
**where each workload belongs** — the data‑centric, forms‑and‑workflow parts often reimagine cleanly as
**Dataverse + a code app + a Copilot Studio agent** (the kit's sweet spot), while compute‑heavy or
specialized parts **stay on Azure**, modernized (containers, serverless, managed data).

**Sketch.**
- **New source adapter — read the Azure solution.** Two ingest modes: (1) **IaC** — parse **Bicep/ARM**
  (or Terraform) to get the resource graph (types, SKUs, dependencies, app settings / connection strings →
  flag as secrets); (2) **live inventory** — use the **Azure MCP tools** / ARM (`group_resource_list`,
  `bicepschema`, `appservice`, `sql`, `functionapp`, `storage`, `cloudarchitect`, …) to read a
  subscription/resource group **read‑only**. Emit a normalized **Azure current‑state** (compute, data,
  integration, identity, networking) into `generated/current-state`.
- **Target routing (the key new decision).** Classify each workload **retain‑on‑Azure (modernize)** vs
  **move‑to‑Power‑Platform**: relational data + CRUD/forms/approvals + a user app → **Dataverse + code app
  + agent**; a public API / heavy compute / event pipeline / ML → **stay Azure** (ACA/AKS, Functions,
  managed Postgres/SQL, Service Bus). Produce a **coexistence architecture** (what calls what; where
  identity + data live) rather than forcing everything into Power Platform.
- **Reuse the pipeline for the Power‑Platform slice.** Parts routed to Power Platform flow through the
  existing gates (schema → `provision-tables` → synthetic data → code app → agent). Azure‑retained parts get
  a **modernized Bicep** + a deploy runbook (lean on the Azure MCP `deploy` / `azd` / `get_azure_bestpractices`
  / `wellarchitectedframework` tools).

**Considerations.**
- **Scope + boundary.** Azure solutions are unbounded — require an explicit boundary (one resource group /
  one app) and a retain‑vs‑move policy up front (an intent/feature‑selection decision).
- **Secrets + identity.** App settings / connection strings / Key Vault refs are secrets — never persist
  raw; the sanitizer must cover IaC + inventory dumps. Managed identity / Entra app registrations map to the
  target's identity model.
- **Synthetic data only.** Like the Power Platform path, the reimagined target uses **synthetic data**, not
  migrated production data.
- **Tooling already present.** The Azure MCP server (inventory, Bicep schema, cloud architect, WAF /
  best‑practices, deploy) can do the read + target design + deploy heavy lifting; the kit orchestrates + gates it.
- **Two flavors of "reimagine."** Be explicit: *Azure → Power Platform* (workload fit) vs *Azure → modern
  Azure* (architecture modernization). Start with the Azure→Power‑Platform slice (closest to the kit's core).

---

## Related backlog

- **Mode-aware gate stages.** The `status`/gate ledger includes `discovery` + `intent` stages that
  are source-oriented; for **new-concept** they're trivial (the agent just approves them). A
  mode-aware stage list would be cleaner (deferred — low value vs. effort).
- See the **Kit backlog** section of [PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md) for additional
  improvements identified during pilots (PnP-script schema parser, SharePoint→Dataverse mapping
  template, retry/backoff around `pac code push`, add-app poll/retry).
