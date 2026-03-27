import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { Certificate, ValidationResult } from "../types.js";

function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean" || typeof obj === "number") return JSON.stringify(obj);
  if (typeof obj === "string") return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }

  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`,
  );
  return "{" + pairs.join(",") + "}";
}

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input, "utf-8").digest("hex");
}

export function generateCertificate(
  result: ValidationResult,
  schemaRaw: string,
  intentRaw: string,
): Certificate {
  if (result.verdict !== "SAFE") {
    throw new Error("Certificates are only generated for SAFE verdicts");
  }

  return {
    ccre_version: "0.1.0",
    verdict: "SAFE",
    confidence: "DETERMINISTIC_WITHIN_SCOPE",
    schema_hash: sha256(canonicalize(JSON.parse(schemaRaw))),
    intent_hash: sha256(canonicalize(JSON.parse(intentRaw))),
    scope: ["VISIBILITY", "AUTHORIZATION"],
    checks_passed: result.checksTotal,
    checks_total: result.checksTotal,
    deterministic: true,
  };
}

export function writeCertificate(cert: Certificate, path: string): void {
  writeFileSync(path, JSON.stringify(cert, null, 2) + "\n", "utf-8");
}
