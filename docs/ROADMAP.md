# Roadmap — kit ideas & backlog

Ideas for the Power Platform Reimagined kit that aren't scheduled yet. Each is a candidate, not a
commitment. Durable "why/how" background for shipped work lives in
[PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md); this file is the forward-looking wish list.

> Found something worth building while running a pilot? Add it here.

---

## Next up (designed — ready to build)

### SharePoint bridge — read‑only source ingestion

SharePoint isn't a target workload, but real solutions are SharePoint‑backed, so the kit needs to
**read** it. Three capabilities scoped; **#1 is designed and next to build** (full design + type map
in [SESSION_HANDOFF.md](SESSION_HANDOFF.md)):

1. **Lists → Dataverse tables — ✅ BUILT.** `scripts/read-sharepoint-list.ps1` (Graph device‑code)
   reads a live list's schema; `src/sharepoint-map.ts` + `reimagine sharepoint-map` map it to a
   `tables.json` (for `provision-tables.ps1`) + a source→target column map + decisions
   (Title→primary, choice→choice, lookup→lookup when in scope, person→text, calculated→skip, …),
   **schema only → synthetic data**. 5 mapper tests. *Remaining: a live validation against a real
   SharePoint site.*
2. **Docs → agent knowledge** *(next)* — download library files → sanitize → ground the agent
   (native SharePoint knowledge via the `add-knowledge` skill, or upload files).
3. **Create a demo SharePoint site + upload sanitized knowledge** — for a portable, self‑contained
   demo knowledge source.

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

## Related backlog

- **Mode-aware gate stages.** The `status`/gate ledger includes `discovery` + `intent` stages that
  are source-oriented; for **new-concept** they're trivial (the agent just approves them). A
  mode-aware stage list would be cleaner (deferred — low value vs. effort).
- See the **Kit backlog** section of [PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md) for additional
  improvements identified during pilots (PnP-script schema parser, SharePoint→Dataverse mapping
  template, retry/backoff around `pac code push`, add-app poll/retry).
