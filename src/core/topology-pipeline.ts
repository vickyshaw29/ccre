import type { ContractModel } from "../schemas/contract.schema.js";
import type { TopologyConfig } from "../schemas/topology.schema.js";
import type {
  TopologyAnalysisResult,
  DeploymentDecision,
} from "../types/topology.js";
import {
  buildPartyDomainMap,
  inferExecutionDomains,
  validateTopology,
} from "./topology-resolver.js";
import { validateStakeholderHosting } from "./validators/stakeholder-hosting.js";

export function runTopologyPipeline(
  model: ContractModel,
  topology: TopologyConfig,
): TopologyAnalysisResult {
  const warnings = validateTopology(topology, model);
  const isSingleDomain = topology.domains.length < 2;

  if (isSingleDomain) {
    return {
      deployment_decision: "PASS",
      findings: [],
      summary:
        "Single-domain topology — no multi-domain risks detected",
      domainCount: topology.domains.length,
      templateCount: model.templates.length,
      checksRun: 0,
    };
  }

  const partyDomainMap = buildPartyDomainMap(topology);
  const templateDomains = inferExecutionDomains(model, partyDomainMap);
  const stakeholderFindings = validateStakeholderHosting(
    model,
    partyDomainMap,
    templateDomains,
  );

  const allFindings = [...stakeholderFindings];

  let deployment_decision: DeploymentDecision = "PASS";
  let summary = "";

  const criticalCount = allFindings.filter(
    (f) => f.severity === "CRITICAL",
  ).length;
  const highCount = allFindings.filter(
    (f) => f.severity === "HIGH",
  ).length;

  if (criticalCount > 0) {
    deployment_decision = "BLOCKED";
    summary = `${criticalCount} CRITICAL finding(s) — deployment blocked`;
  } else if (highCount > 0) {
    deployment_decision = "WARNING";
    summary = `${highCount} HIGH finding(s) — review recommended`;
  } else {
    summary = `All checks passed across ${topology.domains.length} domains and ${model.templates.length} templates`;
  }

  if (warnings.length > 0) {
    summary += ` (${warnings.length} topology warning(s))`;
  }

  return {
    deployment_decision,
    findings: allFindings,
    summary,
    domainCount: topology.domains.length,
    templateCount: model.templates.length,
    checksRun: allFindings.length > 0 ? allFindings.length : model.templates.length,
  };
}
