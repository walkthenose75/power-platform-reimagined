import type { IntakePayload } from "./intake-kickoff.js";

export interface AgentBuildOptions {
  /** Table logical names the agent should ground on (from discovery). */
  groundingTables?: string[];
  /** Whether the agent was already built + imported as code (pac copilot). */
  built?: boolean;
  /** Publisher prefix + solution, for the build-agent command hint. */
  prefix?: string;
  solution?: string;
  /** Demo knowledge library URL to ground on (from demo-knowledge-result.json), if published. */
  knowledgeUrl?: string;
}

function agentKinds(intake: IntakePayload): { copilotStudio: boolean; m365: boolean } {
  const a = intake.target?.agents ?? {};
  return { copilotStudio: Boolean(a.copilotStudio), m365: Boolean(a.m365Copilot) };
}

/** A few grounded test prompts, tailored to the grounding tables when we have them. */
function testPrompts(intake: IntakePayload, tables: string[]): string[] {
  const prompts = ["show me the tables in Dataverse"];
  const first = tables[0];
  if (first) {
    prompts.push(`describe the ${first} table`);
    prompts.push(`how many rows are in ${first}?`);
  } else {
    prompts.push(`how many records does ${intake.pilotName} have?`);
  }
  prompts.push("what needs attention right now?");
  return prompts;
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
  const knowledgeUrl = options.knowledgeUrl;
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

  lines.push("## 2. Add the Dataverse MCP tool (Copilot Studio, ~2 clicks)");
  lines.push(
    "Grounding the agent on live Dataverse data is a one-time **connection consent** — the only step " +
      "that can't be authored in code (OAuth consent is interactive). It's quick:"
  );
  lines.push("");
  lines.push("1. Open **copilotstudio.microsoft.com** → pick your environment → **Agents** → open the agent.");
  lines.push("2. In the **Tools** section, select **+ Add tool**.");
  lines.push("3. Choose **Model Context Protocol** → **Dataverse MCP Server**.");
  lines.push("4. If prompted, **create/authorize the Dataverse connection** (one-time sign-in consent).");
  lines.push("5. Select **Add to agent**.");
  lines.push(`6. *(Optional)* **… → Edit** next to the tool to scope which tables/tools are exposed (${tablesLine}).`);
  lines.push("");
  lines.push(
    "> The Dataverse MCP server is **enabled by default for the Copilot Studio client**, so there's " +
      "usually nothing to turn on. Only *external* MCP clients (VS Code GitHub Copilot, Claude) need admin " +
      "enablement in PPAC → Environment → **Settings → Product → Features → Dataverse Model Context Protocol**."
  );
  lines.push("");

  lines.push("## 3. Add knowledge (ground on documents)");
  lines.push("");
  if (knowledgeUrl) {
    lines.push("Ground the agent on the **portable demo knowledge library** published for this pilot:");
    lines.push("");
    lines.push("1. In Copilot Studio → open the agent → **Knowledge** → **+ Add knowledge**.");
    lines.push("2. Choose **SharePoint** (or **Website**) and paste the library URL:");
    lines.push(`   \`${knowledgeUrl}\``);
    lines.push("3. Add a name + a clear description, then **Add**. (This is the `add-knowledge` skill's SharePoint path.)");
    lines.push("");
    lines.push("> The library holds only synthetic/sanitized documents, so the demo carries no customer content.");
  } else {
    lines.push("Ground the agent on documents so it can answer policy / how-to questions:");
    lines.push("");
    lines.push("1. In Copilot Studio → open the agent → **Knowledge** → **+ Add knowledge**.");
    lines.push("2. **Upload** sanitized files, or add a **SharePoint / Website** source (see `KNOWLEDGE.md` / `DEMO_KNOWLEDGE.md`).");
    lines.push("3. Give each source a clear description — it drives generative orchestration.");
  }
  lines.push("");

  lines.push("## 4. Test it (Copilot Studio test pane)");
  lines.push("");
  lines.push("With the tool added, try these in **Test your agent**:");
  lines.push("");
  for (const p of testPrompts(intake, tables)) lines.push(`- "${p}"`);
  lines.push("");

  lines.push("## 5. Refine the agent (optional) — paste into the Build tab");
  lines.push("");
  lines.push("To expand behavior, paste this into the agent's **Build** (describe/refine) box:");
  lines.push("");
  lines.push("```text");
  lines.push(
    `You are the ${intake.pilotName} assistant${industryLine}. Ground every answer in Dataverse via the ` +
      `Dataverse MCP Server over ${tablesLine}. Help users find records, report items that need attention, ` +
      `summarize by category, and take safe update actions on request. Be concise, show numbers, and ` +
      `proactively flag anything that needs action. Ask a brief clarifying question when a request is ambiguous.`
  );
  lines.push("```");
  lines.push("");

  lines.push("## 6. Publish + channels");
  lines.push("");
  if (built) {
    lines.push("The agent is already **Published** (the build script publishes it). Re-publish after any change.");
  } else {
    lines.push("1. In Copilot Studio, **Publish** the agent.");
  }
  if (m365) lines.push("- Enable the **Microsoft 365 Copilot** channel; a tenant admin approves it (M365 admin center → Integrated apps).");
  if (copilotStudio || !m365) lines.push("- Enable the channel(s) you need — **Microsoft Teams** and/or a **Custom website** (for the code-app embed below).");
  lines.push("");

  lines.push("## 7. Embed in the code app");
  lines.push("");
  lines.push(
    "The code app's **Assistant** tab renders the agent as soon as its embed URL is set — no code change " +
      "needed:"
  );
  lines.push("");
  lines.push("1. In Copilot Studio → **Channels** → **Custom website** (or **Web/Direct Line**), copy the agent's **embed URL**.");
  lines.push("2. Set it as the app's **`VITE_AGENT_EMBED_URL`** build variable (e.g. in the code app's `.env`), then redeploy.");
  lines.push("3. The **Assistant** tab now hosts the live agent; until then it shows these setup steps.");
  lines.push("");
  return lines.join("\n");
}
