/**
 * SharePoint document library → Copilot Studio agent knowledge planner (pure, deterministic).
 *
 * Input: a normalized SharePoint docs schema (produced by `scripts/read-sharepoint-docs.ts` via
 * Graph — libraries + file metadata, read-only). Output: a knowledge plan that classifies each file
 * as groundable or skipped (per Copilot Studio's supported types + 512 MB / 500-file limits),
 * recommends a grounding mode, and records the decisions taken. It never reads or embeds source file
 * CONTENT — that stays in the gitignored workspace and must pass the sanitizer before publication.
 *
 * Two grounding modes (see docs/ROADMAP.md — SharePoint bridge capability 2):
 *   - `upload`     — download → SANITIZE → upload files as agent knowledge. Portable + publishable.
 *   - `sharepoint` — ground the LIVE agent on the source site/library via the `add-knowledge` skill
 *                    ("unstructured data"). Fast for an in-tenant pilot, but ties the demo to the
 *                    source tenant and reads live customer content (not portable, not publishable).
 */

/**
 * File extensions Copilot Studio accepts as an uploaded knowledge document.
 * Source: Microsoft Learn — "Upload files as a knowledge source" (Supported document types).
 */
export const GROUNDABLE_EXTENSIONS = new Set([
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf",
  "txt", "md", "log", "html", "htm", "csv", "xml",
  "odt", "ods", "odp", "epub", "rtf",
  "pages", "key", "numbers", "json", "yml", "yaml", "tex"
]);

/** Copilot Studio limits (Microsoft Learn — "Upload files as a knowledge source" / "Quotas and limits"). */
export const MAX_KNOWLEDGE_FILE_BYTES = 512 * 1024 * 1024; // 512 MB per file
export const MAX_KNOWLEDGE_FILES = 500; // files as knowledge per agent

export type GroundingMode = "upload" | "sharepoint";

export interface DocFile {
  name: string;
  /** Library-relative path (folders), for display + de-duping. */
  path?: string;
  size?: number;
  mimeType?: string;
  /** Lowercase extension without the dot; derived from `name` when absent. */
  extension?: string;
  lastModified?: string;
  webUrl?: string;
}

export interface DocLibrary {
  name: string;
  url?: string;
  files: DocFile[];
}

export interface DocSchema {
  site?: string;
  libraries: DocLibrary[];
}

export interface KnowledgeSource {
  library: string;
  name: string;
  path: string;
  extension: string;
  sizeBytes: number;
  groundable: boolean;
  /** Sanitized, collision-free name to use when uploading the file as knowledge. */
  targetName: string;
  note?: string;
}

export interface KnowledgeDecision {
  title: string;
  detail: string;
}

export interface GroundingOption {
  mode: GroundingMode;
  title: string;
  detail: string;
  portable: boolean;
}

export interface KnowledgePlan {
  site?: string;
  libraries: Array<{ name: string; url?: string; fileCount: number }>;
  sources: KnowledgeSource[];
  summary: { groundable: number; skipped: number; totalBytes: number };
  grounding: { recommended: GroundingMode; options: GroundingOption[] };
  decisions: KnowledgeDecision[];
}

function extensionOf(file: DocFile): string {
  if (file.extension) return file.extension.replace(/^\./, "").toLowerCase();
  const dot = file.name.lastIndexOf(".");
  return dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
}

