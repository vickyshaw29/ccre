import type { ContractModel, ContractTemplate } from "../schemas/contract.schema.js";
import type { WorkflowIntent } from "../schemas/intent.schema.js";
import type { ResolvedStep } from "../types.js";
import { EXIT_CODES } from "../types.js";
import { CcreError } from "./parser.js";

function collectKnownParties(model: ContractModel): Set<string> {
  const parties = new Set<string>();
  for (const template of model.templates) {
    for (const s of template.signatories) parties.add(s);
    for (const o of template.observers) parties.add(o);
    for (const choice of template.choices) {
      for (const c of choice.controllers) parties.add(c);
    }
  }
  return parties;
}

export function resolveSteps(
  model: ContractModel,
  intent: WorkflowIntent,
): ResolvedStep[] {
  const templateMap = new Map<string, ContractTemplate>();
  for (const t of model.templates) {
    templateMap.set(t.name, t);
  }

  const knownParties = collectKnownParties(model);

  const resolved: ResolvedStep[] = [];

  for (let i = 0; i < intent.steps.length; i++) {
    const step = intent.steps[i];
    const stepNum = i + 1;

    const templateName = intent.bindings[step.role];
    if (!templateName) {
      throw new CcreError(
        EXIT_CODES.BINDING_ERROR,
        `step-${stepNum}: role "${step.role}" has no binding. Available bindings: [${Object.keys(intent.bindings).join(", ")}]`,
      );
    }

    const template = templateMap.get(templateName);
    if (!template) {
      throw new CcreError(
        EXIT_CODES.BINDING_ERROR,
        `step-${stepNum}: binding "${step.role}" resolves to template "${templateName}", which does not exist in the contract model. Available templates: [${[...templateMap.keys()].join(", ")}]`,
      );
    }

    const choice = template.choices.find((c) => c.name === step.action);
    if (!choice) {
      throw new CcreError(
        EXIT_CODES.SCHEMA_ERROR,
        `step-${stepNum}: action "${step.action}" does not match any choice on template "${templateName}". Available choices: [${template.choices.map((c) => c.name).join(", ")}]`,
      );
    }

    if (!knownParties.has(step.by)) {
      throw new CcreError(
        EXIT_CODES.ACTOR_ERROR,
        `step-${stepNum}: actor "${step.by}" is not a known party within the contract model (appearing in at least one template as signatory, observer, or controller). Known parties: [${[...knownParties].join(", ")}]`,
      );
    }

    resolved.push({
      index: stepNum,
      action: step.action,
      role: step.role,
      actor: step.by,
      templateName: template.name,
      choiceName: choice.name,
    });
  }

  return resolved;
}
