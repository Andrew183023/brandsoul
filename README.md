# BrandSoul

## 1. Project Overview

BrandSoul today is a multi-surface software system for running brand-facing entities with controlled decision logic, persisted state, and an economic funnel. The current repository contains three relevant application surfaces:

- `backend/`: the current TypeScript backend where FlowMind orchestration, sovereign mutation control, the multi-entity runtime, and the portfolio/economic loop are implemented.
- `brandsoul-frontend/`: the React frontend that consumes backend projections and admin/public routes.
- `brandsoul/`: a legacy FastAPI application that still exists in the repository for older product flows and supporting services.

The operational core described in this document lives in `backend/`.

### System relationship

- **BrandSoul** is the product and repository boundary.
- **FlowMind** is the decision and cognitive layer used by the TypeScript backend.
- The **multi-entity system** manages isolated runtime state, goals, risk, autonomy level, approval state, and recent decision snapshots per entity.
- The **portfolio system** derives signals, routes leads, tracks funnel progression, reconciles converted revenue, and feeds outcome learning back into entity memory and portfolio metrics.

In practical terms, BrandSoul currently operates as a command-driven entity system where FlowMind proposes or informs actions, the sovereign backend controls mutation, and the portfolio layer measures commercial outcomes.

## 2. Core Architecture

### 2.1 FlowMind

FlowMind is the cognitive engine implemented in `backend/src/flowmind` and exposed to the orchestrator through `backend/src/services/flowMindService.ts`.

#### Decision model

The current decision contract is `FlowMindDecisionV2` in `backend/src/flowmind/types/flowMindDecision.ts`.

It includes:

- `intent`, `action`, and `confidence`
- a deterministic `decisionHash`
- a structured `responsePlan`
- explicit `memoryReadSet`
- explicit `memoryWritePlan`
- explicit `expectedStateChanges`
- optional metadata for memory influence and behavioral influence

The backend normalizes and hashes decision input so repeated evaluation of the same semantic input produces the same decision envelope unless the memory state changes.

#### Memory system

Entity cognitive memory is persisted per entity and includes:

- cognitive state
- strategy profile
- policy profile
- adaptive decision profile
- historical signals
- episodic memory

The current implementation reads and writes this state through `backend/src/flowmind/memory` and persists it through `backend/src/repositories/entityCognitiveMemoryRepository.ts`.

#### Autonomy policy

FlowMind does not receive unrestricted execution authority.

The backend evaluates:

- comparison against the legacy/orchestrator decision path
- divergence and stability metrics
- fallback rate and adaptive success rate
- recent error rate and decision stability
- safe, prohibited, and future command zones

This policy lives in `backend/src/orchestrator/flowMindAuthorityPolicy.ts`. The current contract supports `manual`, `supervised`, `partial`, and `autonomous` levels, but only specific action types and command zones are eligible for higher authority.

### 2.2 Sovereign Command System

The sovereign mutation layer is implemented primarily in `backend/src/orchestrator/sovereignMutationCommandService.ts`.

Its role is to ensure that state mutation happens through explicit commands instead of ad hoc repository writes.

Current responsibilities include:

- lead routing and lifecycle transitions
- approval handling
- entity persistence
- event append flows
- legal-case related mutations
- revenue event persistence
- outcome learning updates

#### Executor

FlowMind action execution is handled through `backend/src/brain/flowmind/flowMindActionExecutor.ts` and the operational orchestration path in `backend/src/orchestrator/flowMindOperationalService.ts`.

The executor validates actions, applies policy, emits follow-up commands, generates UI effects and scheduled tasks, and runs protected mutations inside an authority context.

#### Idempotency

Idempotency is implemented with command IDs plus execution ledger checks. Replayed commands are detected and returned as unchanged when the ledger already contains a committed record for the same command.

#### Ledger

The execution ledger is persisted through `backend/src/repositories/flowMindExecutionLedgerRepository.ts`.

Current ledger states are:

- `pending`
- `committed`
- `rolled_back`
- `failed`

This ledger is used to make command replay safe and to prevent duplicate event append or duplicate state transitions.

### 2.3 Entity Runtime

The entity runtime loop is implemented in `backend/src/orchestrator/entityRuntimeLoop.ts`.

It runs a controlled loop with the following phases:

- observe
- evaluate
- execute
- cooldown

The runtime derives scores such as:

- health score
- lead generation score
- memory confidence
- autonomy readiness
- risk score
- goal priority score
- episodic memory relevance

It also prioritizes active goals and evaluates triggers such as:

- lead score drop
- growth stagnation
- opportunity detected
- memory pattern detected
- portfolio gap detected

Autonomy level affects the loop interval and whether certain actions can proceed directly, require approval, or are blocked.

## 3. Economic Loop (Real State)

The implemented economic loop in the TypeScript backend is:

`signal -> lead -> funnel -> outcome -> revenue -> learning`

### What is implemented and persisted

#### Routed leads

Portfolio signals are derived and persisted, then routed into leads per entity. The portfolio layer currently works with explicit persisted records for signals, leads, proposals, revenue events, and entity metrics.

#### Lead lifecycle

The current lead lifecycle is persisted with these practical states:

- routed
- qualified
- contacted
- converted
- lost

Lifecycle timestamps and transition events are stored. Current tests validate:

