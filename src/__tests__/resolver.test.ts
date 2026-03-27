import { describe, it, expect } from "vitest";
import { parseContractModel, parseWorkflowIntent, CcreError } from "../core/parser.js";
import { resolveSteps } from "../core/resolver.js";
import { resolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const fixture = (name: string, file: string) =>
  resolve(import.meta.dirname, "../../fixtures", name, file);

describe("resolveSteps", () => {
  it("resolves valid steps correctly", () => {
    const model = parseContractModel(fixture("passing", "contracts.json"));
    const intent = parseWorkflowIntent(fixture("passing", "intent.json"));
    const steps = resolveSteps(model, intent);

    expect(steps).toHaveLength(4);
    expect(steps[0].index).toBe(1);
    expect(steps[0].templateName).toBe("Asset");
    expect(steps[0].choiceName).toBe("Lock");
    expect(steps[0].actor).toBe("BankA");
  });

  it("throws BINDING_ERROR for missing binding", () => {
    const model = parseContractModel(fixture("passing", "contracts.json"));
    const dir = mkdtempSync(resolve(tmpdir(), "ccre-test-"));
    const intentPath = resolve(dir, "intent.json");
    writeFileSync(
      intentPath,
      JSON.stringify({
        pattern: "DvP",
        steps: [{ action: "Lock", role: "Unknown", by: "BankA" }],
        bindings: {},
      }),
      "utf-8",
    );

    const intent = parseWorkflowIntent(intentPath);
    expect(() => resolveSteps(model, intent)).toThrow(CcreError);

    try {
      resolveSteps(model, intent);
    } catch (err) {
      expect((err as CcreError).code).toBe(4);
    }

    rmSync(dir, { recursive: true });
  });

  it("throws ACTOR_ERROR for unknown party", () => {
    const model = parseContractModel(fixture("passing", "contracts.json"));
    const dir = mkdtempSync(resolve(tmpdir(), "ccre-test-"));
    const intentPath = resolve(dir, "intent.json");
    writeFileSync(
      intentPath,
      JSON.stringify({
        pattern: "DvP",
        steps: [{ action: "Lock", role: "Asset", by: "UnknownParty" }],
        bindings: { Asset: "Asset" },
      }),
      "utf-8",
    );

    const intent = parseWorkflowIntent(intentPath);
    expect(() => resolveSteps(model, intent)).toThrow(CcreError);

    try {
      resolveSteps(model, intent);
    } catch (err) {
      expect((err as CcreError).code).toBe(5);
    }

    rmSync(dir, { recursive: true });
  });

  it("throws SCHEMA_ERROR for missing choice", () => {
    const model = parseContractModel(fixture("passing", "contracts.json"));
    const dir = mkdtempSync(resolve(tmpdir(), "ccre-test-"));
    const intentPath = resolve(dir, "intent.json");
    writeFileSync(
      intentPath,
      JSON.stringify({
        pattern: "DvP",
        steps: [{ action: "Nonexistent", role: "Asset", by: "BankA" }],
        bindings: { Asset: "Asset" },
      }),
      "utf-8",
    );

    const intent = parseWorkflowIntent(intentPath);
    expect(() => resolveSteps(model, intent)).toThrow(CcreError);

    try {
      resolveSteps(model, intent);
    } catch (err) {
      expect((err as CcreError).code).toBe(6);
    }

    rmSync(dir, { recursive: true });
  });
});
