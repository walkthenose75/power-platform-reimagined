import assert from "node:assert/strict";
import test from "node:test";
import { planDemoUpload, renderDemoKnowledgeGuide, DEFAULT_DEMO_LIBRARY, type LocalFile } from "../src/demo-knowledge.js";

const files: LocalFile[] = [
  { name: "onboarding.md", relPath: "", size: 900 },
  { name: "sop.txt", relPath: "Procedures", size: 1_200 },
  { name: "policy.pdf", relPath: "", size: 2_000_000 },
  { name: "diagram.png", relPath: "", size: 20_000 }
];

test("plans groundable files for upload and excludes non-groundable ones", () => {
  const plan = planDemoUpload(files, { library: "Demo KB", siteUrl: "https://demo.sharepoint.com/sites/kb" });
  assert.equal(plan.library, "Demo KB");
  assert.equal(plan.siteUrl, "https://demo.sharepoint.com/sites/kb");
  assert.equal(plan.upload.length, 3);
  assert.equal(plan.excluded.length, 1);
  assert.equal(plan.excluded[0]?.source, "diagram.png");
  assert.equal(plan.totalBytes, 900 + 1_200 + 2_000_000);
});

test("preserves relative folder paths and sanitizes target names", () => {
  const plan = planDemoUpload(files);
  const sop = plan.upload.find((u) => u.source === "Procedures/sop.txt");
  assert.ok(sop, "keeps the folder-relative source path");
  assert.equal(sop?.targetName, "sop.txt");
});

test("defaults the library name when none is given", () => {
  const plan = planDemoUpload(files);
  assert.equal(plan.library, DEFAULT_DEMO_LIBRARY);
});

test("carries the sanitize-before-publishing decision through", () => {
  const plan = planDemoUpload(files);
  assert.ok(plan.decisions.some((d) => /Sanitize before publishing/.test(d.title)));
});

test("guide shows the provisioner command, grounding step, and file table", () => {
  const plan = planDemoUpload(files, { library: "Demo KB", siteUrl: "https://demo.sharepoint.com/sites/kb" });
  const md = renderDemoKnowledgeGuide(plan, { pilotName: "Ops Assistant", sourceDir: "ws/generated/knowledge" });
  assert.match(md, /# Demo knowledge — Ops Assistant/);
  assert.match(md, /publish-demo-knowledge\.ps1 -SiteUrl https:\/\/demo\.sharepoint\.com\/sites\/kb -LibraryName "Demo KB" -SourceDir "ws\/generated\/knowledge"/);
  assert.match(md, /add-knowledge/);
  assert.match(md, /policy\.pdf/);
  assert.match(md, /Excluded \(not groundable\)/);
  assert.match(md, /diagram\.png/);
});
