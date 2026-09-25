import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InitOptions } from "./types.js";

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export async function initializeWorkspace(options: InitOptions): Promise<void> {
  const assessmentId = `assessment:${slugify(options.name)}`;
  const now = new Date().toISOString();
  let source: Record<string, unknown>;
  if (options.source === "tenant") {
    source = { type: "tenant", solutionName: options.name };
  } else if (options.source === "solution-zip") {
    source = {
      type: "solution-zip",
      solutionName: options.name,
      zipPath: options.zipPath,
      sha256: options.sha256
    };
  } else if (options.source === "new-concept") {
    source = { type: "new-concept" };
  } else {
    source = {
      type: "repository",
      repository: options.repository ?? "REPLACE_WITH_REPOSITORY_URL",
      revision: options.revision ?? "REPLACE_WITH_REVISION"
    };
  }

  const model = {
    schemaVersion: "1.0.0",
    assessment: {
      id: assessmentId,
      name: options.name,
      createdAt: now,
      stage: "intake"
    },
    source,
    components: [],
    dependencies: [],
    evidence: [],
    claims: [],
    unknowns: [],
    featureOpportunities: [],
    decisions: []
  };

  const directories = [
    "evidence",
    "generated/current-state",
    "generated/target-state",
    "synthetic-data/csv",
    "solution/src",
    "solution/package",
    "publication"
  ];

  await Promise.all(directories.map((directory) => mkdir(path.join(options.output, directory), { recursive: true })));
  await writeFile(
    path.join(options.output, "solution-model.json"),
    `${JSON.stringify(model, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(options.output, "README.md"),
    `# ${options.name}\n\nLocal assessment workspace. Evidence may be private and must not be published without sanitization review.\n`,
    "utf8"
  );
}
