import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startFromZip } from "../src/intake.js";
import { scanPath } from "../src/sanitizer.js";
import { validateWorkspace } from "../src/validation.js";
import { initializeWorkspace } from "../src/workspace.js";

async function withTempDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "power-platform-reimagined-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("initializes and validates a tenant assessment workspace", async () => {
  await withTempDirectory(async (directory) => {
    const workspace = path.join(directory, "assessment");
    await initializeWorkspace({
      name: "Fabrikam Care Operations",
      source: "tenant",
      output: workspace
    });

    const result = await validateWorkspace(workspace);
    assert.equal(result.valid, true, result.errors.join("\n"));

    const model = JSON.parse(await readFile(path.join(workspace, "solution-model.json"), "utf8")) as {
      assessment: { id: string; stage: string };
    };
    assert.equal(model.assessment.id, "assessment:fabrikam-care-operations");
    assert.equal(model.assessment.stage, "intake");
  });
});

test("starts from a ZIP and records source provenance", async () => {
  await withTempDirectory(async (directory) => {
    const zip = path.join(directory, "FabrikamCare.zip");
    const workspace = path.join(directory, "assessment");
    await writeFile(zip, "fictitious solution package", "utf8");

    await startFromZip({
      name: "Fabrikam Care Operations",
      zip,
      output: workspace
    });

    const model = JSON.parse(await readFile(path.join(workspace, "solution-model.json"), "utf8")) as {
      source: { type: string; zipPath: string; sha256: string };
    };
    assert.equal(model.source.type, "solution-zip");
    assert.equal(model.source.zipPath, "evidence/source/FabrikamCare.zip");
    assert.match(model.source.sha256, /^[a-f0-9]{64}$/);
    assert.match(await readFile(path.join(workspace, "KICKOFF.md"), "utf8"), /Current gate/);
    // A standalone zip (outside inbox/) is COPIED, never removed.
    assert.equal(await readFile(zip, "utf8"), "fictitious solution package");
  });
});

test("a wizard-staged inbox ZIP is MOVED into the workspace (no duplicate) with its unpack", async () => {
  await withTempDirectory(async (directory) => {
    const inboxRoot = path.resolve("inbox");
    const stagedDir = path.join(inboxRoot, `__move-test-${Date.now()}`);
    const zip = path.join(stagedDir, "Staged.zip");
    const unpacked = path.join(stagedDir, "unpacked");
    const workspace = path.join(directory, "assessment");
    await mkdir(unpacked, { recursive: true });
    await writeFile(zip, "staged solution package", "utf8");
    await writeFile(path.join(unpacked, "solution.xml"), "<ImportExportXml/>", "utf8");

    try {
      await startFromZip({ name: "Staged Pilot", zip, output: workspace });

      // Moved into the workspace evidence, and the inbox staging dir is gone (no duplicate copy).
      assert.equal(await readFile(path.join(workspace, "evidence", "source", "Staged.zip"), "utf8"), "staged solution package");
      assert.equal(
        await readFile(path.join(workspace, "evidence", "source", "unpacked", "solution.xml"), "utf8"),
        "<ImportExportXml/>"
      );
      await assert.rejects(readFile(zip, "utf8"));
    } finally {
      await rm(stagedDir, { recursive: true, force: true });
    }
  });
});

test("initializes and validates a new-concept assessment workspace", async () => {
  await withTempDirectory(async (directory) => {
    const workspace = path.join(directory, "assessment");
    await initializeWorkspace({
      name: "Fresh Idea",
      source: "new-concept",
      output: workspace
    });

    const result = await validateWorkspace(workspace);
    assert.equal(result.valid, true, result.errors.join("\n"));

    const model = JSON.parse(await readFile(path.join(workspace, "solution-model.json"), "utf8")) as {
      source: { type: string };
      assessment: { stage: string };
    };
    assert.equal(model.source.type, "new-concept");
    assert.equal(model.assessment.stage, "intake");
  });
});

test("refuses to overwrite a non-empty workspace", async () => {
  await withTempDirectory(async (directory) => {
    const zip = path.join(directory, "FabrikamCare.zip");
    const workspace = path.join(directory, "assessment");
    await writeFile(zip, "fictitious solution package", "utf8");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "keep.txt"), "preserve me", "utf8");

    await assert.rejects(
      startFromZip({
        name: "Fabrikam Care Operations",
        zip,
        output: workspace
      }),
      /Output workspace is not empty/
    );
  });
});

test("an already-ingested workspace gets an actionable 'already ingested' error, not a cryptic one", async () => {
  await withTempDirectory(async (directory) => {
    const zip = path.join(directory, "FabrikamCare.zip");
    const workspace = path.join(directory, "assessment");
    await writeFile(zip, "fictitious solution package", "utf8");
    // Simulate a prior successful ingestion (solution-model.json present).
    await initializeWorkspace({ name: "Fabrikam Care Operations", source: "solution-zip", output: workspace });

    await assert.rejects(
      startFromZip({ name: "Fabrikam Care Operations", zip, output: workspace }),
      /already ingested[\s\S]*npm run status/
    );
  });
});

test("rejects broken canonical references", async () => {
  await withTempDirectory(async (directory) => {
    const workspace = path.join(directory, "assessment");
    await initializeWorkspace({
      name: "Fabrikam Care Operations",
      source: "tenant",
      output: workspace
    });
    const modelPath = path.join(workspace, "solution-model.json");
    const model = JSON.parse(await readFile(modelPath, "utf8")) as {
      dependencies: unknown[];
    };
    model.dependencies.push({
      id: "dependency:missing",
      fromComponentId: "component:missing-a",
      toComponentId: "component:missing-b",
      relationship: "uses",
      evidenceIds: ["evidence:missing"]
    });
    await writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`, "utf8");

    const result = await validateWorkspace(workspace);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("component:missing-a")));
    assert.ok(result.errors.some((error) => error.includes("evidence:missing")));
  });
});

test("sanitizer reports secrets and tenant-specific URLs without flagging ordinary record IDs", async () => {
  await withTempDirectory(async (directory) => {
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "publish.md"),
      [
        "recordId: 67b23c62-1d84-4f53-9f18-7a2f5232caa1",
        "tenantId: 3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        "url: https://fabrikam.crm.dynamics.com",
        "client_secret=super-secret-value"
      ].join("\n"),
      "utf8"
    );

    const findings = await scanPath(directory);
    assert.deepEqual(
      findings.map((finding) => finding.rule).sort(),
      ["Dataverse environment URL", "Microsoft tenant identifier", "Secret assignment"].sort()
    );
    assert.ok(findings.every((finding) => !finding.excerpt.includes("super-secret-value")));
  });
});
