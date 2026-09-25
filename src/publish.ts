import type { IntakePayload } from "./intake-kickoff.js";

export interface PublishTarget {
  githubRepoUrl?: string;
  owner?: string;
  name?: string;
  visibility: "public" | "private";
  /** The exact command to publish the bundle, or null when no repo URL was captured. */
  command: string | null;
  warnings: string[];
}

/** Parse an owner/name from a GitHub repo URL (https or git@), tolerant of trailing .git/slash. */
export function parseRepo(url: string | undefined): { owner?: string; name?: string } {
  if (!url) return {};
  const cleaned = url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const https = /github\.com[/:]([^/]+)\/([^/]+)$/i.exec(cleaned);
  if (https && https[1] && https[2]) return { owner: https[1], name: https[2] };
  return {};
}

/**
 * Derive the publish target from the intake brief. Uses the captured
 * `publish.githubRepoUrl` (owner/name) and `publish.visibility` so publication
 * honors exactly what the operator asked for.
 */
export function renderPublishTarget(intake: IntakePayload | null | undefined, outDirRelative = "."): PublishTarget {
  const publish = (intake as { publish?: { githubRepoUrl?: string; visibility?: string } } | null | undefined)?.publish ?? {};
  const { owner, name } = parseRepo(publish.githubRepoUrl);
  const visibility: "public" | "private" = publish.visibility === "private" ? "private" : "public";
  const warnings: string[] = [];
  if (publish.githubRepoUrl && (!owner || !name)) {
    warnings.push(`Could not parse owner/name from githubRepoUrl '${publish.githubRepoUrl}'.`);
  }
  if (!publish.visibility) {
    warnings.push("No repo visibility captured at intake; defaulting to public. Confirm before publishing.");
  }
  const command =
    owner && name
      ? `gh repo create ${owner}/${name} --${visibility} --source ${outDirRelative} --push`
      : null;
  return {
    ...(publish.githubRepoUrl ? { githubRepoUrl: publish.githubRepoUrl } : {}),
    ...(owner ? { owner } : {}),
    ...(name ? { name } : {}),
    visibility,
    command,
    warnings
  };
}
