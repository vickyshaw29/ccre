# CCRE — Canton Composition Reasoning Engine

Pre-flight checker for Canton multi-synchronizer deployments.

A Canton transaction executes on exactly one synchronizer, and only if every stakeholder of its contracts is hosted there, every package is vetted, and every input can be reassigned to it. Workflows that pass on a single synchronizer can therefore be rejected at runtime once they are deployed across several — a failure that is invisible in the code and depends on the deployment topology.

CCRE analyzes Daml contract interfaces together with a synchronizer topology to detect these failures before deployment. No running Canton node or active ledger connection is required.

> Canton 3.3 renamed "domain" to "synchronizer", and CCRE uses the new term throughout. Topology files written for CCRE 0.1 with `domains` fields are still accepted.

**What works today:**

- **Synchronizer routing dry-run (`ccre route`)** — Predicts which synchronizer Canton's router will choose for a transaction and which inputs it will reassign, or reports why no synchronizer qualifies.
- **CCRE-003: Stakeholder hosting validation** (CRITICAL) — Checks that every stakeholder (signatory and observer) is hosted on each synchronizer where a template can execute. A contract cannot be created on, or reassigned to, a synchronizer where one of its stakeholders is not hosted.
- **Visibility validation** — Checks `actor ∈ (signatories ∪ observers)` for every workflow step.
- **Authorization validation** — Checks `actor == choice.controller` for single-controller choices.
- **Deterministic certificate generation** — SHA-256 reproducible proof of validation.

