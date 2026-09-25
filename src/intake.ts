import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { type IntakePayload, kickoff } from "./intake-kickoff.js";
import type { InitOptions } from "./types.js";
import { validateWorkspace } from "./validation.js";
import { initializeWorkspace } from "./workspace.js";

interface ZipStartOptions {
  name: string;
  zip: string;
  output: string;
}

interface RepositoryStartOptions {
  name: string;
  repository: string;
  revision: string;
  output: string;
}

async function assertFreshWorkspace(output: string): Promise<void> {
  const allowed = new Set(["intake.json", "KICKOFF.md"]);
  try {
    const entries = (await readdir(output)).filter((entry) => !allowed.has(entry));
    if (entries.length > 0) {
      throw new Error(`Output workspace is not empty: ${output}`);
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

function runAndCapture(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}: ${stderr.trim()}`));
      }
    });
  });
}

async function sha256(file: string): Promise<string> {
  const content = await readFile(file);
  return createHash("sha256").update(content).digest("hex");
}

async function writeKickoffBrief(output: string, sourceSummary: string): Promise<void> {
  const intakePath = path.join(output, "intake.json");
  try {
    const intake = JSON.parse(await readFile(intakePath, "utf8")) as IntakePayload;
    if (typeof intake.pilotName === "string" && typeof intake.entryMode === "string") {
      const slug = path.basename(output);
      await writeFile(path.join(output, "KICKOFF.md"), kickoff(slug, intake, { ingested: true }), "utf8");
      return;
    }
  } catch {
    // No wizard intake.json (pure CLI use) — fall back to the standalone brief below.
  }

  const brief = `# Kickoff Brief

## Source

${sourceSummary}

## Current gate

Intake initialized. No environment mutation has been authorized.

## Next actions for Copilot

1. Load the \`reimagine-power-platform\` skill.
2. Validate \`solution-model.json\`.
3. Inspect the ingested source without reading or persisting source business rows.
4. Determine available workload specialists.
5. Produce the discovery plan and request only the access needed for unsupported dependencies.
6. Stop at the discovery gate for coverage and unknowns review.
`;
  await writeFile(path.join(output, "KICKOFF.md"), brief, "utf8");
}

export async function startFromZip(options: ZipStartOptions): Promise<void> {
  const zip = path.resolve(options.zip);
  const output = path.resolve(options.output);
  await assertFreshWorkspace(output);
  const sourceDirectory = path.join(output, "evidence", "source");
  await mkdir(sourceDirectory, { recursive: true });
  const destination = path.join(sourceDirectory, path.basename(zip));
  await copyFile(zip, destination);
  const digest = await sha256(destination);
  const initOptions: InitOptions = {
    name: options.name,
    source: "solution-zip",
    output,
    zipPath: path.relative(output, destination).replaceAll("\\", "/"),
    sha256: digest
  };
  await initializeWorkspace(initOptions);
  await writeKickoffBrief(output, `Solution ZIP: \`${path.basename(destination)}\`\n\nSHA-256: \`${digest}\``);
  const validation = await validateWorkspace(output);
  if (!validation.valid) {
    throw new Error(`Initialized workspace failed validation:\n${validation.errors.join("\n")}`);
  }
}

export async function startFromRepository(options: RepositoryStartOptions): Promise<void> {
  const output = path.resolve(options.output);
  await assertFreshWorkspace(output);
  const destination = path.join(output, "evidence", "source-repository");
  await mkdir(path.dirname(destination), { recursive: true });
  await run(
    "git",
    ["clone", "--filter=blob:none", "--branch", options.revision, "--single-branch", options.repository, destination],
    process.cwd()
  );
  const resolvedRevision = await runAndCapture("git", ["rev-parse", "HEAD"], destination);
  const initOptions: InitOptions = {
    name: options.name,
    source: "repository",
    output,
    repository: options.repository,
    revision: resolvedRevision
  };
  await initializeWorkspace(initOptions);
  await writeKickoffBrief(
    output,
    `Repository: \`${options.repository}\`\n\nRequested revision: \`${options.revision}\`\n\nResolved commit: \`${resolvedRevision}\``
  );
  const validation = await validateWorkspace(output);
  if (!validation.valid) {
    throw new Error(`Initialized workspace failed validation:\n${validation.errors.join("\n")}`);
  }
}
