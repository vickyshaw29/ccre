import type { ExecutionNode, Violation, UnsupportedConstruct } from "../../types.js";
import { getAuthorizationFix } from "../fix-suggestions.js";

export function validateAuthorization(chain: ExecutionNode[]): {
  violations: Violation[];
  unsupported: UnsupportedConstruct[];
} {
  const violations: Violation[] = [];
  const unsupported: UnsupportedConstruct[] = [];

  for (const node of chain) {
    if (node.choice.controllers.length > 1) {
      unsupported.push({
        stepId: node.id,
        action: node.choice.name,
        templateName: node.template.name,
        reason: `Choice ${node.choice.name} on ${node.template.name} has ${node.choice.controllers.length} controllers: [${node.choice.controllers.join(", ")}]. Multi-controller authorization requires joint-authorization analysis (Phase 2).`,
      });
      continue;
    }

    const controller = node.choice.controllers[0];
    if (node.actor !== controller) {
      const { fix, why, safetyWarning } = getAuthorizationFix(
        node.template.name,
        node.actor,
        node.choice.name,
      );

      violations.push({
        dimension: "AUTHORIZATION",
        stepId: node.id,
        action: node.choice.name,
        templateName: node.template.name,
        actor: node.actor,
        reason: `${node.actor} is not a controller of ${node.choice.name} on ${node.template.name} (controllers: [${controller}])`,
        fix,
        why,
        safetyWarning,
      });
    }
  }

  return { violations, unsupported };
}
