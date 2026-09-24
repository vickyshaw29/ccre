import type { ContractModel } from "../../schemas/contract.schema.js";
import type { PartySynchronizerMap, TemplateSynchronizerMap } from "../../types/topology.js";
import type { TopologyFinding } from "../../types/topology.js";

export function validateStakeholderHosting(
  model: ContractModel,
  partySynchronizerMap: PartySynchronizerMap,
  templateSynchronizers: TemplateSynchronizerMap,
): TopologyFinding[] {
  const findings: TopologyFinding[] = [];

  for (const template of model.templates) {
    const executionSynchronizers = templateSynchronizers[template.name];
    if (!executionSynchronizers || executionSynchronizers.size === 0) {
      continue;
    }

    // Every stakeholder must be hosted on a synchronizer for the contract to be
    // created on it or reassigned to it. A party listed as both signatory and
    // observer is reported once, as a signatory.
    const roles = new Map<string, "Signatory" | "Observer">();
    for (const signatory of template.signatories) roles.set(signatory, "Signatory");
    for (const observer of template.observers) {
      if (!roles.has(observer)) roles.set(observer, "Observer");
    }

    for (const [party, role] of roles) {
      const hostedOn = partySynchronizerMap[party] || new Set();
      for (const synchronizer of executionSynchronizers) {
        if (!hostedOn.has(synchronizer)) {
          findings.push({
            check: "CCRE-003",
            severity: "CRITICAL",
            template: template.name,
            party,
            synchronizer,
            message: `${role} '${party}' not hosted on '${synchronizer}'`,
            impact: `'${template.name}' cannot be created on or reassigned to '${synchronizer}' — Canton requires every stakeholder to be hosted there`,
            deployment_decision: "BLOCKED",
          });
        }
      }
    }
  }

  return findings;
}
