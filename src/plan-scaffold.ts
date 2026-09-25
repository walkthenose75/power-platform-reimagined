import type { IntakePayload } from "./intake-kickoff.js";

type Model = Record<string, unknown> & {
  evidence?: unknown[];
  decisions?: unknown[];
  assessment?: Record<string, unknown>;
};

const INTAKE_EVIDENCE_ID = "evidence:intake-brief";
const TARGET_SURFACE_DECISION_ID = "decision:target-surface";

/**
 * Seed a **valid** draft target model from the intake so plan mode doesn't start from a blank,
 * evidence-centric schema. The model requires `evidenceIds` on every component/decision/feature,
 * and a greenfield concept has no source evidence — so we record the intake brief as an
 * `owner-confirmation` evidence entry and capture the always-true target-surface decision. The
 * agent then extends components/featureOpportunities citing `evidence:intake-brief`.
 *
 * Idempotent: re-running does not duplicate the seeded entries.
 */
export function scaffoldPlan(intake: IntakePayload, model: Model): Model {
  const next: Model = { ...model };
  const now = new Date().toISOString();

  const evidence = Array.isArray(next.evidence) ? [...next.evidence] : [];
  if (!evidence.some((e) => (e as { id?: string }).id === INTAKE_EVIDENCE_ID)) {
    evidence.push({
      id: INTAKE_EVIDENCE_ID,
      kind: "owner-confirmation",
      locator: "intake.json",
      collectedAt: now,
      collector: "intake-wizard"
    });
  }
  next.evidence = evidence;

  const custom = intake.target?.uiSystem === "custom";
  const ui = custom ? "the intake's custom design system" : "Fluent UI 2 (`@fluentui/react-components` v9)";
  const decisions = Array.isArray(next.decisions) ? [...next.decisions] : [];
  if (!decisions.some((d) => (d as { id?: string }).id === TARGET_SURFACE_DECISION_ID)) {
    decisions.push({
      id: TARGET_SURFACE_DECISION_ID,
      title: "Target surface: code app + Dataverse in one named unmanaged solution",
      status: "proposed",
      decision:
        `Build the target as a ${ui} code app over Dataverse tables, with everything (tables, app, ` +
        "connection references, any agents/flows) inside a single named unmanaged solution.",
      rationale: "Kit standard target — modern, accessible, Teams-native, and installable.",
      evidenceIds: [INTAKE_EVIDENCE_ID]
    });
  }
  next.decisions = decisions;

  return next;
}

/** The intake-brief evidence id the agent should cite on greenfield components/decisions. */
export const PLAN_EVIDENCE_ID = INTAKE_EVIDENCE_ID;
