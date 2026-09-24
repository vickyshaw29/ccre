import type { ContractModel, ContractTemplate } from "../schemas/contract.schema.js";
import type { TopologyConfig, Participant } from "../schemas/topology.schema.js";
import type { Transaction } from "../schemas/transaction.schema.js";
import { VERSION } from "../version.js";

// Static dry-run of Canton's synchronizer router.
//
// Canton executes a transaction on exactly one synchronizer. The router picks a
// synchronizer on which all stakeholders of all input contracts are hosted and
// all input packages are vetted, reassigns inputs that live elsewhere, and
// breaks ties by priority, then fewest reassignments, then synchronizer id.
// Each reassignment requires every stakeholder to be hosted on a reassigning
// participant, i.e. one connected to both source and target synchronizer.

export type RoutingBlockerKind =
  | "SUBMITTER_NOT_HOSTED"
  | "STAKEHOLDER_NOT_HOSTED"
  | "PACKAGE_NOT_VETTED"
  | "NO_REASSIGNING_PARTICIPANT"
  | "UNKNOWN_TEMPLATE"
  | "UNKNOWN_SYNCHRONIZER";

export interface RoutingBlocker {
  kind: RoutingBlockerKind;
  template?: string;
  party?: string;
  from?: string;
  message: string;
}

export interface Reassignment {
  template: string;
  from: string;
  to: string;
}

export interface SynchronizerEvaluation {
  synchronizer: string;
  priority: number;
  valid: boolean;
  reassignments: Reassignment[];
  blockers: RoutingBlocker[];
}

export interface RoutingResult {
  transaction: string;
  decision: "ROUTABLE" | "NO_VALID_SYNCHRONIZER";
  selected: string | null;
  evaluations: SynchronizerEvaluation[];
}

function hostingParticipants(
  topology: TopologyConfig,
  party: string,
  synchronizer: string,
): Participant[] {
  return topology.participants.filter(
    (p) => p.parties.includes(party) && p.synchronizers.includes(synchronizer),
  );
}

function stakeholders(template: ContractTemplate): string[] {
  return [...new Set([...template.signatories, ...template.observers])];
}

function isVetted(participant: Participant, packageId: string): boolean {
  // Participants without an explicit vetting list are treated as vetting everything.
  return participant.vettedPackages === undefined || participant.vettedPackages.includes(packageId);
}

function evaluate(
  model: ContractModel,
  topology: TopologyConfig,
  tx: Transaction,
  synchronizer: string,
  priority: number,
): SynchronizerEvaluation {
  const blockers: RoutingBlocker[] = [];
  const reassignments: Reassignment[] = [];
  const knownSynchronizers = new Set(topology.synchronizers.map((d) => d.id));

  if (hostingParticipants(topology, tx.submitter, synchronizer).length === 0) {
    blockers.push({
      kind: "SUBMITTER_NOT_HOSTED",
      party: tx.submitter,
      message: `Submitter '${tx.submitter}' is not hosted on '${synchronizer}'`,
    });
  }

  for (const input of tx.inputs) {
    const template = model.templates.find((t) => t.name === input.template);
    if (!template) {
      blockers.push({
        kind: "UNKNOWN_TEMPLATE",
        template: input.template,
        message: `Input template '${input.template}' is not in the contract model`,
      });
      continue;
    }
    if (!knownSynchronizers.has(input.location)) {
      blockers.push({
        kind: "UNKNOWN_SYNCHRONIZER",
        template: template.name,
        message: `Input '${template.name}' is located on unknown synchronizer '${input.location}'`,
      });
      continue;
    }

    for (const party of stakeholders(template)) {
      const hosts = hostingParticipants(topology, party, synchronizer);
      if (hosts.length === 0) {
        blockers.push({
          kind: "STAKEHOLDER_NOT_HOSTED",
          template: template.name,
          party,
          message: `Stakeholder '${party}' of '${template.name}' is not hosted on '${synchronizer}'`,
        });
        continue;
      }
      if (!hosts.some((p) => isVetted(p, template.packageId))) {
        blockers.push({
          kind: "PACKAGE_NOT_VETTED",
          template: template.name,
          party,
          message: `Package '${template.packageId}' of '${template.name}' is not vetted by any participant hosting '${party}' on '${synchronizer}'`,
        });
      }
    }

    if (input.location !== synchronizer) {
      reassignments.push({ template: template.name, from: input.location, to: synchronizer });
      for (const party of stakeholders(template)) {
        const reassigning = topology.participants.some(
          (p) =>
            p.parties.includes(party) &&
            p.synchronizers.includes(input.location) &&
            p.synchronizers.includes(synchronizer),
        );
        if (!reassigning) {
          blockers.push({
            kind: "NO_REASSIGNING_PARTICIPANT",
            template: template.name,
            party,
            from: input.location,
            message: `No participant hosts '${party}' on both '${input.location}' and '${synchronizer}' — '${template.name}' cannot be reassigned`,
          });
        }
      }
    }
  }

  return { synchronizer, priority, valid: blockers.length === 0, reassignments, blockers };
}

export function dryRunRouting(
  model: ContractModel,
  topology: TopologyConfig,
  tx: Transaction,
): RoutingResult {
  const evaluations = topology.synchronizers.map((d) =>
    evaluate(model, topology, tx, d.id, d.priority ?? 0),
  );

  const candidates = evaluations
    .filter((e) => e.valid)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.reassignments.length - b.reassignments.length ||
        a.synchronizer.localeCompare(b.synchronizer),
    );

  const selected = candidates.length > 0 ? candidates[0].synchronizer : null;

  return {
    transaction: tx.name,
    decision: selected ? "ROUTABLE" : "NO_VALID_SYNCHRONIZER",
    selected,
    evaluations,
  };
}

export function formatRoutingTextReport(result: RoutingResult): string {
  const lines: string[] = [];
  lines.push(`CCRE v${VERSION} — Synchronizer routing dry-run`);
  lines.push(`Transaction: ${result.transaction}`);
  lines.push("");

  if (result.selected) {
    const chosen = result.evaluations.find((e) => e.synchronizer === result.selected)!;
    lines.push(`ROUTING DECISION: ROUTABLE → ${result.selected}`);
    for (const r of chosen.reassignments) {
      lines.push(`  reassign ${r.template}: ${r.from} → ${r.to}`);
    }
  } else {
    lines.push("ROUTING DECISION: NO VALID SYNCHRONIZER");
    lines.push("Canton will reject this submission. No synchronizer satisfies the routing constraints.");
  }
  lines.push("");

  for (const e of result.evaluations) {
    const status = e.valid ? "OK" : "BLOCKED";
    lines.push(`[${status}] ${e.synchronizer} (priority ${e.priority}, ${e.reassignments.length} reassignment(s))`);
    for (const b of e.blockers) {
      lines.push(`  - ${b.kind}: ${b.message}`);
    }
  }

  return lines.join("\n");
}
