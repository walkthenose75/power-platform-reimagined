/**
 * Demo knowledge source planner (pure, deterministic) — SharePoint bridge capability 3.
 *
 * Turns a folder of PUBLISHABLE (synthetic or fully-sanitized) knowledge files into an upload plan
 * for a portable demo SharePoint library, reusing the capability-2 classifier so the same Copilot
 * Studio rules apply (supported types, 512 MB/file, 500 files/agent). The actual create-library +
 * upload is done by `scripts/publish-demo-knowledge.ps1`; grounding is the `add-knowledge` skill
 * pointed at the returned library URL.
 *
 * This never reads source customer content — the input is the demo/synthetic set the operator
 * authored, which must also pass `reimagine scan` before it's published.
 */

import { planKnowledge, type DocSchema, type KnowledgeDecision } from "./knowledge-plan.js";

export interface LocalFile {
  /** File name including extension. */
  name: string;
  /** Folder path relative to the source root (empty for root-level files). */
  relPath?: string;
  size: number;
}

export interface DemoUploadItem {
  /** Source path relative to the upload root (folder + name). */
  source: string;
  /** Sanitized, collision-free name to store in the demo library. */
  targetName: string;
  sizeBytes: number;
}

export interface DemoKnowledgePlan {
  library: string;
  siteUrl?: string;
  upload: DemoUploadItem[];
  excluded: Array<{ source: string; reason: string }>;
  totalBytes: number;
  decisions: KnowledgeDecision[];
}

export const DEFAULT_DEMO_LIBRARY = "Reimagined Demo Knowledge";

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Plan how a folder of publishable files becomes a portable demo SharePoint knowledge library. */
export function planDemoUpload(files: LocalFile[], opts: { library?: string; siteUrl?: string } = {}): DemoKnowledgePlan {
  const library = opts.library?.trim() || DEFAULT_DEMO_LIBRARY;
  const schema: DocSchema = {
    ...(opts.siteUrl ? { site: opts.siteUrl } : {}),
    libraries: [{ name: library, files: files.map((f) => ({ name: f.name, path: f.relPath ?? "", size: f.size })) }]
  };
  const plan = planKnowledge(schema, { recommend: "upload" });

  const upload: DemoUploadItem[] = [];
  const excluded: Array<{ source: string; reason: string }> = [];
  let totalBytes = 0;
  for (const s of plan.sources) {
    if (s.groundable) {
      upload.push({ source: s.path, targetName: s.targetName, sizeBytes: s.sizeBytes });
      totalBytes += s.sizeBytes;
    } else {
      excluded.push({ source: s.path, reason: s.note ?? "not groundable" });
    }
  }

  return {
    library,
    ...(opts.siteUrl ? { siteUrl: opts.siteUrl } : {}),
    upload,
    excluded,
    totalBytes,
    decisions: plan.decisions
  };
}

/** Render DEMO_KNOWLEDGE.md — how to provision the demo library and ground the agent on it. */
export function renderDemoKnowledgeGuide(plan: DemoKnowledgePlan, opts: { pilotName?: string | undefined; sourceDir?: string | undefined } = {}): string {
  const name = opts.pilotName ?? "the demo agent";
  const src = opts.sourceDir ?? "<source dir>";
  const site = plan.siteUrl ? ` -SiteUrl ${plan.siteUrl}` : "";
  const lines: string[] = [];
  lines.push(`# Demo knowledge — ${name}`);
  lines.push("");
  lines.push(
    `A **portable** knowledge source: create a demo SharePoint library and upload the ${plan.upload.length} ` +
      `publishable file(s) (${humanBytes(plan.totalBytes)}), then ground ${name} on it. No source customer ` +
      "content is used — only the synthetic/sanitized set below."
  );
  lines.push("");

  lines.push("## 1. Confirm the set is publishable");
  lines.push(`Every file must be synthetic or fully sanitized. Gate it: \`npm run reimagine -- scan --path ${src}\` (the provisioner refuses to upload if this finds anything).`);
  lines.push("");

  lines.push("## 2. Provision the demo library + upload");
  lines.push("```powershell");
  lines.push(`./scripts/publish-demo-knowledge.ps1${site} -LibraryName "${plan.library}" -SourceDir "${src}"`);
  lines.push("```");
  lines.push("Signs in with a Microsoft Graph device code (Sites.Manage.All), creates the library if needed, uploads the files, and writes the library URL to `demo-knowledge-result.json`.");
  lines.push("");

  lines.push("## 3. Ground the agent");
  lines.push("Invoke the **add-knowledge** skill with the demo library URL from `demo-knowledge-result.json` to add it as the agent's knowledge source. Because the library lives on the demo tenant, the resulting demo is portable and carries no customer content.");
  lines.push("");

  if (plan.upload.length) {
    lines.push("## Files to upload");
    lines.push("| Source | Store as | Size |");
    lines.push("| --- | --- | --- |");
    for (const u of plan.upload) lines.push(`| ${u.source} | \`${u.targetName}\` | ${humanBytes(u.sizeBytes)} |`);
    lines.push("");
  }

  if (plan.excluded.length) {
    lines.push("## Excluded (not groundable)");
    for (const e of plan.excluded) lines.push(`- ${e.source} — ${e.reason}`);
    lines.push("");
  }

  if (plan.decisions.length) {
    lines.push("## Decisions");
    for (const d of plan.decisions) lines.push(`- **${d.title}** — ${d.detail}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