- manual lifecycle progression
- autonomous progression from routed to converted when thresholds are met
- autonomous loss marking when timeout or failure signals are present
- replay safety for converted and lost leads

#### Reconciled revenue model

Converted revenue is not read only from the lead row. It is reconciled through a dedicated revenue event model persisted in `entity_portfolio_lead_revenue_event` and surfaced back into:

- lead payload metadata
- funnel metrics
- per-entity portfolio metrics

The current reconciled model stores values such as:

- amount
- invoice ID
- payment ID
- contract ID
- validation method

#### Outcome-based learning

Lead outcomes are fed back into entity cognitive memory and registry state. Converted and lost outcomes create learning signals that affect later opportunity scoring and preserve lifecycle path history in episodic memory.

### What is real today

- signals are persisted
- routed leads are persisted
- lifecycle transitions are persisted
- converted revenue events are persisted
- funnel and portfolio metrics are computed from persisted records
- outcome learning writes back into memory and runtime state
- replay protection is validated in tests

### What is not yet fully real

- there is no general-purpose autonomous external fulfillment layer that independently closes the loop with third-party systems end to end
- reconciled revenue accepts externally validated identifiers and methods, but the repository does not yet implement a broad connector framework for invoice, payment, or CRM systems
- execution remains controlled by internal commands, workers, and approval boundaries rather than unconstrained external automation

## 4. Market Intelligence

Market intelligence is partially implemented inside the portfolio layer.

### Implemented direction

The current system derives opportunity and commercial pressure from:

- recent social and public interaction signals
- marketplace demand signals for legal entities
- performance gaps
- content opportunity gaps
- persisted lead conversion outcomes
- reconciled revenue contribution
- per-entity risk and autonomy readiness

Current read models compute:

- `opportunityScore`
- `conversionScore`
- `revenuePotential`
- `cacEstimate`
- `ltvEstimate`
- `roiEstimate`

### Limitations

- the system is currently driven mainly by internal and first-party signals, not by live external market feeds
- scoring is deterministic and heuristic-based, not a statistical model trained on external datasets
- the implementation is useful for prioritization and routing, but it is not a standalone market intelligence platform

## 5. Safety And Guarantees

### No mutation outside the sovereign command system

The repository enforces a mutation authority boundary in `backend/src/sovereignty/authorityBoundary.ts`. Protected mutation paths log their caller chain and throw if they are executed outside the executor authority context.

### Idempotency guarantees

Command handlers consult the execution ledger before mutating state. If a committed command is replayed, the handler returns the current persisted result without duplicating effects.

### Replay safety

Replay safety is currently validated for lead conversion, lost-lead handling, and other sovereign command paths that depend on the execution ledger.

### Authority boundary enforcement

FlowMind decisions do not directly mutate state. They pass through:

- policy checks
- safe action mapping
- executor validation
- sovereign command handling
- transaction boundaries

This keeps side effects auditable and bounded.

## 6. Current Capabilities

Only the following capabilities are documented here because they are implemented and validated in the current backend:

- autonomous lead funnel progression under controlled conditions
- revenue reconciliation for converted leads
- outcome-based learning written into entity cognitive memory
- multi-entity isolation for memory, events, and runtime state
- decision scoring for divergence, stability, fallback, risk, conversion, and opportunity

## 7. Limitations

- there is no full autonomous external execution layer for arbitrary third-party systems
- the system depends on controlled loops, background workers, and explicit sovereign command handlers
- market intelligence is partial and largely first-party; there is no live general external ingestion mesh
- the FlowMind service still supports degraded and fallback modes when the cognitive adapter is unavailable
- parts of the repository still include legacy application surfaces, including the FastAPI app in `brandsoul/`
- some backend routes still contain legacy fallback paths in adjacent domains such as case access and migration boundaries

## 8. Development

### Run the current backend

```bash
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

The current TypeScript backend entrypoint is `src/server.ts`.

### Run backend tests

```bash
cd backend
npm test
```

The backend test runner resolves all `*.test.ts` files under `backend/src` through `backend/scripts/run-tests.mjs`.

### Minimum checks before commit

At minimum, these commands should pass before committing backend work:

```bash
cd backend
npm run build
npm test
```

If a change touches the React application, `brandsoul-frontend` should also build successfully before commit.

### Git warning

Do not use `git add .` in this repository.

The repository frequently contains local databases, temporary assets, frontend work in progress, and other unrelated changes. Stage explicit paths only.

## 9. Architecture Principles

- **FlowMind is the decision source of truth inside the TypeScript backend.** The orchestrator still compares and governs it, but behavior should not be reimplemented in the frontend.
- **The system is command-driven.** Mutations are represented as commands and logged effects instead of direct repository edits.
- **No side effects outside the executor boundary.** Protected mutations require an authority context.
- **Determinism is preferred.** Decision normalization, hashing, replay checks, and ledger-backed execution are used to keep behavior auditable.

## 10. Roadmap

Near-term work that follows directly from the current implementation:

- harden the external execution bridge around controlled third-party confirmation paths
- expand market signal ingestion beyond current first-party and derived signals
- connect more real-world feedback into the learning loop with less manual bridging

## Repository Structure

```text
flow_core_group/
├── backend/              # Current TypeScript backend and FlowMind orchestration layer
├── brandsoul-frontend/   # React frontend
├── brandsoul/            # Legacy FastAPI application still present in the repo
└── README.md
```