import type { FastifyBaseLogger } from 'fastify'

import type { ReplayIdentityOperationalFreezeStatus } from '../learning/governance/replayIdentityOperationalFreeze.js'
import type { LearningCheckpointRepository } from '../learning/persistence/learningCheckpointRepository.js'
import type { ObservabilityService } from './observabilityService.js'
import type { BackendDatabase } from '../db/index.js'
import { hydrateEntityCognitiveMemory } from '../flowmind/memory/entityCognitiveMemory.js'
import type {
  RuntimeContinuityRecoveryValidationResult,
  RuntimeContinuityShutdownPhase,
  RuntimeContinuityAttestationService,
} from './runtimeContinuityAttestationService.js'

export type InstitutionalContinuityMode =
  | 'institutional_safe'
  | 'degraded_memory'
  | 'continuity_untrusted'
  | 'recovery_required'

export type PersistenceTruthfulness = 'guaranteed' | 'degraded' | 'untrusted'

export type RestartIntegrityState =
  | 'validated'
  | 'unsafe_shutdown_detected'
  | 'checkpoint_integrity_failed'
  | 'memory_lineage_failed'
  | 'replay_continuity_failed'
  | 'attestation_chain_failed'

export type ReplayContinuityState = 'validated' | 'drift_detected'

export type ShutdownIntegrityState = 'not_started' | 'running' | 'shutdown_in_progress' | 'shutdown_completed'

export type InstitutionalContinuityCapability =
  | 'sovereign.mutation'
  | 'governance.approval'
  | 'governance.replay.generate'
  | 'adaptive.runtime.mutation'
  | 'auth.authority.transition'
  | 'public.read.low_risk'

export type InstitutionalContinuityRiskLevel = 'high' | 'low'

export type InstitutionalContinuityDecisionReason =
  | 'institutional-safe'
  | 'degraded-memory-low-risk-allowed'
  | 'degraded-memory-persistence-truth-not-guaranteed'
  | 'continuity-untrusted-blocked'
  | 'recovery-required-blocked'

export type InstitutionalContinuityDecision = {
  capability: InstitutionalContinuityCapability
  allowed: boolean
  reason: InstitutionalContinuityDecisionReason
  riskLevel: InstitutionalContinuityRiskLevel
  evaluatedAt: string
}

export type InstitutionalContinuityResponseMetadata = {
  continuityMode: InstitutionalContinuityMode
  persistenceTruthfulness: PersistenceTruthfulness
  recoveryRequired: boolean
  degradedMemoryFallbackActive: boolean
  unsafeShutdownDetected: boolean
  replayContinuityState: ReplayContinuityState
  restartIntegrityState: RestartIntegrityState
  blockedCapabilities: InstitutionalContinuityCapability[]
  continuityDecision: InstitutionalContinuityDecision
}

export type RestartContinuityValidationResult = {
  continuityMode: InstitutionalContinuityMode
  persistenceTruthfulness: PersistenceTruthfulness
  recoveryRequired: boolean
  unsafeShutdownDetected: boolean
  replayContinuityState: ReplayContinuityState
  restartIntegrityState: RestartIntegrityState
  blockedCapabilities: InstitutionalContinuityCapability[]
  failStartup: boolean
  reasons: string[]
}

export type InstitutionalContinuityStatus = Omit<InstitutionalContinuityResponseMetadata, 'continuityDecision'> & {
  shutdownIntegrityState: ShutdownIntegrityState
  lastReason?: string
  lastTransitionAt: string
  updatedAt: string
}

type ContinuityStateRow = {
  state_id: string
  continuity_mode: InstitutionalContinuityMode
  persistence_truthfulness: PersistenceTruthfulness
  recovery_required: number
  degraded_memory_fallback_active: number
  unsafe_shutdown_detected: number
  replay_continuity_state: ReplayContinuityState
  restart_integrity_state: RestartIntegrityState
  shutdown_integrity_state: ShutdownIntegrityState
  blocked_capabilities_json: string
  last_reason: string | null
  last_transition_at: string
  updated_at: string
}

