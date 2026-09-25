# Troubleshooting — quick fixes at the point of pain

Most stalls are environment/setup, not code. Find the symptom, apply the fix, continue. Deeper
background is in [PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md).

| Symptom | Cause | Fix |
|---|---|---|
| `403 CodeAppOperationNotAllowedInEnvironment` on first `pac code push` | Code apps not enabled on the env (or still propagating) | Enable **Power Apps code apps** in PPAC (Environment → Settings → Product → Features), then wait a few minutes and **retry** the push. It's admin‑gated. See [runbook P1](CODE_APP_BUILD_RUNBOOK.md#p1-enable-code-apps-in-the-target-environment-required). |
| `pac`/`az` commands target the wrong tenant | Default account ≠ target/source tenant | `pac auth create --environment <url>` and `az login --tenant <tenant-id>`. Confirm with `pac auth list` / `az account show`. The **source** may be a different tenant than the **target**. |
| Preflight/build fails with a **sign‑in / auth** error (not signed in to the target env) | `pac`/`az`/`gh` not connected to the target | Run the one‑shot **`./scripts/connect.ps1 -IntakePath workspaces/<pilot>/intake.json`** (pac + az + gh). The agent runs it; you just complete the browser prompt. Then re‑run preflight. |
| `start` says **"already ingested"** or **"Output workspace is not empty"** | The source was already ingested (or the folder has other files) | If already ingested you **don't need `start`** — run `npm run status` to continue. To re‑ingest from scratch, delete the workspace folder or pass a new `--output`. |
| Dataverse calls return `401` / az token error after a while | The `az` access token expired | Re‑run `az login` (or the command); tokens are short‑lived. Not a data problem. |
| Table column create fails with `0x80040216` right after creating a table | Metadata timing — the table isn't fully provisioned yet | Wait a few seconds and **retry**. This is expected right after table creation. |
| `pac code push` fails with `ENOTFOUND` / `ENOENT` to `*.powerplatform.com` or blob storage | Transient DNS/network blip | **Retry** with backoff. |
| Teams personal tab renders **blank** | App CSP `frame-ancestors` blocks Teams | Add `https://teams.microsoft.com` and `https://*.teams.microsoft.com` to the App CSP (PPAC → env → Settings → Product → Privacy + Security → Content security policy → **App**). |
| Exported solution has **only tables** (no code app) | Code apps aren't emitted by `pac solution export` | Expected. The app's ALM artifact is its **source**; deploy with `pac code push`. Add it to the solution via the portal (*Add existing → App*) or `scripts/add-app-to-solution.ps1`. |
| Acceptance says **NOT ACCEPTED — no rows** | Synthetic data not seeded | Seed the fictitious demo data, then re‑run `scripts/acceptance.ps1`. |
| Acceptance says **Code app in solution: none** | Code app not added — and it has no Dataverse record until the portal adds it | **Add it once via the portal:** Solutions → `<name>` → **Add existing → App** (proven necessary — `pac code push --solutionName`, the API, and `pac solution add-solution-component` can't add a code app that has no record yet). Then verify: `scripts/add-app-to-solution.ps1 -EnvironmentUrl <url> -SolutionUnique <name> -AppName "<display name>"`. |
| `pac` not found in the terminal | PAC CLI installed only via the VS Code extension | Install the standalone tool: `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`. Re‑run `npm run doctor`. |
| "Where am I? What do I do next?" | Lost the thread (new session / interruption) | `npm run status` (or `npm run reimagine`) — prints the current phase, pending gate, and the one next action. |

## Two readiness checks — don't confuse them

- **Doctor** (`npm run doctor`) — *"is my machine set up?"* Tools, versions, VS Code extensions,
  repo deps. No sign‑in. Run first.
- **Readiness gate** (`./scripts/preflight.ps1 -IntakePath workspaces/<pilot>/intake.json`) —
  *"can I build this pilot?"* Source auth, code‑apps enablement, license. Run after intake,
  before building.

Still stuck? Re‑run `npm run status` for the next action, and check
[PROCESS_LEARNINGS.md](PROCESS_LEARNINGS.md) for the full history behind each fix.
