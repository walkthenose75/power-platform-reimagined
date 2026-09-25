import type { IntakePayload } from "./intake-kickoff.js";

export interface AgentBuildOptions {
  /** Table logical names the agent should ground on (from discovery). */
  groundingTables?: string[];
  /** Whether the agent was already built + imported as code (pac copilot). */
  built?: boolean;
  /** Publisher prefix + solution, for the build-agent command hint. */
  prefix?: string;
  solution?: string;
}

function agentKinds(intake: IntakePayload): { copilotStudio: boolean; m365: boolean } {
  const a = intake.target?.agents ?? {};
  return { copilotStudio: Boolean(a.copilotStudio), m365: Boolean(a.m365Copilot) };
}

/**
 * Generate AGENT_BUILD.md — how to finish/refine a Copilot Studio agent built with the new
 * experience (GitHub Copilot harness). The agent itself is authored as code (pac copilot); this
 * covers the manual last mile (Dataverse MCP tool + connection, publish, channel, embed) plus a
 * paste-ready refinement prompt for the Build tab.
 */
export function renderAgentBuild(intake: IntakePayload, options: AgentBuildOptions = {}): string {
  const { copilotStudio, m365 } = agentKinds(intake);
  const industry = intake.publish?.solutionHub?.industry?.trim();
  const tables = options.groundingTables ?? [];
  const built = options.built ?? false;
  const prefix = options.prefix ?? "<prefix>";
  const solution = options.solution ?? "<Solution>";
  const industryLine = industry ? ` for a **${industry}** organization` : "";
  const tablesLine = tables.length ? tables.map((t) => `\`${t}\``).join(", ") : "the reimagined Dataverse tables";

  const lines: string[] = [];
  lines.push(`# Agent build — ${intake.pilotName}`);
  lines.push("");
  lines.push(
    "Built with the **new Copilot Studio experience** on the **GitHub Copilot harness**. The agent " +
      "(identity + instructions + model) is authored **as code** and lands in the solution; the steps " +
      "below are the one-time UI/consent last mile."
  );
  lines.push("");

  lines.push("## 1. The agent (built as code)");
  if (built) {
    lines.push(
      "Already built and imported into the solution via " +
        `\`scripts/build-agent.ps1\` (\`pac copilot init\` → \`pack --solution-name ${solution}\` → \`solution import\`). ` +
        "It's a CliCopilot agent on a Sonnet-class model."
    );
  } else {
    lines.push("Build + deploy it into the solution:");
    lines.push("");
    lines.push("```powershell");
    lines.push(
      `./scripts/build-agent.ps1 -EnvironmentUrl <env> -Name "<Agent>" -PublisherPrefix ${prefix} \` `
    );
    lines.push(`    -Solution ${solution} -InstructionsFile workspaces/<pilot>/generated/agent-instructions.md`);
    lines.push("```");
  }
  lines.push("");

  lines.push("## 2. Add the Dataverse MCP tool + connection (UI, one-time)");
  lines.push(
    "This is a connector/consent flow and can't be fully authored in code (OAuth consent is interactive)."
  );
  lines.push("");
  lines.push("1. Open the agent in **copilotstudio.microsoft.com** → **Build** tab → **Tools** → **Add a tool**.");
  lines.push("2. Choose **Model Context Protocol** → **Dataverse MCP Server**.");
  lines.push("3. **Authorize the connection** (create/confirm the Dataverse connection).");
  lines.push(`4. Scope it to ${tablesLine}. Select **Add and configure**.`);
  lines.push("");
  lines.push(
    "> Ensure the **Dataverse MCP Server (preview)** feature is enabled for the environment (PPAC → " +
      "Environment → Settings → Product → Features). See `MANUAL_STEPS.md`."
  );
  lines.push("");

  lines.push("## 3. Refine the agent (optional) — paste into the Build tab");
  lines.push("");
  lines.push("If you want to expand behavior, paste this into the agent's **Build** (describe/refine) box:");
  lines.push("");
  lines.push("```text");
  lines.push(
    `You are the ${intake.pilotName} assistant${industryLine}. Ground every answer in Dataverse via the ` +
      `Dataverse MCP Server over ${tablesLine}. Help users find records, see details (including images), ` +
      `report items that need attention, summarize by category, and take safe update actions on request. ` +
      `Be concise, show numbers, and proactively flag anything that needs action. Ask a brief clarifying ` +
      `question when a request is ambiguous.`
  );
  lines.push("```");
  lines.push("");

  lines.push("## 4. Publish + channels");
  lines.push("");
  lines.push("1. In Copilot Studio, **Publish** the agent.");
  if (m365) lines.push("2. Enable the **Microsoft 365 Copilot** channel; a tenant admin approves it (M365 admin center → Integrated apps).");
  if (copilotStudio || !m365) lines.push("2. Enable the channel(s) you need — **Microsoft Teams** and/or **demo web**.");
  lines.push("");

  lines.push("## 5. Embed in the code app");
  lines.push("");
  lines.push(
    "The code app's **Assistant** tab hosts the agent once it's published. Copy the agent's **demo web / " +
      "embed URL** (or a Direct Line token endpoint) from its channel settings and set it in the app's " +
      "agent‑embed config/environment value. The app works without it; the agent plugs in when ready."
  );
  lines.push("");
  return lines.join("\n");
}
