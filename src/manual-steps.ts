import type { IntakePayload } from "./intake-kickoff.js";

/** A manual/UI step that generally cannot be performed programmatically by the build agent. */
export interface ManualStepCatalogItem {
  id: string;
  title: string;
  category: "enablement" | "connections" | "solution" | "teams" | "agents" | "identity" | "licensing" | "sharing" | "publish";
  /** Why it can't be automated (admin-gated, interactive consent, UI-only, …). */
  why: string;
  /** Where in the UI to do it. */
  where: string;
  /** Ordered UI steps. */
  steps: string[];
  /** True when a full (Standard) harness could automate it; still manual in the GitHub Copilot harness. */
  automatableInStandardHarness?: boolean;
  /** Predicate: does this apply to the given intake? */
  appliesWhen: (intake: IntakePayload) => boolean;
}

/** A step recorded at runtime by the build agent when it hit something it could not automate. */
export interface RecordedManualStep {
  title: string;
  why?: string;
  where?: string;
  steps?: string[];
}

const hasAgents = (i: IntakePayload): boolean => Boolean(i.target?.agents?.copilotStudio || i.target?.agents?.m365Copilot);
const hasM365Agent = (i: IntakePayload): boolean => Boolean(i.target?.agents?.m365Copilot);
const hasTeams = (i: IntakePayload): boolean => i.target?.teamsPackaging !== false;
const always = (): boolean => true;

/** Well-known Power Platform steps that require the maker portal / admin center / UI. */
export const MANUAL_STEP_CATALOG: ManualStepCatalogItem[] = [
  {
    id: "enable-code-apps",
    title: "Enable Power Apps code apps on the target environment",
    category: "enablement",
    why: "Admin-gated feature with no public API. The first `pac code push` returns 403 until it is on (and it takes a few minutes to propagate).",
    where: "Power Platform admin center (admin.powerplatform.microsoft.com) → Environments → <env> → Settings → Product → Features",
    steps: [
      "Open the target environment's Settings → Product → Features.",
      "Turn ON 'Power Apps code apps'.",
      "Save, then wait a few minutes for it to propagate before pushing."
    ],
    appliesWhen: always
  },
  {
    id: "premium-licensing",
    title: "Ensure Power Apps Premium licensing for end users",
    category: "licensing",
    why: "Licensing is assigned in the admin center, not by code. Code apps on Dataverse require Power Apps Premium for the people who run them.",
    where: "Microsoft 365 admin center → Users → Licenses (or Billing → Licenses; or environment/security-group rules)",
    steps: [
      "Confirm each user who will run the app has Power Apps Premium (per-user or per-app).",
      "Assign licenses (or an environment/group rule) as needed."
    ],
    appliesWhen: always
  },
  {
    id: "create-connections",
    title: "Create and consent to connector connections",
    category: "connections",
    why: "OAuth consent is interactive. A solution can carry connection references, but the actual connection + user/admin consent must be created in the UI.",
    where: "make.powerapps.com → Connections → New connection (some connectors also prompt on first app play)",
    steps: [
      "Create a connection for each connector the app/flows use (e.g., Office 365 Outlook, Dataverse, Teams).",
      "Complete the OAuth consent prompt.",
      "Map each connection reference in the solution to its connection."
    ],
    appliesWhen: always
  },
  {
    id: "add-app-to-solution",
    title: "Confirm the code app is a component of the solution",
    category: "solution",
    why: "`pac code push --solutionName` does not reliably register the app as a solution component (there is no canvasapps record until it is known to a solution).",
    where: "make.powerapps.com → Solutions → <solution> → Add existing → App",
    steps: [
      "Run `scripts/add-app-to-solution.ps1` first (it adds it via AddSolutionComponent).",
      "If it is still missing, in the portal open the solution → Add existing → App → select the code app.",
      "Re-run `scripts/audit-solution.ps1` to confirm the app appears (component type 300)."
    ],
    automatableInStandardHarness: true,
    appliesWhen: always
  },
  {
    id: "teams-csp",
    title: "Allow Microsoft Teams to frame the app (Content Security Policy)",
    category: "teams",
    why: "The App CSP frame-ancestors defaults to 'self' https://*.powerapps.com and there is no CLI to edit it. Without this the Teams tab renders blank.",
    where: "PPAC → Environments → <env> → Settings → Product → Privacy + Security → Content security policy → App tab",
    steps: [
      "Add https://teams.microsoft.com and https://*.teams.microsoft.com to frame-ancestors.",
      "Save. (SSO inside the tab uses the app's own Entra sign-in; add webApplicationInfo later for silent SSO.)"
    ],
    appliesWhen: hasTeams
  },
  {
    id: "add-agent-mcp-tool",
    title: "Add the Dataverse MCP tool to the agent (one-time consent)",
    category: "agents",
    why: "Grounding the agent on live Dataverse data rides on a Power Platform connector, so the connection needs interactive OAuth consent. The agent's identity + instructions are built as code; only this connection is manual. The Dataverse MCP server is on by default for the Copilot Studio client, so it's ~2 clicks + one sign-in.",
    where: "copilotstudio.microsoft.com → <agent> → Tools → + Add tool → Model Context Protocol → Dataverse MCP Server",
    steps: [
      "Open the agent in Copilot Studio and go to the Tools section.",
      "Select + Add tool → Model Context Protocol → Dataverse MCP Server.",
      "If prompted, create/authorize the Dataverse connection (one-time sign-in consent).",
      "Select Add to agent. (Optional: … → Edit next to the tool to scope which tables/tools are exposed.)",
      "Test in the agent's chat pane, e.g. 'describe the <table>' / 'what needs attention right now?'.",
      "See AGENT_BUILD.md for the full walkthrough + grounded test prompts."
    ],
    appliesWhen: hasAgents
  },
  {
    id: "publish-agent",
    title: "Publish the Copilot Studio agent and enable its channels",
    category: "agents",
    why: "Publishing and enabling channels (Teams, Microsoft 365 Copilot) is a Copilot Studio UI flow. In the GitHub Copilot harness there is no background publish; drive it interactively.",
    where: "copilotstudio.microsoft.com → <agent> → Publish; then Channels / Settings",
    steps: [
      "Open the agent in Copilot Studio and click Publish. (If built as code, the kit already published it — re-publish after any change.)",
      "Enable the channel(s) you need — Microsoft Teams and/or Microsoft 365 Copilot.",
      "To embed the agent in the code app, enable a Custom website channel, copy its embed URL, set the app's VITE_AGENT_EMBED_URL build variable, and redeploy (see AGENT_BUILD.md).",
      "Submit for admin approval if prompted."
    ],
    automatableInStandardHarness: true,
    appliesWhen: hasAgents
  },
  {
    id: "approve-m365-agent",
    title: "Approve the agent for Microsoft 365 Copilot (tenant admin)",
    category: "agents",
    why: "A declarative / M365 Copilot agent must be approved by a tenant admin before users can access it.",
    where: "Microsoft 365 admin center → Settings → Integrated apps (or Copilot → Agents)",
    steps: [
      "Find the submitted agent under Integrated apps / Copilot agents.",
      "Review permissions and Approve / publish it to the intended users or groups."
    ],
    appliesWhen: hasM365Agent
  },
  {
    id: "app-registration",
    title: "Register an Entra app for server-side Graph (if the agent/flows call Graph app-only)",
    category: "identity",
    why: "App registration, admin consent, and client secrets are Entra/Azure UI actions. Secrets must be created in the UI and kept server-side (in a flow or Key Vault), never in the client app.",
    where: "entra.microsoft.com (or portal.azure.com) → App registrations",
    steps: [
      "New registration → note the Application (client) ID and Directory (tenant) ID.",
      "API permissions → add the required Microsoft Graph Application permissions → Grant admin consent.",
      "Certificates & secrets → new client secret → store it server-side (flow/Key Vault)."
    ],
    appliesWhen: hasAgents
  },
  {
    id: "share-app-roles",
    title: "Share the app and assign Dataverse security roles",
    category: "sharing",
    why: "Sharing the app and assigning security roles that grant table access is a maker/admin UI action.",
    where: "make.powerapps.com → Apps → Share; Dataverse security roles",
    steps: [
      "Share the app with the users/groups who will run it.",
      "Assign the security role that grants access to the app's Dataverse tables."
    ],
    appliesWhen: always
  },
  {
    id: "solution-hub-submit",
    title: "Submit to the Solution Hub / Solution City",
    category: "publish",
    why: "The catalog submission is a web form (no API in this kit).",
    where: "The Solution Hub / Solution City submission form",
    steps: [
      "Open the submission form and use 'Fetch & Fill' from the published GitHub repo if available.",
      "Paste the fields from `solution-hub.json` / `SOLUTION_HUB.md` (title, industry, content types, technical areas, contributors, narrative)."
    ],
    appliesWhen: always
  }
];