Next steps are listed under [Roadmap](#roadmap).

## Prerequisites

- Node.js >= 20.0.0
- npm

## Quick Start

```bash
npm install
```

### Workflow Validation (Visibility + Authorization)

```bash
npx tsx src/cli.ts validate --schema fixtures/passing/contracts.json --intent fixtures/passing/intent.json
```

### Multi-Synchronizer Topology Analysis

```bash
npx tsx src/cli.ts validate --schema fixtures/topology-blocked/contracts.json --topology fixtures/topology-blocked/topology.json
```

```
CCRE v0.2.0 — Multi-synchronizer topology analysis
Analyzing: 2 templates across 2 synchronizers

DEPLOYMENT DECISION: BLOCKED

4 CRITICAL finding(s) — deployment blocked

[CRITICAL] CCRE-003: Bond
  Party: Issuer
  Synchronizer: settlement-synchronizer
  Issue: Signatory 'Issuer' not hosted on 'settlement-synchronizer'
  Impact: 'Bond' cannot be created on or reassigned to 'settlement-synchronizer' — Canton requires every stakeholder to be hosted there
  Canton protocol: This operation WILL fail at runtime
```

Without CCRE, this misconfiguration would only surface as a failed transaction at runtime — with no pre-deployment warning and no indication of root cause.

## Demo: BLOCKED → FIX → PASS

**1. Run against a misconfigured multi-synchronizer topology:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/topology-blocked/contracts.json \
  --topology fixtures/topology-blocked/topology.json
```

Investor is hosted on both synchronizers, but Issuer only on `issuance-synchronizer`, so Bond can never be created on or reassigned to `settlement-synchronizer`. Any workflow that needs Bond there will be rejected. CCRE catches this.

**2. Run against a correctly configured topology:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/topology-pass/contracts.json \
  --topology fixtures/topology-pass/topology.json
```

```
DEPLOYMENT DECISION: PASS

All checks passed across 2 synchronizers and 1 templates

All stakeholders are hosted on every synchronizer where their contracts can execute.
No multi-synchronizer deployment risks detected.
```

**3. Workflow FAIL → FIX → PASS cycle:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/fix-demo/contracts-broken.json \
  --intent fixtures/fix-demo/intent.json
```

```
RESULT: UNSAFE (Visibility violation at step-3)

[VISIBILITY] step-3: Claim on Bond
  Actor: Investor
  Reason: Investor is not a signatory or observer of Bond (signatories: [Issuer], observers: [])
  Fix: Modify Bond template definition to include Investor as observer
```

Apply the fix and re-validate:

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/fix-demo/contracts-fixed.json \
  --intent fixtures/fix-demo/intent.json
```

```
RESULT: SAFE
Certificate written to: ./ccre-cert.json
```

## Synchronizer Routing Dry-Run: Canton Coin ↔ Private-Synchronizer DvP

Canton executes each transaction on exactly one synchronizer. Its router picks a synchronizer that hosts every stakeholder of every input contract and has every input package vetted, reassigns inputs that live elsewhere, and breaks ties by priority, then fewest reassignments, then synchronizer id. `ccre route` runs that decision statically, before you submit.

The fixture in `fixtures/dvp-amulet/` models an atomic DvP that settles a Canton Coin allocation against a bond allocation issued on a private synchronizer. Stakeholders follow the Splice templates (`AmuletAllocation` is signed by the instrument admin — the DSO — and the sender; the settlement venue is an observer). The contract model is hand-written from the Splice sources; direct DAR ingestion is on the roadmap.

```bash
npx tsx src/cli.ts route \
  --schema fixtures/dvp-amulet/contracts.json \
  --topology fixtures/dvp-amulet/topology-blocked.json \
  --tx fixtures/dvp-amulet/settle-dvp.json
```

```
ROUTING DECISION: NO VALID SYNCHRONIZER
Canton will reject this submission. No synchronizer satisfies the routing constraints.

[BLOCKED] global-synchronizer (priority 0, 1 reassignment(s))
  - STAKEHOLDER_NOT_HOSTED: Stakeholder 'BondIssuer' of 'BondAllocation' is not hosted on 'global-synchronizer'
  - NO_REASSIGNING_PARTICIPANT: No participant hosts 'BondIssuer' on both 'bond-private-synchronizer' and 'global-synchronizer' — 'BondAllocation' cannot be reassigned
[BLOCKED] bond-private-synchronizer (priority 0, 1 reassignment(s))
  - STAKEHOLDER_NOT_HOSTED: Stakeholder 'DSO' of 'AmuletAllocation' is not hosted on 'bond-private-synchronizer'
  ...
```

In this topology the DSO party is hosted only by the Super Validator nodes on the Global Synchronizer, so the Amulet allocation cannot move to the private synchronizer. The fix is for the bond issuer's participant to also connect to the Global Synchronizer. With `topology-fixed.json`, CCRE confirms the route and the reassignment the router will perform:

```
ROUTING DECISION: ROUTABLE → global-synchronizer
  reassign BondAllocation: bond-private-synchronizer → global-synchronizer
```

Participants may list `vettedPackages`, in which case the dry-run also blocks synchronizers where hosting participants have not vetted an input package. Synchronizers may set `priority`.

## What It Checks

### Routing Dry-Run (`route`)

Evaluates every synchronizer in the topology for one transaction: submitter hosting, stakeholder hosting, package vetting (when `vettedPackages` is given) and, for inputs located on another synchronizer, whether every stakeholder has a reassigning participant connected to both. Signatory confirmation thresholds for reassignment are not modelled yet.

### Multi-Synchronizer Topology Analysis (`validate --topology`)

**CCRE-003: Stakeholder Hosting** (CRITICAL) — Checks that every stakeholder (signatory and observer) is hosted on each synchronizer where a template can execute. A contract cannot be created on, or reassigned to, a synchronizer where one of its stakeholders is not hosted.

### Workflow Validation (`validate --intent`)

**Visibility** — Can the actor see the target contract? Canton requires `actor ∈ (signatories ∪ observers)`.

**Authorization** — Is the actor allowed to exercise the choice? Canton requires `actor == choice.controller`. Multi-controller choices are marked UNSUPPORTED rather than approximated — CCRE prioritizes correctness over coverage.

## CLI Usage

```bash
npx tsx src/cli.ts validate --schema <path> (--intent <path> | --topology <path>) [--json] [--cert <path>]
npx tsx src/cli.ts route --schema <path> --topology <path> --tx <path> [--json]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--schema` | yes | Path to contract interface JSON |
| `--intent` | for workflow validation | Path to workflow intent JSON |
| `--topology` | for topology analysis and `route` | Path to topology configuration JSON |
| `--tx` | for `route` | Path to transaction JSON (submitter and input contracts with their current synchronizer) |
| `--json` | no | Machine-readable JSON output |
| `--cert` | no | Certificate output path (default: `./ccre-cert.json`) |

When `--topology` is provided, `validate` runs multi-synchronizer topology analysis (CCRE-003). Without it, `validate` runs workflow visibility and authorization checks. `route` exits with 0 when the transaction is routable and 1 when no synchronizer qualifies.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | SAFE / PASS / ROUTABLE |
| 1 | UNSAFE / BLOCKED / NO VALID SYNCHRONIZER |
| 2 | UNSUPPORTED / WARNING |
| 3 | INPUT_ERROR |
| 4 | BINDING_ERROR |
| 5 | ACTOR_ERROR |
| 6 | SCHEMA_ERROR |

## Input Formats

**Contract interface JSON** (`--schema`):

```json
{
  "version": "1.0",
  "templates": [
    {
      "name": "Bond",
      "packageId": "bond-pkg",
      "signatories": ["Issuer"],
      "observers": ["Investor", "Regulator"],
      "choices": [
        { "name": "Settle", "controllers": ["Issuer"], "consuming": true }
      ]
    }
  ]
}
```

**Topology configuration JSON** (`--topology`):

```json
{
  "version": "1.0",
  "synchronizers": [
    { "id": "issuance-synchronizer" },
    { "id": "settlement-synchronizer" }
  ],
  "participants": [
    {
      "id": "issuerNode",
      "synchronizers": ["issuance-synchronizer"],
      "parties": ["Issuer"]
    },
    {
      "id": "investorNode",
      "synchronizers": ["issuance-synchronizer", "settlement-synchronizer"],
      "parties": ["Investor"]
    }
  ]
}
```

Optional fields: `priority` on a synchronizer and `vettedPackages` on a participant (both used by `route`). Files that use the CCRE 0.1 field name `domains` are still accepted.

**Transaction JSON** (`--tx`, for `route`):

```json
{
  "version": "1.0",
  "name": "Settle Amulet-for-Bond DvP",
  "submitter": "Venue",
  "inputs": [
    { "template": "AmuletAllocation", "location": "global-synchronizer" },
    { "template": "BondAllocation", "location": "bond-private-synchronizer" }
  ]
}
```

**Workflow intent JSON** (`--intent`):

```json
{
  "pattern": "DvP",
  "steps": [
    { "action": "Lock", "template": "Bond", "role": "issuer" },
    { "action": "Settle", "template": "Bond", "role": "investor" }
  ],
  "roles": {
    "issuer": "Issuer",
    "investor": "Investor"
  }
}
```

## Fixtures

| Fixture | Mode | Result | Demonstrates |
|---------|------|--------|-------------|
| `dvp-amulet/` | Routing | NO VALID SYNCHRONIZER → ROUTABLE | Canton Coin ↔ private-synchronizer DvP |
| `topology-blocked/` | Topology | BLOCKED | Issuer not hosted on settlement-synchronizer — CCRE-003 |
| `topology-pass/` | Topology | PASS | All stakeholders hosted on all synchronizers |
| `passing/` | Workflow | SAFE | Standard DvP — all checks pass |
| `failing-visibility/` | Workflow | UNSAFE | Actor cannot see target contract |
| `failing-auth/` | Workflow | UNSAFE | Actor is not a controller |
| `fix-demo/` | Workflow | UNSAFE → SAFE | Full detect → fix → verify cycle |
| `unsupported-multi-controller/` | Workflow | UNSUPPORTED | Multi-controller choice rejection |

## Architecture

```
contracts.json + topology.json
        │
        ▼
  ┌─────────────┐
  │  Parse + Zod │──▶ INPUT_ERROR (invalid schema)
  │  validation  │
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  Workflow  Topology
  checks    analysis
    │         │
    ▼         ▼
  ┌──────┐  ┌──────────────┐
  │Visi- │  │ Party →      │
  │bility│  │ synchronizer │
  └──┬───┘  └──────┬───────┘
     ▼              ▼
  ┌──────┐  ┌──────────────┐
  │Auth  │  │ Infer exec   │
  │      │  │ synchronizers│
  └──┬───┘  └──────┬───────┘
     ▼              ▼
  ┌──────┐  ┌──────────────┐
  │SAFE/ │  │ CCRE-003     │
  │UNSAFE│  │ Stakeholder  │
  │      │  │ hosting      │
  └──────┘  └──────┬───────┘
                    ▼
            ┌──────────────┐
            │ PASS/BLOCKED │
            └──────────────┘
```

`route` shares the parser and evaluates each synchronizer against the transaction's inputs.

## Roadmap

The next steps are proposed for funding in the Canton Dev Fund ([PR #142](https://github.com/canton-foundation/canton-dev-fund/pull/142)):

- **M1 — Real inputs and routing checks:** DAR ingestion, topology export from a live participant, package-vetting (CCRE-020) and reassignment-feasibility (CCRE-011) checks, each blocking check reproduced on a two-synchronizer Canton 3.5 LocalNet
- **M2 — Contract-key and cross-synchronizer reference safety:** CCRE-001 (Canton 3.5 non-unique contract-key hazards) and CCRE-010
- **M3 — Distribution:** `dpm ccre` DPM component, GitHub Action, npm package
- **M4 — Adoption:** teams running CCRE in CI on their own code and topology

## Running Tests

```bash
npm test
```

29 tests across 6 test files. Covers workflow validation (parser, resolver, pipeline, certificate), multi-synchronizer topology analysis (CCRE-003 scenarios, legacy topology format) and the routing dry-run.

## License

MIT
