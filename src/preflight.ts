import { spawn } from "node:child_process";

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

function tryRun(command: string, args: string[], timeoutMs = 8000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let out = "";
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve({ ok, out: out.trim() });
      }
    };
    let child;
    try {
      child = spawn(command, args, { shell: process.platform === "win32" });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      finish(code === 0);
    });
  });
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0] ?? "";
}

function nodeMeets22(version: string): boolean {
  const match = /v(\d+)\./.exec(version.trim());
  return match ? Number(match[1]) >= 22 : false;
}

export async function runPreflight(): Promise<PreflightCheck[]> {
  const [node, git, dotnet, pac, az, pacAuth, azAuth] = await Promise.all([
    tryRun("node", ["--version"]),
    tryRun("git", ["--version"]),
    tryRun("dotnet", ["--version"]),
    tryRun("pac", ["help"]),
    tryRun("az", ["version"]),
    tryRun("pac", ["auth", "list"]),
    tryRun("az", ["account", "show"])
  ]);

  return [
    {
      name: "Node.js 22+",
      ok: node.ok && nodeMeets22(node.out),
      detail: node.ok ? node.out.trim() : "not found — install from nodejs.org",
      required: true
    },
    {
      name: "Git",
      ok: git.ok,
      detail: git.ok ? firstLine(git.out) : "not found — install from git-scm.com",
      required: true
    },
    {
      name: ".NET SDK 8+",
      ok: dotnet.ok,
      detail: dotnet.ok ? firstLine(dotnet.out) : "not found — needed to install pac; dotnet.microsoft.com",
      required: false
    },
    {
      name: "Power Platform CLI (pac)",
      ok: pac.ok,
      detail: pac.ok ? "installed" : "not found — dotnet tool install --global Microsoft.PowerApps.CLI.Tool",
      required: true
    },
    {
      name: "Azure CLI (az)",
      ok: az.ok,
      detail: az.ok ? "installed" : "not found — needed for Dataverse table creation",
      required: true
    },
    {
      name: "pac auth profile",
      ok: pacAuth.ok && /https?:\/\//.test(pacAuth.out),
      detail: pacAuth.ok && /https?:\/\//.test(pacAuth.out) ? "profile present" : "run: pac auth create --environment <url>",
      required: false
    },
    {
      name: "az login",
      ok: azAuth.ok,
      detail: azAuth.ok ? "signed in" : "run: az login --tenant <target-tenant>",
      required: false
    }
  ];
}
