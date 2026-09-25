import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertSolutionZip, sanitizeZipFileName, storeSolutionZip } from "../src/intake-upload.js";
import { agentsBrief, kickoff, nextCommand } from "../src/intake-kickoff.js";
import { runPreflight } from "../src/preflight.js";
import { validateObject } from "../src/validation.js";

const baseTarget = { surface: "code-app", teamsPackaging: true };

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
    concept: { problem: "Nurses need faster rounding.", users: "Bedside nurses" }
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("rejects retired concept fields", async () => {
  const retired = [
    { problem: "x", capabilities: "no" },
    { problem: "x", data: "no" },
    { problem: "x", integrations: "no" },
    { problem: "x", successCriteria: "no" }
  ];
  for (const concept of retired) {
    const result = await validateObject(
      { schemaVersion: "1.0.0", pilotName: "Fresh Idea", entryMode: "new-concept", target: baseTarget, concept },
      "intake.schema.json"
    );
    assert.equal(result.valid, false, `expected invalid for ${JSON.stringify(concept)}`);
  }
});

test("new-concept kickoff directs the agent into plan mode", () => {
  const brief = kickoff("fresh-idea", {
    pilotName: "Fresh Idea",
    entryMode: "new-concept"
  });
  assert.match(brief, /Enter plan mode/);
  assert.match(brief, /approval before building/i);
  assert.match(brief, /Reimagine this Power Platform solution/);
});

test("source-mode kickoff instructs the agent to ingest and the operator to open Copilot", () => {
  const brief = kickoff("care-ops", {
    pilotName: "Care Ops",
    entryMode: "repository",
    source: { repository: "https://example.invalid/repo", revision: "main", dependencyBoundary: "full-closure" }
  });
  assert.match(brief, /Ingest the source into this workspace/);
  assert.match(brief, /--repo https:\/\/example\.invalid\/repo/);
  assert.match(brief, /boundary: Everything it depends on/);
  assert.match(brief, /Open this folder in Copilot and say/);
  assert.match(brief, /Reimagine this Power Platform solution/);
});

test("ingested kickoff does not re-issue the start command", () => {
  const intake = {
    pilotName: "Care Ops",
    entryMode: "solution-zip" as const,
    source: { zipPath: "inbox/care-ops/Care.zip" }
  };
  const brief = kickoff("care-ops", intake, { ingested: true });
  assert.match(brief, /Source already ingested into `evidence\/`/);
  assert.doesNotMatch(brief, /npm run reimagine -- start/);
});

test("requires an agent harness when Copilot Studio is in scope", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "Agent Solution",
    entryMode: "new-concept",
    target: { ...baseTarget, agents: { copilotStudio: true } }
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, false);
});

test("requires an agent harness when an M365 Copilot agent is in scope", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "Declarative Agent",
    entryMode: "new-concept",
    target: { ...baseTarget, agents: { m365Copilot: true } }
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, false);
});

