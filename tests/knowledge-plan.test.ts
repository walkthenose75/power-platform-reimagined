import assert from "node:assert/strict";
import test from "node:test";
import { planKnowledge, renderKnowledgeGuide, GROUNDABLE_EXTENSIONS, type DocSchema } from "../src/knowledge-plan.js";

const schema: DocSchema = {
  site: "https://contoso.sharepoint.com/sites/ops",
  libraries: [
    {
      name: "Policies",
      url: "https://contoso.sharepoint.com/sites/ops/Policies",
      files: [
        { name: "Onboarding Guide.pdf", path: "", size: 1_200_000, extension: "pdf" },
        { name: "SOP.docx", path: "Procedures", size: 45_000, extension: "docx" },
        { name: "Notes.txt", path: "", size: 900, extension: "txt" },
        { name: "logo.png", path: "", size: 20_000, extension: "png" },
        { name: "walkthrough.mp4", path: "", size: 8_000_000, extension: "mp4" },
        { name: "huge-archive.pdf", path: "", size: 600 * 1024 * 1024, extension: "pdf" }
      ]
    }
  ]
};

test("every groundable extension from the Learn list is accepted", () => {
  for (const ext of ["pdf", "docx", "pptx", "xlsx", "txt", "md", "html", "csv", "json", "yaml", "rtf"]) {
    assert.ok(GROUNDABLE_EXTENSIONS.has(ext), `${ext} should be groundable`);
  }
});

test("classifies files: supported types groundable, media/executables skipped", () => {
  const plan = planKnowledge(schema);
  const byName = new Map(plan.sources.map((s) => [s.name, s]));
  assert.equal(byName.get("Onboarding Guide.pdf")?.groundable, true);
  assert.equal(byName.get("SOP.docx")?.groundable, true);
  assert.equal(byName.get("Notes.txt")?.groundable, true);
  assert.equal(byName.get("logo.png")?.groundable, false);
  assert.equal(byName.get("walkthrough.mp4")?.groundable, false);
  assert.equal(plan.summary.groundable, 3);
  assert.equal(plan.summary.skipped, 3);
});

test("skips files over the 512 MB limit", () => {
  const plan = planKnowledge(schema);
  const huge = plan.sources.find((s) => s.name === "huge-archive.pdf");
  assert.equal(huge?.groundable, false);
  assert.match(huge?.note ?? "", /512 MB/);
  assert.ok(plan.decisions.some((d) => /over the 512 MB limit/.test(d.title)));
});

test("target upload names are sanitized, lowercase, and collision-free", () => {
  const dup: DocSchema = {
    libraries: [
      {
        name: "L",
        files: [
          { name: "Onboarding Guide.pdf", size: 1, extension: "pdf" },
          { name: "Onboarding  Guide.pdf", size: 1, extension: "pdf" }
        ]
      }
    ]
  };
  const plan = planKnowledge(dup);
  const names = plan.sources.map((s) => s.targetName);
  assert.equal(names[0], "onboarding-guide.pdf");
  assert.equal(names[1], "onboarding-guide-2.pdf");
});

test("always records a sanitize-before-publishing decision and rolls up skips", () => {
  const plan = planKnowledge(schema);
  assert.ok(plan.decisions.some((d) => /Sanitize before publishing/.test(d.title)));
  assert.ok(plan.decisions.some((d) => /unsupported as knowledge/.test(d.title)));
});

test("grounding: upload is the portable recommendation; both modes are offered", () => {
  const plan = planKnowledge(schema);
  assert.equal(plan.grounding.recommended, "upload");
  const upload = plan.grounding.options.find((o) => o.mode === "upload");
  const sp = plan.grounding.options.find((o) => o.mode === "sharepoint");
  assert.equal(upload?.portable, true);
  assert.equal(sp?.portable, false);
});

test("recommendation can be overridden to sharepoint", () => {
  const plan = planKnowledge(schema, { recommend: "sharepoint" });
  assert.equal(plan.grounding.recommended, "sharepoint");
});

test("guide lists groundable files, skips, and stars the recommended mode", () => {
  const plan = planKnowledge(schema);
  const md = renderKnowledgeGuide(plan, { pilotName: "Ops Assistant", siteUrl: schema.site });
  assert.match(md, /# Agent knowledge — Ops Assistant/);
  assert.match(md, /onboarding-guide\.pdf/);
  assert.match(md, /Skipped \(not groundable\)/);
  assert.match(md, /⭐ \*\*recommended\*\*/);
  // skipped media appears in the skip list
  assert.match(md, /logo\.png/);
});
