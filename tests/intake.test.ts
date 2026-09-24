import assert from "node:assert/strict";
import test from "node:test";
import { runPreflight } from "../src/preflight.js";
import { validateObject } from "../src/validation.js";

const baseTarget = { surface: "code-app", teamsPackaging: true, modelDrivenPolicy: "case-by-case" };

test("accepts a valid repository intake", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "Virtual Rounding",
    entryMode: "repository",
    source: { repository: "https://github.com/org/repo", revision: "master" },
    target: baseTarget
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("rejects a repository intake missing the repository URL", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "No Repo",
    entryMode: "repository",
    source: { revision: "main" },
    target: baseTarget
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, false);
});

test("accepts a new-concept intake without a source", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "Fresh Idea",
    entryMode: "new-concept",
    target: baseTarget,
    concept: { problem: "Nurses need faster rounding." }
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("rejects an unknown industry value", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "Bad Industry",
    entryMode: "new-concept",
    target: baseTarget,
    publish: { solutionHub: { industry: "Retail" } }
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, false);
});

test("preflight returns the expected checks", async () => {
  const checks = await runPreflight();
  assert.equal(checks.length, 6);
  for (const check of checks) {
    assert.equal(typeof check.name, "string");
    assert.equal(typeof check.ok, "boolean");
    assert.equal(typeof check.required, "boolean");
  }
  const names = checks.map((c) => c.name);
  assert.ok(names.some((n) => n.includes("Node")));
  assert.ok(names.some((n) => n.includes("pac")));
});