test("accepts an agent scope that names a harness", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "Agent Solution",
    entryMode: "new-concept",
    target: { ...baseTarget, agents: { copilotStudio: true, m365Copilot: false, harness: "github-copilot" } }
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("accepts a target with no agents block", async () => {
  const intake = {
    schemaVersion: "1.0.0",
    pilotName: "No Agents",
    entryMode: "new-concept",
    target: baseTarget
  };
  const result = await validateObject(intake, "intake.schema.json");
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("accepts a known uiSystem and rejects an unknown one", async () => {
  const ok = await validateObject(
    { schemaVersion: "1.0.0", pilotName: "UI", entryMode: "new-concept", target: { ...baseTarget, uiSystem: "custom" } },
    "intake.schema.json"
  );
  assert.equal(ok.valid, true, ok.errors.join("\n"));
  const bad = await validateObject(
    { schemaVersion: "1.0.0", pilotName: "UI", entryMode: "new-concept", target: { ...baseTarget, uiSystem: "material" } },
    "intake.schema.json"
  );
  assert.equal(bad.valid, false);
});

test("kickoff build conventions default to Fluent 2 and note recommended models", () => {
  const fluent = kickoff("care-ops", { pilotName: "Care Ops", entryMode: "new-concept" });
  assert.match(fluent, /## Build conventions/);
  assert.match(fluent, /Fluent UI 2/);
  assert.match(fluent, /Recommended models/);
  assert.match(fluent, /preflight\.ps1 -IntakePath workspaces\/care-ops\/intake\.json/);

  const custom = kickoff("care-ops", { pilotName: "Care Ops", entryMode: "new-concept", target: { uiSystem: "custom" } });
  assert.match(custom, /Custom \/ bespoke design system/);
  assert.doesNotMatch(custom, /Fluent UI 2/);
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
  assert.equal(checks.length, 7);
  for (const check of checks) {
    assert.equal(typeof check.name, "string");
    assert.equal(typeof check.ok, "boolean");
    assert.equal(typeof check.required, "boolean");
  }
  const names = checks.map((c) => c.name);
  assert.ok(names.some((n) => n.includes("Node")));
  assert.ok(names.some((n) => n.includes("pac")));
  assert.ok(names.some((n) => n.includes(".NET")));
});

test("sanitizes an uploaded ZIP filename", () => {
  assert.equal(sanitizeZipFileName("C%3A%5CDownloads%5CFabrikam%20Care.zip"), "Fabrikam-Care.zip");
  assert.throws(() => sanitizeZipFileName("solution.exe"), /\.zip file/);
});

test("rejects content that is not a ZIP archive", () => {
  assert.throws(() => assertSolutionZip(Buffer.from("not a zip")), /not a valid ZIP/);
});

test("stores and unpacks an uploaded solution ZIP", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reimagine-intake-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let unpackedFrom = "";
  let unpackedTo = "";
  const result = await storeSolutionZip({
    pilotSlug: "fabrikam-care",
    originalName: "Fabrikam Care.zip",
    content: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    inboxRoot: root,
    unpack: async (zipPath, outputPath) => {
      unpackedFrom = zipPath;
      unpackedTo = outputPath;
    }
  });

  assert.equal(await readFile(unpackedFrom, "hex"), "504b0304");
  assert.equal(unpackedTo, path.join(root, "fabrikam-care", "unpacked"));
  assert.match(result.zipPath, /fabrikam-care\/Fabrikam-Care\.zip$/);
  assert.match(result.unpackedPath, /fabrikam-care\/unpacked$/);
});

test("kickoff omits the agents section when no agents are in scope", () => {
  const brief = kickoff("no-agents", {
    pilotName: "No Agents",
    entryMode: "new-concept"
  });
  assert.equal(brief.includes("## Conversational agents"), false);
});

test("kickoff records the Standard harness for Copilot Studio scope", () => {
  const brief = kickoff("agentic", {
    pilotName: "Agentic",
    entryMode: "new-concept",
    target: { agents: { copilotStudio: true, harness: "standard" } }
  });
  assert.match(brief, /## Conversational agents/);
  assert.match(brief, /In scope: Copilot Studio agent\(s\)/);
  assert.match(brief, /Authoring harness: \*\*Standard harness\*\*/);
  assert.match(brief, /Advisor, Author, Manage, Test/);
});

test("kickoff constrains the GitHub Copilot harness and lists both agent kinds", () => {
  const brief = agentsBrief({
    pilotName: "Agentic",
    entryMode: "tenant",
    target: { agents: { copilotStudio: true, m365Copilot: true, harness: "github-copilot" } }
  });
  assert.match(brief, /Copilot Studio agent\(s\), Microsoft 365 Copilot \(declarative\) agent\(s\)/);
  assert.match(brief, /Authoring harness: \*\*GitHub Copilot harness\*\*/);
  assert.match(brief, /Do not spawn autonomous sub-agents/);
});

test("nextCommand is null for a new concept and set for a repository", () => {
  assert.equal(nextCommand("x", { pilotName: "X", entryMode: "new-concept" }), null);
  assert.match(
    nextCommand("y", { pilotName: "Y", entryMode: "repository", source: { repository: "https://example.invalid/repo" } }) ?? "",
    /--repo https:\/\/example\.invalid\/repo/
  );
});
