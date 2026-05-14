import { createHash, randomUUID } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { InstitutionalContinuityCapability, ShutdownIntegrityState } from './institutionalContinuityGovernanceService.js'
import type { ObservabilityService } from './observabilityService.js'

export type RuntimeContinuityShutdownPhase =
  | 'runtime_flush'
  | 'queue_drain'
  | 'checkpoint_flush'
  | 'replay_flush'
  | 'shutdown_complete'

export type RuntimeContinuityAttestationStatus = 'pending' | 'attested' | 'failed'

export type RuntimeContinuityAttestation = {
  runtimeId: string
  attestationId: string
  continuityEpoch: string
  generatedAt: string
  shutdownPhase: RuntimeContinuityShutdownPhase
  attestationStatus: RuntimeContinuityAttestationStatus
  replayContinuityFingerprint: string
  mutationQueueFingerprint?: string
  checkpointFingerprint?: string
  lineageHash: string
  persisted: boolean
  verifiedOnRecovery: boolean
}

export type GovernedRuntimeFlushResult = {
  runtimeId: string
  flushCompleted: boolean
  replayFingerprint?: string
  checkpointFingerprint?: string
  queueFingerprint?: string
  lineageHash: string
  attestationPersisted: boolean
}

export type RuntimeAttestationIntegrity = 'verified' | 'broken' | 'missing'
export type RuntimeReplayVerificationState = 'verified' | 'failed' | 'missing'
export type RuntimeQueueContinuityState = 'verified' | 'fork_detected' | 'interrupted_drain' | 'missing'
export type RuntimeCheckpointAttestationState = 'verified' | 'orphan_detected' | 'failed' | 'missing'
export type RuntimeLineageContinuityState = 'verified' | 'broken' | 'missing'
export type RuntimeRecoveryVerificationState = 'verified' | 'recovery_required' | 'startup_blocked' | 'missing'

export type RuntimeContinuityRecoveryValidationResult = {
  attestationIntegrity: RuntimeAttestationIntegrity
  replayVerificationState: RuntimeReplayVerificationState
  queueContinuityState: RuntimeQueueContinuityState
  checkpointAttestationState: RuntimeCheckpointAttestationState
  lineageContinuityState: RuntimeLineageContinuityState
  recoveryVerificationState: RuntimeRecoveryVerificationState
  brokenAttestationChains: string[]
  blockedCapabilities: InstitutionalContinuityCapability[]
  shouldFailStartup: boolean
  recoveryRequired: boolean
}

type RuntimeContinuityAttestationServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  now?: () => string
}

type RuntimeContinuityAttestationRow = {
  insertion_order?: number
  attestation_id: string
  runtime_id: string
  continuity_epoch: string
  lineage_hash: string
  replay_fingerprint: string | null
  queue_fingerprint: string | null
  checkpoint_fingerprint: string | null
  shutdown_phase: RuntimeContinuityShutdownPhase
  attestation_status: RuntimeContinuityAttestationStatus
  verified_on_recovery: number
  generated_at: string
}

const HIGH_RISK_BLOCKED_CAPABILITIES: InstitutionalContinuityCapability[] = [
  'sovereign.mutation',
  'governance.approval',
  'governance.replay.generate',
  'adaptive.runtime.mutation',
  'auth.authority.transition',
]

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeFingerprint(value?: string | null) {
  return value?.trim() || ''
}

export function buildRuntimeContinuityLineageHash(args: {
  previousLineageHash?: string | null
  replayFingerprint?: string | null
  checkpointFingerprint?: string | null
  queueFingerprint?: string | null
  continuityEpoch: string
}) {
  return hashValue(stableStringify({
    previousLineageHash: normalizeFingerprint(args.previousLineageHash),
    replayFingerprint: normalizeFingerprint(args.replayFingerprint),
    checkpointFingerprint: normalizeFingerprint(args.checkpointFingerprint),
    queueFingerprint: normalizeFingerprint(args.queueFingerprint),
    continuityEpoch: args.continuityEpoch,
  }))
}

