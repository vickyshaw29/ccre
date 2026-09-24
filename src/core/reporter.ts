import type { ValidationResult, Certificate } from "../types.js";
import type { TopologyAnalysisResult } from "../types/topology.js";

import { VERSION } from "../version.js";
const HEADER = `CCRE v${VERSION} — Pre-execution safety check for multi-app Canton workflows`;

function formatViolation(v: {
  dimension: string;
  stepId: number;
  action: string;
  templateName: string;
  actor: string;
  reason: string;
  fix: string;
  why: string;
  safetyWarning: string;
}): string {
  return [
    `[${v.dimension}] step-${v.stepId}: ${v.action} on ${v.templateName}`,
    `  Actor: ${v.actor}`,
    `  Reason: ${v.reason}`,
    `  Fix: ${v.fix}`,
    `  Why: ${v.why}`,
    `  ⚠ ${v.safetyWarning}`,
  ].join("\n");
}

function formatUnsupported(u: {
  stepId: number;
  action: string;
  templateName: string;
  reason: string;
}): string {
  return [
    `[UNSUPPORTED] step-${u.stepId}: ${u.action} on ${u.templateName}`,
    `  Reason: ${u.reason}`,
  ].join("\n");
}

export function formatTextReport(
  result: ValidationResult,
  certificate?: Certificate,
  certPath?: string,
): string {
  const lines: string[] = [
    HEADER,
    `Validating: ${result.pattern} workflow (${result.stepCount} steps, ${result.templateCount} templates, ${result.partyCount} parties)`,
    "",
  ];

  if (result.verdict === "SAFE") {
    lines.push("RESULT: SAFE");
    lines.push("");
    lines.push("All checks passed:");
    lines.push("  ✓ Visibility: all actors can see required contracts");
    lines.push("  ✓ Authorization: all actors have required controller rights");
    lines.push("");
    lines.push(`${result.checksTotal} checks passed across ${result.stepCount} steps.`);
    lines.push("");
    lines.push("Confidence: DETERMINISTIC_WITHIN_SCOPE");

    if (certificate) {
      lines.push("");
      lines.push("Certificate:");
      lines.push(JSON.stringify(certificate, null, 2));
      lines.push("");
      lines.push(`Certificate written to: ${certPath ?? "./ccre-cert.json"}`);
    }
  } else if (result.verdict === "UNSUPPORTED") {
    const firstUnsupported = result.unsupported[0];
    lines.push(
      `RESULT: UNSUPPORTED (Multi-controller choice at step-${firstUnsupported.stepId})`,
    );
    lines.push("");

    for (const u of result.unsupported) {
      lines.push(formatUnsupported(u));
      lines.push("");
    }

    if (result.violations.length > 0) {
      for (const v of result.violations) {
        lines.push(formatViolation(v));
        lines.push("");
      }
    }

    lines.push(
      "CCRE prioritizes correctness over coverage: any scenario that cannot be",
    );
    lines.push(
      "deterministically validated is explicitly marked UNSUPPORTED rather than approximated.",
    );
    lines.push("");
    lines.push(
      `${result.unsupported.length} unsupported construct(s), ${result.violations.length} violation(s) across ${result.stepCount} steps (${result.checksTotal} checks total)`,
    );
  } else {
    const firstViolation = result.violations[0];
    const dimensionLabel =
      firstViolation.dimension === "VISIBILITY"
        ? "Visibility violation"
        : "Authorization violation";
    lines.push(
      `RESULT: UNSAFE (${dimensionLabel} at step-${firstViolation.stepId})`,
    );
    lines.push("");

    for (const v of result.violations) {
      lines.push(formatViolation(v));
      lines.push("");
    }

    lines.push(
      "Note: Fix suggestions resolve the reported structural violation but may",
    );
    lines.push(
      "impact business logic or privacy constraints. Review before applying.",
    );
    lines.push("");
    lines.push(
      `${result.violations.length} violation(s) across ${result.stepCount} steps (${result.checksTotal} checks total)`,
    );
    lines.push("Confidence: DETERMINISTIC_WITHIN_SCOPE");
  }

  return lines.join("\n");
}

export function formatJsonReport(
  result: ValidationResult,
  certificate?: Certificate,
): string {
  return JSON.stringify(
    {
      ...result,
      certificate: certificate ?? null,
    },
    null,
    2,
  );
}

export function formatTopologyTextReport(
  result: TopologyAnalysisResult,
): string {
  const lines: string[] = [
    `CCRE v${VERSION} — Multi-synchronizer topology analysis`,
    `Analyzing: ${result.templateCount} templates across ${result.synchronizerCount} synchronizers`,
    "",
  ];

  if (result.deployment_decision === "PASS") {
    lines.push("DEPLOYMENT DECISION: PASS");
    lines.push("");
    lines.push(result.summary);
    lines.push("");
    lines.push("All stakeholders are hosted on every synchronizer where their contracts can execute.");
    lines.push("No multi-synchronizer deployment risks detected.");
  } else {
    lines.push(`DEPLOYMENT DECISION: ${result.deployment_decision}`);
    lines.push("");
    lines.push(result.summary);
    lines.push("");

    for (const f of result.findings) {
      lines.push(`[${f.severity}] ${f.check}: ${f.template}`);
      if (f.party) lines.push(`  Party: ${f.party}`);
      if (f.synchronizer) lines.push(`  Synchronizer: ${f.synchronizer}`);
      lines.push(`  Issue: ${f.message}`);
      lines.push(`  Impact: ${f.impact}`);
      lines.push(`  Canton protocol: ${f.severity === "CRITICAL" ? "This operation WILL fail at runtime" : "This operation may produce unexpected results"}`);
      lines.push("");
    }

    if (result.deployment_decision === "BLOCKED") {
      lines.push("Canton requires every stakeholder (signatory and observer) of a contract to be hosted");
      lines.push("on the synchronizer where it is created or to which it is reassigned. CCRE detected");
      lines.push("configurations that violate this — workflows that need these contracts there will fail.");
    }
  }

  lines.push("");
  lines.push(`${result.checksRun} checks across ${result.synchronizerCount} synchronizers, ${result.templateCount} templates`);

  return lines.join("\n");
}

export function formatTopologyJsonReport(
  result: TopologyAnalysisResult,
): string {
  return JSON.stringify(result, null, 2);
}
