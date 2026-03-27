import { describe, it, expect } from "vitest";
import { parseContractModel, parseWorkflowIntent, getRawFileContent } from "../core/parser.js";
import { runPipeline } from "../core/pipeline.js";
import { generateCertificate } from "../core/certificate.js";
import { resolve } from "node:path";

const fixture = (name: string, file: string) =>
  resolve(import.meta.dirname, "../../fixtures", name, file);

describe("certificate", () => {
  it("generates a deterministic certificate for SAFE verdicts", () => {
    const schemaPath = fixture("passing", "contracts.json");
    const intentPath = fixture("passing", "intent.json");

    const model = parseContractModel(schemaPath);
    const intent = parseWorkflowIntent(intentPath);
    const result = runPipeline(model, intent);

    const schemaRaw = getRawFileContent(schemaPath);
    const intentRaw = getRawFileContent(intentPath);

    const cert = generateCertificate(result, schemaRaw, intentRaw);

    expect(cert.verdict).toBe("SAFE");
    expect(cert.confidence).toBe("DETERMINISTIC_WITHIN_SCOPE");
    expect(cert.deterministic).toBe(true);
    expect(cert.schema_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(cert.intent_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(cert.scope).toEqual(["VISIBILITY", "AUTHORIZATION"]);
    expect(cert.checks_passed).toBe(cert.checks_total);
  });

  it("produces identical certificates for identical inputs", () => {
    const schemaPath = fixture("passing", "contracts.json");
    const intentPath = fixture("passing", "intent.json");

    const model = parseContractModel(schemaPath);
    const intent = parseWorkflowIntent(intentPath);
    const result = runPipeline(model, intent);

    const schemaRaw = getRawFileContent(schemaPath);
    const intentRaw = getRawFileContent(intentPath);

    const cert1 = generateCertificate(result, schemaRaw, intentRaw);
    const cert2 = generateCertificate(result, schemaRaw, intentRaw);

    expect(JSON.stringify(cert1)).toBe(JSON.stringify(cert2));
  });

  it("throws when generating certificate for non-SAFE verdict", () => {
    const model = parseContractModel(fixture("failing-visibility", "contracts.json"));
    const intent = parseWorkflowIntent(fixture("failing-visibility", "intent.json"));
    const result = runPipeline(model, intent);

    expect(() => generateCertificate(result, "{}", "{}")).toThrow(
      "Certificates are only generated for SAFE verdicts",
    );
  });
});
