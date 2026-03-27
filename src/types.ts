import type { ContractTemplate, Choice } from "./schemas/contract.schema.js";

export type Verdict = "SAFE" | "UNSAFE" | "UNSUPPORTED";

export interface ExecutionNode {
  id: number;
  template: ContractTemplate;
  choice: Choice;
  actor: string;
  requires: number[];
}

export interface ResolvedStep {
  index: number;
  action: string;
  role: string;
  actor: string;
  templateName: string;
  choiceName: string;
}

export interface Violation {
  dimension: "VISIBILITY" | "AUTHORIZATION";
  stepId: number;
  action: string;
  templateName: string;
  actor: string;
  reason: string;
  fix: string;
  why: string;
  safetyWarning: string;
}

export interface UnsupportedConstruct {
  stepId: number;
  action: string;
  templateName: string;
  reason: string;
}

export interface ValidationResult {
  verdict: Verdict;
  violations: Violation[];
  unsupported: UnsupportedConstruct[];
  executionChain: ExecutionNode[];
  summary: string;
  pattern: string;
  stepCount: number;
  templateCount: number;
  partyCount: number;
  checksTotal: number;
}

export interface Certificate {
  ccre_version: string;
  verdict: "SAFE";
  confidence: "DETERMINISTIC_WITHIN_SCOPE";
  schema_hash: string;
  intent_hash: string;
  scope: string[];
  checks_passed: number;
  checks_total: number;
  deterministic: true;
}

export const EXIT_CODES = {
  SAFE: 0,
  UNSAFE: 1,
  UNSUPPORTED: 2,
  INPUT_ERROR: 3,
  BINDING_ERROR: 4,
  ACTOR_ERROR: 5,
  SCHEMA_ERROR: 6,
} as const;