type InstitutionalContinuityState = {
  continuityMode: InstitutionalContinuityMode
  persistenceTruthfulness: PersistenceTruthfulness
  recoveryRequired: boolean
  degradedMemoryFallbackActive: boolean
  unsafeShutdownDetected: boolean
  replayContinuityState: ReplayContinuityState
  restartIntegrityState: RestartIntegrityState
  shutdownIntegrityState: ShutdownIntegrityState
  blockedCapabilities: InstitutionalContinuityCapability[]
  lastReason?: string
  lastTransitionAt: string
  updatedAt: string
}

type InstitutionalContinuityGovernanceServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
}

const STATE_ID = 'institutional-continuity'

const HIGH_RISK_BLOCKED_CAPABILITIES: InstitutionalContinuityCapability[] = [
  'sovereign.mutation',
  'governance.approval',
  'governance.replay.generate',
  'adaptive.runtime.mutation',
  'auth.authority.transition',
]

const DEGRADED_MEMORY_BLOCKED_CAPABILITIES: InstitutionalContinuityCapability[] = [
  'governance.replay.generate',
  'adaptive.runtime.mutation',
  'auth.authority.transition',
]

function buildDefaultState(now: string): InstitutionalContinuityState {
  return {
    continuityMode: 'institutional_safe',
    persistenceTruthfulness: 'guaranteed',
    recoveryRequired: false,
    degradedMemoryFallbackActive: false,
    unsafeShutdownDetected: false,
    replayContinuityState: 'validated',
    restartIntegrityState: 'validated',
    shutdownIntegrityState: 'not_started',
    blockedCapabilities: [],
    lastTransitionAt: now,
    updatedAt: now,
  }
}

function parseBlockedCapabilities(value: string): InstitutionalContinuityCapability[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((entry): entry is InstitutionalContinuityCapability => typeof entry === 'string')
  } catch {
    return []
  }
}

function mapRow(row?: ContinuityStateRow): InstitutionalContinuityState | null {
  if (!row) {
    return null
  }

  return {
    continuityMode: row.continuity_mode,
    persistenceTruthfulness: row.persistence_truthfulness,
    recoveryRequired: row.recovery_required === 1,
    degradedMemoryFallbackActive: row.degraded_memory_fallback_active === 1,
    unsafeShutdownDetected: row.unsafe_shutdown_detected === 1,
    replayContinuityState: row.replay_continuity_state,
    restartIntegrityState: row.restart_integrity_state,
    shutdownIntegrityState: row.shutdown_integrity_state,
    blockedCapabilities: parseBlockedCapabilities(row.blocked_capabilities_json),
    lastReason: row.last_reason ?? undefined,
    lastTransitionAt: row.last_transition_at,
    updatedAt: row.updated_at,
  }
}

function buildBlockedCapabilitiesForMode(mode: InstitutionalContinuityMode): InstitutionalContinuityCapability[] {
  switch (mode) {
    case 'degraded_memory':
      return [...DEGRADED_MEMORY_BLOCKED_CAPABILITIES]
    case 'continuity_untrusted':
    case 'recovery_required':
      return [...HIGH_RISK_BLOCKED_CAPABILITIES, 'public.read.low_risk']
    case 'institutional_safe':
    default:
      return []
  }
}

export class InstitutionalContinuityBlockedError extends Error {
  readonly code = 'INSTITUTIONAL_CONTINUITY_BLOCKED'
  readonly statusCode = 503
  readonly continuityMode: InstitutionalContinuityResponseMetadata['continuityMode']
  readonly persistenceTruthfulness: InstitutionalContinuityResponseMetadata['persistenceTruthfulness']
  readonly recoveryRequired: InstitutionalContinuityResponseMetadata['recoveryRequired']
  readonly degradedMemoryFallbackActive: InstitutionalContinuityResponseMetadata['degradedMemoryFallbackActive']
  readonly unsafeShutdownDetected: InstitutionalContinuityResponseMetadata['unsafeShutdownDetected']
  readonly replayContinuityState: InstitutionalContinuityResponseMetadata['replayContinuityState']
  readonly restartIntegrityState: InstitutionalContinuityResponseMetadata['restartIntegrityState']
  readonly blockedCapabilities: InstitutionalContinuityResponseMetadata['blockedCapabilities']
  readonly continuityDecision: InstitutionalContinuityResponseMetadata['continuityDecision']

