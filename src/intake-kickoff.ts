export interface IntakePayload {
  pilotName: string;
  entryMode: "new-concept" | "repository" | "solution-zip" | "tenant";
  source?: {
    repository?: string;
    revision?: string;
    zipPath?: string;
    environmentUrl?: string;
    solutionName?: string;
  };
  target?: {
    agents?: {
      copilotStudio?: boolean;
      m365Copilot?: boolean;
      harness?: "standard" | "github-copilot";
    };
  };
}

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

export function kickoff(slug: string, intake: IntakePayload): string {
  const cmd = nextCommand(slug, intake);
  const ingest =
    intake.entryMode === "new-concept"
      ? "This is a **new concept** (greenfield). Skip source discovery. Use `intake.json` (concept + target) to design the modern solution directly, then build it in a named unmanaged solution."
      : `Ingest the source into this workspace, then continue:\n\n\`\`\`powershell\n${cmd}\n\`\`\``;

  return `# Kickoff Brief — ${intake.pilotName}

## Intake

Captured by the guided intake wizard. See \`intake.json\` in this folder for the full brief.

- Entry mode: **${intake.entryMode}**${agentsBrief(intake)}

## Current gate

Intake complete. No environment mutation has been authorized.

## Next actions for Copilot

1. Load the \`reimagine-power-platform\` skill.
2. Read \`intake.json\` — it holds source, target, features, synthetic-data, and publish details.
3. ${ingest}
4. Follow the phased process in \`docs/REIMAGINE_PROCESS.md\`, stopping at each approval gate.
`;
}
