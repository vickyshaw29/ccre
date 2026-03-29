import type { ContractModel } from "../../schemas/contract.schema.js";
import type { PartyDomainMap, TemplateDomainMap } from "../../types/topology.js";
import type { TopologyFinding } from "../../types/topology.js";

export function validateStakeholderHosting(
  model: ContractModel,
  partyDomainMap: PartyDomainMap,
  templateDomains: TemplateDomainMap,
): TopologyFinding[] {
  const findings: TopologyFinding[] = [];

  for (const template of model.templates) {
    const executionDomains = templateDomains[template.name];
    if (!executionDomains || executionDomains.size === 0) {
      continue;
    }

    const maintainer =
      template.signatories.length > 0 ? template.signatories[0] : null;

    if (maintainer) {
      const maintainerDomains = partyDomainMap[maintainer] || new Set();
      for (const domain of executionDomains) {
        if (!maintainerDomains.has(domain)) {
          findings.push({
            check: "CCRE-003",
            severity: "CRITICAL",
            template: template.name,
            party: maintainer,
            domain,
            message: `Key maintainer '${maintainer}' not hosted on '${domain}'`,
            impact:
              "Runtime failure — Canton protocol will reject key operations on this domain",
            deployment_decision: "BLOCKED",
          });
        }
      }
    }

    for (const signatory of template.signatories) {
      const sigDomains = partyDomainMap[signatory] || new Set();
      for (const domain of executionDomains) {
        if (!sigDomains.has(domain)) {
          const isMaintainer = signatory === maintainer;
          if (isMaintainer) continue;
          findings.push({
            check: "CCRE-003",
            severity: "CRITICAL",
            template: template.name,
            party: signatory,
            domain,
            message: `Signatory '${signatory}' not hosted on '${domain}'`,
            impact:
              "Runtime failure — Canton protocol requires all signatories for confirmation",
            deployment_decision: "BLOCKED",
          });
        }
      }
    }

    for (const observer of template.observers) {
      const obsDomains = partyDomainMap[observer] || new Set();
      for (const domain of executionDomains) {
        if (!obsDomains.has(domain)) {
          findings.push({
            check: "CCRE-003",
            severity: "CRITICAL",
            template: template.name,
            party: observer,
            domain,
            message: `Observer '${observer}' not hosted on '${domain}' — reassignment to this domain impossible`,
            impact:
              "Reassignment blocked — Canton requires all stakeholders on target domain",
            deployment_decision: "BLOCKED",
          });
        }
      }
    }
  }

  return findings;
}
