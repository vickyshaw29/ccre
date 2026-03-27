import { describe, it, expect } from "vitest";
import { parseContractModel, parseWorkflowIntent } from "../core/parser.js";
import { runPipeline } from "../core/pipeline.js";
import { resolve } from "node:path";

const fixture = (name: string, file: string) =>
  resolve(import.meta.dirname, "../../fixtures", name, file);

describe("pipeline", () => {
  describe("passing fixture", () => {
    it("returns SAFE verdict with zero violations", () => {
      const model = parseContractModel(fixture("passing", "contracts.json"));
      const intent = parseWorkflowIntent(fixture("passing", "intent.json"));
      const result = runPipeline(model, intent);

      expect(result.verdict).toBe("SAFE");
      expect(result.violations).toHaveLength(0);
      expect(result.unsupported).toHaveLength(0);
      expect(result.checksTotal).toBe(8);
      expect(result.stepCount).toBe(4);
    });
  });

  describe("failing-visibility fixture", () => {
    it("returns UNSAFE with visibility violation at step-3", () => {
      const model = parseContractModel(fixture("failing-visibility", "contracts.json"));
      const intent = parseWorkflowIntent(fixture("failing-visibility", "intent.json"));
      const result = runPipeline(model, intent);

      expect(result.verdict).toBe("UNSAFE");
      expect(result.violations.length).toBeGreaterThan(0);

      const visViolation = result.violations.find(
        (v) => v.dimension === "VISIBILITY" && v.stepId === 3,
      );
      expect(visViolation).toBeDefined();
      expect(visViolation!.actor).toBe("BankB");
      expect(visViolation!.templateName).toBe("Asset");
    });
  });

  describe("failing-auth fixture", () => {
    it("returns UNSAFE with authorization violation at step-3", () => {
      const model = parseContractModel(fixture("failing-auth", "contracts.json"));
      const intent = parseWorkflowIntent(fixture("failing-auth", "intent.json"));
      const result = runPipeline(model, intent);

      expect(result.verdict).toBe("UNSAFE");

      const authViolation = result.violations.find(
        (v) => v.dimension === "AUTHORIZATION" && v.stepId === 3,
      );
      expect(authViolation).toBeDefined();
      expect(authViolation!.actor).toBe("BankA");
      expect(authViolation!.templateName).toBe("Asset");
    });
  });

  describe("fix-demo fixture", () => {
    it("broken contracts produce UNSAFE", () => {
      const model = parseContractModel(fixture("fix-demo", "contracts-broken.json"));
      const intent = parseWorkflowIntent(fixture("fix-demo", "intent.json"));
      const result = runPipeline(model, intent);

      expect(result.verdict).toBe("UNSAFE");
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("fixed contracts produce SAFE", () => {
      const model = parseContractModel(fixture("fix-demo", "contracts-fixed.json"));
      const intent = parseWorkflowIntent(fixture("fix-demo", "intent.json"));
      const result = runPipeline(model, intent);

      expect(result.verdict).toBe("SAFE");
      expect(result.violations).toHaveLength(0);
      expect(result.unsupported).toHaveLength(0);
    });
  });

  describe("unsupported-multi-controller fixture", () => {
    it("returns UNSUPPORTED with multi-controller construct", () => {
      const model = parseContractModel(
        fixture("unsupported-multi-controller", "contracts.json"),
      );
      const intent = parseWorkflowIntent(
        fixture("unsupported-multi-controller", "intent.json"),
      );
      const result = runPipeline(model, intent);

      expect(result.verdict).toBe("UNSUPPORTED");
      expect(result.unsupported.length).toBeGreaterThan(0);
      expect(result.unsupported[0].stepId).toBe(3);
      expect(result.unsupported[0].templateName).toBe("Asset");
    });
  });
});
