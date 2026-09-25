# Environment scripts

Reusable, parameterized PowerShell for the env-aware stages of a reimagination. They enforce the
kit's core rule: **create one named unmanaged solution first, build everything inside it, and
verify.** All are idempotent and read the target via the Dataverse Web API (`az` token).

Prereqs: `pac` + `az` installed; `az login --tenant <target-tenant>`; System Customizer/Administrator.

| Script | Purpose | When |
|---|---|---|
| `check-prereqs.ps1` | **Prerequisites doctor:** machine setup only — tools + versions, VS Code extensions, repo deps. No env/auth. Run FIRST via `npm run doctor`. | Day 1 / before intake |
| `connect.ps1` | **One-shot connect:** establish pac auth + az login + gh auth for the target env (interactive). Reads the brief with `-IntakePath`. | After intake, before the readiness gate |
| `preflight.ps1` | Phase 2 readiness: tools, `pac`/`az` auth to the **target** env, Dataverse reachability + maker role, **source readiness per entry mode** (tenant auth + solution exists / repo+revision reachable / uploaded ZIP present), and **enablement + licensing** (code-apps checkpoint, admin-rights note, best-effort Power Apps license probe). Reads the wizard brief with `-IntakePath`. | Before building |
| `export-source-solution.ps1` | **Tenant one-button:** export the named solution from the source env (unmanaged) and seed the workspace. Reads the brief with `-IntakePath`. | Tenant source ingest |
| `analyze-artifacts.ps1` | **Discovery adapter:** unpack canvas `.msapp` (Power Fx) + flow `definition.json` from a source solution/repo and summarize real behavior into `behavior-evidence.md`. | During discovery (Phase 3) |
| `ensure-solution.ps1` | **Solution-first:** create the publisher + unmanaged solution. | First mutation step |
| `provision-tables.ps1` | **Generic table provisioner:** create tables, columns, and lookups INSIDE the solution from a JSON spec (`-SpecFile`). Types: string/memo/int/decimal/money/boolean/datetime + one-to-many lookups. Idempotent. | After ensure-solution |
| `load-synthetic-data.ps1` | **Generic data loader:** load CSVs from a synthetic-data manifest (`-ManifestPath`), in `loadOrder`, resolving lookups by target key, type-aware, idempotent by key. | After the app is built |
| `add-app-to-solution.ps1` | Add a deployed **code app** to the solution (push doesn't reliably do it). | Right after `pac code push` |
| `audit-solution.ps1` | **Everything-in-solution audit:** list components (tables, app, flows, connection references) + gap-scan custom tables not in the solution. | After building, before publish |
| `acceptance.ps1` | **Definition of done:** one verdict (`ACCEPTED` / `NOT ACCEPTED`) — solution complete (tables + app + connection refs), gap scan clean, demo data seeded, app reachable, publication sanitization clean. Pilot-agnostic (`-SolutionUnique`/`-Prefix` or `-IntakePath`). | After building, before publish |

## Typical build order

```powershell
# 0. ready?  (reads the brief: target + source + enablement/licensing)
./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json
# or target only:
./scripts/preflight.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com

# 1. solution FIRST
./scripts/ensure-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
  -PublisherUnique <pub> -PublisherFriendly "<Publisher>" -Prefix <prefix> `
  -SolutionUnique <Solution> -SolutionFriendly "<Solution Display>"

# 2. create tables/columns/lookups INSIDE the solution from a JSON spec
./scripts/provision-tables.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -Solution <Solution> -SpecFile <tables.json>
# 3. build + deploy the code app
pac code push --environment https://<org>.crm.dynamics.com/ --solutionName <Solution>
./scripts/add-app-to-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -SolutionUnique <Solution> -AppId <app-id>

# 4. load synthetic data (manifest-driven, resolves lookups)
./scripts/load-synthetic-data.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -ManifestPath workspaces/<pilot>/synthetic-data/manifest.json
# 5. VERIFY everything landed
./scripts/audit-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -SolutionUnique <Solution> -Prefix <prefix>

# 6. DEFINITION OF DONE - one verdict before you call it complete
./scripts/acceptance.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -SolutionUnique <Solution> -Prefix <prefix> -AppUrl <play-url>
```

## Notes

- **Code app + solution:** a code app has **no `canvasapps` record until it's known to a solution**.
  Once added (portal *Add existing > App*, or `add-app-to-solution.ps1` via `AddSolutionComponent`
  ComponentType=300), it appears as a `canvasapps` record with a publisher-prefixed name and as a
  solution component (type 300).
- **Connection references** appear as solution component **type 10163**; create the
  `connectionreference` record with header `MSCRM.SolutionUniqueName=<Solution>`.
- These are deterministic env operations. The guided workflow calls them; you can also run them
  directly in the VS Code terminal.
