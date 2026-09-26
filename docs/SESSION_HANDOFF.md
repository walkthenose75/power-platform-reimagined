# Session Handoff — resume point

_Last updated: 2026‑09‑25 (session: kit hardening + Inventory v2 pilot + **SharePoint bridge COMPLETE — all 3 capabilities live‑validated**)._
Read this first to resume with **zero drift**. It is the single source of truth for where we are.

## TL;DR

The **Power Platform Reimagined** kit is mature and battle‑tested. This session hardened it
end‑to‑end, ran a **second full pilot** (Inventory Tracking v2) through all 9 gates to a published,
**directly importable** GitHub asset, and **empirically proved** the code‑app→solution limitation.
We then **built and LIVE‑VALIDATED the entire SharePoint bridge (all 3 capabilities)**:
1. **lists → Dataverse** (reader + mapper + CLI). A throwaway probe created real lists (text/choice/
   currency/boolean/date + a resolved lookup, person, calculated), read them via Graph, mapped them,
   deleted them — surfacing + fixing two live‑only bugs (BOM in the reader's JSON; system columns
   `ContentType`/`Attachments`).
2. **docs → agent knowledge** (reader + planner + CLI). A throwaway probe created a real document
   library, uploaded files (incl. a subfolder + a `.png`), read + downloaded them, and planned them
   into groundable/skipped knowledge with a `KNOWLEDGE.md` guide. Clean first‑try end‑to‑end.
3. **portable demo knowledge** (planner + CLI + Graph writer). A throwaway probe authored synthetic
   files, planned them (sanitizer‑gated), **created a demo library + uploaded**, **read it back** via
   the capability‑2 reader (cross‑capability verification), and deleted it — surfacing + fixing a
   live‑only bug (**non‑ASCII em‑dash in a `.ps1` breaks Windows PowerShell 5.1**, which reads
   BOM‑less scripts as ANSI).

- **Kit:** https://github.com/walkthenose75/power-platform-reimagined — public, `master`, **78 tests
  green** (`npm run check`), working tree **clean and in sync with origin**.
- **Demos (public, importable):** `walkthenose75/virtual-rounding`, `walkthenose75/inventory-tracker-go`.
- **Tenant:** Skunkworks POC `https://orgfd452920.crm.dynamics.com/` (env `db02e4be‑e8d1‑e733‑bbac‑10384a8f4212`,
  tenant `505fd4e7‑74f6‑4aec‑9c0e‑3ed624c84faf`), active `pac` + `az` as `admin@diax56912972.onmicrosoft.com`.

## ✅ DONE: the SharePoint **bridge** — all 3 capabilities BUILT + LIVE‑VALIDATED

