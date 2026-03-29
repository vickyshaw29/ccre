export type Severity = "CRITICAL" | "HIGH" | "INFO";
export type DeploymentDecision = "BLOCKED" | "WARNING" | "PASS";

export interface TopologyFinding {
  check: string;
  severity: Severity;
  template: string;
  choice?: string;
  party?: string;
  domain?: string;
  referencedTemplate?: string;
  message: string;
  impact: string;
  deployment_decision: DeploymentDecision;
}

export interface TopologyAnalysisResult {
  deployment_decision: DeploymentDecision;
  findings: TopologyFinding[];
  summary: string;
  domainCount: number;
  templateCount: number;
  checksRun: number;
}

export interface PartyDomainMap {
  [party: string]: Set<string>;
}

export interface TemplateDomainMap {
  [templateName: string]: Set<string>;
}
