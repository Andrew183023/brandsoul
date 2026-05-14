import { createHash, randomUUID } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type {
  InstitutionalContinuityCapability,
  InstitutionalContinuityGovernanceService,
  InstitutionalContinuityRiskLevel,
} from '../services/institutionalContinuityGovernanceService.js'
import type { ObservabilityService } from '../services/observabilityService.js'
import type { InstitutionalRecoveryGovernanceService } from '../services/institutionalRecoveryGovernanceService.js'
import type {
  RuntimeContinuityAttestationService,
  RuntimeReplayVerificationState,
  RuntimeAttestationIntegrity,
} from '../services/runtimeContinuityAttestationService.js'
import type {
  RuntimeGovernanceCapability,
  RuntimeGovernanceService,
  RuntimeRiskLevel,
} from '../services/runtimeGovernanceService.js'
import { runWithMutationAuthority } from './authorityBoundary.js'
import { buildMutationAuthorityGraph } from './mutationAuthorityGraph.js'
import {
  buildSovereignMutationLineageHash,
  createSovereignMutationIdempotencyService,
  type SovereignMutationIdentity,
  type ReplayEquivalentMutationResult,
} from './sovereignMutationIdempotency.js'
import type { SovereignPersistenceCoordinationService } from './sovereignPersistenceCoordinationService.js'

export type SovereignMutationContext = {
  mutationType: string
  mutationScope:
    | 'governance'
    | 'replay'
    | 'checkpoint'
    | 'queue'
    | 'auth'
    | 'runtime'
    | 'entity'
    | 'memory'

  requestedCapability: string

  runtimeMode: string
  continuityMode: string

  replayVerificationState: string
  attestationIntegrity: string

  recoveryRequired: boolean

  actor:
    | 'runtime'
    | 'governance'
    | 'admin'
    | 'public'
    | 'recovery'

  traceId: string
}

export type SovereignMutationAttestation = {
  mutationId: string
  mutationType: string
  mutationScope: string
  governanceDecision:
    | 'allowed'
    | 'blocked'
    | 'degraded_allowed'
  runtimeMode: string
  continuityMode: string
  replayVerificationState: string
  attestationIntegrity: string
  traceId: string
  lineageHash: string
  executed: boolean
  persisted: boolean
}

type EvaluateAndExecuteOptions<T> = {
  context: SovereignMutationContext
  authoritySource: string
  mutationId?: string
  semanticIntentId?: string
  replayFingerprint?: string
  continuityEpoch?: string
  effectFingerprint?: string
  onAttested?: (attestation: SovereignMutationAttestation) => Promise<void> | void
  replayEquivalentResult?: () => Promise<T> | T
  onReplayEquivalent?: (result: ReplayEquivalentMutationResult) => Promise<T> | T
  work: () => Promise<T>
}

type InstitutionalSovereignMutationGateOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  persistenceCoordination?: SovereignPersistenceCoordinationService
  runtimeGovernance?: RuntimeGovernanceService
  continuityGovernance?: InstitutionalContinuityGovernanceService
  runtimeContinuityAttestationService?: RuntimeContinuityAttestationService
  recoveryGovernance?: InstitutionalRecoveryGovernanceService
}

type EffectiveGovernanceState = {
  runtimeMode: string
  continuityMode: string
  replayVerificationState: RuntimeReplayVerificationState | string
  attestationIntegrity: RuntimeAttestationIntegrity | string
  recoveryRequired: boolean
  blockedCapabilities: string[]
}

let installedGate: InstitutionalSovereignMutationGate | null = null

function hashValue(value: string) {
  return createHash('sha256').update(value, 'utf-8').digest('hex')
}

function toContinuityCapability(context: SovereignMutationContext): InstitutionalContinuityCapability {
  switch (context.mutationScope) {
    case 'auth':
      return 'auth.authority.transition'
    case 'governance':
    case 'queue':
      return 'governance.approval'
    case 'replay':
      return 'governance.replay.generate'
    case 'runtime':
    case 'checkpoint':
      return 'adaptive.runtime.mutation'
    case 'entity':
    case 'memory':
    default:
      return 'sovereign.mutation'
  }
}