  constructor(metadata: InstitutionalContinuityResponseMetadata) {
    super('Operation blocked because institutional continuity is not trustworthy enough.')
    this.name = 'InstitutionalContinuityBlockedError'
    this.continuityMode = metadata.continuityMode
    this.persistenceTruthfulness = metadata.persistenceTruthfulness
    this.recoveryRequired = metadata.recoveryRequired
    this.degradedMemoryFallbackActive = metadata.degradedMemoryFallbackActive
    this.unsafeShutdownDetected = metadata.unsafeShutdownDetected
    this.replayContinuityState = metadata.replayContinuityState
    this.restartIntegrityState = metadata.restartIntegrityState
    this.blockedCapabilities = metadata.blockedCapabilities
    this.continuityDecision = metadata.continuityDecision
  }
}

export function isInstitutionalContinuityBlockedError(error: unknown): error is InstitutionalContinuityBlockedError {
  return error instanceof InstitutionalContinuityBlockedError
}

export class InstitutionalContinuityGovernanceService {
  private state: InstitutionalContinuityState = buildDefaultState(new Date().toISOString())

  constructor(private readonly options: InstitutionalContinuityGovernanceServiceOptions) {}

  async initialize() {
    const now = new Date().toISOString()
    const persisted = await this.readPersistedState()
    if (!persisted) {
      this.state = buildDefaultState(now)
      await this.persistState(this.state)
      return
    }

    this.state = persisted
    if (persisted.shutdownIntegrityState === 'running' || persisted.shutdownIntegrityState === 'shutdown_in_progress') {
      await this.transitionState({
        continuityMode: 'recovery_required',
        persistenceTruthfulness: 'untrusted',
        recoveryRequired: true,
        degradedMemoryFallbackActive: persisted.degradedMemoryFallbackActive,
        unsafeShutdownDetected: true,
        replayContinuityState: persisted.replayContinuityState,
        restartIntegrityState: 'unsafe_shutdown_detected',
        shutdownIntegrityState: persisted.shutdownIntegrityState,
        lastReason: 'unsafe shutdown detected on startup',
      }, {
        event: 'institutional-continuity.unsafe-shutdown-detected',
        metrics: ['unsafe_shutdown_detected_total', 'institutional_recovery_required_total', 'restart_integrity_failure_total'],
      })
    }
  }

