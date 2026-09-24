import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runPreflight } from "./preflight.js";
import { validateObject } from "./validation.js";

const PORT = Number(process.env.INTAKE_PORT ?? 5170);
const publicDir = path.resolve("public");
const workspacesDir = path.resolve("workspaces");

interface IntakePayload {
  pilotName: string;
  entryMode: "new-concept" | "repository" | "solution-zip" | "tenant";
  source?: {
    repository?: string;
    revision?: string;
    zipPath?: string;
    environmentUrl?: string;
    solutionName?: string;
  };
}

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

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function nextCommand(slug: string, intake: IntakePayload): string | null {
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

function kickoff(slug: string, intake: IntakePayload): string {
  const cmd = nextCommand(slug, intake);
  const ingest =
    intake.entryMode === "new-concept"
      ? "This is a **new concept** (greenfield). Skip source discovery. Use `intake.json` (concept + target) to design the modern solution directly, then build it in a named unmanaged solution."
      : `Ingest the source into this workspace, then continue:\n\n\`\`\`powershell\n${cmd}\n\`\`\``;

  return `# Kickoff Brief — ${intake.pilotName}

## Intake

Captured by the guided intake wizard. See \`intake.json\` in this folder for the full brief.

- Entry mode: **${intake.entryMode}**

## Current gate

Intake complete. No environment mutation has been authorized.

## Next actions for Copilot

1. Load the \`reimagine-power-platform\` skill.
2. Read \`intake.json\` — it holds source, target, features, synthetic-data, and publish details.
3. ${ingest}
4. Follow the phased process in \`docs/REIMAGINE_PROCESS.md\`, stopping at each approval gate.
`;
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
  await writeFile(path.join(output, "intake.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(path.join(output, "KICKOFF.md"), kickoff(slug, intake), "utf8");

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
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(resolved)] ?? "application/octet-stream" });
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