/** Sanitize a file name into a safe, lowercase, collision-free upload name. */
function safeName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  let candidate = ext ? `${base}.${ext}` : base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = ext ? `${base}-${n}.${ext}` : `${base}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Plan how a SharePoint site's documents become Copilot Studio agent knowledge. */
export function planKnowledge(schema: DocSchema, opts: { recommend?: GroundingMode } = {}): KnowledgePlan {
  const sources: KnowledgeSource[] = [];
  const decisions: KnowledgeDecision[] = [];
  const usedNames = new Set<string>();
  let groundable = 0;
  let skipped = 0;
  let totalBytes = 0;

  const libraries = (schema.libraries ?? []).map((lib) => ({ name: lib.name, fileCount: lib.files?.length ?? 0, ...(lib.url ? { url: lib.url } : {}) }));

  for (const lib of schema.libraries ?? []) {
    for (const file of lib.files ?? []) {
      const ext = extensionOf(file);
      const size = file.size ?? 0;
      const rel = file.path ? `${file.path.replace(/\/+$/, "")}/${file.name}` : file.name;
      let isGroundable = true;
      let note: string | undefined;

      if (!GROUNDABLE_EXTENSIONS.has(ext)) {
        isGroundable = false;
        note = ext ? `unsupported type .${ext} — images/media/executables can't be agent knowledge` : "no file extension — unsupported as knowledge";
      } else if (size > MAX_KNOWLEDGE_FILE_BYTES) {
        isGroundable = false;
        note = `exceeds the 512 MB per-file limit (${humanBytes(size)})`;
      }

      const targetName = isGroundable ? safeName(file.name, usedNames) : "";
      sources.push({ library: lib.name, name: file.name, path: rel, extension: ext, sizeBytes: size, groundable: isGroundable, targetName, ...(note ? { note } : {}) });

      if (isGroundable) {
        groundable += 1;
        totalBytes += size;
      } else {
        skipped += 1;
      }
    }
  }

  // Roll up skip reasons into readable decisions (one per category, not one per file).
  const unsupported = sources.filter((s) => !s.groundable && /unsupported|no file extension/.test(s.note ?? ""));
  if (unsupported.length) {
    decisions.push({
      title: `${unsupported.length} file(s) skipped — unsupported as knowledge`,
      detail: `Images, media, executables, and unrecognized types can't be uploaded as Copilot Studio knowledge: ${unsupported.slice(0, 8).map((s) => s.name).join(", ")}${unsupported.length > 8 ? ", …" : ""}.`
    });
  }
  const tooBig = sources.filter((s) => !s.groundable && /512 MB/.test(s.note ?? ""));
  if (tooBig.length) {
    decisions.push({
      title: `${tooBig.length} file(s) skipped — over the 512 MB limit`,
      detail: `Copilot Studio rejects files larger than 512 MB: ${tooBig.map((s) => s.name).join(", ")}.`
    });
  }
  if (groundable > MAX_KNOWLEDGE_FILES) {
    decisions.push({
      title: `Too many files — ${groundable} groundable vs the 500-file limit`,
      detail: "An agent can include at most 500 files as knowledge. Select the most relevant subset, or use native SharePoint (unstructured data) knowledge instead."
    });
  }
  decisions.push({
    title: "Sanitize before publishing",
    detail: "Downloaded documents can carry secrets, customer names, or tenant identifiers. Keep them in the gitignored workspace, run `reimagine scan`, and upload only sanitized, non-identifying files. Encrypted or sensitivity-labeled files aren't supported."
  });

  const options: GroundingOption[] = [
    {
      mode: "upload",
      title: "Upload sanitized files as knowledge (portable)",
      detail: "Download → SANITIZE → upload the files to the agent (Copilot Studio → Add knowledge → Upload files). Produces a portable, publishable demo that carries no live customer content.",
      portable: true
    },
    {
      mode: "sharepoint",
      title: "Ground on the source SharePoint site (in-tenant pilot)",
      detail: "Use the `add-knowledge` skill with the source site/library URL (unstructured-data knowledge). Fastest for an in-tenant pilot, but ties the demo to the source tenant and reads live customer content — not portable or publishable.",
      portable: false
    }
  ];

  return {
    ...(schema.site ? { site: schema.site } : {}),
    libraries,
    sources,
    summary: { groundable, skipped, totalBytes },
    grounding: { recommended: opts.recommend ?? "upload", options },
    decisions
  };
}

/** Render KNOWLEDGE.md — the operator's guide to attaching the planned documents as agent knowledge. */
export function renderKnowledgeGuide(plan: KnowledgePlan, opts: { pilotName?: string | undefined; siteUrl?: string | undefined } = {}): string {
  const name = opts.pilotName ?? "the agent";
  const lines: string[] = [];
  lines.push(`# Agent knowledge — ${name}`);
  lines.push("");
  lines.push(
    `Grounds ${name} on documents from ${opts.siteUrl ?? plan.site ?? "the source SharePoint site"}. ` +
      `**${plan.summary.groundable}** file(s) are groundable (${humanBytes(plan.summary.totalBytes)}); ` +
      `**${plan.summary.skipped}** were skipped.`
  );
  lines.push("");

  lines.push("## Libraries");
  for (const lib of plan.libraries) lines.push(`- **${lib.name}** — ${lib.fileCount} file(s)${lib.url ? ` ([open](${lib.url}))` : ""}`);
  lines.push("");

  lines.push("## Choose a grounding mode");
  for (const o of plan.grounding.options) {
    const star = o.mode === plan.grounding.recommended ? " ⭐ **recommended**" : "";
    lines.push(`### ${o.title}${star}`);
    lines.push(o.detail);
    lines.push("");
  }

  if (plan.grounding.recommended === "upload") {
    lines.push("## Upload path (recommended)");
    lines.push("1. Pull the files into the gitignored workspace: rerun the reader with `-DownloadDir <ws>/evidence/knowledge/raw`.");
    lines.push("2. **Sanitize:** `npm run reimagine -- scan --path <ws>/evidence/knowledge/raw` and review binaries by hand. Remove or redact anything flagged; drop encrypted/labeled files.");
    lines.push("3. In Copilot Studio → open the agent → **Add knowledge** → **Upload files** → add the sanitized files below (max 512 MB each, 500 files per agent). Give each a clear **description** (it drives generative orchestration).");
  } else {
    lines.push("## SharePoint path");
    lines.push("Invoke the **add-knowledge** skill with the source site/library URL to add it as unstructured-data knowledge. Note: this reads live customer content and ties the demo to the source tenant.");
  }
  lines.push("");

  const groundables = plan.sources.filter((s) => s.groundable);
  if (groundables.length) {
    lines.push("## Files to add as knowledge");
    lines.push("| Library | Source file | Upload as | Size |");
    lines.push("| --- | --- | --- | --- |");
    for (const s of groundables) lines.push(`| ${s.library} | ${s.path} | \`${s.targetName}\` | ${humanBytes(s.sizeBytes)} |`);
    lines.push("");
  }

  const skips = plan.sources.filter((s) => !s.groundable);
  if (skips.length) {
    lines.push("## Skipped (not groundable)");
    for (const s of skips) lines.push(`- ${s.path} — ${s.note}`);
    lines.push("");
  }

  if (plan.decisions.length) {
    lines.push("## Decisions");
    for (const d of plan.decisions) lines.push(`- **${d.title}** — ${d.detail}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
