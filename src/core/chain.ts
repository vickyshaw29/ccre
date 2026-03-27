import type { ContractModel } from "../schemas/contract.schema.js";
import type { ResolvedStep, ExecutionNode } from "../types.js";

export function buildExecutionChain(
  resolvedSteps: ResolvedStep[],
  model: ContractModel,
): ExecutionNode[] {
  const templateMap = new Map(model.templates.map((t) => [t.name, t]));

  return resolvedSteps.map((step) => {
    const template = templateMap.get(step.templateName)!;
    const choice = template.choices.find((c) => c.name === step.choiceName)!;

    return {
      id: step.index,
      template,
      choice,
      actor: step.actor,
      requires: step.index > 1 ? [step.index - 1] : [],
    };
  });
}
