import { describe, it, expect } from "vitest";
import { runTopologyPipeline } from "../core/topology-pipeline.js";
import type { ContractModel } from "../schemas/contract.schema.js";
import type { TopologyConfig } from "../schemas/topology.schema.js";

describe("Topology Pipeline — CCRE-003 Stakeholder Hosting", () => {
  it("detects key maintainer not hosted on execution domain", () => {
    const model: ContractModel = {
      version: "1.0",
      templates: [
        {
          name: "Bond",
          packageId: "bond-pkg",
          signatories: ["issuer"],
          observers: ["custodian"],
          choices: [
            { name: "Transfer", controllers: ["custodian"], consuming: true },
          ],
        },
      ],
    };

    const topology: TopologyConfig = {
      version: "1.0",
      domains: [{ id: "tradingDomain" }, { id: "settlementDomain" }],
      participants: [
        {
          id: "issuerNode",
          domains: ["tradingDomain"],
          parties: ["issuer"],
        },
        {
          id: "custodianNode",
          domains: ["tradingDomain", "settlementDomain"],
          parties: ["custodian"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("BLOCKED");
    expect(result.findings.length).toBeGreaterThan(0);

    const maintainerFinding = result.findings.find(
      (f) =>
        f.check === "CCRE-003" &&
        f.party === "issuer" &&
        f.domain === "settlementDomain",
    );
    expect(maintainerFinding).toBeDefined();
    expect(maintainerFinding!.severity).toBe("CRITICAL");
    expect(maintainerFinding!.message).toContain("issuer");
    expect(maintainerFinding!.message).toContain("settlementDomain");
  });

  it("passes when all stakeholders are hosted on all domains", () => {
    const model: ContractModel = {
      version: "1.0",
      templates: [
        {
          name: "Bond",
          packageId: "bond-pkg",
          signatories: ["issuer"],
          observers: ["custodian"],
          choices: [
            { name: "Transfer", controllers: ["custodian"], consuming: true },
          ],
        },
      ],
    };

    const topology: TopologyConfig = {
      version: "1.0",
      domains: [{ id: "tradingDomain" }, { id: "settlementDomain" }],
      participants: [
        {
          id: "issuerNode",
          domains: ["tradingDomain", "settlementDomain"],
          parties: ["issuer"],
        },
        {
          id: "custodianNode",
          domains: ["tradingDomain", "settlementDomain"],
          parties: ["custodian"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("PASS");
    expect(result.findings.length).toBe(0);
  });

  it("skips checks on single-domain topology", () => {
    const model: ContractModel = {
      version: "1.0",
      templates: [
        {
          name: "Bond",
          packageId: "bond-pkg",
          signatories: ["issuer"],
          observers: ["custodian"],
          choices: [
            { name: "Transfer", controllers: ["custodian"], consuming: true },
          ],
        },
      ],
    };

    const topology: TopologyConfig = {
      version: "1.0",
      domains: [{ id: "singleDomain" }],
      participants: [
        {
          id: "node1",
          domains: ["singleDomain"],
          parties: ["issuer", "custodian"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("PASS");
    expect(result.checksRun).toBe(0);
    expect(result.summary).toContain("Single-domain");
  });

  it("detects observer blocking reassignment", () => {
    const model: ContractModel = {
      version: "1.0",
      templates: [
        {
          name: "Trade",
          packageId: "trade-pkg",
          signatories: ["broker"],
          observers: ["regulator"],
          choices: [
            { name: "Settle", controllers: ["broker"], consuming: true },
          ],
        },
      ],
    };

    const topology: TopologyConfig = {
      version: "1.0",
      domains: [{ id: "executionDomain" }, { id: "clearingDomain" }],
      participants: [
        {
          id: "brokerNode",
          domains: ["executionDomain", "clearingDomain"],
          parties: ["broker"],
        },
        {
          id: "regulatorNode",
          domains: ["executionDomain"],
          parties: ["regulator"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("BLOCKED");

    const observerFinding = result.findings.find(
      (f) =>
        f.check === "CCRE-003" &&
        f.party === "regulator" &&
        f.domain === "clearingDomain",
    );
    expect(observerFinding).toBeDefined();
    expect(observerFinding!.message).toContain("reassignment");
  });

  it("handles multiple templates with mixed findings", () => {
    const model: ContractModel = {
      version: "1.0",
      templates: [
        {
          name: "Bond",
          packageId: "bond-pkg",
          signatories: ["issuer"],
          observers: [],
          choices: [
            { name: "Redeem", controllers: ["issuer"], consuming: true },
          ],
        },
        {
          name: "Trade",
          packageId: "trade-pkg",
          signatories: ["broker"],
          observers: ["auditor"],
          choices: [
            { name: "Execute", controllers: ["broker"], consuming: false },
          ],
        },
      ],
    };

    const topology: TopologyConfig = {
      version: "1.0",
      domains: [{ id: "domainA" }, { id: "domainB" }],
      participants: [
        {
          id: "issuerNode",
          domains: ["domainA", "domainB"],
          parties: ["issuer"],
        },
        {
          id: "brokerNode",
          domains: ["domainA", "domainB"],
          parties: ["broker"],
        },
        {
          id: "auditorNode",
          domains: ["domainA"],
          parties: ["auditor"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("BLOCKED");

    const bondFindings = result.findings.filter(
      (f) => f.template === "Bond",
    );
    expect(bondFindings.length).toBe(0);

    const auditorFinding = result.findings.find(
      (f) => f.party === "auditor" && f.domain === "domainB",
    );
    expect(auditorFinding).toBeDefined();
  });
});
