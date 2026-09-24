# Session Handoff — Morning Catch‑Up

_Last updated: end of session 2026‑09‑23 (evening). Session ID: cdb16b3c‑13c1‑4166‑9569‑4b1c4b3f1939._

Read this first in the morning. It's the single source of truth for where we are.

## TL;DR

We built the **Power Platform Reimagined** kit **and** used it to reimagine the **Virtual
Rounding** solution end‑to‑end — from a legacy GitHub repo to a modern **Power Apps code app on
Dataverse**, deployed to a tenant, and **published as two public GitHub repos**.

- **Kit (reusable product):** https://github.com/walkthenose75/power-platform-reimagined (public)
- **Demo (reimagined solution):** https://github.com/walkthenose75/virtual-rounding (public)
- **Tenant:** Skunkworks POC (`https://orgfd452920.crm.dynamics.com/`), solution **VirtualRounding**

## What's live

### GitHub
| Repo | Visibility | Contents |
|---|---|---|
| `power-platform-reimagined` | public | The kit: intake wizard, schemas, CLI, skill, 8‑phase docs, tests (10/10 green) |
| `virtual-rounding` | public | The demo: code‑app source, unmanaged solution, synthetic data, Teams package, install/demo/hub docs |

### Power Platform (Skunkworks POC, tenant `505fd4e7‑…`)
- **Publisher:** Smartter Health (prefix `sh`)
- **Unmanaged solution:** `VirtualRounding` (display "Virtual Rounding")
- **Tables:** `sh_location` → `sh_sublocation` → `sh_room` (in the solution)
- **Code app:** "Virtual Rounding" (`6765134d‑f22e‑43d8‑9e24‑348f20ef8e82`) — deployed via
  `pac code push --solutionName VirtualRounding`
- **Synthetic data:** 2 hospitals (Fabrikam, Contoso), 3 units, 7 rooms — fictitious
- Play URL: `https://apps.powerapps.com/play/e/db02e4be‑e8d1‑e733‑bbac‑10384a8f4212/app/6765134d‑f22e‑43d8‑9e24‑348f20ef8e82`

> **Final evening state (confirmed):** `pac solution publish` → **Published All Customizations**,
> and `pac code list` → **"Virtual Rounding" app present**. The app push **succeeded**. The
> data‑count re‑check failed only because the **`az` token had expired** after several hours (it
> returned a server error page, not a data issue) — the 7 rooms were seeded and confirmed earlier.
> In the morning, `az login --tenant 505fd4e7‑…` then re‑run the verify block in "How to resume".

## The 8‑phase process (all documented in docs/REIMAGINE_PROCESS.md)

`1 Envision → 2 Prepare → 3 Deconstruct → 4 Reimagine → 5 Build → 6 Review → 7 Publish → 8 Evolve`

Status against the Virtual Rounding pilot: **Phases 1–7 proven.** Phase 8 (Evolve) is the
ongoing backlog/roadmap.

## Key learnings (all captured in docs/PROCESS_LEARNINGS.md)

1. **Two CLIs.** The `create-code-app` skill assumes the npm `power-apps` CLI; this machine used
   the **PAC CLI** (`pac code …`). Detect which is present; don't assume.
2. **Code apps must be enabled per environment** (first push → `403
   CodeAppOperationNotAllowedInEnvironment`); enablement takes minutes to propagate. This is the
   #1 preflight.
3. **Cross‑tenant auth.** Target env was in a different tenant than the default `microsoft.com`
   account. `pac auth create` + `az login --tenant <target>` were both required.
4. **Solution naming.** Unique names can't contain spaces and are immutable — use PascalCase
   unique + friendly display; keep "reimagine" branding out of the deliverable.
5. **Build everything in the solution.** All Dataverse artifacts go in a named unmanaged
   solution created up front.
6. **Code apps are NOT auto-added to the classic solution export** (0 `canvasapps`; `--solutionName`
   on push didn't associate it). **But** the code app **can be added to the solution manually via
   the maker portal** (Add existing > App) — the user did this. Verify solution membership after push.
7. **Teams framing needs a CSP change** — add `https://teams.microsoft.com` +
   `https://*.teams.microsoft.com` to the App CSP `frame-ancestors`, or the tab renders blank.
8. **Transient errors → retry:** `pac code push` DNS blips (`ENOTFOUND`/`ENOENT` to
   `*.powerplatform.com` / blob storage), table‑column `0x80040216` right after table create, and
   the enablement 403. All cleared on retry/backoff.
9. **Windows spawn shims.** Preflight had to use `shell:true` on Windows so `az`/`pac` (`.cmd`)
   resolve.
10. **Publishing.** `gh` CLI made repo creation trivial (`gh repo create --public --source . --push`);
    env‑specific IDs in `power.config.json` were templatized before publishing.

## Open items / next steps for the morning

- [ ] **Confirm the deployed app renders** with data (open the play URL in the tenant browser
      profile, or the Teams tab after the CSP change).
- [ ] **Verify data counts** (locations 2 / sublocations 3 / rooms 7) — see resume block.
- [ ] **Real Solution Hub submission** — `virtual-rounding/SOLUTION_HUB.md` is drafted with the
      repo URL; submit via the Solutions Hub form ("Fetch & Fill" from the repo).
- [ ] **Screenshots** for both READMEs / Solution Hub (app console, rounding grid).
- [ ] Optional: add `webApplicationInfo` (Entra app reg) for silent Teams SSO.
- [ ] Optional: extend the intake wizard to pre‑fill from an existing repo and add an env
      code‑apps‑enabled check once auth is present.
- [ ] Optional: build the **Phase 7 publish automation** into the kit CLI (wrap
      `package-repo.ps1` + `gh` + scan into `npm run reimagine -- publish`).

## How to resume (commands)

```powershell
# from the kit root
cd c:\VSCodeProjects\power-platform-reimagined

# 1. confirm tenant auth (active profile should be VirtualRoundingTarget / Skunkworks POC)
pac auth list

# 2. rebuild + redeploy the app if you changed it
cd workspaces\virtual-rounding\solution\virtual-rounding-app
npm install ; npm run build
pac code push --environment https://orgfd452920.crm.dynamics.com/ --solutionName VirtualRounding

# 3. verify data (needs: az login --tenant 505fd4e7-74f6-4aec-9c0e-3ed624c84faf)
$envUrl="https://orgfd452920.crm.dynamics.com"; $token=az account get-access-token --resource $envUrl --query accessToken -o tsv
$h=@{Authorization="Bearer $token"; "OData-Version"="4.0"}
foreach($t in 'sh_locations','sh_sublocations','sh_rooms'){ (Invoke-RestMethod "$envUrl/api/data/v9.2/$t?`$count=true&`$top=0" -Headers $h).'@odata.count' }

# 4. local preview of the app (live data)
npm run dev    # open the printed "Local Play" URL in the tenant browser profile

# 5. run the intake wizard (kit front door)
cd c:\VSCodeProjects\power-platform-reimagined ; npm run intake
```

## Repo scripts (in workspaces/virtual-rounding/solution/, gitignored from the kit)

- `provision-dataverse.ps1` — publisher + unmanaged solution + tables (idempotent)
- `rename-solution.ps1` — clean solution name + move components
- `seed-synthetic-data.ps1` — fictitious demo data (idempotent)
- `teams/build-teams-package.ps1` — Teams personal‑tab package
- `package-repo.ps1` — assemble the publishable demo repo

## Background processes at sign‑off

The intake wizard (`npm run intake`, port 5171) and the VR app dev server (`npm run dev`) and the
final verify command were running. They are being **stopped** at end of session — restart with
the commands above.
