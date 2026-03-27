# CCRE — Canton Composition Reasoning Engine

Deterministic pre-execution validation for multi-application Canton workflows. Detects visibility and authorization violations before deployment.

Canton guarantees correctness of execution, not correctness of composition. CCRE fills that gap.

Without CCRE, multi-application workflows are validated through trial-and-error after deployment — leading to failed transactions, silent authorization errors, and costly debugging across institutional boundaries.

CCRE operates on contract interfaces derived from Daml packages (DAR files), enabling static validation without requiring a running Canton node or active ledger connection.

## Prerequisites

- Node.js >= 20.0.0
- npm

## Quick Start

```bash
npm install
npx tsx src/cli.ts validate --schema fixtures/passing/contracts.json --intent fixtures/passing/intent.json
```

## Demo: FAIL → FIX → PASS

The strongest way to understand CCRE is to see it catch a real problem and guide the fix.

**1. Run against a broken contract model:**

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

Without CCRE, this workflow would fail at runtime when Investor attempts to access Bond — with no pre-deployment warning.

**2. Apply the fix and re-validate:**

```bash
npx tsx src/cli.ts validate \
  --schema fixtures/fix-demo/contracts-fixed.json \
  --intent fixtures/fix-demo/intent.json
```

```
RESULT: SAFE

All checks passed.
Certificate written to: ./ccre-cert.json
```

**3. Inspect the certificate:**

```bash
cat ccre-cert.json
```

The certificate is a reproducible proof that the workflow was validated under specific contract interfaces and intent. Same inputs always produce identical output, byte for byte. It can be integrated into CI pipelines, audit trails, or governance processes.

## What It Checks

**Visibility** — Can the actor see the target contract? In Canton, only signatories and observers have visibility. CCRE checks `actor ∈ (signatories ∪ observers)` for every step.

**Authorization** — Is the actor allowed to exercise the choice? Canton requires the actor to be a controller. CCRE checks `actor == choice.controller` for single-controller choices. Multi-controller choices are marked `UNSUPPORTED` rather than approximated.

## CLI Usage

```bash
npx tsx src/cli.ts validate --schema <path> --intent <path> [--json] [--cert <path>]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--schema` | yes | Path to contract interface JSON |
| `--intent` | yes | Path to workflow intent JSON |
| `--json` | no | Machine-readable JSON output |
| `--cert` | no | Certificate output path (default: `./ccre-cert.json`) |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | SAFE |
| 1 | UNSAFE |
| 2 | UNSUPPORTED |
| 3 | INPUT_ERROR |
| 4 | BINDING_ERROR |
| 5 | ACTOR_ERROR |
| 6 | SCHEMA_ERROR |

## Fixtures

| Fixture | Verdict | Demonstrates |
|---------|---------|-------------|
| `passing/` | SAFE | Standard DvP — all checks pass |
| `failing-visibility/` | UNSAFE | Actor cannot see target contract |
| `failing-auth/` | UNSAFE | Actor is not a controller of the choice |
| `fix-demo/` | UNSAFE → SAFE | Full detect → fix → verify cycle |
| `unsupported-multi-controller/` | UNSUPPORTED | Multi-controller choice rejection |

## Validation Pipeline

```
contracts.json + intent.json
        │
        ▼
  ┌─────────────┐
  │  Parse + Zod │──▶ INPUT_ERROR (invalid schema)
  │  validation  │──▶ INPUT_ERROR (controller ⊄ stakeholders)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │   Resolve    │──▶ BINDING_ERROR (unknown template)
  │   bindings   │──▶ ACTOR_ERROR (unknown party)
  └──────┬──────┘──▶ SCHEMA_ERROR (unknown choice)
         ▼
  ┌─────────────┐
  │    Build     │
  │    chain     │
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Visibility  │──▶ VISIBILITY violations
  │  validator   │
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │    Auth      │──▶ AUTHORIZATION violations
  │  validator   │──▶ UNSUPPORTED constructs
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │   Verdict    │──▶ SAFE / UNSAFE / UNSUPPORTED
  │  + report    │
  └─────────────┘
```

Verdict priority: `UNSUPPORTED > UNSAFE > SAFE`

## Scope and Limitations

CCRE validates structural correctness of workflow composition against contract interfaces. It does not validate:

- Execution ordering constraints (Milestone 2)
- Direct DAR parsing to eliminate manual schema definition (Milestone 3)
- Runtime ledger state or contract instance data
- Business logic beyond visibility and authorization
- Privacy policy constraints

## Running Tests

```bash
npm test
```

## License

MIT
