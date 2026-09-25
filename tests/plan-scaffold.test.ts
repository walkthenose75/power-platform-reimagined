import assert from "node:assert/strict";
import test from "node:test";
import type { IntakePayload } from "../src/intake-kickoff.js";
import { scaffoldPlan, PLAN_EVIDENCE_ID } from "../src/plan-scaffold.js";

function emptyModel(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    assessment: { id: "assessment:x", name: "X", createdAt: new Date().toISOString(), stage: "intake" },
    source: { type: "new-concept" },
    components: [],
    dependencies: [],
    evidence: [],
    claims: [],
    unknowns: [],
    featureOpportunities: [],
    decisions: [],
    gates: [],
    manualSteps: []
  };
}

const intake = {
  pilotName: "Greenfield Pilot",
  entryMode: "new-concept",
  target: { surface: "code-app", uiSystem: "fluent2" }
} as IntakePayload;

test("plan-scaffold seeds an owner-confirmation evidence entry and a target-surface decision", () => {
  const out = scaffoldPlan(intake, emptyModel());
  const evidence = out.evidence as Array<{ id: string; kind: string; locator: string }>;
  const seeded = evidence.find((e) => e.id === PLAN_EVIDENCE_ID);
  assert.ok(seeded, "intake-brief evidence present");
  assert.equal(seeded?.kind, "owner-confirmation");
  assert.equal(seeded?.locator, "intake.json");

  const decisions = out.decisions as Array<{ id: string; evidenceIds: string[]; status: string }>;
  const decision = decisions.find((d) => d.id === "decision:target-surface");
  assert.ok(decision, "target-surface decision present");
  assert.deepEqual(decision?.evidenceIds, [PLAN_EVIDENCE_ID]);
  assert.equal(decision?.status, "proposed");
});

test("plan-scaffold is idempotent (no duplicates on re-run)", () => {
  const once = scaffoldPlan(intake, emptyModel());
  const twice = scaffoldPlan(intake, once);
  assert.equal((twice.evidence as unknown[]).length, 1);
  assert.equal((twice.decisions as unknown[]).length, 1);
});

test("plan-scaffold reflects a custom UI system in the decision text", () => {
  const custom = {
    pilotName: "Greenfield Pilot",
    entryMode: "new-concept",
    target: { surface: "code-app", uiSystem: "custom" }
  } as IntakePayload;
  const out = scaffoldPlan(custom, emptyModel());
  const decisions = out.decisions as Array<{ decision: string }>;
  const decision = decisions.find((d) => typeof d.decision === "string");
  assert.ok(decision);
  assert.match(decision.decision, /custom design system/);
});
