import assert from "node:assert/strict";
import test from "node:test";
import type { IntakePayload } from "../src/intake-kickoff.js";
import { renderManualGuide, selectManualSteps } from "../src/manual-steps.js";

const base: IntakePayload = {
  pilotName: "Inventory Tracking",
  entryMode: "solution-zip",
  target: { teamsPackaging: true, uiSystem: "fluent2" }
};

test("always-applicable manual steps are selected for any code-app pilot", () => {
  const ids = selectManualSteps(base).map((s) => s.id);
  assert.ok(ids.includes("enable-code-apps"));
  assert.ok(ids.includes("premium-licensing"));
  assert.ok(ids.includes("create-connections"));
  assert.ok(ids.includes("add-app-to-solution"));
  assert.ok(ids.includes("solution-hub-submit"));
});

test("Teams packaging adds the CSP step; disabling it removes the step", () => {
  assert.ok(selectManualSteps(base).some((s) => s.id === "teams-csp"));
  const noTeams: IntakePayload = { ...base, target: { ...base.target, teamsPackaging: false } };
  assert.ok(!selectManualSteps(noTeams).some((s) => s.id === "teams-csp"));
});

test("agents add publish + app-registration; an M365 agent adds admin approval", () => {
  const withAgent: IntakePayload = {
    ...base,
    target: { ...base.target, agents: { copilotStudio: true, m365Copilot: true, harness: "github-copilot" } }
  };
  const ids = selectManualSteps(withAgent).map((s) => s.id);
  assert.ok(ids.includes("publish-agent"));
  assert.ok(ids.includes("app-registration"));
  assert.ok(ids.includes("approve-m365-agent"));

  const noAgent = selectManualSteps(base).map((s) => s.id);
  assert.ok(!noAgent.includes("publish-agent"));
  assert.ok(!noAgent.includes("approve-m365-agent"));
});

test("guide notes the GitHub Copilot harness and includes recorded steps", () => {
  const withAgent: IntakePayload = {
    ...base,
    target: { ...base.target, agents: { copilotStudio: true, m365Copilot: true, harness: "github-copilot" } }
  };
  const guide = renderManualGuide("Inventory Tracking", withAgent, [
    { title: "Configure the facilities webhook", why: "external system UI", where: "Facilities portal", steps: ["Open portal", "Add webhook"] }
  ]);
  assert.match(guide, /# Manual steps — Inventory Tracking/);
  assert.match(guide, /GitHub Copilot harness/);
  assert.match(guide, /Standard harness can automate/);
  assert.match(guide, /Publish the Copilot Studio agent/);
  assert.match(guide, /Approve the agent for Microsoft 365 Copilot/);
  assert.match(guide, /Recorded during the build/);
  assert.match(guide, /Configure the facilities webhook/);
});

test("guide omits the harness callout for the standard harness", () => {
  const std: IntakePayload = { ...base, target: { ...base.target, agents: { copilotStudio: true, harness: "standard" } } };
  const guide = renderManualGuide("Inventory Tracking", std, []);
  assert.doesNotMatch(guide, /You are using the \*\*GitHub Copilot harness\*\*/);
});
