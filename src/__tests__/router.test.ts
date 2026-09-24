import { describe, it, expect } from "vitest";
import { dryRunRouting } from "../core/router.js";
import type { ContractModel } from "../schemas/contract.schema.js";
import type { TopologyConfig } from "../schemas/topology.schema.js";
import type { Transaction } from "../schemas/transaction.schema.js";

const model: ContractModel = {
  version: "1.0",
  templates: [
    {
      name: "AmuletAllocation",
      packageId: "splice-amulet",
      signatories: ["DSO", "Buyer"],
      observers: ["Venue"],
      choices: [{ name: "Execute", controllers: ["Venue"], consuming: true }],
    },
    {
      name: "BondAllocation",
      packageId: "bond-registry",
      signatories: ["BondIssuer", "Seller"],
      observers: ["Venue"],
      choices: [{ name: "Execute", controllers: ["Venue"], consuming: true }],
    },
  ],
};

const tx: Transaction = {
  version: "1.0",
  name: "dvp",
  submitter: "Venue",
  inputs: [
    { template: "AmuletAllocation", location: "global" },
    { template: "BondAllocation", location: "private" },
  ],
};

function topology(issuerSyncs: string[]): TopologyConfig {
  return {
    version: "1.0",
    domains: [{ id: "global" }, { id: "private" }],
    participants: [
      { id: "sv", domains: ["global"], parties: ["DSO"] },
      { id: "buyer", domains: ["global"], parties: ["Buyer"] },
      { id: "issuer", domains: issuerSyncs, parties: ["BondIssuer"] },
      { id: "seller", domains: ["global", "private"], parties: ["Seller"] },
      { id: "venue", domains: ["global", "private"], parties: ["Venue"] },
    ],
  };
}

describe("Synchronizer routing dry-run", () => {
  it("reports no valid synchronizer when no synchronizer hosts all stakeholders", () => {
    const result = dryRunRouting(model, topology(["private"]), tx);
    expect(result.decision).toBe("NO_VALID_SYNCHRONIZER");
    expect(result.selected).toBeNull();
    const global = result.evaluations.find((e) => e.synchronizer === "global")!;
    expect(global.blockers.map((b) => b.kind)).toContain("STAKEHOLDER_NOT_HOSTED");
    expect(global.blockers.map((b) => b.kind)).toContain("NO_REASSIGNING_PARTICIPANT");
  });

  it("routes to the synchronizer where all stakeholders are hosted and reports reassignments", () => {
    const result = dryRunRouting(model, topology(["global", "private"]), tx);
    expect(result.decision).toBe("ROUTABLE");
    expect(result.selected).toBe("global");
    const global = result.evaluations.find((e) => e.synchronizer === "global")!;
    expect(global.reassignments).toEqual([
      { template: "BondAllocation", from: "private", to: "global" },
    ]);
  });

  it("blocks a synchronizer when hosting participants have not vetted the package", () => {
    const topo = topology(["global", "private"]);
    topo.participants = topo.participants.map((p) =>
      p.id === "issuer" ? { ...p, vettedPackages: ["some-other-package"] } : p,
    );
    const result = dryRunRouting(model, topo, tx);
    expect(result.decision).toBe("NO_VALID_SYNCHRONIZER");
    const global = result.evaluations.find((e) => e.synchronizer === "global")!;
    expect(global.blockers).toContainEqual(
      expect.objectContaining({ kind: "PACKAGE_NOT_VETTED", party: "BondIssuer" }),
    );
  });

  it("blocks when the submitter is not hosted on the synchronizer", () => {
    const result = dryRunRouting(model, topology(["global", "private"]), {
      ...tx,
      submitter: "Outsider",
    });
    expect(result.decision).toBe("NO_VALID_SYNCHRONIZER");
    expect(result.evaluations[0].blockers[0].kind).toBe("SUBMITTER_NOT_HOSTED");
  });

  it("prefers higher priority, then fewer reassignments, then synchronizer id", () => {
    const everywhere: TopologyConfig = {
      version: "1.0",
      domains: [{ id: "b" }, { id: "a" }, { id: "c", priority: 0 }],
      participants: [
        { id: "all", domains: ["a", "b", "c"], parties: ["DSO", "Buyer", "BondIssuer", "Seller", "Venue"] },
      ],
    };
    const onB: Transaction = {
      ...tx,
      inputs: [
        { template: "AmuletAllocation", location: "b" },
        { template: "BondAllocation", location: "b" },
      ],
    };
    expect(dryRunRouting(model, everywhere, onB).selected).toBe("b");

    const onMixed: Transaction = {
      ...tx,
      inputs: [
        { template: "AmuletAllocation", location: "b" },
        { template: "BondAllocation", location: "c" },
      ],
    };
    expect(dryRunRouting(model, everywhere, onMixed).selected).toBe("b");

    everywhere.domains = [{ id: "b" }, { id: "a", priority: 10 }, { id: "c" }];
    expect(dryRunRouting(model, everywhere, onB).selected).toBe("a");
  });
});