The "SharePoint bridge" (read‑only source ingestion, since SharePoint isn't a target workload). All
three scoped capabilities are **complete and live‑validated**. Design is **LOCKED** — do not re‑litigate:

- **Source:** a **LIVE SharePoint site** (not PnP scripts for v1).
- **Auth:** **Microsoft Graph device‑code sign‑in** (SE signs in; least setup, cross‑platform).
  Read `GET /sites/{site-id}/lists/{list-id}/columns` (+ `/lists` to enumerate). Scope:
  `Sites.Read.All` (delegated) — confirm the device‑code client id/consent next session.
- **Fits the existing pipeline** (no new build machinery): `read list schema` → **type‑map** →
  emit `tables.json` → **`scripts/provision-tables.ps1`** (already supports string/memo/int/decimal/
  money/boolean/datetime/**choice**/image/file/lookup) → **synthetic‑data** → build.
- **Type map (the deterministic core to implement):**
  Title→**primary name** (string) · Text→string (carry maxLength) · Note→memo · Number→int/decimal ·
  Currency→money · Choice(single)→**choice** (local option set) · Choice(multi)→multiselect choice ·
  Yes/No→boolean · Date/DateTime→datetime · **Person/Group→text (display name) or lookup to a
  synthetic Staff table — NOT real `systemuser`** · **Lookup→Dataverse lookup only if the referenced
  list is also in scope (create that table first); else flatten to text + log a decision** ·
  Hyperlink→string(URL) · Picture→image · Managed metadata→choice/string · **Calculated/Rollup→NOT
  recreated (recompute in app)** · Attachments→file/notes.
- **Locked defaults:** person→text/synthetic; multi‑value lookups→simplify; **no source rows** (read
  schema only, generate synthetic data).
- **BUILT (commit `7d21509`) + hardened via live validation:** `scripts/read-sharepoint-list.ps1`
  (Graph device‑code → normalized schema JSON), `src/sharepoint-map.ts` (pure deterministic mapper →
  `tables.json` + source→target column map + decisions), `reimagine sharepoint-map` CLI, **6 mapper
  tests (65 total green)**, and the SKILL type‑map docs.
- **LIVE‑VALIDATED** on the tenant root site via a throwaway probe (created real lists → read via Graph
  → mapped → deleted). **Two live‑only bugs found + fixed:**
  1. **BOM** — the reader wrote JSON with `Set-Content -Encoding UTF8`, which on PS 5.1 prepends a
     UTF‑8 BOM that `JSON.parse` rejects (CLI said "No SharePoint schema"). Fixed: reader now writes
     BOM‑free via `[IO.File]::WriteAllText(..., UTF8Encoding($false))`, **and** the CLI strips a leading
     BOM defensively (helps every PS‑written JSON in the kit).
  2. **System columns** — `ContentType`/`Attachments` slipped past the readOnly/hidden filter as
     `type=unknown` and would have become junk Dataverse columns. Fixed: reader skips a plumbing‑column
     name set (`ContentType`, `Edit`, `DocIcon`, `Link*`, `_UIVersionString`, `Compliance*`, …) and
     normalizes `Attachments`→`attachments`; mapper guards the same set and maps `attachments`→**file**
     (with a decision). Confirmed: clean first‑try run, no BOM, `ContentType` gone, `Attachments`→file.
  - To re‑validate: run the probe pattern in `workspaces/_sp-probe/run.ps1` (gitignored throwaway; the
    device‑code client needs `Sites.Manage.All` to create+delete; read‑only use needs only
    `Sites.Read.All`).
- **Capability (2) docs → agent knowledge — BUILT + LIVE‑VALIDATED (this session):**
  `scripts/read-sharepoint-docs.ps1` (Graph device‑code → enumerate document libraries + files,
  recurse folders, optional `-DownloadDir` into the gitignored workspace, BOM‑free write),
  `src/knowledge-plan.ts` (pure planner → classify each file against Copilot Studio's supported types +
  **512 MB**/file + **500** files/agent, skip images/media, sanitize‑first) + `reimagine knowledge-plan`
  CLI (writes `knowledge-plan.json` + a **`KNOWLEDGE.md`** guide with two grounding modes: **upload**
  sanitized files [portable, default] or **native SharePoint** via the `add-knowledge` skill [in‑tenant
  pilot]). **8 planner tests.** Live probe (`workspaces/_kb-probe/run.ps1`, gitignored) created a real
  document library, uploaded files (incl. a subfolder + a `.png`), read + downloaded them, planned them
  (2 groundable / 1 skipped), ran `reimagine scan` on the downloads (clean), and deleted the library.
- **Capability (3) portable demo knowledge — BUILT + LIVE‑VALIDATED (this session):**
  `src/demo-knowledge.ts` (pure planner — reuses the capability‑2 classifier; builds an upload plan +
  `DEMO_KNOWLEDGE.md`) + `reimagine demo-knowledge` CLI (**refuses if `reimagine scan` finds anything**)
  + `scripts/publish-demo-knowledge.ps1` (Graph device‑code, Sites.Manage.All — re‑runs the sanitizer
  gate, creates/reuses the demo library, uploads files preserving folders, writes the library URL to
  `demo-knowledge-result.json` for grounding via `add-knowledge`). **5 planner tests.** Live probe
  (`workspaces/_dk-probe/run.ps1`, gitignored) authored synthetic files, planned + published them,
  **read them back via the capability‑2 reader** (cross‑capability verification), and deleted the library.
  - **Live‑only bug found + fixed:** a non‑ASCII **em‑dash in a `.ps1`** broke Windows PowerShell 5.1
    (it reads BOM‑less scripts as ANSI, so UTF‑8 `—` → mojibake `â€"` → parser error). Rule now:
    **keep `.ps1` files pure ASCII** in executable code. Verified with a `Parser::ParseFile` check.
- **⏭ The SharePoint bridge is COMPLETE.** Next candidates (pick with the operator): (a) exercise the
  full bridge inside a **real SharePoint‑backed pilot** end‑to‑end; (b) the **"additional context files
  at intake"** roadmap idea (PPTX/Word/PDF → context or reimagine target); (c) whatever the operator
  brings. See [ROADMAP.md](ROADMAP.md).

## This session's shipped work (all committed + pushed to the kit)

- **Copilot Studio agent as code** (`pac copilot`): `scripts/build-agent.ps1`, `src/agent-build.ts`
  + `reimagine agent-guide`; audit/acceptance recognize agent component **type 10225**. Verified live
  (published `inv_InventoryAssistant`, `inv2_InventoryAssistantv2`).
- **Agent last‑mile surfaced** to developers (MANUAL_STEPS, bundle README, app Assistant tab, status
  flow): authoritative Dataverse **MCP tool** steps (on by default for the Copilot Studio client),
  embed via `VITE_AGENT_EMBED_URL`.
- **New‑developer journey hardened** (no‑drift): SKILL first‑moves are **state‑based** (ingest→
  connect→preflight), `connect.ps1` is an explicit agent step, `start` gives actionable errors,
  wizard re‑submit preserves the ingested state.
- **Plan‑mode bootstrap:** `reimagine plan-scaffold` (seeds valid owner‑confirmation evidence +
  target decision) + a model‑authoring cheat‑sheet — kills the evidence‑centric‑schema friction.
- **`provision-tables.ps1` gained `choice`/optionset** columns.
- **Discovery now extracts Dataverse table columns** from `customizations.xml` (fixes the v1
  image‑drop root cause).
- **Turnkey demo data:** the bundle ships the CSVs **+ manifest + self‑contained loader** (+ a
  data README); `package.ts` copies them for every future bundle.
- **Self‑sufficient bundle:** complete README (prereqs, clone, correct app‑deploy sequence,
  one‑command data load, honest docs); `package.ts` now **copies the templatized code‑app source**.
- **Naming derivation** guidance for new‑concept builds; **`docs/ROADMAP.md`** created (intake
  context/source files idea).

## Key PROVEN learnings (durable — in `docs/PROCESS_LEARNINGS.md`)

- **Code app → solution requires the maker portal (PROVEN with a probe app, pac 2.12.2).** A code
  app is a `canvasapp` record (`canvasapptype = 4`), solution component **type 300**, whose
  `objectid` **is** the `canvasappid`. A freshly `pac code push`ed app has **no canvasapp record**,
  so `pac code push --solutionName`, the `AddSolutionComponent` Web API, and
  `pac solution add-solution-component` **all fail** ("CanvasApp … does not exist"). Only the portal
  **Add existing → App** creates the record. **Dataverse tables/choices/agent still land
  automatically** via `ensure-solution` + the `MSCRM.SolutionUniqueName` header; `audit-solution.ps1`
  + `acceptance.ps1` verify/gate everything‑in‑solution. `add-app-to-solution.ps1` now **resolves +
  verifies** (by `-AppName`/`-AppId`) and adds only when a record already exists.
- Agent as code is real; `pac copilot publish --bot <schema>` works headlessly; the **Dataverse MCP
  tool** is the one interactive OAuth step (on by default for the Copilot Studio client).
- Don't copy a code app's `node_modules` (partial‑copy → clean reinstall needed); `pac code init`
  refuses if `power.config.json` exists.

## Tenant state (as of sign‑off)

- **Live solutions:** `VirtualRounding` (earlier pilot, intact), `VizientAutomationIntake` (your other
  project — tables + option sets, all in‑solution).
- **`InventoryTracking` + `InventoryTrackingV2` and their `inv_`/`inv2_` tables were DELETED** from
  the tenant at some point (VirtualRounding survived, so the env was **not** reset). **Nothing lost:**
  the GitHub deliverable `inventory-tracker-go` has the importable managed+unmanaged ZIPs + app source
  + data — re‑import anytime.
- Cleaned up this session: the throwaway `AddAppProbe` solution + publisher (deleted); a harmless
  dummy code app "Add App Probe" (`44b747d3‑…`) remains — delete via portal > Apps if desired.

## How to resume

```powershell
cd C:\VSCodeProjects\power-platform-reimagined
git pull                      # ensure latest
npm run check                 # 64 tests should be green
pac auth list ; az account show   # confirm Skunkworks POC / tenant 505fd4e7…
# if tokens expired: pac auth create --environment https://orgfd452920.crm.dynamics.com/ ; az login --tenant 505fd4e7-74f6-4aec-9c0e-3ed624c84faf
npm run status                # kit's "where am I / next" (per workspace)
```

Then start the **SharePoint lists→Dataverse adapter** per the locked design above. Session findings
are also tracked in the session DB tables `v2_findings`, `dx_findings`, `pilot_findings`, and `todos`.
