# Environment scripts

Reusable, parameterized PowerShell for the env-aware stages of a reimagination. They enforce the
kit's core rule: **create one named unmanaged solution first, build everything inside it, and
verify.** All are idempotent and read the target via the Dataverse Web API (`az` token).

Prereqs: `pac` + `az` installed; `az login --tenant <target-tenant>`; System Customizer/Administrator.

| Script | Purpose | When |
|---|---|---|
| `preflight.ps1` | Phase 2 readiness: tools, `pac`/`az` auth to the target env, Dataverse reachability, maker role, code-apps feature note. | Before building |
| `analyze-artifacts.ps1` | **Discovery adapter:** unpack canvas `.msapp` (Power Fx) + flow `definition.json` from a source solution/repo and summarize real behavior into `behavior-evidence.md`. | During discovery (Phase 3) |
| `ensure-solution.ps1` | **Solution-first:** create the publisher + unmanaged solution. | First mutation step |
| `add-app-to-solution.ps1` | Add a deployed **code app** to the solution (push doesn't reliably do it). | Right after `pac code push` |
| `audit-solution.ps1` | **Everything-in-solution audit:** list components (tables, app, flows, connection references) + gap-scan custom tables not in the solution. | After building, before publish |

## Typical build order

```powershell
# 0. ready?
./scripts/preflight.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com

# 1. solution FIRST
./scripts/ensure-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com `
  -PublisherUnique <pub> -PublisherFriendly "<Publisher>" -Prefix <prefix> `
  -SolutionUnique <Solution> -SolutionFriendly "<Solution Display>"

# 2. create tables/choices with header  MSCRM.SolutionUniqueName=<Solution>   (see the pilot's provision script)
# 3. build + deploy the code app
pac code push --environment https://<org>.crm.dynamics.com/ --solutionName <Solution>
./scripts/add-app-to-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -SolutionUnique <Solution> -AppId <app-id>

# 4. connectors -> connection references in the solution (MSCRM.SolutionUniqueName header on the connectionreference)
# 5. VERIFY everything landed
./scripts/audit-solution.ps1 -EnvironmentUrl https://<org>.crm.dynamics.com -SolutionUnique <Solution> -Prefix <prefix>
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
