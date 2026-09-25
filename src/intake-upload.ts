import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_SOLUTION_ZIP_BYTES = 100 * 1024 * 1024;

export interface StoredSolutionZip {
  zipPath: string;
  unpackedPath: string;
}

interface StoreSolutionZipOptions {
  pilotSlug: string;
  originalName: string;
  content: Buffer;
  inboxRoot?: string;
  unpack?: (zipPath: string, outputPath: string) => Promise<void>;
}

function toRelativePath(value: string): string {
  return path.relative(process.cwd(), value).replaceAll("\\", "/");
}

export function sanitizeZipFileName(originalName: string): string {
  const decoded = decodeURIComponent(originalName);
  const name = path.basename(decoded.replaceAll("\\", "/")).replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!name || !name.toLowerCase().endsWith(".zip")) {
    throw new Error("Choose a Power Platform solution .zip file.");
  }
  return name;
}

export function assertSolutionZip(content: Buffer): void {
  if (content.length === 0) {
    throw new Error("The selected ZIP file is empty.");
  }
  if (content.length > MAX_SOLUTION_ZIP_BYTES) {
    throw new Error(`The selected ZIP exceeds the ${MAX_SOLUTION_ZIP_BYTES / 1024 / 1024} MB upload limit.`);
  }
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b) {
    throw new Error("The selected file is not a valid ZIP archive.");
  }
}

function runPacUnpack(zipPath: string, outputPath: string, packageType: "Unmanaged" | "Managed"): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pac",
      ["solution", "unpack", "--zipfile", zipPath, "--folder", outputPath, "--packagetype", packageType],
      { shell: process.platform === "win32" }
    );
    let output = "";
    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(output.trim() || `PAC CLI exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

export async function unpackSolutionZip(zipPath: string, outputPath: string): Promise<void> {
  try {
    await runPacUnpack(zipPath, outputPath, "Unmanaged");
  } catch (unmanagedError) {
    await rm(outputPath, { recursive: true, force: true });
    try {
      await runPacUnpack(zipPath, outputPath, "Managed");
    } catch (managedError) {
      const unmanagedMessage = unmanagedError instanceof Error ? unmanagedError.message : String(unmanagedError);
      const managedMessage = managedError instanceof Error ? managedError.message : String(managedError);
      throw new Error(
        `PAC CLI could not unpack the solution ZIP as unmanaged or managed.\nUnmanaged: ${unmanagedMessage}\nManaged: ${managedMessage}`
      );
    }
  }
}

export async function storeSolutionZip(options: StoreSolutionZipOptions): Promise<StoredSolutionZip> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.pilotSlug)) {
    throw new Error("The solution name must produce a valid workspace name.");
  }
  assertSolutionZip(options.content);

  const inboxRoot = path.resolve(options.inboxRoot ?? "inbox");
  const uploadRoot = path.resolve(inboxRoot, options.pilotSlug);
  if (!uploadRoot.startsWith(`${inboxRoot}${path.sep}`)) {
    throw new Error("The upload destination is outside the inbox.");
  }

  const fileName = sanitizeZipFileName(options.originalName);
  const zipPath = path.join(uploadRoot, fileName);
  const unpackedPath = path.join(uploadRoot, "unpacked");
  await mkdir(uploadRoot, { recursive: true });
  await rm(unpackedPath, { recursive: true, force: true });
  await writeFile(zipPath, options.content);

  try {
    await (options.unpack ?? unpackSolutionZip)(zipPath, unpackedPath);
  } catch (error) {
    await rm(zipPath, { force: true });
    await rm(unpackedPath, { recursive: true, force: true });
    throw error;
  }

  return {
    zipPath: toRelativePath(zipPath),
    unpackedPath: toRelativePath(unpackedPath)
  };
}