  async validateStartup(args: {
    replayIdentityOperationalFreezeStatus: ReplayIdentityOperationalFreezeStatus
    learningCheckpointRepository: LearningCheckpointRepository
    runtimeContinuityAttestationValidationResult?: RuntimeContinuityRecoveryValidationResult
  }): Promise<RestartContinuityValidationResult> {
    const reasons: string[] = []

    if (args.replayIdentityOperationalFreezeStatus.driftDetected) {
      reasons.push('replay continuity drift detected')
      await this.transitionState({
        continuityMode: 'recovery_required',
        persistenceTruthfulness: 'untrusted',
        recoveryRequired: true,
        degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
        unsafeShutdownDetected: this.state.unsafeShutdownDetected,
        replayContinuityState: 'drift_detected',
        restartIntegrityState: 'replay_continuity_failed',
        shutdownIntegrityState: this.state.shutdownIntegrityState,
        lastReason: 'replay continuity validation failed',
      }, {
        event: 'institutional-continuity.replay-continuity-failed',
        metrics: ['restart_integrity_failure_total'],
      })
    }

    const corruptedCheckpoint = await this.options.db.get<{ runtime_name: string }>(
      `
        SELECT runtime_name
        FROM flowmind_learning_checkpoint
        WHERE checkpoint_payload_json IS NOT NULL
          AND (
            continuity_fingerprint IS NULL
            OR continuity_fingerprint = ''
            OR lineage_key IS NULL
            OR lineage_key = ''
          )
        LIMIT 1
      `,
    )

    if (corruptedCheckpoint) {
      reasons.push(`checkpoint integrity invalid for ${corruptedCheckpoint.runtime_name}`)
      await this.transitionState({
        continuityMode: 'recovery_required',
        persistenceTruthfulness: 'untrusted',
        recoveryRequired: true,
        degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
        unsafeShutdownDetected: this.state.unsafeShutdownDetected,
        replayContinuityState: this.state.replayContinuityState,
        restartIntegrityState: 'checkpoint_integrity_failed',
        shutdownIntegrityState: this.state.shutdownIntegrityState,
        lastReason: `checkpoint integrity invalid for ${corruptedCheckpoint.runtime_name}`,
      }, {
        event: 'institutional-continuity.checkpoint-integrity-failed',
        metrics: ['restart_integrity_failure_total', 'institutional_recovery_required_total'],
      })
    }

    const memoryRows = await this.options.db.all<Array<{ entity_id: string, memory_json: string }>>(
      `
        SELECT entity_id, memory_json
        FROM entity_cognitive_memory
      `,
    )

    for (const row of memoryRows) {
      try {
        hydrateEntityCognitiveMemory(JSON.parse(row.memory_json) as Record<string, unknown>)
      } catch {
        reasons.push(`memory lineage invalid for ${row.entity_id}`)
        await this.transitionState({
          continuityMode: 'recovery_required',
          persistenceTruthfulness: 'untrusted',
          recoveryRequired: true,
          degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
          unsafeShutdownDetected: this.state.unsafeShutdownDetected,
          replayContinuityState: this.state.replayContinuityState,
          restartIntegrityState: 'memory_lineage_failed',
          shutdownIntegrityState: this.state.shutdownIntegrityState,
          lastReason: `memory lineage invalid for ${row.entity_id}`,
        }, {
          event: 'institutional-continuity.memory-lineage-failed',
          metrics: ['restart_integrity_failure_total', 'institutional_recovery_required_total'],
        })
        break
      }
    }

    if (this.state.unsafeShutdownDetected && this.state.restartIntegrityState === 'validated') {
      reasons.push('unsafe shutdown detected')
    }

    const attestationValidation = args.runtimeContinuityAttestationValidationResult
    if (attestationValidation?.recoveryRequired) {
      reasons.push(...attestationValidation.brokenAttestationChains)
      await this.transitionState({
        continuityMode: 'recovery_required',
        persistenceTruthfulness: 'untrusted',
        recoveryRequired: true,
        degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
        unsafeShutdownDetected: this.state.unsafeShutdownDetected,
        replayContinuityState: attestationValidation.shouldFailStartup ? 'drift_detected' : this.state.replayContinuityState,
        restartIntegrityState: 'attestation_chain_failed',
        shutdownIntegrityState: this.state.shutdownIntegrityState,
        lastReason: attestationValidation.brokenAttestationChains[0] ?? 'runtime continuity attestation verification failed',
      }, {
        event: 'institutional-continuity.attestation-chain-failed',
        metrics: [
          'restart_integrity_failure_total',
          'institutional_recovery_required_total',
          'recovery_attestation_validation_failed_total',
        ],
      })
    }

    return {
      continuityMode: this.state.continuityMode,
      persistenceTruthfulness: this.state.persistenceTruthfulness,
      recoveryRequired: this.state.recoveryRequired,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      blockedCapabilities: [...this.state.blockedCapabilities],
      failStartup: this.state.restartIntegrityState === 'replay_continuity_failed' || attestationValidation?.shouldFailStartup === true,
      reasons,
    }
  }

  async markRuntimeStarted(now = new Date().toISOString()) {
    await this.transitionState({
      continuityMode: this.state.continuityMode,
      persistenceTruthfulness: this.state.persistenceTruthfulness,
      recoveryRequired: this.state.recoveryRequired,
      degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      shutdownIntegrityState: 'running',
      lastReason: this.state.lastReason,
      lastTransitionAt: now,
    }, {
      event: 'institutional-continuity.runtime-started',
    })
  }

