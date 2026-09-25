import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Canonical stage progression (mirrors solution-model.schema.json assessment.stage). */
export interface StageMeta {
  id: string;
  phase: string;
  gate: string;
  next: (wsRel: string) => string;
}

export const STAGES: StageMeta[] = [
  { id: "intake", phase: "Envision", gate: "Intake approved (source, boundary, target)", next: (ws) => `Run the readiness gate: ./scripts/preflight.ps1 -IntakePath ${ws}/intake.json  — then: npm run reimagine -- gate intake --workspace ${ws}` },
  { id: "discovery", phase: "Deconstruct", gate: "Discovery review — coverage + unknowns", next: (ws) => `Reconstruct current state (analyze-artifacts), then: npm run reimagine -- gate discovery --workspace ${ws}` },
  { id: "intent", phase: "Reconstruct intent", gate: "Owner confirms material inferences", next: (ws) => `Confirm intent with the owner, then: npm run reimagine -- gate intent --workspace ${ws}` },
  { id: "feature-selection", phase: "Ideate & select", gate: "Bounded build set approved", next: (ws) => `Score & select features, then: npm run reimagine -- gate feature-selection --workspace ${ws}` },
  { id: "architecture", phase: "Design target", gate: "Architecture approved", next: (ws) => `Design the target (old→new), then: npm run reimagine -- gate architecture --workspace ${ws}` },
  { id: "synthetic-data", phase: "Design synthetic data", gate: "Synthetic data approved", next: (ws) => `Design fictitious demo data, then: npm run reimagine -- gate synthetic-data --workspace ${ws}` },
  { id: "build", phase: "Build", gate: "Mutation authorized + everything-in-solution audit clean", next: (ws) => `Get build authorization; build solution-first; audit-solution.ps1; then: npm run reimagine -- gate build --workspace ${ws}` },
  { id: "validation", phase: "Validate", gate: "ACCEPTED (acceptance check passes)", next: (ws) => `Run ./scripts/acceptance.ps1 ... to ACCEPTED, then: npm run reimagine -- gate validation --workspace ${ws}` },
  { id: "publication", phase: "Publish", gate: "Publication approved (sanitization scan clean)", next: (ws) => `Run the scan; on approval publish, then: npm run reimagine -- gate publication --workspace ${ws}` }
];

export interface StatusReport {
  workspace: string;
  pilotName: string;
  source: string;
  ingested: boolean;
  stageId: string;
  stageIndex: number;
  totalStages: number;
  approvedStages: string[];
  pendingGate: string;
  nextAction: string;
  complete: boolean;
}

interface Gate {
  stage: string;
  approvedAt: string;
  note?: string;
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function describeSource(model: Record<string, unknown> | null, intake: Record<string, unknown> | null): string {
  const src = (model?.source ?? null) as Record<string, unknown> | null;
  if (src?.type) {
    switch (src.type) {
      case "repository": return `repository ${src.repository ?? ""}`.trim();
      case "solution-zip": return `solution ZIP`;
      case "tenant": return `tenant solution ${src.solutionName ?? ""}`.trim();
      case "new-concept": return `new concept`;
    }
  }
  const mode = intake?.entryMode as string | undefined;
  return mode ? `${mode}` : "unknown";
}

export async function findNewestWorkspace(root = "workspaces"): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return null;
  }
  let newest: { dir: string; mtime: number } | null = null;
  for (const entry of entries) {
    const dir = path.join(root, entry);
    try {
      if (!(await stat(dir)).isDirectory()) continue;
    } catch {
      continue;
    }
    let mtime = 0;
    for (const marker of ["solution-model.json", "intake.json", "KICKOFF.md"]) {
      try {
        mtime = Math.max(mtime, (await stat(path.join(dir, marker))).mtimeMs);
      } catch {
        /* marker absent */
      }
    }
    if (mtime > 0 && (!newest || mtime > newest.mtime)) {
      newest = { dir, mtime };
    }
  }
  return newest?.dir ?? null;
}

