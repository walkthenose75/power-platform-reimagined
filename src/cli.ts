import { readdir } from "node:fs/promises";
import path from "node:path";
import { startFromRepository, startFromZip } from "./intake.js";
import { scanPath } from "./sanitizer.js";
import type { InitOptions, SourceType } from "./types.js";
import { validateWorkspace } from "./validation.js";
import { initializeWorkspace } from "./workspace.js";

function valueOf(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${flag} value.`);
  }
  return value;
}

function printUsage(): void {
  console.log(`Usage:
  reimagine start --name <name> --zip <solution.zip> --output <directory>
  reimagine start --name <name> --repo <url> [--revision <branch-or-tag>] --output <directory>
  reimagine start --name <name> --inbox <directory> --output <directory>
  reimagine init --name <name> --source <tenant|repository> --output <directory>
  reimagine validate --workspace <directory>
  reimagine scan --path <directory>`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "init") {
    const source = valueOf(args, "--source");
    if (source !== "tenant" && source !== "repository") {
      throw new Error("--source must be tenant or repository.");
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
