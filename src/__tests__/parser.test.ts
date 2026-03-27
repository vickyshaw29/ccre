import { describe, it, expect } from "vitest";
import { parseContractModel, parseWorkflowIntent, CcreError } from "../core/parser.js";
import { resolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const fixture = (name: string, file: string) =>
  resolve(import.meta.dirname, "../../fixtures", name, file);

describe("parseContractModel", () => {
  it("parses a valid contract model", () => {
    const model = parseContractModel(fixture("passing", "contracts.json"));
    expect(model.version).toBe("1.0");
    expect(model.templates).toHaveLength(2);
    expect(model.templates[0].name).toBe("Asset");
    expect(model.templates[0].signatories).toContain("BankA");
  });

  it("throws INPUT_ERROR for missing file", () => {
    expect(() => parseContractModel("/nonexistent/path.json")).toThrow(CcreError);
    try {
      parseContractModel("/nonexistent/path.json");
    } catch (err) {
      expect((err as CcreError).code).toBe(3);
    }
  });

  it("throws INPUT_ERROR for invalid JSON", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "ccre-test-"));
    const path = resolve(dir, "bad.json");
    writeFileSync(path, "not json", "utf-8");

    expect(() => parseContractModel(path)).toThrow(CcreError);
    try {
      parseContractModel(path);
    } catch (err) {
      expect((err as CcreError).code).toBe(3);
    }

    rmSync(dir, { recursive: true });
  });

  it("throws INPUT_ERROR when controller is not a stakeholder", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "ccre-test-"));
    const path = resolve(dir, "invalid-controller.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: "1.0",
        templates: [
          {
            name: "Test",
            packageId: "test-pkg",
            signatories: ["Alice"],
            observers: [],
            choices: [
              { name: "Do", controllers: ["Bob"], consuming: false },
            ],
          },
        ],
      }),
      "utf-8",
    );

    expect(() => parseContractModel(path)).toThrow(CcreError);
    try {
      parseContractModel(path);
    } catch (err) {
      expect((err as CcreError).code).toBe(3);
      expect((err as CcreError).message).toContain("controller");
    }

    rmSync(dir, { recursive: true });
  });
});

describe("parseWorkflowIntent", () => {
  it("parses a valid intent", () => {
    const intent = parseWorkflowIntent(fixture("passing", "intent.json"));
    expect(intent.pattern).toBe("DvP");
    expect(intent.steps).toHaveLength(4);
    expect(intent.bindings).toHaveProperty("Asset");
  });
});
