export interface IntakePayload {
  pilotName: string;
  entryMode: "new-concept" | "repository" | "solution-zip" | "tenant";
  source?: {
    repository?: string;
    revision?: string;
    zipPath?: string;
    environmentUrl?: string;
    solutionName?: string;
    dependencyBoundary?: "full-closure" | "referenced-only" | "solution-owned";
  };
  target?: {
    environmentUrl?: string;
    signInAccount?: string;
    teamsPackaging?: boolean;
    uiSystem?: "fluent2" | "custom";
    agents?: {
      copilotStudio?: boolean;
      m365Copilot?: boolean;
      harness?: "standard" | "github-copilot";
    };
  };
  synthetic?: {
    realism?: string;
    volume?: string;
  };
  reimagine?: {
    painPoints?: string;
    keepChangeDrop?: string;
    featureIdeas?: string;
  };
  concept?: {
    problem?: string;
    users?: string;
  };
  publish?: {
    githubRepoUrl?: string;
    solutionHub?: {
      title?: string;
      industry?: string;
      contentTypes?: string[];
      technicalAreas?: string[];
      contributors?: string;
      narrative?: string;
    };
  };
}

export interface KickoffOptions {
  /** True when the source has already been ingested (e.g. the CLI `start` ran). */
  ingested?: boolean;
}

const OPERATOR_PHRASE = "Reimagine this Power Platform solution.";

const BOUNDARY_LABEL: Record<NonNullable<NonNullable<IntakePayload["source"]>["dependencyBoundary"]>, string> = {
  "full-closure": "Everything it depends on",
  "referenced-only": "Solution + one hop out",
  "solution-owned": "Only what's inside the solution"
};

export function nextCommand(slug: string, intake: IntakePayload): string | null {
  const output = `workspaces/${slug}`;
  const name = intake.pilotName;
  const source = intake.source ?? {};
  switch (intake.entryMode) {
    case "repository":
      return `npm run reimagine -- start --name "${name}" --repo ${source.repository ?? "<repo-url>"} --revision ${source.revision || "main"} --output ${output}`;
    case "solution-zip":
      return `npm run reimagine -- start --name "${name}" --zip "${source.zipPath ?? "<path-to-zip>"}" --output ${output}`;
    case "tenant":
      return `# Export the solution from the tenant, then:\nnpm run reimagine -- start --name "${name}" --zip "<exported-solution.zip>" --output ${output}`;
    case "new-concept":
      return null;
  }
}

function sourceLine(intake: IntakePayload): string {
  const source = intake.source ?? {};
  const boundary =
    intake.entryMode !== "new-concept" && source.dependencyBoundary
      ? ` · boundary: ${BOUNDARY_LABEL[source.dependencyBoundary]}`
      : "";
  switch (intake.entryMode) {
    case "repository":
      return `GitHub repo \`${source.repository ?? "<repo-url>"}\` @ \`${source.revision || "main"}\`${boundary}`;
    case "solution-zip":
      return `Uploaded solution ZIP \`${source.zipPath ?? "<path-to-zip>"}\`${boundary}`;
    case "tenant":
      return `Tenant solution \`${source.solutionName ?? "<solution>"}\` in \`${source.environmentUrl ?? "<environment-url>"}\`${boundary}`;
    case "new-concept":
      return "New concept (greenfield) — no existing source";
  }
}

function ingestionBlock(slug: string, intake: IntakePayload): string {
  const output = `workspaces/${slug}`;
  const name = intake.pilotName;
  const source = intake.source ?? {};
  switch (intake.entryMode) {
    case "repository":
      return `Clone and seed the workspace:

   \`\`\`powershell
   npm run reimagine -- start --name "${name}" --repo ${source.repository ?? "<repo-url>"} --revision ${source.revision || "main"} --output ${output}
   \`\`\``;
    case "solution-zip":
      return `Seed the workspace from the uploaded export (already saved by the wizard):

   \`\`\`powershell
   npm run reimagine -- start --name "${name}" --zip "${source.zipPath ?? "<path-to-zip>"}" --output ${output}
   \`\`\``;
    case "tenant": {
      const env = source.environmentUrl ?? "<environment-url>";
      const solution = source.solutionName ?? "<solution>";
      return `Authenticate to the **source** environment, then run the one-button export + seed:

   \`\`\`powershell
   pac auth create --environment ${env}
   ./scripts/export-source-solution.ps1 -IntakePath workspaces/${slug}/intake.json
   \`\`\`

   (Equivalent long form: \`pac solution export --path .\\inbox\\${slug}\\${solution}.zip --name ${solution} --managed false --environment ${env}\` then \`npm run reimagine -- start --name "${name}" --zip ".\\inbox\\${slug}\\${solution}.zip" --output ${output}\`.)`;
    }
    case "new-concept":
      return "";
  }
}

