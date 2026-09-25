# The Reimagine Process (least-friction design)

## Who this is for

You built a Power Platform solution 2–3 years ago. It still demonstrates a real, valuable
scenario in front of customers — but it's dated: canvas apps over SharePoint lists, PowerShell
setup, per-user accounts, manual wiring. Standing it up today is painful, and it doesn't show
the modern platform (code apps, Dataverse, Teams, Copilot).

Your source might be a **GitHub repo**, a **solution in a tenant**, a **.zip export**, or just
the **concept** in your head. You don't want to relearn the plumbing. You want a modern,
installable demo others can run — with the fewest possible steps.

## Design goal: least friction

You should only ever do **five things**:

1. Run one **intake wizard**.
2. Complete a couple of **sign-ins**.
3. Approve the **target plan**.
4. **Click through** the app in your tenant.
5. Approve **publish**.

Everything else is automated. The wizard **front-loads every decision and prerequisite** so the
agent never interrupts you mid-build. (The Virtual Rounding pilot proved why this matters — the
friction was never the code; it was code-apps enablement, cross-tenant auth, and solution
naming. The wizard now captures all of that up front.)

> **Recommended models:** run the build with the strongest agentic **coding** model available
> (Claude Sonnet-class); use a high-**reasoning** model (GPT-5 / o-series) for the architecture
> and plan-mode gates. Pick the strongest models your harness offers.

## The single spine

Everything flows through one artifact chain, so nothing is ever re-asked or re-derived:

`intake.json` → canonical solution model (evidence) → target design → unmanaged solution on your tenant → published GitHub + Solution Hub package

## The journey (8 phases)

```
1 Envision → 2 Prepare → 3 Deconstruct → 4 Reimagine → 5 Build → 6 Review → 7 Publish → 8 Evolve
   intent      readiness    understand      design       make      shape       share       sustain
```

Only phases **1, 6, and 7** need real attention from you. Phase 2 is a guided checklist; 3–5 run
largely hands-off; 8 is ongoing. Total hands-on decision time: ~15–20 minutes.

---

### Phase 1 — Envision
**Your question:** "What do I want to reimagine, and where should it end up?"
- **You do:** Run the intake wizard. Pick how you're starting — GitHub repo, `.zip` export,
  tenant solution, or a brand-new concept. Name it. Paste any context or assets. Say where it
  publishes.
- **The kit does:** Creates the workspace, records source provenance, seeds the canonical model
  and `intake.json`.
- **Gate:** — (this is your input)
- **You get:** A validated `intake.json` — the single brief that drives everything after.
- **Friction removed:** No scattered chat questions. One form, once. Handles both "modernize what
  exists" and "build a new idea."

### Phase 2 — Prepare  *(the "1.5")*
**Your question:** "Am I actually set up to do this?"
- **You do:** Complete up to two browser sign-ins (`pac`, `az`). If code apps are off, flip one
  admin toggle. Confirm a Premium license for end users.
- **The kit does:** Preflights everything that stalls builds — tool versions (Node/Git/pac/az),
  auth pointed at the right tenant, **source readiness** (tenant sign-in + the solution exists /
  repo+revision reachable / uploaded ZIP present), **code apps enabled** on the target env, your
  maker role, and a **Power Apps license** probe. One command reads the brief:
  `./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json`. Returns a green light or a
  short punch list with exact fixes.
- **Gate:** **Readiness gate** — the build won't start until it's green.
- **You get:** A readiness report; zero mid-build surprises.
- **Friction removed:** Every blocker we hit on the pilot (code-apps 403, cross-tenant auth,
  missing role) is caught here, up front — not two hours in.

### Phase 3 — Deconstruct
**Your question:** "What does this thing actually do today?"
- **You do:** Almost nothing — answer a couple of clarifying questions if intent is ambiguous.
  *(New-concept mode: describe the scenario instead.)*
- **The kit does:** Clones/unpacks/reads the source; reconstructs the data model (even from PnP
  setup scripts), apps, flows, dependencies, and integrations; builds a dependency graph; labels
  each fact **observed / inferred / unknown**; writes current-state docs.
- **Gate:** **Discovery review** — coverage and unknowns, not prose polish.
- **You get:** Current-state architecture, data model, user journeys, and a findings/unknowns
  register.
- **Friction removed:** No manual archaeology. The agent reads the old solution so you don't
  have to.

### Phase 4 — Reimagine
**Your question:** "What should it become — and what should we add?"
- **You do:** Approve the target plan. Choose which recommended new features go in **now** vs.
  the **backlog**.
- **The kit does:** Maps old→new (canvas→code app, SharePoint→Dataverse, model-driven only where
  it truly fits, Teams packaging); proposes **scored** feature ideas; designs the data model,
  security, and integrations; writes decision records and old→new traceability.
- **Gate:** **Architecture + feature-selection gate** — the one substantive approval.
- **You get:** A modern target design, a prioritized feature backlog, and full traceability from
  old to new.