function toRuntimeCapability(context: SovereignMutationContext): RuntimeGovernanceCapability {
  if (context.actor === 'public') {
    return 'public.interaction.action.execute'
  }

  return 'orchestrator.command.execute'
}

function toRuntimeRiskLevel(): RuntimeRiskLevel {
  return 'high'
}

function toContinuityRiskLevel(): InstitutionalContinuityRiskLevel {
  return 'high'
}

function buildLineageFallback(context: SovereignMutationContext) {
  return hashValue([
    context.traceId,
    context.mutationType,
    context.mutationScope,
    context.requestedCapability,
  ].join(':'))
}

export class InstitutionalSovereignMutationBlockedError extends Error {
  readonly code = 'INSTITUTIONAL_SOVEREIGN_MUTATION_BLOCKED'
  readonly statusCode = 503

  constructor(
    readonly attestation: SovereignMutationAttestation,
    readonly blockedCapabilities: string[],
  ) {
    super('Institutional sovereign mutation gate blocked the requested mutation.')
    this.name = 'InstitutionalSovereignMutationBlockedError'
  }
}

export class InstitutionalSovereignMutationGate {
  private readonly idempotency

  private readonly replayEquivalentResultCache = new Map<string, unknown>()

  constructor(private readonly options: InstitutionalSovereignMutationGateOptions) {
    this.idempotency = createSovereignMutationIdempotencyService({
      db: this.options.db,
      observability: this.options.observability,
      logger: this.options.logger,
    })
  }

