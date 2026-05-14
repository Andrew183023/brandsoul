# BrandSoul

## Sovereign Institutional Cognitive Runtime

BrandSoul is a sovereign institutional cognitive runtime architecture.

It is not an AI wrapper, not a generic chatbot platform, not a simple orchestration layer, and not an autonomous AGI system.

The active operational core is in `backend/` and is focused on:

- replay-safe governance
- institutional continuity
- mutation sovereignty
- semantic replay integrity
- deterministic operational lineage
- distributed sovereignty foundations

Repository surfaces:

- `backend/`: current TypeScript runtime and governance system
- `brandsoul-frontend/`: React client for admin/public runtime projections
- `brandsoul/`: legacy FastAPI surface retained for compatibility and migration boundaries

## Current Runtime Capabilities

Status legend:

- `REAL`: implemented and actively used by runtime paths and tests
- `PARTIAL`: implemented in meaningful scope but with known operational gaps
- `FOUNDATION ONLY`: structural primitives exist, but production-grade distributed behavior is not complete

| Capability | Status | Reality Statement |
| --- | --- | --- |
| Runtime Governance | REAL | Runtime subsystem startup health is tracked and capability gating is enforced by mode. |
| Replay Governance | REAL | Replay verification and freeze policies exist and are enforced in governance paths. |
| Recovery Sovereignty | PARTIAL | Governed recovery, attestation, and unlock logic exist, but distributed recovery orchestration is incomplete. |
| Institutional Continuity Governance | REAL | Continuity mode, unsafe shutdown tracking, and governed startup/shutdown checks are implemented. |
| Mutation Idempotency | REAL | Command execution ledger and idempotent mutation behavior are implemented for sovereign mutation flows. |
| Sovereign Mutation Gate | REAL | Mutation authority is fail-closed and institutional gate checks are enforced before protected writes. |
| Semantic Replay Hydration | REAL | Replay shape integrity and semantic replay hydration guards are implemented and tested. |
| Persistence Coordination | PARTIAL | Persistence arbitration services exist with coordination semantics, but distributed arbitration is not complete. |
| Distributed Sovereignty Foundation | FOUNDATION ONLY | Node identity, lineage, attestation, and split-brain primitives exist without consensus or quorum write control. |
| Hermetic CI/Test Isolation | PARTIAL | Hermetic bootstrap, network guard, isolated runtime mode, and test DB isolation exist; full suite convergence is still in progress. |

## Architecture Overview

### FlowMind

FlowMind is the cognitive runtime layer that produces decision envelopes and memory-aware action intent. It does not directly mutate sovereign state. Decisions are passed into governed execution paths where policy, authority, and idempotency are applied.

### Runtime Governance Layer

Runtime governance tracks subsystem readiness and failure states, then maps those states to capability decisions. It supports mode transitions and blocks high-risk operations when runtime safety conditions degrade.

### Institutional Recovery Layer

Institutional recovery governs restart safety, continuity attestation, replay verification dependencies, and unlock conditions. Runtime startup is not treated as unconditional; startup is evaluated against continuity and recovery criteria.

### Sovereign Mutation Layer

Sovereign mutation enforces authority boundaries and mutation gate controls, then executes protected writes through command-driven paths with execution ledger checks and idempotency guarantees.

### Semantic Replay Layer

Semantic replay hydration reconstructs replay outputs under contract checks for shape and replay integrity. It is designed to preserve semantic continuity while blocking invalid replay payload conditions.

### Persistence Coordination Layer

Persistence coordination manages mutation/persistence ordering and arbitration semantics to reduce unsafe state divergence across runtime and governance concerns.

### Distributed Sovereignty Layer

Distributed sovereignty is currently a single-node sovereignty system with distributed foundation primitives. It is not a complete distributed consensus runtime.

Current truth:

- single-node sovereignty is real
- distributed sovereignty is foundation-stage only

## Governance Principles

- fail-closed governance: if governance confidence or authority conditions fail, mutation is blocked
- append-only lineage: operational evidence and attestation flows favor append behavior over mutable history
- replay-safe execution: replay paths are governed, verified, and isolated from uncontrolled side effects
- deterministic mutation lineage: command IDs and ledger-backed replay protection enforce idempotent mutation history
- continuity attestation: startup/shutdown and runtime continuity signals are persisted for institutional traceability
- semantic replay integrity: replay payload and shape constraints are validated to prevent semantic corruption
- capability governance: runtime capabilities are enabled/disabled according to governance mode and risk
- persistence arbitration: persistence coordination services arbitrate write safety semantics

