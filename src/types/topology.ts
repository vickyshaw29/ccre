export type Severity = "CRITICAL" | "HIGH" | "INFO";
export type DeploymentDecision = "BLOCKED" | "WARNING" | "PASS";

export interface TopologyFinding {
  check: string;
  severity: Severity;
  template: string;
  choice?: string;
  party?: string;
  synchronizer?: string;
  referencedTemplate?: string;
  message: string;
  impact: string;
  deployment_decision: DeploymentDecision;
}

export interface TopologyAnalysisResult {
  deployment_decision: DeploymentDecision;
  findings: TopologyFinding[];
  summary: string;
  synchronizerCount: number;
  templateCount: number;
  checksRun: number;
}

export interface PartySynchronizerMap {
  [party: string]: Set<string>;
}

export interface TemplateSynchronizerMap {
  [templateName: string]: Set<string>;
}
