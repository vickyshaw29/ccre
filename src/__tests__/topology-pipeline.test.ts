import { describe, it, expect } from "vitest";
import { runTopologyPipeline } from "../core/topology-pipeline.js";
import type { ContractModel } from "../schemas/contract.schema.js";
import { TopologyConfigSchema, type TopologyConfig } from "../schemas/topology.schema.js";

describe("Topology Pipeline — CCRE-003 Stakeholder Hosting", () => {
  it("detects signatory not hosted on a synchronizer where the template can execute", () => {
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
      synchronizers: [{ id: "tradingSync" }, { id: "settlementSync" }],
      participants: [
        {
          id: "issuerNode",
          synchronizers: ["tradingSync"],
          parties: ["issuer"],
        },
        {
          id: "custodianNode",
          synchronizers: ["tradingSync", "settlementSync"],
          parties: ["custodian"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("BLOCKED");
    expect(result.findings.length).toBeGreaterThan(0);

    const signatoryFinding = result.findings.find(
      (f) =>
        f.check === "CCRE-003" &&
        f.party === "issuer" &&
        f.synchronizer === "settlementSync",
    );
    expect(signatoryFinding).toBeDefined();
    expect(signatoryFinding!.severity).toBe("CRITICAL");
    expect(signatoryFinding!.message).toContain("Signatory 'issuer'");
    expect(signatoryFinding!.message).toContain("settlementSync");
  });

  it("passes when all stakeholders are hosted on all synchronizers", () => {
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
      synchronizers: [{ id: "tradingSync" }, { id: "settlementSync" }],
      participants: [
        {
          id: "issuerNode",
          synchronizers: ["tradingSync", "settlementSync"],
          parties: ["issuer"],
        },
        {
          id: "custodianNode",
          synchronizers: ["tradingSync", "settlementSync"],
          parties: ["custodian"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("PASS");
    expect(result.findings.length).toBe(0);
  });

  it("skips checks on single-synchronizer topology", () => {
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
      synchronizers: [{ id: "singleSync" }],
      participants: [
        {
          id: "node1",
          synchronizers: ["singleSync"],
          parties: ["issuer", "custodian"],
        },
      ],
    };

    const result = runTopologyPipeline(model, topology);

    expect(result.deployment_decision).toBe("PASS");
    expect(result.checksRun).toBe(0);
    expect(result.summary).toContain("Single-synchronizer");
  });

  it("detects observer not hosted on a synchronizer", () => {
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
      synchronizers: [{ id: "executionSync" }, { id: "clearingSync" }],
      participants: [
        {
          id: "brokerNode",
          synchronizers: ["executionSync", "clearingSync"],
          parties: ["broker"],
        },
        {
          id: "regulatorNode",
          synchronizers: ["executionSync"],
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
        f.synchronizer === "clearingSync",
    );
    expect(observerFinding).toBeDefined();
    expect(observerFinding!.message).toContain("Observer 'regulator'");
    expect(observerFinding!.impact).toContain("cannot be created on or reassigned to");
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
      synchronizers: [{ id: "syncA" }, { id: "syncB" }],
      participants: [
        {
          id: "issuerNode",
          synchronizers: ["syncA", "syncB"],
          parties: ["issuer"],
        },
        {
          id: "brokerNode",
          synchronizers: ["syncA", "syncB"],
          parties: ["broker"],
        },
        {
          id: "auditorNode",
          synchronizers: ["syncA"],
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
      (f) => f.party === "auditor" && f.synchronizer === "syncB",
    );
    expect(auditorFinding).toBeDefined();
  });
});

describe("Topology schema", () => {
  it("accepts legacy 'domains' fields from CCRE 0.1 topology files", () => {
    const topology = TopologyConfigSchema.parse({
      version: "1.0",
      domains: [{ id: "syncA" }, { id: "syncB" }],
      participants: [{ id: "node", domains: ["syncA", "syncB"], parties: ["issuer"] }],
    });

    expect(topology.synchronizers.map((s) => s.id)).toEqual(["syncA", "syncB"]);
    expect(topology.participants[0].synchronizers).toEqual(["syncA", "syncB"]);
  });
});
