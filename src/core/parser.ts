import { readFileSync } from "node:fs";
import { ContractModelSchema, type ContractModel } from "../schemas/contract.schema.js";
import { WorkflowIntentSchema, type WorkflowIntent } from "../schemas/intent.schema.js";
import { TopologyConfigSchema, type TopologyConfig } from "../schemas/topology.schema.js";
import { EXIT_CODES } from "../types.js";

export class CcreError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "CcreError";
  }
}

function readJsonFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    throw new CcreError(EXIT_CODES.INPUT_ERROR, `File not found: ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new CcreError(EXIT_CODES.INPUT_ERROR, `Invalid JSON in file: ${path}`);
  }
}

function validateControllerInvariant(model: ContractModel): void {
  const errors: string[] = [];

  for (const template of model.templates) {
    const stakeholders = new Set([...template.signatories, ...template.observers]);
    for (const choice of template.choices) {
      for (const controller of choice.controllers) {
        if (!stakeholders.has(controller)) {
          errors.push(
            `Template "${template.name}", choice "${choice.name}": controller "${controller}" is not a signatory or observer. In Daml, controllers must be stakeholders.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new CcreError(
      EXIT_CODES.INPUT_ERROR,
      `Invalid contract model — controller ⊆ stakeholders invariant violated:\n${errors.join("\n")}`,
    );
  }
}

export function parseContractModel(path: string): ContractModel {
  const data = readJsonFile(path);
  const result = ContractModelSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new CcreError(EXIT_CODES.INPUT_ERROR, `Contract schema validation failed:\n${issues}`);
  }

  validateControllerInvariant(result.data);

  const frozen = Object.freeze({
    ...result.data,
    templates: result.data.templates.map((t) =>
      Object.freeze({
        ...t,
        signatories: Object.freeze([...t.signatories]),
        observers: Object.freeze([...t.observers]),
        choices: Object.freeze(
          t.choices.map((c) =>
            Object.freeze({
              ...c,
              controllers: Object.freeze([...c.controllers]),
            }),
          ),
        ),
      }),
    ),
  });

  return frozen as ContractModel;
}

export function parseWorkflowIntent(path: string): WorkflowIntent {
  const data = readJsonFile(path);
  const result = WorkflowIntentSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new CcreError(EXIT_CODES.INPUT_ERROR, `Intent schema validation failed:\n${issues}`);
  }

  return result.data;
}

export function parseTopologyConfig(path: string): TopologyConfig {
  const data = readJsonFile(path);
  const result = TopologyConfigSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new CcreError(EXIT_CODES.INPUT_ERROR, `Topology config validation failed:\n${issues}`);
  }

  return result.data;
}

export function getRawFileContent(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    throw new CcreError(EXIT_CODES.INPUT_ERROR, `File not found: ${path}`);
  }
}