function orderedSteps(slug: string, intake: IntakePayload, ingested: boolean): string {
  if (intake.entryMode === "new-concept") {
    return [
      "1. Load the `reimagine-power-platform` skill.",
      `2. Scaffold the workspace (seeds \`solution-model.json\` + directories):\n\n   \`\`\`powershell\n   npm run reimagine -- init --name "${intake.pilotName}" --source new-concept --output workspaces/${slug}\n   \`\`\``,
      "3. Read `intake.json` (problem, target users, target); treat `solution-model.json` as the source of truth to populate.",
      "4. **Enter plan mode.** With the operator, complete the plan — capabilities and scenarios, the Dataverse data model, and integrations. Get the operator's approval before building.",
      `5. Before building, **establish the sign-ins** — you run it; the operator only completes the browser prompts: \`./scripts/connect.ps1 -IntakePath workspaces/${slug}/intake.json\`, then \`./scripts/preflight.ps1 -IntakePath workspaces/${slug}/intake.json\` and clear every FAIL.`,
      "6. On approval, build it in a named unmanaged solution and follow `docs/REIMAGINE_PROCESS.md` from Phase 4, stopping at each approval gate."
    ].join("\n");
  }

  if (ingested) {
    return [
      "1. Load the `reimagine-power-platform` skill.",
      "2. Source already ingested into `evidence/`. Read `intake.json` and validate `solution-model.json`.",
      `3. **Establish the sign-ins** — you run it; the operator only completes the browser prompts:\n\n   \`\`\`powershell\n   ./scripts/connect.ps1 -IntakePath workspaces/${slug}/intake.json\n   \`\`\`\n   Then run the readiness gate (\`preflight.ps1\`, see Build conventions) and clear every FAIL before any tenant mutation.`,
      "4. Follow `docs/REIMAGINE_PROCESS.md` (discovery → plan → build → review → publish), stopping at each approval gate."
    ].join("\n");
  }

  return [
    "1. Load the `reimagine-power-platform` skill.",
    `2. Ingest the source into this workspace. ${ingestionBlock(slug, intake)}`,
    "3. Read `intake.json` and validate `solution-model.json`.",
    `4. **Establish the sign-ins** — you run it; the operator only completes the browser prompts:\n\n   \`\`\`powershell\n   ./scripts/connect.ps1 -IntakePath workspaces/${slug}/intake.json\n   \`\`\`\n   Then run the readiness gate (\`preflight.ps1\`, see Build conventions) and clear every FAIL before any tenant mutation.`,
    "5. Follow `docs/REIMAGINE_PROCESS.md` (discovery → plan → build → review → publish), stopping at each approval gate."
  ].join("\n");
}

export function agentsBrief(intake: IntakePayload): string {
  const agents = intake.target?.agents;
  if (!agents || (!agents.copilotStudio && !agents.m365Copilot)) {
    return "";
  }
  const kinds: string[] = [];
  if (agents.copilotStudio) {
    kinds.push("Copilot Studio agent(s)");
  }
  if (agents.m365Copilot) {
    kinds.push("Microsoft 365 Copilot (declarative) agent(s)");
  }
  const isGitHub = agents.harness === "github-copilot";
  const harnessLabel = isGitHub ? "GitHub Copilot harness" : "Standard harness";
  const harnessNote = isGitHub
    ? "Single-agent and interactive. Do not spawn autonomous sub-agents or background runs; drive the Copilot Studio skills as guided prompts, and treat publish and batch evaluation as manual, operator-confirmed steps."
    : "Full harness. Route agent work to the Copilot Studio specialists (Advisor, Author, Manage, Test), including clone/pull/push/publish and background evaluation and chat testing.";
  return [
    "",
    "",
    "## Conversational agents",
    "",
    `- In scope: ${kinds.join(", ")}`,
    `- Authoring harness: **${harnessLabel}**`,
    `- ${harnessNote}`
  ].join("\n");
}

