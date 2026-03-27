import type { ExecutionNode, Violation } from "../../types.js";
import { getVisibilityFix } from "../fix-suggestions.js";

export function validateVisibility(chain: ExecutionNode[]): Violation[] {
  const violations: Violation[] = [];

  for (const node of chain) {
    const visible = new Set([
      ...node.template.signatories,
      ...node.template.observers,
    ]);

    if (!visible.has(node.actor)) {
      const { fix, why, safetyWarning } = getVisibilityFix(
        node.template.name,
        node.actor,
      );

      violations.push({
        dimension: "VISIBILITY",
        stepId: node.id,
        action: node.choice.name,
        templateName: node.template.name,
        actor: node.actor,
        reason: `${node.actor} is not a signatory or observer of ${node.template.name} (signatories: [${node.template.signatories.join(", ")}], observers: [${node.template.observers.join(", ")}])`,
        fix,
        why,
        safetyWarning,
      });
    }
  }

  return violations;
}