  async registerDegradedMemoryFallback(args: { reason: string, entityId?: string, now?: string }) {
    if (this.state.continuityMode === 'continuity_untrusted' || this.state.continuityMode === 'recovery_required') {
      return
    }

    await this.transitionState({
      continuityMode: 'degraded_memory',
      persistenceTruthfulness: 'degraded',
      recoveryRequired: false,
      degradedMemoryFallbackActive: true,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      shutdownIntegrityState: this.state.shutdownIntegrityState,
      lastReason: args.reason,
      lastTransitionAt: args.now,
    }, {
      event: 'institutional-continuity.degraded-memory-fallback',
      metrics: ['institutional_continuity_degraded_total', 'memory_truthfulness_degraded_total'],
      logPayload: {
        entityId: args.entityId,
      },
    })
  }

  async registerPersistenceTruthfulnessFailure(args: { reason: string, entityId?: string, now?: string }) {
    await this.transitionState({
      continuityMode: 'continuity_untrusted',
      persistenceTruthfulness: 'untrusted',
      recoveryRequired: true,
      degradedMemoryFallbackActive: true,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      shutdownIntegrityState: this.state.shutdownIntegrityState,
      lastReason: args.reason,
      lastTransitionAt: args.now,
    }, {
      event: 'institutional-continuity.persistence-truthfulness-failed',
      metrics: ['institutional_continuity_degraded_total', 'institutional_recovery_required_total', 'memory_truthfulness_degraded_total'],
      logPayload: {
        entityId: args.entityId,
      },
    })
  }

  async completeRecovery(args?: { reason?: string, now?: string }) {
    await this.transitionState({
      continuityMode: 'institutional_safe',
      persistenceTruthfulness: 'guaranteed',
      recoveryRequired: false,
      degradedMemoryFallbackActive: false,
      unsafeShutdownDetected: false,
      replayContinuityState: 'validated',
      restartIntegrityState: 'validated',
      shutdownIntegrityState: this.state.shutdownIntegrityState,
      lastReason: args?.reason ?? 'institutional recovery complete',
      lastTransitionAt: args?.now,
    }, {
      event: 'institutional-continuity.recovery-complete',
    })
  }

  evaluateCapability(args: {
    capability: InstitutionalContinuityCapability
    riskLevel: InstitutionalContinuityRiskLevel
    now?: string
  }): InstitutionalContinuityResponseMetadata {
    const evaluatedAt = args.now ?? new Date().toISOString()
    let allowed = true
    let reason: InstitutionalContinuityDecisionReason = 'institutional-safe'

    if (this.state.continuityMode === 'degraded_memory') {
      if (args.capability === 'public.read.low_risk' && args.riskLevel === 'low') {
        reason = 'degraded-memory-low-risk-allowed'
      } else if (this.state.blockedCapabilities.includes(args.capability)) {
        allowed = false
        reason = 'degraded-memory-persistence-truth-not-guaranteed'
      }
    }

    if (this.state.continuityMode === 'continuity_untrusted') {
      if (this.state.blockedCapabilities.includes(args.capability) || args.riskLevel === 'high') {
        allowed = false
        reason = 'continuity-untrusted-blocked'
      }
    }

    if (this.state.continuityMode === 'recovery_required') {
      if (this.state.blockedCapabilities.includes(args.capability) || args.riskLevel === 'high') {
        allowed = false
        reason = 'recovery-required-blocked'
      }
    }

    return {
      continuityMode: this.state.continuityMode,
      persistenceTruthfulness: this.state.persistenceTruthfulness,
      recoveryRequired: this.state.recoveryRequired,
      degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      blockedCapabilities: [...this.state.blockedCapabilities],
      continuityDecision: {
        capability: args.capability,
        allowed,
        reason,
        riskLevel: args.riskLevel,
        evaluatedAt,
      },
    }
  }

