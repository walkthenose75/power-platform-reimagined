import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { startFromRepository, startFromZip } from "./intake.js";
import type { IntakePayload } from "./intake-kickoff.js";
import { renderAgentBuild } from "./agent-build.js";
import { scaffoldPlan } from "./plan-scaffold.js";
import { mapSharePointToDataverse, type SpSchema } from "./sharepoint-map.js";
import { planKnowledge, renderKnowledgeGuide, type DocSchema } from "./knowledge-plan.js";
import { planDemoUpload, renderDemoKnowledgeGuide, DEFAULT_DEMO_LIBRARY, type LocalFile } from "./demo-knowledge.js";
import { packagePublication, renderPackageReport } from "./package.js";
import { type RecordedManualStep, renderManualGuide } from "./manual-steps.js";
import { scanPath } from "./sanitizer.js";
import { approveGate, computeStatus, findNewestWorkspace, renderStatus } from "./status.js";
import type { InitOptions, SourceType } from "./types.js";
import { validateWorkspace } from "./validation.js";
import { initializeWorkspace } from "./workspace.js";

async function readJsonFile(file: string): Promise<Record<string, unknown> | null> {
  try {
    // PowerShell (Set-Content -Encoding UTF8 on PS 5.1) prepends a UTF-8 BOM that JSON.parse rejects.
    return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function valueOf(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${flag} value.`);
  }
  return value;
}

function optionalValueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

/** List files under a folder recursively as {name, relPath, size} (forward-slash relative paths). */
async function listFilesRecursive(root: string, dir: string = root): Promise<LocalFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: LocalFile[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(root, full)));
    } else if (entry.isFile()) {
      const rel = path.relative(root, dir).split(path.sep).join("/");
      const info = await stat(full);
      out.push({ name: entry.name, relPath: rel, size: info.size });
    }
  }
  return out;
}

function printUsage(): void {
  console.log(`Usage:
  reimagine                                            # what's my status + next step?
  reimagine status [--workspace <directory>]           # where am I, and what's next?
  reimagine gate <stage> [--workspace <directory>] [--note <text>]   # record a gate approval
  reimagine start --name <name> --zip <solution.zip> --output <directory>
  reimagine start --name <name> --repo <url> [--revision <branch-or-tag>] --output <directory>
  reimagine start --name <name> --inbox <directory> --output <directory>
  reimagine init --name <name> --source <tenant|repository|new-concept> --output <directory>
  reimagine plan-scaffold [--workspace <directory>]    # seed a valid draft target model for plan mode (new-concept)
  reimagine sharepoint-map --schema <schema.json> --prefix <p> [--workspace <dir>] [--out <tables.json>]   # SharePoint list schema -> Dataverse tables.json + column map
  reimagine knowledge-plan --schema <docs.json> [--workspace <dir>] [--out <knowledge-plan.json>] [--recommend upload|sharepoint] [--pilot <name>]   # SharePoint docs -> agent-knowledge plan + KNOWLEDGE.md
  reimagine demo-knowledge --source <dir> [--site <url>] [--library <name>] [--workspace <dir>] [--pilot <name>] [--out <plan.json>]   # plan a portable demo knowledge library + DEMO_KNOWLEDGE.md
  reimagine validate --workspace <directory>
  reimagine manual-guide [--workspace <directory>] [--out <file>]   # UI/manual steps the agent can't automate
  reimagine agent-guide [--workspace <directory>] [--out <file>] [--tables a,b] [--built] [--prefix inv] [--solution Name]    # Copilot Studio agent build + finish guide
  reimagine package [--workspace <directory>] [--out <directory>]   # assemble the GitHub/Solution Hub bundle
  reimagine scan --path <directory>`);
}

async function printStatus(workspace: string | null): Promise<void> {
  const ws = workspace ?? (await findNewestWorkspace());
  if (!ws) {
    console.log("No pilots yet.\n\nGet started:\n  1. npm run doctor      # verify your machine\n  2. npm run intake      # capture the pilot\nThen open the workspace KICKOFF.md in Copilot and say: \"Reimagine this Power Platform solution.\"");
    return;
  }
  console.log(renderStatus(await computeStatus(ws)));
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command) {
    await printStatus(null);
    return;
  }
  if (command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "status") {
    await printStatus(optionalValueOf(args, "--workspace") ? path.resolve(valueOf(args, "--workspace")) : null);
    return;
  }

  if (command === "gate") {
    const stage = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
    if (!stage) {
      throw new Error("Usage: reimagine gate <stage> [--workspace <directory>] [--note <text>]");
    }
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    if (!workspace) {
      throw new Error("No workspace found. Pass --workspace <directory>.");
    }
    const report = await approveGate(workspace, stage, optionalValueOf(args, "--note"));
    console.log(`Gate '${stage}' recorded.\n`);
    console.log(renderStatus(report));
    return;
  }

  if (command === "init") {
    const source = valueOf(args, "--source");
    if (source !== "tenant" && source !== "repository" && source !== "new-concept") {
      throw new Error("--source must be tenant, repository, or new-concept.");
    }
    const options: InitOptions = {
      name: valueOf(args, "--name"),
      source: source as SourceType,
      output: path.resolve(valueOf(args, "--output"))
    };
    await initializeWorkspace(options);
    console.log(`Initialized assessment workspace at ${options.output}`);
    return;
  }

  if (command === "plan-scaffold") {
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    if (!workspace) {
      throw new Error("No workspace found. Pass --workspace <directory>.");
    }
    const intake = (await readJsonFile(path.join(workspace, "intake.json"))) as IntakePayload | null;
    if (!intake || !intake.pilotName) {
      throw new Error(`No intake.json in ${workspace}. Run the intake wizard (or start) first.`);
    }
    const model = await readJsonFile(path.join(workspace, "solution-model.json"));
    if (!model) {
      throw new Error(
        `No solution-model.json in ${workspace}. First run: npm run reimagine -- init --name "${intake.pilotName}" --source new-concept --output ${workspace}`
      );
    }
    const scaffolded = scaffoldPlan(intake as unknown as IntakePayload, model);
    await writeFile(path.join(workspace, "solution-model.json"), `${JSON.stringify(scaffolded, null, 2)}\n`, "utf8");
    const validation = await validateWorkspace(workspace);
    if (!validation.valid) {
      throw new Error(`Scaffolded model failed validation:\n${validation.errors.join("\n")}`);
    }
    console.log(
      `Seeded a valid draft plan into ${path.join(workspace, "solution-model.json")} ` +
        "(owner-confirmation evidence + target-surface decision). " +
        "Extend components/featureOpportunities in plan mode, citing evidence:intake-brief."
    );
    return;
  }

  if (command === "sharepoint-map") {
    const prefix = valueOf(args, "--prefix");
    const schemaPath = path.resolve(valueOf(args, "--schema"));
    const schema = (await readJsonFile(schemaPath)) as unknown as SpSchema | null;
    if (!schema || !Array.isArray(schema.lists)) {
      throw new Error(`No SharePoint schema at ${schemaPath}. Produce it with scripts/read-sharepoint-list.ps1.`);
    }
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    const result = mapSharePointToDataverse(schema, { prefix });
    const outTables = optionalValueOf(args, "--out")
      ? path.resolve(valueOf(args, "--out"))
      : workspace
        ? path.join(workspace, "generated", "target-state", "tables.json")
        : path.resolve("tables.json");
    await mkdir(path.dirname(outTables), { recursive: true });
    await writeFile(outTables, `${JSON.stringify({ tables: result.tables }, null, 2)}\n`, "utf8");
    const outMap = workspace
      ? path.join(workspace, "generated", "current-state", "sharepoint-column-map.json")
      : path.resolve("sharepoint-column-map.json");
    await mkdir(path.dirname(outMap), { recursive: true });
    await writeFile(outMap, `${JSON.stringify({ columnMap: result.columnMap, decisions: result.decisions }, null, 2)}\n`, "utf8");
    console.log(`Mapped ${schema.lists.length} SharePoint list(s) -> ${result.tables.length} Dataverse table(s).`);
    console.log(`  tables spec:  ${outTables}`);
    console.log(`  column map:   ${outMap}`);
    if (result.decisions.length) {
      console.log(`  decisions (${result.decisions.length}) — review these simplifications:`);
      for (const d of result.decisions) console.log(`    - ${d.title}`);
    }
    console.log(`Next: provision the tables — scripts/provision-tables.ps1 -EnvironmentUrl <env> -Solution <sol> -SpecFile "${outTables}"`);
    return;
  }

  if (command === "knowledge-plan") {
    const schemaPath = path.resolve(valueOf(args, "--schema"));
    const schema = (await readJsonFile(schemaPath)) as unknown as DocSchema | null;
    if (!schema || !Array.isArray(schema.libraries)) {
      throw new Error(`No SharePoint docs schema at ${schemaPath}. Produce it with scripts/read-sharepoint-docs.ps1.`);
    }
    const recommendRaw = optionalValueOf(args, "--recommend");
    if (recommendRaw && recommendRaw !== "upload" && recommendRaw !== "sharepoint") {
      throw new Error("--recommend must be 'upload' or 'sharepoint'.");
    }
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    const pilot = optionalValueOf(args, "--pilot") ?? (workspace ? path.basename(workspace) : undefined);
    const plan = planKnowledge(schema, recommendRaw ? { recommend: recommendRaw as "upload" | "sharepoint" } : {});
    const outPlan = optionalValueOf(args, "--out")
      ? path.resolve(valueOf(args, "--out"))
      : workspace
        ? path.join(workspace, "generated", "target-state", "knowledge-plan.json")
        : path.resolve("knowledge-plan.json");
    await mkdir(path.dirname(outPlan), { recursive: true });
    await writeFile(outPlan, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const outGuide = workspace ? path.join(workspace, "KNOWLEDGE.md") : path.resolve("KNOWLEDGE.md");
    await writeFile(outGuide, renderKnowledgeGuide(plan, { pilotName: pilot, siteUrl: schema.site }), "utf8");
    console.log(`Planned knowledge from ${plan.libraries.length} library(ies) -> ${plan.summary.groundable} groundable file(s), ${plan.summary.skipped} skipped.`);
    console.log(`  plan:   ${outPlan}`);
    console.log(`  guide:  ${outGuide}`);
    if (plan.decisions.length) {
      console.log(`  decisions (${plan.decisions.length}):`);
      for (const d of plan.decisions) console.log(`    - ${d.title}`);
    }
    console.log(`Next: SANITIZE then ground — recommended mode: ${plan.grounding.recommended}. See KNOWLEDGE.md.`);
    return;
  }

  if (command === "demo-knowledge") {
    const source = path.resolve(valueOf(args, "--source"));
    let files: LocalFile[];
    try {
      files = await listFilesRecursive(source);
    } catch {
      throw new Error(`Source folder not found: ${source}. Point --source at a folder of publishable (synthetic/sanitized) knowledge files.`);
    }
    if (!files.length) throw new Error(`No files in ${source}.`);
    // Safety gate: never plan a publish of un-sanitized content.
    const findings = await scanPath(source);
    if (findings.length > 0) {
      for (const f of findings) console.error(`${f.file}:${f.line} [${f.rule}] ${f.excerpt}`);
      console.error(`\nRefusing: ${findings.length} sensitive finding(s) in ${source}. Redact or replace, then retry.`);
      process.exitCode = 2;
      return;
    }
    const site = optionalValueOf(args, "--site");
    const library = optionalValueOf(args, "--library") ?? DEFAULT_DEMO_LIBRARY;
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    const pilot = optionalValueOf(args, "--pilot") ?? (workspace ? path.basename(workspace) : undefined);
    const plan = planDemoUpload(files, { library, ...(site ? { siteUrl: site } : {}) });
    const outPlan = optionalValueOf(args, "--out")
      ? path.resolve(valueOf(args, "--out"))
      : workspace
        ? path.join(workspace, "generated", "target-state", "demo-knowledge-plan.json")
        : path.resolve("demo-knowledge-plan.json");
    await mkdir(path.dirname(outPlan), { recursive: true });
    await writeFile(outPlan, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const outGuide = workspace ? path.join(workspace, "DEMO_KNOWLEDGE.md") : path.resolve("DEMO_KNOWLEDGE.md");
    await writeFile(outGuide, renderDemoKnowledgeGuide(plan, { pilotName: pilot, sourceDir: source }), "utf8");
    console.log(`Demo knowledge: ${plan.upload.length} file(s) to upload, ${plan.excluded.length} excluded (scan clean).`);
    console.log(`  plan:   ${outPlan}`);
    console.log(`  guide:  ${outGuide}`);
    const siteArg = site ? ` -SiteUrl ${site}` : "";
    console.log(`Next: ./scripts/publish-demo-knowledge.ps1${siteArg} -LibraryName "${library}" -SourceDir "${source}"`);
    return;
  }

  if (command === "start") {
    const name = valueOf(args, "--name");
    const output = valueOf(args, "--output");
    const zipIndex = args.indexOf("--zip");
    const repoIndex = args.indexOf("--repo");
    const inboxIndex = args.indexOf("--inbox");
    const selected = [zipIndex, repoIndex, inboxIndex].filter((index) => index >= 0);
    if (selected.length !== 1) {
      throw new Error("Choose exactly one source: --zip, --repo, or --inbox.");
    }

    if (zipIndex >= 0) {
      await startFromZip({ name, zip: valueOf(args, "--zip"), output });
    } else if (repoIndex >= 0) {
      const revisionIndex = args.indexOf("--revision");
      const revision = revisionIndex >= 0 ? valueOf(args, "--revision") : "main";
      await startFromRepository({
        name,
        repository: valueOf(args, "--repo"),
        revision,
        output
      });
    } else {
      const inbox = path.resolve(valueOf(args, "--inbox"));
      const zipFiles = (await readdir(inbox))
        .filter((entry) => entry.toLowerCase().endsWith(".zip"))
        .sort();
      if (zipFiles.length !== 1) {
        throw new Error(`Inbox must contain exactly one .zip file; found ${zipFiles.length}.`);
      }
      await startFromZip({ name, zip: path.join(inbox, zipFiles[0]!), output });
    }
    console.log(`Kickoff complete. Open ${path.resolve(output, "KICKOFF.md")} in Copilot.`);
    return;
  }

  if (command === "manual-guide") {    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    if (!workspace) {
      throw new Error("No workspace found. Pass --workspace <directory>.");
    }
    const intake = (await readJsonFile(path.join(workspace, "intake.json"))) as IntakePayload | null;
    if (!intake || !intake.pilotName) {
      throw new Error(`No intake.json in ${workspace}. The manual-steps guide needs the intake brief.`);
    }
    const model = await readJsonFile(path.join(workspace, "solution-model.json"));
    const recorded = (model?.manualSteps as RecordedManualStep[] | undefined) ?? [];
    const guide = renderManualGuide(intake.pilotName, intake, recorded);
    const outFile = optionalValueOf(args, "--out")
      ? path.resolve(valueOf(args, "--out"))
      : path.join(workspace, "MANUAL_STEPS.md");
    await writeFile(outFile, guide, "utf8");
    console.log(`Manual-steps guide written to ${outFile}`);
    return;
  }

  if (command === "agent-guide") {
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    if (!workspace) {
      throw new Error("No workspace found. Pass --workspace <directory>.");
    }
    const intake = (await readJsonFile(path.join(workspace, "intake.json"))) as IntakePayload | null;
    if (!intake || !intake.pilotName) {
      throw new Error(`No intake.json in ${workspace}. The agent guide needs the intake brief.`);
    }
    const outFile = optionalValueOf(args, "--out")
      ? path.resolve(valueOf(args, "--out"))
      : path.join(workspace, "AGENT_BUILD.md");
    const groundingTables = optionalValueOf(args, "--tables")
      ? valueOf(args, "--tables").split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const agentOptions = {
      ...(groundingTables ? { groundingTables } : {}),
      ...(args.includes("--built") ? { built: true } : {}),
      ...(optionalValueOf(args, "--prefix") ? { prefix: valueOf(args, "--prefix") } : {}),
      ...(optionalValueOf(args, "--solution") ? { solution: valueOf(args, "--solution") } : {})
    };
    await writeFile(outFile, renderAgentBuild(intake, agentOptions), "utf8");
    console.log(`Agent build guide written to ${outFile}`);
    return;
  }

  if (command === "package") {
    const workspace = optionalValueOf(args, "--workspace")
      ? path.resolve(valueOf(args, "--workspace"))
      : await findNewestWorkspace();
    if (!workspace) {
      throw new Error("No workspace found. Pass --workspace <directory>.");
    }
    const outArg = optionalValueOf(args, "--out");
    const report = await packagePublication(workspace, outArg ? { outDir: path.resolve(outArg) } : {});
    console.log(renderPackageReport(report));
    if (report.scanFindings.length > 0) {
      process.exitCode = 2;
    }
    return;
  }

  if (command === "validate") {
    const workspace = path.resolve(valueOf(args, "--workspace"));
    const result = await validateWorkspace(workspace);
    if (!result.valid) {
      console.error(result.errors.join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(`Workspace is valid: ${workspace}`);
    return;
  }

  if (command === "scan") {
    const target = path.resolve(valueOf(args, "--path"));
    const findings = await scanPath(target);
    if (findings.length > 0) {
      for (const finding of findings) {
        console.error(`${finding.file}:${finding.line} [${finding.rule}] ${finding.excerpt}`);
      }
      process.exitCode = 2;
      return;
    }
    console.log(`No sensitive publication patterns found: ${target}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