function mapAttestationRow(row: RuntimeContinuityAttestationRow): RuntimeContinuityAttestation {
  return {
    runtimeId: row.runtime_id,
    attestationId: row.attestation_id,
    continuityEpoch: row.continuity_epoch,
    generatedAt: row.generated_at,
    shutdownPhase: row.shutdown_phase,
    attestationStatus: row.attestation_status,
    replayContinuityFingerprint: row.replay_fingerprint ?? '',
    mutationQueueFingerprint: row.queue_fingerprint ?? undefined,
    checkpointFingerprint: row.checkpoint_fingerprint ?? undefined,
    lineageHash: row.lineage_hash,
    persisted: true,
    verifiedOnRecovery: row.verified_on_recovery === 1,
  }
}

function sortRows(rows: RuntimeContinuityAttestationRow[]) {
  return [...rows].sort((left, right) => {
    const byTime = left.generated_at.localeCompare(right.generated_at)
    if (byTime !== 0) {
      return byTime
    }

    const leftOrder = left.insertion_order ?? 0
    const rightOrder = right.insertion_order ?? 0
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return left.attestation_id.localeCompare(right.attestation_id)
  })
}

export class RuntimeContinuityAttestationService {
  private latestValidation: RuntimeContinuityRecoveryValidationResult = {
    attestationIntegrity: 'missing',
    replayVerificationState: 'missing',
    queueContinuityState: 'missing',
    checkpointAttestationState: 'missing',
    lineageContinuityState: 'missing',
    recoveryVerificationState: 'missing',
    brokenAttestationChains: [],
    blockedCapabilities: [...HIGH_RISK_BLOCKED_CAPABILITIES],
    shouldFailStartup: false,
    recoveryRequired: false,
  }

  constructor(private readonly options: RuntimeContinuityAttestationServiceOptions) {}

  buildContinuityEpoch(now = this.now()) {
    return `continuity:${now}`
  }

