import { copyFile, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IntakePayload } from "./intake-kickoff.js";
import { renderAgentBuild } from "./agent-build.js";
import { type RecordedManualStep, renderManualGuide } from "./manual-steps.js";
import { type PublishTarget, renderPublishTarget } from "./publish.js";
import { scanPath } from "./sanitizer.js";
import type { ScanFinding } from "./types.js";

export interface HubReadiness {
  ready: boolean;
  present: string[];
  missing: string[];
}

export interface PackageReport {
  workspace: string;
  outputDir: string;
  pilotName: string;
  hub: HubReadiness;
  hubManifest: Record<string, unknown>;
  publishTarget: PublishTarget;
  scanFindings: ScanFinding[];
  files: string[];
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Required "Solution City" / Solution Hub fields for a submission to be ready. */
const HUB_REQUIRED = ["title", "industry", "contentTypes", "technicalAreas", "narrative", "githubRepoUrl"] as const;

function computeHub(intake: Record<string, unknown> | null, pilotName: string): { manifest: Record<string, unknown>; readiness: HubReadiness } {
  const publish = (intake?.publish ?? {}) as Record<string, unknown>;
  const hub = (publish.solutionHub ?? {}) as Record<string, unknown>;
  const manifest: Record<string, unknown> = {
    title: (hub.title as string) || pilotName,
    industry: (hub.industry as string) || "",
    contentTypes: Array.isArray(hub.contentTypes) ? hub.contentTypes : [],
    technicalAreas: Array.isArray(hub.technicalAreas) ? hub.technicalAreas : [],
    contributors: (hub.contributors as string) || "",
    narrative: (hub.narrative as string) || "",
    githubRepoUrl: (publish.githubRepoUrl as string) || ""
  };
  const isPresent = (key: string): boolean => {
    const v = manifest[key];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : Boolean(v);
  };
  const present = HUB_REQUIRED.filter(isPresent);
  const missing = HUB_REQUIRED.filter((k) => !isPresent(k));
  manifest.readiness = { ready: missing.length === 0, present, missing };
  return { manifest, readiness: { ready: missing.length === 0, present: [...present], missing: [...missing] } };
}

function renderReadme(
  pilotName: string,
  source: string,
  hub: Record<string, unknown>,
  opts: { hasAgents?: boolean; appDir?: string } = {}
): string {
  const hasAgents = opts.hasAgents ?? false;
  const appDir = opts.appDir ?? "solution/<app>";
  const repo = (hub.githubRepoUrl as string) || "<this-repo-url>";
  const title = (hub.title as string) ?? pilotName;
  const narrative = (hub.narrative as string) || `${pilotName} — a modern, installable Power Platform demo.`;
  const agentInside = hasAgents
    ? "\n- `AGENT_BUILD.md` — the Copilot Studio agent: built **as code**, plus the 2‑click Dataverse MCP consent, publish, and embed"
    : "";
  const agentStep = hasAgents
    ? "\n5. **Finish the agent** — follow `AGENT_BUILD.md`: add the Dataverse MCP tool (one‑time consent), publish, then set `VITE_AGENT_EMBED_URL` and redeploy to embed it in the app's Assistant tab."
    : "";
  return `# ${title}

${narrative}

> Reusable demo asset. Contains no secrets, source records, or tenant-specific identifiers.

## Prerequisites

- A Power Platform environment where you can create solutions, with **Power Apps code apps enabled**
  (admin: PPAC → Environment → Settings → Product → Features).
- **Node.js 22+**, the **Power Platform CLI** (\`pac\`), and the **Azure CLI** (\`az\`).
- Maker access (System Administrator or equivalent) to import a solution and deploy a code app.

## Quick start

\`\`\`powershell
git clone ${repo}
cd ${title.replace(/[^\w.-]+/g, "-").toLowerCase()}
\`\`\`

Then follow **Install** below (~10 minutes).

## What's inside

- \`solution/\` — the importable **solution package(s)** (Dataverse tables${hasAgents ? " + agent" : ""}) **and** the code‑app source (\`${appDir}/\`)
- \`synthetic-data/\` — reviewable, fictitious demo data (CSV) + a one‑command loader
- \`MANUAL_STEPS.md\` — UI/admin steps that can't be automated (enablement, connections, sharing, …)${agentInside}
- \`SOLUTION_HUB.md\` / \`solution-hub.json\` — Solution City / Solution Hub submission fields
- \`docs/\` — architecture / demo notes (starter you can flesh out)

## Install (in your own environment)

1. **Import the solution.** [make.powerapps.com](https://make.powerapps.com) → **Solutions → Import solution** → pick the \`*_managed.zip\` in \`solution/\` (or \`*_unmanaged.zip\` if you want to customize). This creates the Dataverse tables${hasAgents ? " and the Copilot Studio agent" : ""}.
2. **Deploy the code app** from source (its \`power.config.json\` is templatized, so init sets your own ids):
   \`\`\`powershell
   cd ${appDir}
   npm install
   pac code init --environment <your-env-url> --displayName "${title}"
   pac code push --solutionName <SolutionUniqueName>
   \`\`\`
   Then add the app to the solution once in the portal (**Solutions → your solution → Add existing → App**).
3. **Load the demo data** (resolves lookups automatically):
   \`\`\`powershell
   az login
   ./synthetic-data/load-synthetic-data.ps1 -EnvironmentUrl <your-env-url> -ManifestPath ./synthetic-data/manifest.json
   \`\`\`
   (Portal / Package Deployer alternatives are in \`synthetic-data/README.md\`.)
4. **Complete the UI/admin steps** in \`MANUAL_STEPS.md\` (connections, Teams CSP, sharing).${agentStep}

## Demo

${narrative} Walk the app's tabs to show it end‑to‑end; drop screenshots and a short script into \`docs/\`.

## Customize

The code app is built with **Fluent UI 2** (\`@fluentui/react-components\`). Fork, edit \`${appDir}/src\`, and \`pac code push\` to your environment.
`;
}

function renderSolutionReadme(pilotName: string, appDir: string | null, hasAgents: boolean): string {
  const app = appDir ?? "the code-app source folder";
  const appName = appDir ? path.basename(appDir) : "<app>";
  return `# Solution artifacts — import into your own environment

This folder makes **${pilotName}** installable in Power Platform.

## What's here

- \`*_managed.zip\` — **import this** for a clean managed install (Dataverse tables${hasAgents ? " + the Copilot Studio agent" : ""}).
- \`*_unmanaged.zip\` — import instead if you want to **customize** the solution.
- \`${appName}/\` — the **code‑app source** (React + Vite + Fluent UI 2). Code apps aren't packaged inside a classic solution export, so the app ships as source and deploys with \`pac code push\`.

## Install (3 steps)

1. **Import the solution** — [make.powerapps.com](https://make.powerapps.com) → **Solutions → Import solution** → the managed (or unmanaged) zip.
2. **Deploy the app** — ensure code apps are enabled, then from \`${app}/\`:
   \`\`\`powershell
   npm install
   pac code init --environment <your-env-url> --displayName "${pilotName}"
   pac code push --solutionName <SolutionUniqueName>
   \`\`\`
   Then add the app to the solution once in the portal (**Solutions → your solution → Add existing → App**).
3. **Load demo data** — see \`../synthetic-data/README.md\`.

> \`${appName}/power.config.json\` is templatized (\`appId: null\`, \`environmentId: {{ENVIRONMENT_ID}}\`); \`pac code init\` sets your own values. No secrets or tenant identifiers.
`;
}

function renderDocsReadme(pilotName: string): string {
  return `# ${pilotName} — documentation

Starter for the demo package's supporting docs. Fill these in as you prepare the demo:

- **Architecture** — target components (Dataverse tables, code app, agent) and how they connect.
- **Data model** — tables, columns, and relationships (see the solution + \`../synthetic-data/\`).
- **User journeys** — the key flows the app supports.
- **Demo script** — a 3–5 minute walkthrough of the app's tabs.
- **Screenshots** — drop images here and reference them from the demo script.

Install + usage instructions are in the repo root \`README.md\`; UI/admin steps are in \`../MANUAL_STEPS.md\`.
`;
}

function renderHubDoc(manifest: Record<string, unknown>, readiness: HubReadiness): string {
  const arr = (v: unknown): string => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));
  const status = readiness.ready ? "READY to submit" : `NOT ready — missing: ${readiness.missing.join(", ")}`;
  return `# Solution City / Solution Hub submission

**Status: ${status}**

Fetch & Fill — copy these into the Solution Hub form:

| Field | Value |
|---|---|
| Title | ${manifest.title ?? ""} |
| Industry | ${manifest.industry ?? ""} |
| Content types | ${arr(manifest.contentTypes)} |
| Technical areas | ${arr(manifest.technicalAreas)} |
| Contributors | ${manifest.contributors ?? ""} |
| GitHub repo | ${manifest.githubRepoUrl ?? ""} |

## Narrative

${manifest.narrative || "_(add a narrative — the kit can draft one from the intake problem statement)_"}
`;
}

