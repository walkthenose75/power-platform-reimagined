# Code App Build Runbook (PAC CLI path)

Reusable procedure to build a reimagined target as a **Power Apps code app** using the Power
Platform CLI (`pac`), placing the app **and** its Dataverse tables in a dedicated **unmanaged
solution**. Use this when the npm-based `power-apps` CLI isn't available.

## Preflights — do these BEFORE building

### P1. Enable code apps in the target environment (REQUIRED)

> The Virtual Rounding pilot failed the first deploy with
> `403 CodeAppOperationNotAllowedInEnvironment ... Please reach out to your environment admin
> to enable Code app operations.` The local build succeeded; only the push was blocked.

Power Platform admins or environment admins enable it:

1. Go to https://admin.powerplatform.microsoft.com
2. **Manage** → **Environments** → select the target environment
3. **Settings** → expand **Product** → **Features**
4. Find **Power Apps code apps** → turn on the **Enable code apps** toggle
5. **Save**

End users who run the app need a **Power Apps Premium** license. For many environments, set
this via environment groups and rules.

> **Propagation delay:** after enabling the toggle, the setting can take **several minutes**
> to take effect. Until then, `pac code push` keeps returning the same 403. Wait a few minutes
> and retry rather than re-toggling. If it persists beyond ~15 minutes, re-open the feature and
> confirm the toggle actually saved.

### P2. Authenticate to the environment

- If the env is not in `pac auth list`: `pac auth create --environment <env-url>` (browser).
- Confirm the active profile targets the environment.

### P3. Azure CLI login (only for Web API table creation)

- The `add-dataverse` skill creates tables via the Dataverse Web API using
  `az account get-access-token` — a **separate login from `pac auth`**.
- `az login` to the **same tenant** as the environment. Requires System Administrator or
  System Customizer role.

### P4. Solution container

- The reimagined solution must live in a **named unmanaged solution**, not Default.
- Create a **publisher** (customization prefix) and an **unmanaged solution** BEFORE creating
  tables and BEFORE the app push, so every component lands inside it.

## 1. Scaffold

```
npx degit microsoft/PowerAppsCodeApps/templates/vite <path> --force
cd <path>; npm install
```

## 2. Initialize

```
pac code init --environment <env-url> --displayName "<App>"
```

Verify `power.config.json` (`environmentId` set; `appId` null until first push). A noisy
`Assertion failed ... UV_HANDLE_CLOSING` line on Windows at process exit is non-fatal.

## UI system — Fluent UI 2 (default)

Build the code-app UI with **Fluent UI 2** (Fluent v9) unless intake selects a custom design
system. It makes the app look first-party inside Power Apps and Teams, ships accessible
(WCAG/ARIA) components, and can auto-match the Teams theme.

```
npm install @fluentui/react-components @fluentui/react-icons
```

Wrap the app root in a `FluentProvider` and pick the theme by host:

```tsx
import { FluentProvider, webLightTheme, webDarkTheme, teamsLightTheme, teamsDarkTheme, teamsHighContrastTheme } from "@fluentui/react-components";
// In a Teams tab, read the theme from the Teams JS SDK (app.getContext()) and
// registerOnThemeChangeHandler; map "default|dark|contrast" -> teams*Theme.
// In a standalone browser, follow prefers-color-scheme -> webLight/webDark.
<FluentProvider theme={theme}>{/* app */}</FluentProvider>
```

Guidance:

- Use Fluent components (`DataGrid`, `Field`, `Dialog`, `Combobox`, `Button`, …) and
  `@fluentui/react-icons` instead of hand-rolled CSS; use `makeStyles`/tokens for spacing and color.
- Standardize on **v9** (`@fluentui/react-components`). Avoid v8 (`@fluentui/react`) and the
  deprecated Teams "Northstar."
- Keep components keyboard- and screen-reader-accessible; Fluent's defaults do most of this.

> Version note: the Virtual Rounding pilot app predates this convention (hand-rolled CSS);
> new reimaginings default to Fluent 2, and existing apps can be retrofitted.

