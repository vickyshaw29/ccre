import type { TopologyConfig } from "../schemas/topology.schema.js";
import type { ContractModel } from "../schemas/contract.schema.js";
import type { PartyDomainMap, TemplateDomainMap } from "../types/topology.js";

export function buildPartyDomainMap(topology: TopologyConfig): PartyDomainMap {
  const map: PartyDomainMap = {};
  for (const participant of topology.participants) {
    for (const party of participant.parties) {
      if (!map[party]) {
        map[party] = new Set<string>();
      }
      for (const domain of participant.domains) {
        map[party].add(domain);
      }
    }
  }
  return map;
}

export function inferExecutionDomains(
  model: ContractModel,
  partyDomainMap: PartyDomainMap,
): TemplateDomainMap {
  const templateDomains: TemplateDomainMap = {};

  for (const template of model.templates) {
    const domains = new Set<string>();
    const allStakeholders = [...template.signatories, ...template.observers];

    for (const stakeholder of allStakeholders) {
      const partyDomains = partyDomainMap[stakeholder];
      if (partyDomains) {
        for (const d of partyDomains) {
          domains.add(d);
        }
      }
    }

    templateDomains[template.name] = domains;
  }

  return templateDomains;
}

export function validateTopology(
  topology: TopologyConfig,
  model: ContractModel,
): string[] {
  const warnings: string[] = [];
  const domainIds = new Set(topology.domains.map((d) => d.id));
  const topologyParties = new Set<string>();

  for (const participant of topology.participants) {
    for (const party of participant.parties) {
      topologyParties.add(party);
    }
    for (const domain of participant.domains) {
      if (!domainIds.has(domain)) {
        warnings.push(
          `Participant '${participant.id}' references non-existent domain '${domain}'`,
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

  if (domainIds.size < 2) {
    warnings.push(
      "Single-domain topology — no multi-domain risks. CCRE checks skipped.",
    );
  }

  return warnings;
}
