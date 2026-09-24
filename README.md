# CCRE — Canton Composition Reasoning Engine

Topology-aware protocol safety checker for Canton multi-domain deployments.

Canton guarantees correctness of execution within a single domain, but not correctness of composition across domains. When Daml workflows span multiple synchronizers, failures emerge that are invisible at the code level — they only surface at runtime when topology configuration violates Canton protocol constraints.

CCRE analyzes Daml contract interfaces together with multi-domain topology configuration to detect these failures before deployment. No running Canton node or active ledger connection is required.

**Currently implemented (M1):**

- **CCRE-003: Stakeholder hosting validation** (CRITICAL) — Checks that all stakeholders (signatories and observers) are hosted on every domain where a template may execute. Canton requires this for contract creation, key operations, and reassignment. Violations cause deterministic runtime failure.
- **Visibility validation** — Checks `actor ∈ (signatories ∪ observers)` for every workflow step.
- **Authorization validation** — Checks `actor == choice.controller` for single-controller choices.
- **Deterministic certificate generation** — SHA-256 reproducible proof of validation.

**Planned for M2:**

- CCRE-001: Cross-domain key ambiguity detection (`fetchByKey`/`exerciseByKey` resolving to wrong contract)
- CCRE-010: Cross-domain contract reference risk (`ContractId` on different domain requiring reassignment)
- Interaction graph construction with bounded 2-hop domain inference
- Reference-level cross-suppression between checks

## Prerequisites

- Node.js >= 20.0.0
- npm

## Quick Start

```bash
npm install
```

### Single-Domain Validation (Visibility + Authorization)

```bash
npx tsx src/cli.ts validate --schema fixtures/passing/contracts.json --intent fixtures/passing/intent.json
```

### Multi-Domain Topology Analysis

```bash
npx tsx src/cli.ts validate --schema fixtures/topology-blocked/contracts.json --topology fixtures/topology-blocked/topology.json
```

```
CCRE v0.1.0 — Multi-domain topology analysis
Analyzing: 2 templates across 2 domains

DEPLOYMENT DECISION: BLOCKED

4 CRITICAL finding(s) — deployment blocked

[CRITICAL] CCRE-003: Bond
  Party: Issuer
  Domain: settlementDomain
  Issue: Key maintainer "Issuer" is not hosted on execution domain "settlementDomain"
  Impact: Key operations on Bond will fail on settlementDomain
  Canton protocol: This operation WILL fail at runtime
```

Without CCRE, this misconfiguration would only surface as a failed transaction at runtime — with no pre-deployment warning and no indication of root cause.

## Demo: BLOCKED → FIX → PASS

**1. Run against a misconfigured multi-domain topology:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/topology-blocked/contracts.json \
  --topology fixtures/topology-blocked/topology.json
```

Issuer is hosted only on `issuanceDomain`, but Bond can execute on `settlementDomain` (via Investor). Canton requires all stakeholders to be hosted on every execution domain. CCRE catches this.

**2. Run against a correctly configured topology:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/topology-pass/contracts.json \
  --topology fixtures/topology-pass/topology.json
```

```
DEPLOYMENT DECISION: PASS

All stakeholders are reachable on all execution domains.
No multi-domain deployment risks detected.
```

**3. Single-domain FAIL → FIX → PASS cycle:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/fix-demo/contracts-broken.json \
  --intent fixtures/fix-demo/intent.json
```

```
RESULT: UNSAFE (Visibility violation at step-3)

[VISIBILITY] step-3: Claim on Bond
  Actor: Investor
  Reason: Investor is not a signatory or observer of Bond
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

The DSO party is hosted only by Super Validator nodes on the Global Synchronizer, so Canton Coin can never move to the private synchronizer. The only fix is for the bond issuer's participant to connect to the Global Synchronizer. With `topology-fixed.json`, CCRE confirms the route and the reassignment the router will perform:

```
ROUTING DECISION: ROUTABLE → global-synchronizer
  reassign BondAllocation: bond-private-synchronizer → global-synchronizer
```

Participants may list `vettedPackages`, in which case the dry-run also blocks synchronizers where hosting participants have not vetted an input package. Synchronizers may set `priority`.

## What It Checks

### Multi-Domain Topology Analysis (`--topology`)

**CCRE-003: Stakeholder Hosting** (CRITICAL) — Checks that all stakeholders (signatories and observers) are hosted on every domain where a template may execute. Three failure surfaces: key maintainer not on domain, signatory of created contract not on domain, observer blocking reassignment.

### Single-Domain Composition Validation

**Visibility** — Can the actor see the target contract? Canton requires `actor ∈ (signatories ∪ observers)`.

**Authorization** — Is the actor allowed to exercise the choice? Canton requires `actor == choice.controller`. Multi-controller choices are marked UNSUPPORTED rather than approximated — CCRE prioritizes correctness over coverage.

## CLI Usage

```bash
npx tsx src/cli.ts validate --schema <path> --intent <path> [--topology <path>] [--json] [--cert <path>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--schema` | yes | Path to contract interface JSON |
| `--intent` | for single-domain | Path to workflow intent JSON |
| `--topology` | for multi-domain | Path to topology configuration JSON |
| `--json` | no | Machine-readable JSON output |
| `--cert` | no | Certificate output path (default: `./ccre-cert.json`) |

When `--topology` is provided, CCRE runs multi-domain topology analysis (CCRE-003). Without it, CCRE runs single-domain visibility and authorization checks.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | SAFE / PASS |
| 1 | UNSAFE / BLOCKED |
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
  "domains": [
    { "id": "issuanceDomain" },
    { "id": "settlementDomain" }
  ],
  "participants": [
    {
      "id": "issuerNode",
      "domains": ["issuanceDomain"],
      "parties": ["Issuer"]
    },
    {
      "id": "investorNode",
      "domains": ["issuanceDomain", "settlementDomain"],
      "parties": ["Investor"]
    }
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
| `topology-blocked/` | Multi-domain | BLOCKED | Issuer not hosted on settlementDomain — CCRE-003 |
| `topology-pass/` | Multi-domain | PASS | All stakeholders hosted on all domains |
| `passing/` | Single-domain | SAFE | Standard DvP — all checks pass |
| `failing-visibility/` | Single-domain | UNSAFE | Actor cannot see target contract |
| `failing-auth/` | Single-domain | UNSAFE | Actor is not a controller |
| `fix-demo/` | Single-domain | UNSAFE → SAFE | Full detect → fix → verify cycle |
| `unsupported-multi-controller/` | Single-domain | UNSUPPORTED | Multi-controller choice rejection |

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
  Single    Multi-domain
  domain    (--topology)
    │         │
    ▼         ▼
  ┌──────┐  ┌──────────────┐
  │Visi- │  │ Build party  │
  │bility│  │ domain map   │
  └──┬───┘  └──────┬───────┘
     ▼              ▼
  ┌──────┐  ┌──────────────┐
  │Auth  │  │ Infer exec   │
  │      │  │ domains      │
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

## Roadmap

Milestone 1 (delivered) validates local correctness (visibility and authorization), which forms the foundation for topology-aware analysis. Milestone 2 extends this with the three core multi-domain checks against topology configuration:

- **M2:** CCRE-001 (cross-domain key ambiguity), CCRE-010 (cross-domain contract reference risk), interaction graph construction, reference-level cross-suppression
- **M3:** Direct DAR parsing to eliminate manual contract interface definition
- **M4:** Ecosystem adoption, production hardening, CI integration patterns

## Running Tests

```bash
npm test
```

23 tests across 5 test files. Covers single-domain validation (parser, resolver, pipeline, certificate) and multi-domain topology analysis (topology pipeline with CCRE-003 scenarios).

## License

MIT