## 3. Create publisher + unmanaged solution (Dataverse Web API)

Using the `add-dataverse` auth helper (az token):

- `POST /publishers` → `{ uniquename, friendlyname, customizationprefix }`
- `POST /solutions` → `{ uniquename, friendlyname, _publisherid_value }`

## 4. Create tables INSIDE the solution

- Web API `EntityDefinitions` with header `MSCRM.SolutionUniqueName=<solution-unique-name>`
  so each table is added to the solution.
- Create in dependency order (reference tables first).

## 5. Baseline build + push (into the solution)

```
npm run build
pac code push --environment <env-url> --solutionName <solution-unique-name>
```

Capture the app URL: `https://apps.powerapps.com/play/e/<env-id>/app/<app-id>`.

## Local preview (review before push)

Review the app locally with **live Dataverse data** before publishing to the tenant:

```
npm run dev
```

The `@microsoft/power-apps-vite` plugin prints a **Local Play** URL. Open it in the **same
browser profile** signed in to the target Power Platform tenant. The app is served from
localhost with hot reload, and the plugin resolves Dataverse connections — so seeded data loads.
No separate `pac code run` is needed for the Vite template. Iterate with HMR, then build and
`pac code push` once it looks right.

## 6. Add data sources, implement, redeploy

```
pac code add-data-source -a dataverse -t <prefix>_room   # per table
npm run build
# implement UI against generated services, then:
pac code push --environment <env-url> --solutionName <solution-unique-name>
```

## 7. Package as a Teams personal tab (optional target surface)

Code apps have **no one-click "Add to Teams"**, but a code app is a normal web app, so surface it
as a **custom personal tab**:

1. Keep tenant/env IDs out of source with a **tokenized manifest** (`manifest.template.json` with
   `{{APP_PLAY_URL}}` / `{{APP_DOMAIN}}`).
2. A build script fills the deployed play URL and produces a sideloadable package
   (`manifest.json` + `color.png` 192x192 + `outline.png` 32x32, zipped).
3. Sideload: **Teams > Apps > Manage your apps > Upload a custom app** > select the `.zip`.

> **CSP caveat (important):** code apps default their App **Content Security Policy**
> `frame-ancestors` to `'self' https://*.powerapps.com`, which **blocks Microsoft Teams from
> framing the app**. To embed in Teams, an admin must add Teams origins to the App CSP:
> PPAC > environment > **Settings > Product > Privacy + Security > Content security policy >
> App** tab, add `https://teams.microsoft.com` and `https://*.teams.microsoft.com` to
> `frame-ancestors`. Without this the tab loads blank in Teams (the app still runs in-browser).
> SSO inside the tab uses the app's own Entra sign-in; a `webApplicationInfo` Entra app
> registration can be added later for silent SSO.

The concrete `.zip` contains env + app IDs and is **environment-specific** — publish the
**template** and the build script, not the built zip.

## 8. Export the solution for publication

> **Code app ALM reality (preview):** `pac solution export` packages the **Dataverse schema**
> (tables, choices, relationships) but **not the code app binary** — there is no `canvasapp`
> record for a code app. The app's ALM artifact is its **source repo**; it is (re)deployed with
> `pac code push`. Plan the deliverable as **unmanaged solution (schema) + app source + a
> push step**, not a single all-in-one solution zip.

```
pac solution export --path <out.zip> --name <solution-unique-name> --managed false
pac solution unpack --zipfile <out.zip> --folder <src-folder>   # GitHub-ready source
```

## Notes / gotchas

- `pac code` is Preview; params: `init` (`--environment`, `--displayName`, ...),
  `push` (`--environment`, `--solutionName`).
- Prefer the env **URL** over a typed GUID. Power Platform environment IDs legitimately have
  non-RFC GUID version nibbles, so a "weird-looking" GUID may be valid.
- `pac solution` has no "create empty solution in env" verb; create via Web API (step 3) or
  the maker portal, then use `add-solution-component` / `MSCRM.SolutionUniqueName` to fill it.