  getStatus(): InstitutionalContinuityStatus {
    return {
      continuityMode: this.state.continuityMode,
      persistenceTruthfulness: this.state.persistenceTruthfulness,
      recoveryRequired: this.state.recoveryRequired,
      degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      shutdownIntegrityState: this.state.shutdownIntegrityState,
      blockedCapabilities: [...this.state.blockedCapabilities],
      lastReason: this.state.lastReason,
      lastTransitionAt: this.state.lastTransitionAt,
      updatedAt: this.state.updatedAt,
    }
  }

  async executeGovernedShutdown(
    steps: Array<{
      name: string
      run: () => Promise<void>
      runtimeId?: string
      shutdownPhase?: RuntimeContinuityShutdownPhase
    }>,
    args?: {
      runtimeContinuityAttestationService?: RuntimeContinuityAttestationService
      continuityEpoch?: string
    },
  ) {
    await this.markShutdownStarted()
    const executedSteps: string[] = []
    const continuityEpoch = args?.continuityEpoch ?? args?.runtimeContinuityAttestationService?.buildContinuityEpoch()

    for (const step of steps) {
      try {
        await step.run()
      } catch (error) {
        if (args?.runtimeContinuityAttestationService && step.shutdownPhase && continuityEpoch) {
          await args.runtimeContinuityAttestationService.recordFailedShutdownAttestation({
            runtimeId: step.runtimeId ?? step.name,
            continuityEpoch,
            shutdownPhase: step.shutdownPhase,
          })
        }
        throw error
      }
      executedSteps.push(step.name)
      if (args?.runtimeContinuityAttestationService && step.shutdownPhase && continuityEpoch) {
        const result = await args.runtimeContinuityAttestationService.captureShutdownPhaseAttestation({
          runtimeId: step.runtimeId ?? step.name,
          continuityEpoch,
          shutdownPhase: step.shutdownPhase,
        })
        if (!result.flushCompleted || !result.attestationPersisted) {
          throw new Error(`Runtime continuity attestation did not complete for ${step.runtimeId ?? step.name}.`)
        }
      }
    }

    await this.markShutdownCompleted()
    if (args?.runtimeContinuityAttestationService && continuityEpoch) {
      const result = await args.runtimeContinuityAttestationService.captureShutdownPhaseAttestation({
        runtimeId: 'institutional-runtime-plane',
        continuityEpoch,
        shutdownPhase: 'shutdown_complete',
      })
      if (!result.flushCompleted || !result.attestationPersisted) {
        throw new Error('Shutdown completion attestation was not persisted.')
      }
    }
    return executedSteps
  }

  private async markShutdownStarted(now = new Date().toISOString()) {
    await this.transitionState({
      continuityMode: this.state.continuityMode,
      persistenceTruthfulness: this.state.persistenceTruthfulness,
      recoveryRequired: this.state.recoveryRequired,
      degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
      unsafeShutdownDetected: this.state.unsafeShutdownDetected,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState,
      shutdownIntegrityState: 'shutdown_in_progress',
      lastReason: 'governed shutdown started',
      lastTransitionAt: now,
    }, {
      event: 'institutional-continuity.shutdown-started',
    })
  }

  private async markShutdownCompleted(now = new Date().toISOString()) {
    await this.transitionState({
      continuityMode: this.state.continuityMode,
      persistenceTruthfulness: this.state.persistenceTruthfulness,
      recoveryRequired: this.state.recoveryRequired,
      degradedMemoryFallbackActive: this.state.degradedMemoryFallbackActive,
      unsafeShutdownDetected: false,
      replayContinuityState: this.state.replayContinuityState,
      restartIntegrityState: this.state.restartIntegrityState === 'unsafe_shutdown_detected' ? 'validated' : this.state.restartIntegrityState,
      shutdownIntegrityState: 'shutdown_completed',
      lastReason: 'governed shutdown completed',
      lastTransitionAt: now,
    }, {
      event: 'institutional-continuity.shutdown-completed',
    })
  }

  private async readPersistedState() {
    const row = await this.options.db.get<ContinuityStateRow>(
      `
        SELECT *
        FROM flowmind_institutional_continuity_state
        WHERE state_id = ?
        LIMIT 1
      `,
      STATE_ID,
    )

    return mapRow(row)
  }

