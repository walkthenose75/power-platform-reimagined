import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_SOLUTION_ZIP_BYTES, storeSolutionZip } from "./intake-upload.js";
import { type IntakePayload, kickoff, nextCommand } from "./intake-kickoff.js";
import { runPreflight } from "./preflight.js";
import { validateObject } from "./validation.js";

const PORT = Number(process.env.INTAKE_PORT ?? 5170);
const publicDir = path.resolve("public");
const workspacesDir = path.resolve("workspaces");

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_SOLUTION_ZIP_BYTES) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new Error(`Payload exceeds the ${MAX_SOLUTION_ZIP_BYTES / 1024 / 1024} MB upload limit.`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function handleSubmit(res: ServerResponse, bodyText: string): Promise<void> {
  let intake: IntakePayload & Record<string, unknown>;
  try {
    intake = JSON.parse(bodyText);
  } catch {
    json(res, 400, { ok: false, errors: ["Body is not valid JSON."] });
    return;
  }

  const document = { schemaVersion: "1.0.0", ...intake };
  const result = await validateObject(document, "intake.schema.json");
  if (!result.valid) {
    json(res, 400, { ok: false, errors: result.errors });
    return;
  }

  const slug = slugify(intake.pilotName);
  const output = path.join(workspacesDir, slug);
  await mkdir(output, { recursive: true });
  // If this pilot is already ingested (a re-submit), keep KICKOFF in the "ingested" state so we
  // never tell the agent to re-ingest (which would then hit the "already ingested" guard).
  const alreadyIngested = await stat(path.join(output, "solution-model.json")).then(() => true).catch(() => false);
  await writeFile(path.join(output, "intake.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(path.join(output, "KICKOFF.md"), kickoff(slug, intake, { ingested: alreadyIngested }), "utf8");

  json(res, 200, {
    ok: true,
    workspace: `workspaces/${slug}`,
    nextCommand: nextCommand(slug, intake)
  });
}

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

async function serveStatic(res: ServerResponse, file: string): Promise<void> {
  try {
    const resolved = path.join(publicDir, file);
    if (!resolved.startsWith(publicDir)) {
      json(res, 403, { ok: false });
      return;
    }
    const content = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(resolved)] ?? "application/octet-stream",
      "Cache-Control": "no-store, must-revalidate"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/") {
      await serveStatic(res, "intake.html");
      return;
    }
    if (req.method === "GET" && url.pathname === "/preflight") {
      json(res, 200, { checks: await runPreflight() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/submit") {
      try {
        await handleSubmit(res, await readBody(req));
      } catch (error: unknown) {
        json(res, 500, { ok: false, errors: [error instanceof Error ? error.message : String(error)] });
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/upload-zip") {
      try {
        const pilotSlug = slugify(url.searchParams.get("pilotName") ?? "");
        const originalName = url.searchParams.get("fileName") ?? "";
        const stored = await storeSolutionZip({
          pilotSlug,
          originalName,
          content: await readBinaryBody(req)
        });
        json(res, 200, { ok: true, ...stored });
      } catch (error: unknown) {
        json(res, 400, { ok: false, errors: [error instanceof Error ? error.message : String(error)] });
      }
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      await serveStatic(res, url.pathname.replace("/assets/", ""));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  })();
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  Reimagine intake wizard running at ${url}\n`);
  if (process.platform === "win32") {
    try {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } catch {
      /* opening the browser is best-effort */
    }
  }
});