## Current Runtime Modes

- `normal`: all governed capabilities available under policy and authority constraints
- `degraded`: runtime remains available with high-risk capability blocking and degraded-readiness metadata
- `recovery_required`: institutional continuity/recovery requires remediation before full capability unlock
- `institutional_safe`: continuity state indicates guarded-safe operation with governance and attestation alignment
- `isolated_test`: hermetic test mode with runtime side effects and external providers disabled unless explicitly enabled

## Recovery Model

Recovery behavior is governed, not ad hoc.

Implemented recovery model characteristics:

- governed recovery: recovery flows pass through institutional governance checks
- continuity attestation: runtime continuity evidence is persisted and evaluated
- unsafe shutdown detection: shutdown integrity state is tracked and affects restart policy
- replay-safe restart: startup validation includes replay safety and continuity dependencies
- institutional unlock process: runtime unlock is conditional, not automatic
- recovery lineage: recovery events and continuity state produce auditable lineage records

## Hermetic CI

Hermetic CI/test isolation foundations are implemented for backend testing:

- hermetic test bootstrap: test-only environment bootstrap is loaded before suites
- isolated runtime mode: autonomous loops and side-effect-heavy startup behavior are disabled by default in tests
- external provider disabling: external market/provider integrations are disabled under hermetic flags
- no outbound network policy: test network guard blocks outbound HTTP unless allowlisted
- temporary SQLite strategy: tests use isolated temporary sqlite paths rather than repository-local databases
- deterministic test isolation: test env defaults and runtime mode are explicitly set by bootstrap

Current status note:

- this is an active foundation and substantial behavior is live
- full matrix pass convergence is still being hardened

## Distributed Foundation (Foundation Only)

Implemented foundation primitives:

- node identity
- distributed lineage records
- distributed attestation records
- split-brain detection primitives
- replay federation metadata
- quorum modeling constructs

Not implemented (explicitly absent today):

- distributed consensus
- quorum writes
- distributed failover orchestration
- split-brain resolution protocol
- multi-writer arbitration
- Raft/Paxos-style coordination

This is foundation only, not full distributed sovereignty.

## Current Limitations

- single-writer topology remains the operational reality
- distributed consensus is absent
- auth sovereignty is still partial
- distributed recovery orchestration is incomplete
- quorum authority is modeled but not fully enforced for distributed writes
- distributed persistence arbitration is incomplete
- hermetic CI is implemented but not yet fully converged across every targeted suite

## Development And Testing

Backend baseline commands:

```bash
cd backend
npm ci
npm run build
npm test
```

Hermetic strategy:

- tests run through bootstrap-backed isolation
- isolated test runtime mode is default for CI-safe behavior
- hermetic suite execution is available through `npm run test:hermetic`
- CI readiness audit is available through `npm run ci:readiness`

## Repository Safety

- local DB files are ignored and should not be relied on for test truth
- `.env` and `.env.local` files are not committed and are not required by hermetic tests
- CI is designed to run isolated from local machine state
- `RENDER_DEPLOY_MODE` safety must be explicit; test/CI contexts must not behave as production deploy mode

## Scope Honesty

BrandSoul currently provides a serious governance-oriented runtime core with replay, continuity, mutation, and lineage controls.

It does not currently provide a complete distributed consensus runtime, multi-writer distributed arbitration, or unconstrained autonomous execution.

Client/UI
   ↓
Runtime Governance
   ↓
FlowMind
   ↓
Sovereign Mutation Gate
   ↓
Semantic Replay Layer
   ↓
Persistence Coordination
   ↓
Distributed Sovereignty Foundation

## Current Operational Truth

Current production/runtime reality:

- single-node institutional sovereignty is operational
- replay governance is active
- mutation idempotency is active
- semantic replay hydration is active
- distributed sovereignty is foundation-stage only
- distributed consensus is not implemented

BrandSoul exists to explore governed cognitive runtime architectures where operational continuity, replay safety, mutation authority, and institutional traceability matter more than unconstrained autonomy.