  private async persistState(state: InstitutionalContinuityState) {
    await this.options.db.run(
      `
        INSERT INTO flowmind_institutional_continuity_state (
          state_id,
          continuity_mode,
          persistence_truthfulness,
          recovery_required,
          degraded_memory_fallback_active,
          unsafe_shutdown_detected,
          replay_continuity_state,
          restart_integrity_state,
          shutdown_integrity_state,
          blocked_capabilities_json,
          last_reason,
          last_transition_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(state_id) DO UPDATE SET
          continuity_mode = excluded.continuity_mode,
          persistence_truthfulness = excluded.persistence_truthfulness,
          recovery_required = excluded.recovery_required,
          degraded_memory_fallback_active = excluded.degraded_memory_fallback_active,
          unsafe_shutdown_detected = excluded.unsafe_shutdown_detected,
          replay_continuity_state = excluded.replay_continuity_state,
          restart_integrity_state = excluded.restart_integrity_state,
          shutdown_integrity_state = excluded.shutdown_integrity_state,
          blocked_capabilities_json = excluded.blocked_capabilities_json,
          last_reason = excluded.last_reason,
          last_transition_at = excluded.last_transition_at,
          updated_at = excluded.updated_at
      `,
      STATE_ID,
      state.continuityMode,
      state.persistenceTruthfulness,
      state.recoveryRequired ? 1 : 0,
      state.degradedMemoryFallbackActive ? 1 : 0,
      state.unsafeShutdownDetected ? 1 : 0,
      state.replayContinuityState,
      state.restartIntegrityState,
      state.shutdownIntegrityState,
      JSON.stringify(state.blockedCapabilities),
      state.lastReason ?? null,
      state.lastTransitionAt,
      state.updatedAt,
    )
  }

  private async transitionState(
    next: Partial<InstitutionalContinuityState> & Pick<InstitutionalContinuityState, 'continuityMode' | 'persistenceTruthfulness' | 'recoveryRequired' | 'degradedMemoryFallbackActive' | 'unsafeShutdownDetected' | 'replayContinuityState' | 'restartIntegrityState' | 'shutdownIntegrityState'>,
    args?: {
      event?: string
      metrics?: string[]
      logPayload?: Record<string, unknown>
    },
  ) {
    const now = next.lastTransitionAt ?? new Date().toISOString()
    const merged: InstitutionalContinuityState = {
      continuityMode: next.continuityMode,
      persistenceTruthfulness: next.persistenceTruthfulness,
      recoveryRequired: next.recoveryRequired,
      degradedMemoryFallbackActive: next.degradedMemoryFallbackActive,
      unsafeShutdownDetected: next.unsafeShutdownDetected,
      replayContinuityState: next.replayContinuityState,
      restartIntegrityState: next.restartIntegrityState,
      shutdownIntegrityState: next.shutdownIntegrityState,
      blockedCapabilities: buildBlockedCapabilitiesForMode(next.continuityMode),
      lastReason: next.lastReason,
      lastTransitionAt: now,
      updatedAt: now,
    }

    this.state = merged
    await this.persistState(merged)

    for (const metric of args?.metrics ?? []) {
      this.options.observability?.incrementMetric(metric)
    }

    if (args?.event) {
      this.options.logger?.warn({
        event: args.event,
        continuityMode: merged.continuityMode,
        persistenceTruthfulness: merged.persistenceTruthfulness,
        recoveryRequired: merged.recoveryRequired,
        degradedMemoryFallbackActive: merged.degradedMemoryFallbackActive,
        unsafeShutdownDetected: merged.unsafeShutdownDetected,
        replayContinuityState: merged.replayContinuityState,
        restartIntegrityState: merged.restartIntegrityState,
        blockedCapabilities: merged.blockedCapabilities,
        reason: merged.lastReason,
        ...args.logPayload,
      }, 'Institutional continuity state transitioned')
    }
  }
}

export function createInstitutionalContinuityGovernanceService(options: InstitutionalContinuityGovernanceServiceOptions) {
  return new InstitutionalContinuityGovernanceService(options)
}
