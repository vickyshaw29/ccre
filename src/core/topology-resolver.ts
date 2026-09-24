import type { TopologyConfig } from "../schemas/topology.schema.js";
import type { ContractModel } from "../schemas/contract.schema.js";
import type { PartySynchronizerMap, TemplateSynchronizerMap } from "../types/topology.js";

export function buildPartySynchronizerMap(topology: TopologyConfig): PartySynchronizerMap {
  const map: PartySynchronizerMap = {};
  for (const participant of topology.participants) {
    for (const party of participant.parties) {
      if (!map[party]) {
        map[party] = new Set<string>();
      }
      for (const synchronizer of participant.synchronizers) {
        map[party].add(synchronizer);
      }
    }
  }
  return map;
}

export function inferExecutionSynchronizers(
  model: ContractModel,
  partySynchronizerMap: PartySynchronizerMap,
): TemplateSynchronizerMap {
  const templateSynchronizers: TemplateSynchronizerMap = {};

  for (const template of model.templates) {
    const synchronizers = new Set<string>();
    const allStakeholders = [...template.signatories, ...template.observers];

    for (const stakeholder of allStakeholders) {
      const partySynchronizers = partySynchronizerMap[stakeholder];
      if (partySynchronizers) {
        for (const d of partySynchronizers) {
          synchronizers.add(d);
        }
      }
    }

    templateSynchronizers[template.name] = synchronizers;
  }

  return templateSynchronizers;
}

export function validateTopology(
  topology: TopologyConfig,
  model: ContractModel,
): string[] {
  const warnings: string[] = [];
  const synchronizerIds = new Set(topology.synchronizers.map((d) => d.id));
  const topologyParties = new Set<string>();

  for (const participant of topology.participants) {
    for (const party of participant.parties) {
      topologyParties.add(party);
    }
    for (const synchronizer of participant.synchronizers) {
      if (!synchronizerIds.has(synchronizer)) {
        warnings.push(
          `Participant '${participant.id}' references non-existent synchronizer '${synchronizer}'`,
        );
      }
    }
  }

  for (const template of model.templates) {
    const allParties = [
      ...template.signatories,
      ...template.observers,
    ];
    for (const party of allParties) {
      if (!topologyParties.has(party)) {
        warnings.push(
          `Party '${party}' found in template '${template.name}' but not in topology — analysis may be incomplete`,
        );
      }
    }
  }

  if (synchronizerIds.size < 2) {
    warnings.push(
      "Single-synchronizer topology — no multi-synchronizer risks. CCRE checks skipped.",
    );
  }

  return warnings;
}
