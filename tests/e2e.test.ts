import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { packagePublication } from "../src/package.js";
import type { SourceType } from "../src/types.js";
import { validateObject, validateWorkspace } from "../src/validation.js";
import { initializeWorkspace } from "../src/workspace.js";

const sha = createHash("sha256").update("fictitious").digest("hex");

const hub = {
  title: "Care Operations",
  industry: "Providers",
  contentTypes: ["Demo Assets"],
  technicalAreas: ["Power Platform", "Dataverse"],
  contributors: "SE Team",
  narrative: "A modern rounding experience for bedside care."
};

interface Scenario {
  entryMode: string;
  source: SourceType;
  intakeSource?: Record<string, unknown>;
  initExtra?: Record<string, unknown>;
}

const scenarios: Scenario[] = [
  {
    entryMode: "repository",
    source: "repository",
    intakeSource: { repository: "https://github.com/example/repo", revision: "main", dependencyBoundary: "full-closure" },
    initExtra: { repository: "https://github.com/example/repo", revision: "main" }
  },
  {
    entryMode: "solution-zip",
    source: "solution-zip",
    intakeSource: { zipPath: "inbox/care/Care.zip", dependencyBoundary: "full-closure" },
    initExtra: { zipPath: "evidence/source/Care.zip", sha256: sha }
  },
  {
    entryMode: "tenant",
    source: "tenant",
    intakeSource: { environmentUrl: "https://example.crm.dynamics.com/", solutionName: "CareOps", dependencyBoundary: "referenced-only" }
  },
  {
    entryMode: "new-concept",
    source: "new-concept"
  }
];

for (const scenario of scenarios) {
  test(`end-to-end: ${scenario.entryMode} → seeded workspace → publishable bundle with Solution Hub fields`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reimagine-e2e-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const workspace = path.join(root, "care-ops");

    // 1. Intake brief validates against the schema.
    const intake: Record<string, unknown> = {
      schemaVersion: "1.0.0",
      pilotName: "Care Ops",
      entryMode: scenario.entryMode,
      target: { surface: "code-app", teamsPackaging: true, uiSystem: "fluent2" },
      publish: { githubRepoUrl: "https://github.com/example/care-ops", solutionHub: hub },
      ...(scenario.intakeSource ? { source: scenario.intakeSource } : {}),
      ...(scenario.entryMode === "new-concept" ? { concept: { problem: "Rounding is slow.", users: "Nurses" } } : {})
    };
    const intakeResult = await validateObject(intake, "intake.schema.json");
    assert.equal(intakeResult.valid, true, intakeResult.errors.join("\n"));

    // 2. Seed the workspace (canonical solution-model.json) and drop the intake brief beside it.
    await initializeWorkspace({ name: "Care Ops", source: scenario.source, output: workspace, ...scenario.initExtra });
    await writeFile(path.join(workspace, "intake.json"), `${JSON.stringify(intake, null, 2)}\n`, "utf8");

    const workspaceResult = await validateWorkspace(workspace);
    assert.equal(workspaceResult.valid, true, workspaceResult.errors.join("\n"));

    // 3. Package the publication bundle.
    const report = await packagePublication(workspace);

    // 4. A GitHub-postable asset with Solution Hub fields ready, and a clean scan.
    assert.ok(report.files.includes("README.md"));
    assert.ok(report.files.includes("solution-hub.json"));
    assert.equal(report.hub.ready, true, `Hub not ready; missing: ${report.hub.missing.join(", ")}`);
    assert.deepEqual(report.scanFindings, []);

    const manifest = JSON.parse(await readFile(path.join(workspace, "publication", "solution-hub.json"), "utf8")) as {
      title: string;
      industry: string;
      readiness: { ready: boolean };
    };
    assert.equal(manifest.title, "Care Operations");
    assert.equal(manifest.industry, "Providers");
    assert.equal(manifest.readiness.ready, true);
  });
}

test("package flags missing Solution Hub fields as NOT ready", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reimagine-e2e-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "bare");
  await initializeWorkspace({ name: "Bare", source: "new-concept", output: workspace });
  // no intake.json → no Hub fields
  const report = await packagePublication(workspace);
  assert.equal(report.hub.ready, false);
  assert.ok(report.hub.missing.includes("industry"));
  assert.deepEqual(report.scanFindings, []);
});

test("packaged demo data is turnkey — ships the manifest + self-contained loader", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reimagine-e2e-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "with-data");
  await initializeWorkspace({ name: "With Data", source: "new-concept", output: workspace });
  // A workspace with synthetic-data CSVs + a manifest (as the data stage produces).
  await mkdir(path.join(workspace, "synthetic-data", "csv"), { recursive: true });
  await writeFile(path.join(workspace, "synthetic-data", "csv", "x_item.csv"), "x_name\nA\n", "utf8");
  await writeFile(path.join(workspace, "synthetic-data", "manifest.json"), JSON.stringify({ entities: [] }), "utf8");

  await packagePublication(workspace);
  // The CSV, the manifest, AND the loader travel with the bundle so the data imports in one command.
  const dataDir = path.join(workspace, "publication", "synthetic-data");
  assert.equal((await readFile(path.join(dataDir, "x_item.csv"), "utf8")).length > 0, true);
  assert.equal((await readFile(path.join(dataDir, "manifest.json"), "utf8")).length > 0, true);
  assert.match(await readFile(path.join(dataDir, "load-synthetic-data.ps1"), "utf8"), /EnvironmentUrl|ManifestPath/);
});