  async evaluateAndExecute<T>(args: EvaluateAndExecuteOptions<T>): Promise<T> {
    this.options.observability?.incrementMetric('institutional_mutation_attempt_total')

    const mutationId = args.mutationId ?? randomUUID()
    const state = this.readEffectiveGovernanceState(args.context)
    const continuityCheckpoint = await this.readLatestContinuityCheckpoint(args.context)
    const lineageHash = continuityCheckpoint.lineageHash
    const mutationLineageHash = buildSovereignMutationLineageHash({
      mutationType: args.context.mutationType,
      mutationScope: args.context.mutationScope,
      requestedCapability: args.context.requestedCapability,
      traceId: args.context.traceId,
      lineageHash,
      replayVerificationState: state.replayVerificationState,
      continuityMode: state.continuityMode,
    })
    const mutationIdentity = this.buildMutationIdentity({
      mutationId,
      mutationLineageHash,
      semanticIntentId: args.semanticIntentId,
      replayFingerprint: args.replayFingerprint,
      continuityEpoch: args.continuityEpoch ?? continuityCheckpoint.continuityEpoch,
      effectFingerprint: args.effectFingerprint,
      context: args.context,
    })

    const replayEquivalent = await this.idempotency.resolveReplayEquivalent(mutationIdentity)
    if (replayEquivalent) {
      await this.idempotency.registerDeduplicated(mutationIdentity)
      this.options.observability?.incrementMetric('sovereign_mutation_replay_equivalent_total')
      this.options.observability?.incrementMetric('checkpoint_replay_equivalent_total')
      this.options.logger?.info({
        event: 'sovereign-mutation.replay-equivalent',
        mutationId,
        mutationLineageHash,
        traceId: args.context.traceId,
      }, 'Replay-equivalent mutation detected')

      const persisted = await this.persistAttestation({
        mutationId: replayEquivalent.mutationId,
        mutationType: args.context.mutationType,
        mutationScope: args.context.mutationScope,
        governanceDecision: 'allowed',
        runtimeMode: state.runtimeMode,
        continuityMode: state.continuityMode,
        replayVerificationState: state.replayVerificationState,
        attestationIntegrity: state.attestationIntegrity,
        traceId: args.context.traceId,
        lineageHash: replayEquivalent.lineageHash,
        executed: true,
        persisted: true,
      })
      await args.onAttested?.(persisted)

      if (this.replayEquivalentResultCache.has(mutationLineageHash)) {
        const cached = this.replayEquivalentResultCache.get(mutationLineageHash) as T
        this.recordResultContractPreserved({
          source: 'cache',
          mutationId: replayEquivalent.mutationId,
          mutationLineageHash,
          replayResultShape: replayEquivalent.replayResultShape,
        })
        return cached
      }

      if (args.replayEquivalentResult) {
        const replayResult = await args.replayEquivalentResult()
        this.replayEquivalentResultCache.set(mutationLineageHash, replayResult)
        this.recordResultContractPreserved({
          source: 'callback',
          mutationId: replayEquivalent.mutationId,
          mutationLineageHash,
          replayResultShape: replayEquivalent.replayResultShape,
        })
        return replayResult
      }

      if (args.onReplayEquivalent) {
        const replayResult = await args.onReplayEquivalent(replayEquivalent)
        this.replayEquivalentResultCache.set(mutationLineageHash, replayResult)
        this.recordResultContractPreserved({
          source: 'legacy-callback',
          mutationId: replayEquivalent.mutationId,
          mutationLineageHash,
          replayResultShape: replayEquivalent.replayResultShape,
        })
        return replayResult
      }

      const safeReplayResult = this.buildSafeReplayEquivalentResult<T>({
        context: args.context,
        mutationLineageHash,
        replayEquivalent,
      })
      this.replayEquivalentResultCache.set(mutationLineageHash, safeReplayResult)
      this.recordResultContractPreserved({
        source: 'safe-fallback',
        mutationId: replayEquivalent.mutationId,
        mutationLineageHash,
        replayResultShape: replayEquivalent.replayResultShape,
      })
      return safeReplayResult
    }

    const blockedReason = this.resolveBlockedReason(args.context, state)
    const governanceDecision = blockedReason ? 'blocked' : 'allowed'

    const baseAttestation: SovereignMutationAttestation = {
      mutationId,
      mutationType: args.context.mutationType,
      mutationScope: args.context.mutationScope,
      governanceDecision,
      runtimeMode: state.runtimeMode,
      continuityMode: state.continuityMode,
      replayVerificationState: state.replayVerificationState,
      attestationIntegrity: state.attestationIntegrity,
      traceId: args.context.traceId,
      lineageHash,
      executed: false,
      persisted: false,
    }

    if (blockedReason) {
      this.options.observability?.incrementMetric('institutional_mutation_blocked_total')
      if (blockedReason === 'bypass_attempt') {
        this.options.observability?.incrementMetric('institutional_mutation_bypass_attempt_total')
      }

      const persisted = await this.persistAttestation({
        ...baseAttestation,
        persisted: true,
      })
      await this.idempotency.registerExecution({
        identity: mutationIdentity,
        lineageHash,
        executionState: 'blocked',
      })
      await args.onAttested?.(persisted)
      this.options.logger?.warn({
        event: 'institutional-mutation.blocked',
        blockedReason,
        mutationType: args.context.mutationType,
        mutationScope: args.context.mutationScope,
        traceId: args.context.traceId,
      }, 'Institutional mutation blocked')
      throw new InstitutionalSovereignMutationBlockedError(persisted, state.blockedCapabilities)
    }

    const result = await this.executeWithPersistenceCoordination({
      context: {
        operationId: `sovereign:${mutationId}`,
        persistenceDomain: this.mapScopeToPersistenceDomain(args.context.mutationScope),
        mutationLineageHash,
        replayFingerprint: args.replayFingerprint,
        continuityEpoch: args.continuityEpoch,
        executionPriority: this.mapContextToExecutionPriority(args.context),
        executionClass: this.mapContextToExecutionClass(args.context),
        replayRelevant: args.context.mutationScope === 'replay' || args.context.replayVerificationState === 'verified',
        continuityRelevant: args.context.mutationScope === 'checkpoint' || args.context.mutationScope === 'runtime' || args.context.mutationScope === 'replay',
        recoveryRelevant: args.context.recoveryRequired || args.context.actor === 'recovery',
        actorId: args.context.actor,
        requestedAt: new Date().toISOString(),
      },
      work: async () => runWithMutationAuthority({
        source: args.authoritySource,
        viaExecutor: true,
        issuedBySovereignGate: true,
        mutationId,
      }, args.work),
    })

    this.options.observability?.incrementMetric('institutional_mutation_allowed_total')
    const persistedAttestation = await this.persistAttestation({
      ...baseAttestation,
      executed: true,
      persisted: true,
    })
    await this.idempotency.registerExecution({
      identity: mutationIdentity,
      lineageHash,
      executionState: 'executed',
      result,
    })
    this.replayEquivalentResultCache.set(mutationLineageHash, result)
    await args.onAttested?.(persistedAttestation)
    return result
  }

