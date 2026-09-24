import type { ContractModel } from "../schemas/contract.schema.js";
import type { TopologyConfig } from "../schemas/topology.schema.js";
import type {
  TopologyAnalysisResult,
  DeploymentDecision,
} from "../types/topology.js";
import {
  buildPartySynchronizerMap,
  inferExecutionSynchronizers,
  validateTopology,
} from "./topology-resolver.js";
import { validateStakeholderHosting } from "./validators/stakeholder-hosting.js";

export function runTopologyPipeline(
  model: ContractModel,
  topology: TopologyConfig,
): TopologyAnalysisResult {
  const warnings = validateTopology(topology, model);
  const isSingleSynchronizer = topology.synchronizers.length < 2;

  if (isSingleSynchronizer) {
    return {
      deployment_decision: "PASS",
      findings: [],
      summary:
        "Single-synchronizer topology — no multi-synchronizer risks detected",
      synchronizerCount: topology.synchronizers.length,
      templateCount: model.templates.length,
      checksRun: 0,
    };
  }

  const partySynchronizerMap = buildPartySynchronizerMap(topology);
  const templateSynchronizers = inferExecutionSynchronizers(model, partySynchronizerMap);
  const stakeholderFindings = validateStakeholderHosting(
    model,
    partySynchronizerMap,
    templateSynchronizers,
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
    summary = `All checks passed across ${topology.synchronizers.length} synchronizers and ${model.templates.length} templates`;
  }

  if (warnings.length > 0) {
    summary += ` (${warnings.length} topology warning(s))`;
  }

  return {
    deployment_decision,
    findings: allFindings,
    summary,
    synchronizerCount: topology.synchronizers.length,
    templateCount: model.templates.length,
    checksRun: allFindings.length > 0 ? allFindings.length : model.templates.length,
  };
}