function buildConventions(slug: string, intake: IntakePayload): string {
  const custom = intake.target?.uiSystem === "custom";
  const uiLine = custom
    ? "Custom / bespoke design system, per intake — Fluent 2 is not required."
    : "**Fluent UI 2** (`@fluentui/react-components` v9) via `FluentProvider`; use `@fluentui/react-icons` and Fluent components (DataGrid, Field, Dialog). When packaged as a Teams tab, sync the Teams theme (light / dark / high-contrast); otherwise follow `prefers-color-scheme`.";
  return `

## Build conventions

- **Readiness gate (before any tenant mutation):** run \`./scripts/preflight.ps1 -IntakePath workspaces/${slug}/intake.json\` and clear every FAIL. For auth FAILs, re-run \`./scripts/connect.ps1 -IntakePath workspaces/${slug}/intake.json\` (you run it; the operator completes the browser sign-in). Other FAILs: code-apps enablement, Power Apps license.
- **UI system:** ${uiLine}
- **Recommended models:** drive the build with the strongest agentic **coding** model available (Claude Sonnet-class); use a high-**reasoning** model (GPT-5 / o-series) for the architecture and plan-mode gates. Pick the strongest your harness offers.
- **Definition of done (after building):** run \`./scripts/acceptance.ps1 -EnvironmentUrl <target> -SolutionUnique <name> -Prefix <prefix> [-AppUrl <play-url>] [-PublicationPath workspaces/${slug}/publication]\` and get **ACCEPTED** before calling it complete.
- **Stay on rail (no drift):** run \`npm run status\` (or just \`npm run reimagine\`) anytime to see the current phase and the one next action. When a gate is approved, record it — \`npm run reimagine -- gate <stage> --workspace workspaces/${slug}\` — so \`solution-model.json\` always tracks where you are.`;
}

function bullet(label: string, value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? `- **${label}:** ${v}` : null;
}

export function operatorInputs(intake: IntakePayload): string {
  const t = intake.target ?? {};
  const s = intake.synthetic ?? {};
  const r = intake.reimagine ?? {};
  const c = intake.concept ?? {};
  const hub = intake.publish?.solutionHub ?? {};
  const arr = (v: string[] | undefined): string => (Array.isArray(v) && v.length ? v.join(", ") : "");

  const target = [
    bullet("Target environment", t.environmentUrl),
    bullet("Sign-in account", t.signInAccount),
    typeof t.teamsPackaging === "boolean" ? `- **Teams personal tab:** ${t.teamsPackaging ? "yes" : "no"}` : null,
    bullet("UI system", t.uiSystem === "custom" ? "Custom design system" : t.uiSystem === "fluent2" ? "Fluent UI 2" : undefined)
  ].filter(Boolean);

  const data = [
    bullet("Synthetic realism", s.realism),
    bullet("Synthetic volume", s.volume)
  ].filter(Boolean);

  const intent = [
    bullet("Problem", c.problem),
    bullet("Target users", c.users),
    bullet("Keep / change / drop", r.keepChangeDrop),
    bullet("Known pain points", r.painPoints),
    bullet("Feature ideas", r.featureIdeas)
  ].filter(Boolean);

  const publish = [
    bullet("Hub title", hub.title),
    bullet("Industry", hub.industry),
    bullet("Content types", arr(hub.contentTypes)),
    bullet("Technical areas", arr(hub.technicalAreas)),
    bullet("Contributors", hub.contributors),
    bullet("GitHub repo", intake.publish?.githubRepoUrl)
  ].filter(Boolean);

  const groups: string[] = [];
  if (target.length) groups.push(`**Target**\n${target.join("\n")}`);
  if (data.length) groups.push(`**Synthetic data**\n${data.join("\n")}`);
  if (intent.length) groups.push(`**Intent**\n${intent.join("\n")}`);
  if (publish.length) groups.push(`**Solution Hub / Solution City**\n${publish.join("\n")}`);

  const narrative = (hub.narrative ?? "").trim();
  const narrativeBlock = narrative ? `\n\n**Narrative / business value (from intake)**\n\n${narrative}` : "";

  if (!groups.length && !narrativeBlock) return "";
  return `\n\n## Operator inputs (from the wizard)\n\n${groups.join("\n\n")}${narrativeBlock}\n\nHonor these while designing and building. The complete brief is in \`intake.json\`.`;
}

export function kickoff(slug: string, intake: IntakePayload, options: KickoffOptions = {}): string {
  const ingested = options.ingested ?? false;
  return `# Kickoff Brief — ${intake.pilotName}

## Intake

Captured by the guided intake wizard. See \`intake.json\` in this folder for the full brief.

- Entry mode: **${intake.entryMode}**
- Source: ${sourceLine(intake)}${agentsBrief(intake)}${operatorInputs(intake)}

## Start here (operator)

Open this folder in Copilot and say: **"${OPERATOR_PHRASE}"**

That's the only step you run. Copilot performs everything below and stops only at the approval gates.

## Current gate

Intake complete. No environment mutation has been authorized.

## Copilot — do these in order

${orderedSteps(slug, intake, ingested)}${buildConventions(slug, intake)}
`;
}
