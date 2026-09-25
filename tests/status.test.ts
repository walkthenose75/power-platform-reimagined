import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveGate, computeStatus, findNewestWorkspace, STAGES } from "../src/status.js";
import { validateWorkspace } from "../src/validation.js";
import { initializeWorkspace } from "../src/workspace.js";

async function tempRoot(t: { after: (fn: () => unknown) => void }): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "reimagine-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("status of a freshly seeded workspace points at the readiness gate", async (t) => {
  const root = await tempRoot(t);
  const ws = path.join(root, "fresh-idea");
  await initializeWorkspace({ name: "Fresh Idea", source: "new-concept", output: ws });

  const report = await computeStatus(ws);
  assert.equal(report.ingested, true);
  assert.equal(report.stageId, "intake");
  assert.equal(report.stageIndex, 0);
  assert.match(report.nextAction, /preflight/i);
});

test("approving a gate advances the stage and stays schema-valid", async (t) => {
  const root = await tempRoot(t);
  const ws = path.join(root, "fresh-idea");
  await initializeWorkspace({ name: "Fresh Idea", source: "new-concept", output: ws });

  const report = await approveGate(ws, "intake", "looks good");
  assert.equal(report.stageId, "discovery");
  assert.ok(report.approvedStages.includes("intake"));

  const validation = await validateWorkspace(ws);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("walking every gate reaches complete", async (t) => {
  const root = await tempRoot(t);
  const ws = path.join(root, "fresh-idea");
  await initializeWorkspace({ name: "Fresh Idea", source: "new-concept", output: ws });

  for (const stage of STAGES.map((s) => s.id)) {
    await approveGate(ws, stage);
  }
  const report = await computeStatus(ws);
  assert.equal(report.complete, true);
  assert.equal(report.stageId, "publication");
});

test("rejects an unknown gate", async (t) => {
  const root = await tempRoot(t);
  const ws = path.join(root, "fresh-idea");
  await initializeWorkspace({ name: "Fresh Idea", source: "new-concept", output: ws });
  await assert.rejects(approveGate(ws, "not-a-stage"), /Unknown gate/);
});

test("status before ingestion tells you to open KICKOFF", async (t) => {
  const root = await tempRoot(t);
  const ws = path.join(root, "pre");
  await mkdir(ws, { recursive: true });
  await writeFile(path.join(ws, "intake.json"), JSON.stringify({ pilotName: "Pre", entryMode: "repository" }), "utf8");

  const report = await computeStatus(ws);
  assert.equal(report.ingested, false);
  assert.match(report.nextAction, /KICKOFF\.md/);
});

test("findNewestWorkspace picks a seeded workspace", async (t) => {
  const root = await tempRoot(t);
  const ws = path.join(root, "pilot-a");
  await initializeWorkspace({ name: "Pilot A", source: "new-concept", output: ws });

  const found = await findNewestWorkspace(root);
  assert.ok(found && path.basename(found) === "pilot-a");
});
