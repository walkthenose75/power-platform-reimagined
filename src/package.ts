import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

function renderReadme(pilotName: string, source: string, hub: Record<string, unknown>): string {
  const narrative = (hub.narrative as string) || `${pilotName} — a modern, installable Power Platform demo.`;
  return `# ${hub.title ?? pilotName}

${narrative}

> Reusable demo asset. Contains no secrets, source records, or tenant-specific identifiers.

## What's inside

- \`solution/\` — the unmanaged solution package (Dataverse schema) + code‑app source
- \`synthetic-data/\` — reviewable, fictitious demo data (CSV) + loader
- \`docs/\` — architecture, user journeys, and customization notes
- \`MANUAL_STEPS.md\` — UI/admin steps that can't be automated (enablement, connections, agent publish, …)
- \`SOLUTION_HUB.md\` / \`solution-hub.json\` — Solution City / Solution Hub submission fields

## Install (in your own environment)

1. Ensure **Power Apps code apps** are enabled on your target environment.
2. Import the unmanaged solution from \`solution/\` (Dataverse schema).
3. Deploy the code app from source: \`pac code push --environment <your-env-url> --solutionName <solution>\`.
4. Load the fictitious demo data from \`synthetic-data/\`.
5. Complete the UI/admin steps in \`MANUAL_STEPS.md\` (connections, agent publish + approval, Teams CSP, sharing).

## Demo

See \`docs/\` for the demo script and screenshots.

## Customize

The code app is built with **Fluent UI 2** (\`@fluentui/react-components\`). Fork, edit, and
\`pac code push\` to your environment.
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

  await write("README.md", renderReadme(pilotName, source, manifest));
  await write("SOLUTION_HUB.md", renderHubDoc(manifest, readiness));
  await write("solution-hub.json", `${JSON.stringify(manifest, null, 2)}\n`);
  await write(
    path.join("solution", "README.md"),
    `# Solution artifacts\n\nPlace the exported **unmanaged solution** zip and the **code‑app source** here (produced by the build phase). The app is deployed with \`pac code push\`; the solution zip carries the Dataverse schema.\n`
  );
  await write(
    path.join("docs", "README.md"),
    `# Documentation\n\nArchitecture, current→target traceability, user journeys, demo script, and screenshots go here.\n`
  );

  if (intake?.pilotName) {
    const recorded = (model?.manualSteps as RecordedManualStep[] | undefined) ?? [];
    await write("MANUAL_STEPS.md", renderManualGuide(pilotName, intake as unknown as IntakePayload, recorded));
    const agents = (intake as unknown as IntakePayload).target?.agents;
    if (agents && (agents.copilotStudio || agents.m365Copilot)) {
      await write("AGENT_BUILD.md", renderAgentBuild(intake as unknown as IntakePayload));
    }
  }

  if (await copyDirIfPresent(path.join(workspace, "synthetic-data", "csv"), path.join(outputDir, "synthetic-data"))) {
    files.push("synthetic-data/");
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
