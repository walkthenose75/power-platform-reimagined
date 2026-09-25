import assert from "node:assert/strict";
import test from "node:test";
import type { IntakePayload } from "../src/intake-kickoff.js";
import { parseRepo, renderPublishTarget } from "../src/publish.js";

test("parseRepo extracts owner/name from https and git urls", () => {
  assert.deepEqual(parseRepo("https://github.com/walkthenose75/inventory-tracking"), { owner: "walkthenose75", name: "inventory-tracking" });
  assert.deepEqual(parseRepo("https://github.com/org/repo.git/"), { owner: "org", name: "repo" });
  assert.deepEqual(parseRepo("git@github.com:org/repo.git"), { owner: "org", name: "repo" });
  assert.deepEqual(parseRepo(undefined), {});
  assert.deepEqual(parseRepo("not a url"), {});
});

test("publish target uses the captured repo url and visibility", () => {
  const intake = {
    pilotName: "Inventory Tracking",
    entryMode: "solution-zip",
    publish: { githubRepoUrl: "https://github.com/walkthenose75/inventory-tracking", visibility: "private" }
  } as unknown as IntakePayload;
  const t = renderPublishTarget(intake);
  assert.equal(t.owner, "walkthenose75");
  assert.equal(t.name, "inventory-tracking");
  assert.equal(t.visibility, "private");
  assert.match(t.command ?? "", /gh repo create walkthenose75\/inventory-tracking --private --source \. --push/);
  assert.equal(t.warnings.length, 0);
});

test("publish target warns and has no command when no repo url", () => {
  const intake = { pilotName: "X", entryMode: "new-concept" } as unknown as IntakePayload;
  const t = renderPublishTarget(intake);
  assert.equal(t.command, null);
  assert.equal(t.visibility, "public");
  assert.ok(t.warnings.some((w) => /visibility/i.test(w)));
});

test("publish target warns on an unparseable repo url", () => {
  const intake = { pilotName: "X", entryMode: "new-concept", publish: { githubRepoUrl: "https://example.com/not-github", visibility: "public" } } as unknown as IntakePayload;
  const t = renderPublishTarget(intake);
  assert.equal(t.command, null);
  assert.ok(t.warnings.some((w) => /Could not parse/i.test(w)));
});
