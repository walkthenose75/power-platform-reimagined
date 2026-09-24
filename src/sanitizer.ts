import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ScanFinding } from "./types.js";

const textExtensions = new Set([
  ".csv",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".html",
  ".css"
]);

const rules: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "Dataverse environment URL",
    pattern: /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.crm(?:\d+)?\.dynamics\.com/gi
  },
  {
    name: "Microsoft tenant identifier",
    pattern: /\btenant(?:Id)?["'\s:=]+[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  },
  {
    name: "Tenant-scoped Microsoft login URL",
    pattern: /https:\/\/login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  },
  {
    name: "Secret assignment",
    pattern: /\b(?:client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|password)\b\s*[:=]\s*["']?[^\s"',}]{8,}/gi
  },
  {
    name: "Bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g
  },
  {
    name: "Connection string",
    pattern: /\b(?:AccountKey|SharedAccessKey|DefaultEndpointsProtocol|Server|Data Source)\s*=/gi
  }
];

async function collectFiles(target: string): Promise<string[]> {
  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(target, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(resolved);
      }
      return textExtensions.has(path.extname(entry.name).toLowerCase()) ? [resolved] : [];
    })
  );
  return nested.flat();
}

function redactExcerpt(value: string): string {
  if (value.length <= 12) {
    return "[REDACTED]";
  }
  return `${value.slice(0, 4)}...[REDACTED]`;
}

export async function scanPath(target: string): Promise<ScanFinding[]> {
  const files = await collectFiles(target);
  const findings: ScanFinding[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        const matches = line.match(rule.pattern) ?? [];
        for (const match of matches) {
          findings.push({
            file,
            line: index + 1,
            rule: rule.name,
            excerpt: redactExcerpt(match)
          });
        }
      }
    });
  }

  return findings;
}