  private recordResultContractPreserved(args: {
    source: 'cache' | 'callback' | 'legacy-callback' | 'safe-fallback'
    mutationId: string
    mutationLineageHash: string
    replayResultShape?: string
  }) {
    this.options.observability?.incrementMetric('sovereign_mutation_result_contract_preserved_total')
    this.options.logger?.info({
      event: 'sovereign-mutation.replay-result-contract-preserved',
      source: args.source,
      mutationId: args.mutationId,
      mutationLineageHash: args.mutationLineageHash,
      replayResultShape: args.replayResultShape,
    }, 'Replay-equivalent mutation returned a contract-preserved result')
  }

  private buildSafeReplayEquivalentResult<T>(args: {
    context: SovereignMutationContext
    mutationLineageHash: string
    replayEquivalent: ReplayEquivalentMutationResult
  }): T {
    const metadata = {
      replayEquivalent: true,
      mutationId: args.replayEquivalent.mutationId,
      mutationLineageHash: args.mutationLineageHash,
      resultContractPreserved: true,
      replayResultShape: args.replayEquivalent.replayResultShape,
    }

    if (args.context.mutationScope === 'queue') {
      return Object.assign([], {
        replayEquivalentMetadata: metadata,
      }) as T
    }

    return {
      replayEquivalentMetadata: metadata,
    } as T
  }

  async getStatus() {
    const graph = await buildMutationAuthorityGraph()
    const continuityStatus = this.options.continuityGovernance?.getStatus()
    const attestationStatus = this.options.runtimeContinuityAttestationService?.getStatus()
    const runtimeStatus = this.options.runtimeGovernance?.getStatus()
    const recoveryStatus = this.options.recoveryGovernance?.getStatus()

    const idempotencyStatus = await this.idempotency.getStatus()

    return {
      mutationSovereigntyState: graph.detectedBypassPaths.length === 0 && !recoveryStatus?.recoveryLockdownState ? 'centralized' : 'partial',
      centralizedAuthorityCoverage: graph.centralizedAuthorityCoverage,
      detectedBypassPaths: graph.detectedBypassPaths,
      blockedCapabilities: [
        ...(continuityStatus?.blockedCapabilities ?? []),
        ...(runtimeStatus?.blockedCapabilities ?? []),
      ],
      attestationIntegrity: attestationStatus?.attestationIntegrity ?? 'missing',
      continuityRequirements: {
        continuityMode: continuityStatus?.continuityMode ?? 'unknown',
        recoveryRequired: continuityStatus?.recoveryRequired ?? true,
      },
      replayRequirements: {
        replayVerificationState: attestationStatus?.replayVerificationState ?? 'missing',
        brokenAttestationChains: attestationStatus?.brokenAttestationChains ?? [],
      },
      recoveryState: recoveryStatus?.recoveryState ?? 'safe',
      mutationAuthorityGraph: graph.nodes,
      mutationIdempotency: idempotencyStatus,
    }
  }