  async captureShutdownPhaseAttestation(args: {
    runtimeId: string
    continuityEpoch: string
    shutdownPhase: RuntimeContinuityShutdownPhase
    generatedAt?: string
  }): Promise<GovernedRuntimeFlushResult> {
    const generatedAt = args.generatedAt ?? this.now()

    try {
      const fingerprints = await this.collectFingerprints()
      const previousLineageHash = await this.getLatestLineageHash()
      const lineageHash = buildRuntimeContinuityLineageHash({
        previousLineageHash,
        replayFingerprint: fingerprints.replayFingerprint,
        checkpointFingerprint: fingerprints.checkpointFingerprint,
        queueFingerprint: fingerprints.queueFingerprint,
        continuityEpoch: args.continuityEpoch,
      })

      const attestationId = randomUUID()
      await this.options.db.run(
        `
          INSERT INTO flowmind_runtime_continuity_attestation (
            attestation_id,
            runtime_id,
            continuity_epoch,
            lineage_hash,
            replay_fingerprint,
            queue_fingerprint,
            checkpoint_fingerprint,
            shutdown_phase,
            attestation_status,
            verified_on_recovery,
            generated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        attestationId,
        args.runtimeId,
        args.continuityEpoch,
        lineageHash,
        fingerprints.replayFingerprint || null,
        fingerprints.queueFingerprint || null,
        fingerprints.checkpointFingerprint || null,
        args.shutdownPhase,
        'attested',
        0,
        generatedAt,
      )

      if (args.shutdownPhase === 'checkpoint_flush') {
        await this.markLearningCheckpointsAttested({
          lineageHash,
          replayFingerprint: fingerprints.replayFingerprint,
        })
      }

      this.options.observability?.incrementMetric('runtime_continuity_attestation_total')
      this.options.logger?.info({
        event: 'runtime-continuity.attestation.persisted',
        runtimeId: args.runtimeId,
        continuityEpoch: args.continuityEpoch,
        shutdownPhase: args.shutdownPhase,
        lineageHash,
      }, 'Runtime continuity attestation persisted')

      return {
        runtimeId: args.runtimeId,
        flushCompleted: true,
        replayFingerprint: fingerprints.replayFingerprint || undefined,
        checkpointFingerprint: fingerprints.checkpointFingerprint || undefined,
        queueFingerprint: fingerprints.queueFingerprint || undefined,
        lineageHash,
        attestationPersisted: true,
      }
    } catch (error) {
      this.options.observability?.incrementMetric('runtime_continuity_attestation_failed_total')
      this.options.logger?.warn({
        event: 'runtime-continuity.attestation.persist_failed',
        runtimeId: args.runtimeId,
        continuityEpoch: args.continuityEpoch,
        shutdownPhase: args.shutdownPhase,
        error: error instanceof Error ? error.message : 'unknown_error',
      }, 'Runtime continuity attestation persistence failed')
      throw error
    }
  }

  async recordFailedShutdownAttestation(args: {
    runtimeId: string
    continuityEpoch: string
    shutdownPhase: RuntimeContinuityShutdownPhase
    generatedAt?: string
  }) {
    const generatedAt = args.generatedAt ?? this.now()
    const previousLineageHash = await this.getLatestLineageHash()
    const lineageHash = buildRuntimeContinuityLineageHash({
      previousLineageHash,
      continuityEpoch: args.continuityEpoch,
    })

    await this.options.db.run(
      `
        INSERT INTO flowmind_runtime_continuity_attestation (
          attestation_id,
          runtime_id,
          continuity_epoch,
          lineage_hash,
          replay_fingerprint,
          queue_fingerprint,
          checkpoint_fingerprint,
          shutdown_phase,
          attestation_status,
          verified_on_recovery,
          generated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      randomUUID(),
      args.runtimeId,
      args.continuityEpoch,
      lineageHash,
      null,
      null,
      null,
      args.shutdownPhase,
      'failed',
      0,
      generatedAt,
    )

    this.options.observability?.incrementMetric('runtime_continuity_attestation_failed_total')
  }

  async validateRecovery(args: { shutdownIntegrityState: ShutdownIntegrityState }): Promise<RuntimeContinuityRecoveryValidationResult> {
    const rows = sortRows(await this.options.db.all<RuntimeContinuityAttestationRow[]>(
      `
        SELECT rowid AS insertion_order, *
        FROM flowmind_runtime_continuity_attestation
      `,
    ))

    const brokenAttestationChains: string[] = []

    if (rows.length === 0) {
      if (args.shutdownIntegrityState !== 'not_started') {
        brokenAttestationChains.push('missing runtime continuity attestation chain')
      }

      const missingResult: RuntimeContinuityRecoveryValidationResult = {
        attestationIntegrity: 'missing',
        replayVerificationState: 'missing',
        queueContinuityState: 'missing',
        checkpointAttestationState: 'missing',
        lineageContinuityState: 'missing',
        recoveryVerificationState: brokenAttestationChains.length > 0 ? 'recovery_required' : 'missing',
        brokenAttestationChains,
        blockedCapabilities: [...HIGH_RISK_BLOCKED_CAPABILITIES],
        shouldFailStartup: false,
        recoveryRequired: brokenAttestationChains.length > 0,
      }
      this.latestValidation = missingResult
      if (missingResult.recoveryRequired) {
        this.options.observability?.incrementMetric('recovery_attestation_validation_failed_total')
      }
      return missingResult
    }

    let previousLineageHash = ''
    let lineageBroken = false
    let replayBroken = false
    let queueForkDetected = false
    let checkpointBroken = false

    const phasesByEpoch = new Map<string, Map<RuntimeContinuityShutdownPhase, RuntimeContinuityAttestationRow[]>>()
    for (const row of rows) {
      const expected = buildRuntimeContinuityLineageHash({
        previousLineageHash,
        replayFingerprint: row.replay_fingerprint,
        checkpointFingerprint: row.checkpoint_fingerprint,
        queueFingerprint: row.queue_fingerprint,
        continuityEpoch: row.continuity_epoch,
      })
      if (expected !== row.lineage_hash) {
        lineageBroken = true
        brokenAttestationChains.push(`lineage hash mismatch for ${row.runtime_id}:${row.shutdown_phase}:${row.continuity_epoch}`)
      }

      if (row.attestation_status !== 'attested') {
        brokenAttestationChains.push(`failed attestation for ${row.runtime_id}:${row.shutdown_phase}:${row.continuity_epoch}`)
      }

      previousLineageHash = row.lineage_hash

      const epochMap = phasesByEpoch.get(row.continuity_epoch) ?? new Map<RuntimeContinuityShutdownPhase, RuntimeContinuityAttestationRow[]>()
      const phaseRows = epochMap.get(row.shutdown_phase) ?? []
      phaseRows.push(row)
      epochMap.set(row.shutdown_phase, phaseRows)
      phasesByEpoch.set(row.continuity_epoch, epochMap)
    }

    for (const [epoch, phaseMap] of phasesByEpoch.entries()) {
      const replayRows = phaseMap.get('replay_flush') ?? []
      const queueRows = phaseMap.get('queue_drain') ?? []
      const checkpointRows = phaseMap.get('checkpoint_flush') ?? []
      const runtimeRows = phaseMap.get('runtime_flush') ?? []
      const completeRows = phaseMap.get('shutdown_complete') ?? []

      const replayFingerprints = new Set(replayRows.map((row) => normalizeFingerprint(row.replay_fingerprint)))
      if (replayRows.length > 1 && replayFingerprints.size > 1) {
        replayBroken = true
        brokenAttestationChains.push(`duplicate replay mutation detected for continuity epoch ${epoch}`)
      }

      const queueFingerprints = new Set(queueRows.map((row) => normalizeFingerprint(row.queue_fingerprint)))
      if (queueRows.length > 1 && queueFingerprints.size > 1) {
        queueForkDetected = true
        brokenAttestationChains.push(`queue lineage fork detected for continuity epoch ${epoch}`)
      }

      if (checkpointRows.length > 0 && (replayRows.length === 0 || completeRows.length === 0)) {
        checkpointBroken = true
        brokenAttestationChains.push(`orphan checkpoint attestation detected for continuity epoch ${epoch}`)
      }

      const isLatestEpoch = epoch === rows[rows.length - 1]?.continuity_epoch
      if (isLatestEpoch) {
        const requiredPhases: RuntimeContinuityShutdownPhase[] = [
          'runtime_flush',
          'replay_flush',
          'queue_drain',
          'checkpoint_flush',
          'shutdown_complete',
        ]

        for (const requiredPhase of requiredPhases) {
          if ((phaseMap.get(requiredPhase) ?? []).length === 0) {
            brokenAttestationChains.push(`missing ${requiredPhase} attestation for latest continuity epoch ${epoch}`)
            if (requiredPhase === 'replay_flush') replayBroken = true
            if (requiredPhase === 'queue_drain') queueForkDetected = true
            if (requiredPhase === 'checkpoint_flush') checkpointBroken = true
            if (requiredPhase === 'runtime_flush') lineageBroken = true
          }
        }
      }

      if (runtimeRows.length === 0 && args.shutdownIntegrityState === 'shutdown_completed') {
        lineageBroken = true
      }
    }

    if (replayBroken) {
      this.options.observability?.incrementMetric('replay_flush_verification_failed_total')
    }
    if (queueForkDetected) {
      this.options.observability?.incrementMetric('queue_lineage_fork_total')
      this.options.logger?.warn({ event: 'runtime-continuity.queue-lineage-fork-detected' }, 'Runtime queue lineage fork detected')
    }
    if (checkpointBroken) {
      this.options.observability?.incrementMetric('checkpoint_attestation_failure_total')
    }

    const shouldFailStartup = replayBroken
    const recoveryRequired = brokenAttestationChains.length > 0

    if (recoveryRequired) {
      this.options.observability?.incrementMetric('recovery_attestation_validation_failed_total')
      this.options.logger?.warn({
        event: 'runtime-continuity.recovery-verification-failed',
        brokenAttestationChains,
      }, 'Runtime continuity attestation recovery verification failed')
    } else {
      await this.markLatestEpochVerified(rows[rows.length - 1]!.continuity_epoch)
    }

    const result: RuntimeContinuityRecoveryValidationResult = {
      attestationIntegrity: recoveryRequired ? 'broken' : 'verified',
      replayVerificationState: replayBroken ? 'failed' : 'verified',
      queueContinuityState: queueForkDetected ? 'fork_detected' : 'verified',
      checkpointAttestationState: checkpointBroken ? 'orphan_detected' : 'verified',
      lineageContinuityState: lineageBroken ? 'broken' : 'verified',
      recoveryVerificationState: shouldFailStartup ? 'startup_blocked' : recoveryRequired ? 'recovery_required' : 'verified',
      brokenAttestationChains,
      blockedCapabilities: [...HIGH_RISK_BLOCKED_CAPABILITIES],
      shouldFailStartup,
      recoveryRequired,
    }
    this.latestValidation = result
    return result
  }

  getStatus() {
    return { ...this.latestValidation }
  }

  private async collectFingerprints() {
    const replayRows = await this.options.db.all<Array<{
      runtime_name: string
      continuity_fingerprint: string | null
      updated_at: string
    }>>(
      `
        SELECT runtime_name, continuity_fingerprint, updated_at
        FROM flowmind_learning_checkpoint
        ORDER BY runtime_name ASC, updated_at ASC
      `,
    )

    const queueRows = await this.options.db.all<Array<{
      id: string
      status: string
      attempts: number
      updated_at: string
    }>>(
      `
        SELECT id, status, attempts, updated_at
        FROM job_queue
        ORDER BY id ASC
      `,
    )

    const checkpointRows = await this.options.db.all<Array<{
      checkpoint_id: string
      runtime_name: string
      checkpoint_version: number | null
      continuity_fingerprint: string | null
      checkpoint_attestation_state: string | null
      attestation_lineage_hash: string | null
      updated_at: string
    }>>(
      `
        SELECT checkpoint_id, runtime_name, checkpoint_version, continuity_fingerprint, checkpoint_attestation_state, attestation_lineage_hash, updated_at
        FROM flowmind_learning_checkpoint
        ORDER BY runtime_name ASC, checkpoint_id ASC
      `,
    )

    return {
      replayFingerprint: hashValue(stableStringify(replayRows)),
      queueFingerprint: hashValue(stableStringify(queueRows)),
      checkpointFingerprint: hashValue(stableStringify(checkpointRows)),
    }
  }

  private async getLatestLineageHash() {
    const row = await this.options.db.get<{ lineage_hash: string }>(
      `
        SELECT lineage_hash
        FROM flowmind_runtime_continuity_attestation
        WHERE attestation_status = 'attested'
        ORDER BY generated_at DESC, rowid DESC
        LIMIT 1
      `,
    )

    return row?.lineage_hash ?? ''
  }

  private async markLearningCheckpointsAttested(args: {
    lineageHash: string
    replayFingerprint?: string
  }) {
    const metadata = stableStringify({
      verifiedAt: this.now(),
      replayFingerprint: args.replayFingerprint ?? null,
      attestationLineageHash: args.lineageHash,
    })

    await this.options.db.run(
      `
        UPDATE flowmind_learning_checkpoint
        SET checkpoint_attestation_state = ?,
            attestation_lineage_hash = ?,
            replay_verification_metadata_json = ?
      `,
      'attested',
      args.lineageHash,
      metadata,
    )
  }

  private async markLatestEpochVerified(continuityEpoch: string) {
    await this.options.db.run(
      `
        UPDATE flowmind_runtime_continuity_attestation
        SET verified_on_recovery = 1
        WHERE continuity_epoch = ?
      `,
      continuityEpoch,
    )
  }

  private now() {
    return this.options.now?.() ?? new Date().toISOString()
  }
}

export function createRuntimeContinuityAttestationService(options: RuntimeContinuityAttestationServiceOptions) {
  return new RuntimeContinuityAttestationService(options)
}
