import assert from "node:assert/strict";
import test from "node:test";
import type { IntakePayload } from "../src/intake-kickoff.js";
import { renderAgentBuild } from "../src/agent-build.js";

const base: IntakePayload = {
  pilotName: "Inventory Tracking",
  entryMode: "solution-zip",
  target: { agents: { copilotStudio: true, m365Copilot: true, harness: "github-copilot" } },
  publish: { solutionHub: { industry: "Providers" } }
};

test("agent guide covers the code build, MCP tool, publish, and embed", () => {
  const doc = renderAgentBuild(base, { groundingTables: ["inv_InventoryItem", "inv_ItemCategory"], built: true, prefix: "inv", solution: "InventoryTracking" });
  assert.match(doc, /# Agent build — Inventory Tracking/);
  assert.match(doc, /GitHub Copilot harness/);
  assert.match(doc, /Dataverse MCP Server/);
  assert.match(doc, /inv_InventoryItem/);
  assert.match(doc, /Providers/);
  assert.match(doc, /Publish/);
  assert.match(doc, /Embed in the code app/);
  assert.match(doc, /Already built and imported/);
  assert.match(doc, /Add to agent/);
  assert.match(doc, /enabled by default for the Copilot Studio client/);
  assert.match(doc, /VITE_AGENT_EMBED_URL/);
  assert.match(doc, /describe the inv_InventoryItem table/);
  assert.match(doc, /already \*\*Published\*\*/);
});

test("agent guide shows the build command when not yet built, and M365 admin approval when applicable", () => {
  const doc = renderAgentBuild(base, { built: false, prefix: "inv", solution: "InventoryTracking" });
  assert.match(doc, /build-agent\.ps1/);
  assert.match(doc, /Microsoft 365 Copilot/);
  assert.match(doc, /tenant admin approves/);
});

test("agent guide omits the M365 admin step when no M365 agent", () => {
  const only: IntakePayload = { ...base, target: { agents: { copilotStudio: true, harness: "github-copilot" } } };
  const doc = renderAgentBuild(only, {});
  assert.doesNotMatch(doc, /tenant admin approves/);
  assert.match(doc, /Microsoft Teams/);
});