  async getMutationIdempotencyStatus() {
    return this.idempotency.getStatus()
  }

  private readEffectiveGovernanceState(context: SovereignMutationContext): EffectiveGovernanceState {
    const runtimeDecision = this.options.runtimeGovernance?.evaluateCapability({
      capability: toRuntimeCapability(context),
      riskLevel: toRuntimeRiskLevel(),
    })
    const continuityDecision = this.options.continuityGovernance?.evaluateCapability({
      capability: toContinuityCapability(context),
      riskLevel: toContinuityRiskLevel(),
    })
    const attestationStatus = this.options.runtimeContinuityAttestationService?.getStatus()
    const recoveryStatus = this.options.recoveryGovernance?.getStatus()
    const replayVerificationState = attestationStatus?.replayVerificationState === 'missing' && !attestationStatus.recoveryRequired
      ? context.replayVerificationState
      : attestationStatus?.replayVerificationState ?? context.replayVerificationState
    const attestationIntegrity = attestationStatus?.attestationIntegrity === 'missing' && !attestationStatus.recoveryRequired
      ? context.attestationIntegrity
      : attestationStatus?.attestationIntegrity ?? context.attestationIntegrity

    return {
      runtimeMode: runtimeDecision?.runtimeMode ?? context.runtimeMode,
      continuityMode: continuityDecision?.continuityMode ?? context.continuityMode,
      replayVerificationState,
      attestationIntegrity,
      recoveryRequired: recoveryStatus?.recoveryLockdownState === 'active'
        ? true
        : attestationStatus?.recoveryRequired ?? continuityDecision?.recoveryRequired ?? context.recoveryRequired,
      blockedCapabilities: [
        ...(runtimeDecision?.blockedCapabilities ?? []),
        ...(continuityDecision?.blockedCapabilities ?? []),
      ],
    }
  }

  private resolveBlockedReason(context: SovereignMutationContext, state: EffectiveGovernanceState) {
    if (!context.requestedCapability.trim()) {
      return 'bypass_attempt'
    }
    if (state.continuityMode === 'continuity_untrusted') {
      return 'continuity_untrusted'
    }
    if (state.recoveryRequired || state.continuityMode === 'recovery_required') {
      return 'recovery_required'
    }
    if (state.replayVerificationState !== 'verified') {
      return 'replay_verification_failed'
    }
    if (state.attestationIntegrity !== 'verified') {
      return 'attestation_chain_broken'
    }
    if (state.runtimeMode === 'degraded') {
      return 'runtime_degraded_blocked'
    }
    return null
  }

  private async readLatestContinuityCheckpoint(context: SovereignMutationContext) {
    const row = await this.options.db.get<{ lineage_hash: string; continuity_epoch: string | null }>(
      `
        SELECT lineage_hash, continuity_epoch
        FROM flowmind_runtime_continuity_attestation
        ORDER BY generated_at DESC, rowid DESC
        LIMIT 1
      `,
    )

    return {
      lineageHash: row?.lineage_hash ?? buildLineageFallback(context),
      continuityEpoch: row?.continuity_epoch ?? undefined,
    }
  }

  private buildMutationIdentity(args: {
    mutationId: string
    mutationLineageHash: string
    semanticIntentId?: string
    replayFingerprint?: string
    continuityEpoch?: string
    effectFingerprint?: string
    context: SovereignMutationContext
  }): SovereignMutationIdentity {
    return {
      mutationId: args.mutationId,
      mutationLineageHash: args.mutationLineageHash,
      semanticIntentId: args.semanticIntentId,
      replayFingerprint: args.replayFingerprint,
      continuityEpoch: args.continuityEpoch,
      effectFingerprint: args.effectFingerprint,
      executionClass: this.mapExecutionClass(args.context),
      createdAt: new Date().toISOString(),
    }
  }