function describeSource(model: Record<string, unknown> | null, intake: Record<string, unknown> | null): string {
  const src = (model?.source ?? null) as Record<string, unknown> | null;
  if (src?.type) return String(src.type);
  return (intake?.entryMode as string) ?? "unknown";
}

async function copyDirIfPresent(from: string, to: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(from);
  } catch {
    return false;
  }
  if (entries.length === 0) return false;
  await mkdir(to, { recursive: true });
  let copied = false;
  for (const entry of entries) {
    try {
      await copyFile(path.join(from, entry), path.join(to, entry));
      copied = true;
    } catch {
      /* skip subdirs/errors in this shallow copy */
    }
  }
  return copied;
}

async function copyFileIfPresent(from: string, to: string): Promise<boolean> {
  try {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy the code-app source into the bundle so it's self-contained (deployable with `pac code push`).
 * Finds the app dir under `<workspace>/solution/` (the one with a `power.config.json`), copies it
 * excluding `node_modules`/`dist`/`.git`, and templatizes `power.config.json` so it carries no
 * tenant identifiers. Returns the app dir's relative path in the bundle (e.g. `solution/inventory-app`).
 */
async function copyCodeAppSource(workspace: string, outputDir: string): Promise<string | null> {
  const solDir = path.join(workspace, "solution");
  let entries: string[];
  try {
    entries = await readdir(solDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    const appDir = path.join(solDir, name);
    try {
      await readFile(path.join(appDir, "power.config.json"), "utf8");
    } catch {
      continue; // not a code-app dir
    }
    const destRel = path.join("solution", name);
    const dest = path.join(outputDir, destRel);
    await cp(appDir, dest, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(appDir, src);
        return !rel.split(path.sep).some((seg) => seg === "node_modules" || seg === "dist" || seg === ".git");
      }
    });
    try {
      const cfgPath = path.join(dest, "power.config.json");
      const cfg = JSON.parse(await readFile(cfgPath, "utf8")) as Record<string, unknown>;
      cfg.appId = null;
      cfg.environmentId = "{{ENVIRONMENT_ID}}";
      await writeFile(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    } catch {
      /* leave config as-is if it can't be parsed */
    }
    return destRel.replaceAll("\\", "/");
  }
  return null;
}

export async function packagePublication(workspace: string, options: { outDir?: string } = {}): Promise<PackageReport> {
  const intake = await readJson(path.join(workspace, "intake.json"));
  const model = await readJson(path.join(workspace, "solution-model.json"));
  const assessment = (model?.assessment ?? {}) as Record<string, unknown>;
  const pilotName = (assessment.name as string) || (intake?.pilotName as string) || path.basename(workspace);
  const source = describeSource(model, intake);
  const outputDir = options.outDir ?? path.join(workspace, "publication");

  const { manifest, readiness } = computeHub(intake, pilotName);

  await mkdir(path.join(outputDir, "docs"), { recursive: true });
  await mkdir(path.join(outputDir, "solution"), { recursive: true });

  const files: string[] = [];
  const write = async (rel: string, content: string): Promise<void> => {
    await writeFile(path.join(outputDir, rel), content, "utf8");
    files.push(rel);
  };

  const agents = (intake as unknown as IntakePayload | null)?.target?.agents;
  const hasAgentsInScope = Boolean(agents && (agents.copilotStudio || agents.m365Copilot));

  // Copy the code-app source into the bundle (templatized) so it's self-contained + deployable.
  const appDir = await copyCodeAppSource(workspace, outputDir);
  if (appDir) files.push(`${appDir}/`);

  await write("README.md", renderReadme(pilotName, source, manifest, { hasAgents: hasAgentsInScope, ...(appDir ? { appDir } : {}) }));
  await write("SOLUTION_HUB.md", renderHubDoc(manifest, readiness));
  await write("solution-hub.json", `${JSON.stringify(manifest, null, 2)}\n`);
  await write(path.join("solution", "README.md"), renderSolutionReadme(pilotName, appDir, hasAgentsInScope));
  await write(path.join("docs", "README.md"), renderDocsReadme(pilotName));

  if (intake?.pilotName) {
    const recorded = (model?.manualSteps as RecordedManualStep[] | undefined) ?? [];
    await write("MANUAL_STEPS.md", renderManualGuide(pilotName, intake as unknown as IntakePayload, recorded));
    if (hasAgentsInScope) {
      await write("AGENT_BUILD.md", renderAgentBuild(intake as unknown as IntakePayload));
    }
  }

  if (await copyDirIfPresent(path.join(workspace, "synthetic-data", "csv"), path.join(outputDir, "synthetic-data"))) {
    files.push("synthetic-data/");
    // Ship the import mechanism with the data so the CSVs are turnkey (not just reviewable):
    // the manifest (table keys + lookup mapping) and the self-contained loader.
    await copyFileIfPresent(
      path.join(workspace, "synthetic-data", "manifest.json"),
      path.join(outputDir, "synthetic-data", "manifest.json")
    );
    const loaderSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "load-synthetic-data.ps1");
    await copyFileIfPresent(loaderSrc, path.join(outputDir, "synthetic-data", "load-synthetic-data.ps1"));
  }

  const scanFindings = await scanPath(outputDir);
  const publishTarget = renderPublishTarget(intake as unknown as IntakePayload, ".");

  return { workspace: workspace.replaceAll("\\", "/"), outputDir: outputDir.replaceAll("\\", "/"), pilotName, hub: readiness, hubManifest: manifest, publishTarget, scanFindings, files };
}

export function renderPackageReport(report: PackageReport): string {
  const lines = [
    `Publication bundle: ${report.pilotName}`,
    `  Output:  ${report.outputDir}`,
    `  Files:   ${report.files.join(", ")}`,
    ""
  ];
  lines.push(`Solution City / Hub fields: ${report.hub.ready ? "READY" : "NOT READY"}`);
  lines.push(`  Present: ${report.hub.present.join(", ") || "(none)"}`);
  if (report.hub.missing.length) lines.push(`  Missing: ${report.hub.missing.join(", ")}`);
  lines.push("");
  if (report.scanFindings.length) {
    lines.push(`Sanitization scan: ${report.scanFindings.length} FINDING(S) — fix before publishing:`);
    for (const f of report.scanFindings.slice(0, 10)) lines.push(`  ${f.file}:${f.line} [${f.rule}]`);
  } else {
    lines.push("Sanitization scan: clean (no secrets / tenant IDs).");
  }
  lines.push("");
  const t = report.publishTarget;
  if (t.command) {
    lines.push(`Publish (uses the repo captured at intake — ${t.owner}/${t.name}, ${t.visibility}):`);
    lines.push(`  cd ${report.outputDir}`);
    lines.push(`  ${t.command}`);
  } else {
    lines.push("Publish: no GitHub repo URL captured at intake. From the output dir:");
    lines.push("  gh repo create <owner>/<name> --public --source . --push");
  }
  for (const w of t.warnings) lines.push(`  ! ${w}`);
  return lines.join("\n");
}
