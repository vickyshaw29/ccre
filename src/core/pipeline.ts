import type { ContractModel } from "../schemas/contract.schema.js";
import type { WorkflowIntent } from "../schemas/intent.schema.js";
import type { ValidationResult, Verdict } from "../types.js";
import { resolveSteps } from "./resolver.js";
import { buildExecutionChain } from "./chain.js";
import { validateVisibility } from "./validators/visibility.js";
import { validateAuthorization } from "./validators/authorization.js";

function collectUniqueParties(model: ContractModel): Set<string> {
  const parties = new Set<string>();
  for (const t of model.templates) {
    for (const s of t.signatories) parties.add(s);
    for (const o of t.observers) parties.add(o);
    for (const c of t.choices) {
      for (const ctrl of c.controllers) parties.add(ctrl);
    }
  }
  return parties;
}

export function runPipeline(
  model: ContractModel,
  intent: WorkflowIntent,
): ValidationResult {
  const resolvedSteps = resolveSteps(model, intent);
  const chain = buildExecutionChain(resolvedSteps, model);

  const visibilityViolations = validateVisibility(chain);
  const { violations: authViolations, unsupported } = validateAuthorization(chain);

  const allViolations = [...visibilityViolations, ...authViolations];
  const checksTotal = chain.length * 2;

  let verdict: Verdict;
  let summary: string;

  if (unsupported.length > 0) {
    verdict = "UNSUPPORTED";
    summary = `Multi-controller choice at step-${unsupported[0].stepId}`;
  } else if (allViolations.length > 0) {
    verdict = "UNSAFE";
    const first = allViolations[0];
    const label =
      first.dimension === "VISIBILITY"
        ? "Visibility violation"
        : "Authorization violation";
    summary = `${label} at step-${first.stepId}`;
  } else {
    verdict = "SAFE";
    summary = `All ${checksTotal} checks passed across ${chain.length} steps`;
  }

  const parties = collectUniqueParties(model);

  return {
    verdict,
    violations: allViolations,
    unsupported,
    executionChain: chain,
    summary,
    pattern: intent.pattern,
    stepCount: chain.length,
    templateCount: model.templates.length,
    partyCount: parties.size,
    checksTotal,
  };
}