  private mapExecutionClass(context: SovereignMutationContext): SovereignMutationIdentity['executionClass'] {
    if (context.actor === 'recovery') {
      return 'recovery'
    }
    if (context.mutationScope === 'replay') {
      return 'replay'
    }
    if (context.mutationScope === 'runtime' || context.mutationScope === 'checkpoint' || context.mutationScope === 'queue') {
      return 'runtime'
    }
    if (context.mutationScope === 'auth') {
      return 'auth'
    }
    if (context.mutationType.startsWith('semantic.')) {
      return 'semantic'
    }
    return 'governance'
  }

  private async persistAttestation(attestation: SovereignMutationAttestation) {
    try {
      await this.executeWithPersistenceCoordination({
        context: {
          operationId: `attestation:${attestation.mutationId}`,
          persistenceDomain: this.mapScopeToPersistenceDomain(attestation.mutationScope as SovereignMutationContext['mutationScope']),
          mutationLineageHash: attestation.lineageHash,
          replayFingerprint: undefined,
          continuityEpoch: undefined,
          executionPriority: 'high',
          executionClass: attestation.mutationScope === 'auth' ? 'auth' : 'governance',
          replayRelevant: attestation.mutationScope === 'replay',
          continuityRelevant: true,
          recoveryRelevant: false,
          actorId: attestation.traceId,
          requestedAt: new Date().toISOString(),
        },
        work: async () => this.options.db.run(
        `
          INSERT INTO flowmind_sovereign_mutation_attestation (
            mutation_id,
            mutation_type,
            mutation_scope,
            governance_decision,
            runtime_mode,
            continuity_mode,
            replay_verification_state,
            attestation_integrity,
            trace_id,
            lineage_hash,
            executed,
            persisted,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(mutation_id) DO NOTHING
        `,
        attestation.mutationId,
        attestation.mutationType,
        attestation.mutationScope,
        attestation.governanceDecision,
        attestation.runtimeMode,
        attestation.continuityMode,
        attestation.replayVerificationState,
        attestation.attestationIntegrity,
        attestation.traceId,
        attestation.lineageHash,
        attestation.executed ? 1 : 0,
        attestation.persisted ? 1 : 0,
        new Date().toISOString(),
        ),
      })

      const persistedRow = await this.options.db.get<{
        mutation_id: string
        mutation_type: string
        mutation_scope: string
        governance_decision: SovereignMutationAttestation['governanceDecision']
        runtime_mode: string
        continuity_mode: string
        replay_verification_state: string
        attestation_integrity: string
        trace_id: string
        lineage_hash: string
        executed: number
        persisted: number
      }>(
        `
          SELECT
            mutation_id,
            mutation_type,
            mutation_scope,
            governance_decision,
            runtime_mode,
            continuity_mode,
            replay_verification_state,
            attestation_integrity,
            trace_id,
            lineage_hash,
            executed,
            persisted
          FROM flowmind_sovereign_mutation_attestation
          WHERE mutation_id = ?
          LIMIT 1
        `,
        attestation.mutationId,
      )

      if (!persistedRow) {
        return attestation
      }

      if (persistedRow.trace_id !== attestation.traceId) {
        this.options.observability?.incrementMetric('sovereign_mutation_replay_collision_total')
        this.options.logger?.warn({
          event: 'sovereign-mutation.replay-collision',
          mutationId: attestation.mutationId,
          originalTraceId: persistedRow.trace_id,
          replayTraceId: attestation.traceId,
        }, 'Replay collision detected for sovereign mutation attestation')
      }

      if (
        persistedRow.trace_id !== attestation.traceId
        || persistedRow.lineage_hash !== attestation.lineageHash
        || persistedRow.governance_decision !== attestation.governanceDecision
      ) {
        this.options.observability?.incrementMetric('sovereign_mutation_deduplicated_total')
        this.options.logger?.info({
          event: 'sovereign-mutation.duplicate-attestation-prevented',
          mutationId: attestation.mutationId,
        }, 'Duplicate sovereign attestation prevented')
      }

      return {
        mutationId: persistedRow.mutation_id,
        mutationType: persistedRow.mutation_type,
        mutationScope: persistedRow.mutation_scope,
        governanceDecision: persistedRow.governance_decision,
        runtimeMode: persistedRow.runtime_mode,
        continuityMode: persistedRow.continuity_mode,
        replayVerificationState: persistedRow.replay_verification_state,
        attestationIntegrity: persistedRow.attestation_integrity,
        traceId: persistedRow.trace_id,
        lineageHash: persistedRow.lineage_hash,
        executed: persistedRow.executed === 1,
        persisted: persistedRow.persisted === 1,
      }
    } catch (error) {
      this.options.observability?.incrementMetric('institutional_mutation_attestation_failed_total')
      this.options.logger?.warn({
        event: 'institutional-mutation.attestation-failed',
        mutationId: attestation.mutationId,
        error: error instanceof Error ? error.message : 'unknown_error',
      }, 'Institutional sovereign mutation attestation persistence failed')
      throw error
    }
  }