export async function computeStatus(workspace: string): Promise<StatusReport> {
  const wsRel = workspace.replaceAll("\\", "/");
  const model = await readJson(path.join(workspace, "solution-model.json"));
  const intake = await readJson(path.join(workspace, "intake.json"));
  const pilotName =
    ((model?.assessment as Record<string, unknown> | undefined)?.name as string | undefined) ??
    (intake?.pilotName as string | undefined) ??
    path.basename(workspace);
  const source = describeSource(model, intake);

  if (!model) {
    return {
      workspace: wsRel,
      pilotName,
      source,
      ingested: false,
      stageId: "intake",
      stageIndex: 0,
      totalStages: STAGES.length,
      approvedStages: [],
      pendingGate: "Source not yet ingested / workspace not seeded",
      nextAction: `Open ${wsRel}/KICKOFF.md in Copilot (Agent mode) and say: "Reimagine this Power Platform solution."`,
      complete: false
    };
  }

  const stageId = ((model.assessment as Record<string, unknown> | undefined)?.stage as string | undefined) ?? "intake";
  const gates = (model.gates as Gate[] | undefined) ?? [];
  const approvedStages = gates.map((g) => g.stage);
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === stageId));
  const meta = STAGES[idx] ?? STAGES[0]!;
  const complete = stageId === "publication" && approvedStages.includes("publication");

  return {
    workspace: wsRel,
    pilotName,
    source,
    ingested: true,
    stageId: meta.id,
    stageIndex: idx,
    totalStages: STAGES.length,
    approvedStages,
    pendingGate: complete ? "None — all gates approved" : meta.gate,
    nextAction: complete ? "Published — the reimagining is complete. (Phase 8 Evolve: maintain the backlog.)" : meta.next(wsRel),
    complete
  };
}

export async function approveGate(workspace: string, stageId: string, note?: string): Promise<StatusReport> {
  const stageIds = STAGES.map((s) => s.id);
  if (!stageIds.includes(stageId)) {
    throw new Error(`Unknown gate '${stageId}'. Valid gates: ${stageIds.join(", ")}`);
  }
  const modelPath = path.join(workspace, "solution-model.json");
  const model = await readJson(modelPath);
  if (!model) {
    throw new Error(`No solution-model.json in ${workspace}. Ingest/seed the workspace first (open KICKOFF.md and start).`);
  }
  const gates = (model.gates as Gate[] | undefined) ?? [];
  if (!gates.some((g) => g.stage === stageId)) {
    gates.push({ stage: stageId, approvedAt: new Date().toISOString(), ...(note ? { note } : {}) });
  }
  model.gates = gates;

  const assessment = (model.assessment as Record<string, unknown> | undefined) ?? {};
  const currentIndex = Math.max(0, STAGES.findIndex((s) => s.id === (assessment.stage as string | undefined)));
  const approvedIndex = STAGES.findIndex((s) => s.id === stageId);
  const targetIndex = Math.min(STAGES.length - 1, approvedIndex + 1);
  if (targetIndex > currentIndex) {
    assessment.stage = STAGES[targetIndex]!.id;
    model.assessment = assessment;
  }

  await writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`, "utf8");
  return computeStatus(workspace);
}

export function renderStatus(report: StatusReport): string {
  const rail = STAGES.map((s) => {
    if (report.approvedStages.includes(s.id)) return `[x] ${s.id}`;
    if (s.id === report.stageId && !report.complete) return `[>] ${s.id}`;
    return `    ${s.id}`;
  }).join("\n  ");

  const header = `Reimagine — ${report.pilotName}  (${report.source})`;
  const lines = [
    header,
    "=".repeat(header.length),
    `Workspace:  ${report.workspace}`,
    ""
  ];
  if (!report.ingested) {
    lines.push("Status:     intake captured — not yet ingested");
  } else {
    lines.push(`Stage:      ${report.stageIndex + 1}/${report.totalStages}  ${report.stageId}  (${STAGES[report.stageIndex]?.phase ?? ""})`);
  }
  lines.push("", "Progress:", `  ${rail}`, "");
  lines.push(`Pending gate:  ${report.pendingGate}`);
  lines.push(`Next action:   ${report.nextAction}`);
  if (!report.complete) {
    lines.push("", "Tip: run `npm run status` anytime. If blocked, see docs/TROUBLESHOOTING.md.");
  }
  return lines.join("\n");
}