- **Friction removed:** The agent proposes a complete modern architecture; you steer instead of
  design.

### Phase 5 — Build
**Your question:** "Make it real — and keep it all in one solution on my tenant."
- **You do:** Authorize the build once.
- **The kit does:** Creates the publisher and a **cleanly named unmanaged solution first**, then
  builds **everything inside it** — Dataverse tables, the code app, data sources, UI, and a
  coherent, **fictitious** synthetic dataset. The code-app UI is built with **Fluent UI 2** by
  default (Microsoft-native look, Teams theme sync, accessible), unless intake picks a custom
  design system.
- **Gate:** — (decisions were front-loaded; runs on autopilot).
- **You get:** A working app with tables and demo data, all contained in your solution.
- **Friction removed:** No plumbing, nothing stranded in the Default solution, no "reimagined"
  branding leaking into the deliverable; metadata-timing retries are automatic.

### Phase 6 — Review  *(your "Deploy")*
**Your question:** "Let me see it, and shape it."
- **You do:** Open the **Local Play** URL and click through with live data. Ask for changes in
  plain language. When ready, view the **deployed** app in your tenant.
- **The kit does:** Runs the local dev server (real data, hot reload); on your OK, **deploys
  (pushes)** the app into the solution and returns a play URL; iterates on your feedback and
  redeploys. Confirms the build against the **acceptance check**
  (`scripts/acceptance.ps1`) — an `ACCEPTED` verdict means solution-complete, data seeded, app
  reachable, and publication-clean.
- **Gate:** **Looks-good gate.**
- **You get:** A reviewed, working app in your tenant — a private draft, nothing shared yet.
- **Friction removed:** Preview locally before any push; edit by conversation; deploy is one
  command.

### Phase 7 — Publish
**Your question:** "Share it so other SEs can demo and customize it."
- **You do:** Approve publish; confirm the GitHub repo and Solution Hub details (mostly
  pre-filled).
- **The kit does:** Exports the unmanaged solution; unpacks source; assembles the **GitHub
  package** (source, solution zip, synthetic CSVs, setup guide, screenshots, architecture);
  generates the **Solution Hub submission** (metadata + polished narrative + demo script); runs a
  **sanitization scan** that blocks secrets, tenant IDs, URLs, and identities; pushes to GitHub
  and fills the Solution Hub form.
- **Gate:** **Publication gate** — only after the scan passes and you approve.
- **You get:** A GitHub repo and Solution Hub entry; an unmanaged solution any SE can import into
  their own tenant. *(A hosted live demo is optional.)*
- **Friction removed:** Catalog copy is auto-drafted; secrets can't leak; one approval ships it.

> **Two kinds of "deploy":** *you* deploy to your tenant to review (Phase 6); *other SEs* deploy
> by importing your published unmanaged solution into theirs.

### Phase 8 — Evolve
**Your question:** "How do I keep it from going stale again?"
- **You do:** Glance at the roadmap; re-run the process when the platform shifts or you want more
  features.
- **The kit does:** Maintains the prioritized backlog; tracks platform deprecations (e.g., the
  model-driven-in-Teams sunset); supports incremental re-reimagination and versioned releases.
- **Gate:** — (ongoing).
- **You get:** A living roadmap and a cheap path to the next refresh.
- **Friction removed:** The reason this solution needed reimagining — drift over 2–3 years — is
  now a managed backlog, not a rebuild from scratch.

---

## Maps to your outline

| Your outline | Phase |
|---|---|
| 1. What do you want to reimagine | 1 Envision |
| 1.5 Are you prepared / installed | 2 Prepare |
| 2. Deconstruct what you want to reimagine | 3 Deconstruct |
| 3. How do you want to reimagine it | 4 Reimagine |
| (build) | 5 Build |
| (review) | 6 Review |
| 5. Deploy / publish | 6 Review (to tenant) + 7 Publish (to GitHub/Hub) |
| 6. Maintain / Roadmap | 8 Evolve |

## Status of the moving parts

- **Proven on the Virtual Rounding pilot (currently at Phase 6 — Review):** repo intake,
  discovery, Dataverse-in-a-solution provisioning, code-app build, local preview against seeded
  data, deploy to tenant, synthetic data, gotcha capture.
- **Built:** the Phase 1 **intake wizard** (`npm run intake`) — a local browser stepper that runs
  preflight and writes a validated `intake.json` + `KICKOFF.md`.
- **Proven (Phase 7 publish):** solution export + repo packaging (`package-repo.ps1`) +
  sanitization scan + `gh repo create --public --push`. The pilot published two public repos —
  the reusable kit and the Virtual Rounding demo.

## Related

- [PREREQUISITES.md](PREREQUISITES.md) · [CODE_APP_BUILD_RUNBOOK.md](CODE_APP_BUILD_RUNBOOK.md)
  · [OPERATOR_WORKFLOW.md](OPERATOR_WORKFLOW.md) · [PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md)