  private async executeWithPersistenceCoordination<T>(args: {
    context: {
      operationId: string
      persistenceDomain: 'governance' | 'replay' | 'semantic' | 'auth' | 'checkpoint' | 'queue' | 'runtime' | 'entity'
      mutationLineageHash?: string
      replayFingerprint?: string
      continuityEpoch?: string
      executionPriority: 'critical' | 'high' | 'normal' | 'background'
      executionClass: 'runtime' | 'replay' | 'recovery' | 'governance' | 'auth'
      replayRelevant: boolean
      continuityRelevant: boolean
      recoveryRelevant: boolean
      actorId?: string
      requestedAt: string
    }
    work: () => Promise<T>
  }): Promise<T> {
    if (!this.options.persistenceCoordination) {
      return args.work()
    }

    return this.options.persistenceCoordination.executeCoordinatedOperation(args)
  }

  private mapScopeToPersistenceDomain(scope: SovereignMutationContext['mutationScope']) {
    switch (scope) {
      case 'governance':
        return 'governance'
      case 'replay':
        return 'replay'
      case 'auth':
        return 'auth'
      case 'checkpoint':
        return 'checkpoint'
      case 'queue':
        return 'queue'
      case 'runtime':
        return 'runtime'
      case 'entity':
      case 'memory':
      default:
        return 'entity'
    }
  }

  private mapContextToExecutionPriority(context: SovereignMutationContext): 'critical' | 'high' | 'normal' | 'background' {
    if (context.actor === 'recovery' || context.recoveryRequired) {
      return 'critical'
    }

    if (context.mutationScope === 'replay' || context.mutationScope === 'checkpoint' || context.mutationScope === 'governance' || context.mutationScope === 'auth') {
      return 'high'
    }

    if (context.mutationScope === 'queue' || context.mutationScope === 'runtime') {
      return 'normal'
    }

    return 'background'
  }

  private mapContextToExecutionClass(context: SovereignMutationContext): 'runtime' | 'replay' | 'recovery' | 'governance' | 'auth' {
    if (context.actor === 'recovery') {
      return 'recovery'
    }

    if (context.mutationScope === 'replay') {
      return 'replay'
    }

    if (context.mutationScope === 'auth') {
      return 'auth'
    }

    if (context.mutationScope === 'governance' || context.mutationScope === 'queue') {
      return 'governance'
    }

    return 'runtime'
  }
}

export function createInstitutionalSovereignMutationGate(options: InstitutionalSovereignMutationGateOptions) {
  return new InstitutionalSovereignMutationGate(options)
}

export function installInstitutionalSovereignMutationGate(gate: InstitutionalSovereignMutationGate) {
  installedGate = gate
}

export function getInstitutionalSovereignMutationGate() {
  if (!installedGate) {
    throw new Error('Institutional sovereign mutation gate is not installed.')
  }

  return installedGate
}
