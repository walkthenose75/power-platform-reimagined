import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import type { ValidationResult } from "./types.js";

const schemaDirectory = path.resolve("schemas");
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

function formatError(instancePath: string, message: string | undefined): string {
  return `${instancePath || "/"} ${message ?? "is invalid"}`;
}

interface ModelRecord {
  id: string;
}

interface SolutionModel {
  assessment: ModelRecord;
  components: ModelRecord[];
  dependencies: Array<ModelRecord & {
    fromComponentId: string;
    toComponentId: string;
    evidenceIds: string[];
  }>;
  evidence: ModelRecord[];
  claims: Array<ModelRecord & { subjectId: string; evidenceIds: string[] }>;
  unknowns: Array<ModelRecord & { componentIds?: string[] }>;
  featureOpportunities: Array<ModelRecord & { evidenceIds: string[]; dependencies?: string[] }>;
  decisions: Array<ModelRecord & { evidenceIds: string[] }>;
}

function duplicateIds(records: ModelRecord[], collection: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      duplicates.add(record.id);
    }
    seen.add(record.id);
  }
  return [...duplicates].map((id) => `/${collection} contains duplicate id '${id}'`);
}

function missingReferences(
  ids: string[],
  validIds: Set<string>,
  instancePath: string,
  kind: string
): string[] {
  return ids
    .filter((id) => !validIds.has(id))
    .map((id) => `${instancePath} references missing ${kind} '${id}'`);
}

function validateModelIntegrity(model: SolutionModel): string[] {
  const collections: Array<[string, ModelRecord[]]> = [
    ["components", model.components],
    ["dependencies", model.dependencies],
    ["evidence", model.evidence],
    ["claims", model.claims],
    ["unknowns", model.unknowns],
    ["featureOpportunities", model.featureOpportunities],
    ["decisions", model.decisions]
  ];
  const errors = collections.flatMap(([name, records]) => duplicateIds(records, name));
  const componentIds = new Set(model.components.map(({ id }) => id));
  const evidenceIds = new Set(model.evidence.map(({ id }) => id));
  const subjectIds = new Set([model.assessment.id, ...componentIds]);
  const featureIds = new Set(model.featureOpportunities.map(({ id }) => id));

  model.dependencies.forEach((dependency, index) => {
    errors.push(
      ...missingReferences(
        [dependency.fromComponentId, dependency.toComponentId],
        componentIds,
        `/dependencies/${index}`,
        "component"
      ),
      ...missingReferences(dependency.evidenceIds, evidenceIds, `/dependencies/${index}/evidenceIds`, "evidence")
    );
  });
  model.claims.forEach((claim, index) => {
    errors.push(
      ...missingReferences([claim.subjectId], subjectIds, `/claims/${index}/subjectId`, "subject"),
      ...missingReferences(claim.evidenceIds, evidenceIds, `/claims/${index}/evidenceIds`, "evidence")
    );
  });
  model.unknowns.forEach((unknown, index) => {
    errors.push(
      ...missingReferences(unknown.componentIds ?? [], componentIds, `/unknowns/${index}/componentIds`, "component")
    );
  });
  model.featureOpportunities.forEach((feature, index) => {
    errors.push(
      ...missingReferences(feature.evidenceIds, evidenceIds, `/featureOpportunities/${index}/evidenceIds`, "evidence"),
      ...missingReferences(feature.dependencies ?? [], featureIds, `/featureOpportunities/${index}/dependencies`, "feature")
    );
  });
  model.decisions.forEach((decision, index) => {
    errors.push(
      ...missingReferences(decision.evidenceIds, evidenceIds, `/decisions/${index}/evidenceIds`, "evidence")
    );
  });

  return errors;
}

export async function validateObject(document: unknown, schemaFile: string): Promise<ValidationResult> {
  const schemaText = await readFile(path.join(schemaDirectory, schemaFile), "utf8");
  const schema: object = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(document);

  return {
    valid,
    errors: (validate.errors ?? []).map((error: ErrorObject) =>
      formatError(error.instancePath, error.message)
    )
  };
}

export async function validateJsonFile(file: string, schemaFile: string): Promise<ValidationResult> {
  const [documentText, schemaText] = await Promise.all([
    readFile(file, "utf8"),
    readFile(path.join(schemaDirectory, schemaFile), "utf8")
  ]);
  const document: unknown = JSON.parse(documentText);
  const schema: object = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(document);

  return {
    valid,
    errors: (validate.errors ?? []).map((error: ErrorObject) =>
      formatError(error.instancePath, error.message)
    )
  };
}

export async function validateWorkspace(workspace: string): Promise<ValidationResult> {
  const modelPath = path.join(workspace, "solution-model.json");
  const modelResult = await validateJsonFile(
    modelPath,
    "solution-model.schema.json"
  );
  if (!modelResult.valid) {
    return modelResult;
  }
  const model = JSON.parse(await readFile(modelPath, "utf8")) as SolutionModel;
  const integrityErrors = validateModelIntegrity(model);
  return {
    valid: integrityErrors.length === 0,
    errors: integrityErrors
  };
}