export function selectManualSteps(intake: IntakePayload): ManualStepCatalogItem[] {
  return MANUAL_STEP_CATALOG.filter((item) => item.appliesWhen(intake));
}

export function renderManualGuide(
  pilotName: string,
  intake: IntakePayload,
  recorded: RecordedManualStep[] = []
): string {
  const isGitHubHarness = intake.target?.agents?.harness === "github-copilot";
  const items = selectManualSteps(intake);

  const lines: string[] = [];
  lines.push(`# Manual steps — ${pilotName}`);
  lines.push("");
  lines.push(
    "These steps generally **cannot be done programmatically** by the build agent — they need the maker portal, admin center, or another UI. Do them in the browser; everything else the agent automates."
  );
  lines.push("");
  if (isGitHubHarness) {
    lines.push(
      "> You are using the **GitHub Copilot harness** (single-agent, interactive). Steps marked *(Standard harness can automate)* would be automated by the full harness but are manual here."
    );
    lines.push("");
  }
  if (hasAgents(intake)) {
    lines.push(
      "> **Agents:** the agent's identity, instructions, and model are built **as code** and published by the kit. The agent steps below are the one-time UI/consent last mile — see **`AGENT_BUILD.md`** for the full build + finish walkthrough (Dataverse MCP tool, test prompts, publish, embed)."
    );
    lines.push("");
  }

  let n = 0;
  for (const item of items) {
    n += 1;
    const auto = item.automatableInStandardHarness ? " _(Standard harness can automate)_" : "";
    lines.push(`## ${n}. ${item.title}${auto}`);
    lines.push("");
    lines.push(`- **Why manual:** ${item.why}`);
    lines.push(`- **Where:** ${item.where}`);
    lines.push(`- **Steps:**`);
    for (const s of item.steps) lines.push(`  1. ${s}`);
    lines.push("");
  }

  if (recorded.length) {
    lines.push("## Recorded during the build (agent hit these)");
    lines.push("");
    for (const r of recorded) {
      lines.push(`### ${r.title}`);
      if (r.why) lines.push(`- **Why manual:** ${r.why}`);
      if (r.where) lines.push(`- **Where:** ${r.where}`);
      if (r.steps?.length) {
        lines.push(`- **Steps:**`);
        for (const s of r.steps) lines.push(`  1. ${s}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "The agent records any additional non-automatable step it encounters in `solution-model.json` under `manualSteps`; regenerate this guide with `npm run reimagine -- manual-guide --workspace <workspace>`."
  );
  lines.push("");
  return lines.join("\n");
}
