import { createHash, randomUUID } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ReplayIdentityOperationalFreezeStatus } from '../learning/governance/replayIdentityOperationalFreeze.js'
import { buildRuntimeContinuityLineageHash, type RuntimeContinuityRecoveryValidationResult, type RuntimeContinuityAttestationService } from './runtimeContinuityAttestationService.js'
import type { InstitutionalContinuityGovernanceService, RestartContinuityValidationResult, ShutdownIntegrityState } from './institutionalContinuityGovernanceService.js'
import type { ObservabilityService } from './observabilityService.js'

export type RecoveryState =
  | 'safe'
  | 'recovery_required'
  | 'recovery_initializing'
  | 'replay_restoring'
  | 'lineage_reconciling'
  | 'attestation_reconstructing'
  | 'recovery_verifying'
  | 'recovery_degraded'
  | 'recovery_failed'
  | 'recovery_complete'

export type ReplayDriftClassification =
  | 'none'
  | 'replay_corruption_isolated'
  | 'replay_discontinuity'
  | 'semantic_drift'
  | 'lineage_fork'
  | 'orphan_lineage'

export type ReplayRestorationResult = {
  replayRestored: boolean
  deterministic: boolean
  replayLineageVerified: boolean
  replayContinuityReconciled: boolean
  replayCorruptionIsolated: boolean
  replayDriftDetected: boolean
  driftClassification: ReplayDriftClassification
  replayFingerprint: string
  replayLineageHash: string
}

export type RecoveryAttestation = {
  recoveryId: string
  recoveryState: string
  replayRestored: boolean
  lineageReconciled: boolean
  continuityRestored: boolean
  semanticIntegrityVerified: boolean
  reconstructedAttestations: number
  replayDriftDetected: boolean
  recoveryLineageHash: string
  verified: boolean
  startedAt: string
  completedAt?: string
}

export type RecoveryGovernanceStatus = {
  recoveryState: RecoveryState
  replayRestorationState: 'pending' | 'verified' | 'failed'
  lineageReconciliationState: 'pending' | 'verified' | 'failed'
  continuityRestorationState: 'pending' | 'verified' | 'failed'
  semanticIntegrityState: 'pending' | 'verified' | 'failed'
  attestationReconstructionState: 'pending' | 'verified' | 'failed'
  recoveryLockdownState: 'inactive' | 'active'
  institutionalUnlockAllowed: boolean
  replayDriftClassification: ReplayDriftClassification
  reconstructedAttestations: number
  recoveryAttestation?: RecoveryAttestation
}

type ContinuityReconciliationResult = {
  lineageReconciled: boolean
  continuityRestored: boolean
  queueLineageState: 'verified' | 'fork_detected' | 'orphan_lineage'
  replayLineageState: 'verified' | 'drift_detected' | 'orphan_lineage'
  checkpointLineageState: 'verified' | 'orphan_detected'
  semanticMutationLineageState: 'verified' | 'semantic_drift'
  authLineageState: 'verified' | 'gap_detected'
  brokenChains: string[]
}

type SemanticContinuityVerificationResult = {
  verified: boolean
  semanticDivergenceDetected: boolean
  semanticMeaningStable: boolean
  replaySemanticEquivalence: boolean
  reasons: string[]
}

type AttestationReconstructionResult = {
  reconstructedAttestations: number
  reconstructedEpochs: string[]
  verified: boolean
  coldStartBootstrapApplied: boolean
  reconstructionSource: 'institutional_recovery_governance' | 'cold_start_recovery_bootstrap' | null
  bootstrapEpoch?: string
}

type InstitutionalRecoveryGovernanceServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  continuityGovernance: InstitutionalContinuityGovernanceService
  runtimeContinuityAttestationService: RuntimeContinuityAttestationService
  now?: () => string
}

type RecoveryTrigger = {
  replayIdentityOperationalFreezeStatus: ReplayIdentityOperationalFreezeStatus
  shutdownIntegrityState: ShutdownIntegrityState
  startupValidation: RestartContinuityValidationResult
  runtimeAttestationValidation: RuntimeContinuityRecoveryValidationResult
}

type RuntimeContinuityAttestationRow = {
  attestation_id: string
  runtime_id: string
  continuity_epoch: string
  lineage_hash: string
  replay_fingerprint: string | null
  queue_fingerprint: string | null
  checkpoint_fingerprint: string | null
  shutdown_phase: 'runtime_flush' | 'queue_drain' | 'checkpoint_flush' | 'replay_flush' | 'shutdown_complete'
  attestation_status: string
  verified_on_recovery: number
  reconstructed_on_recovery: number
  reconstruction_lineage_hash: string | null
  reconstruction_source: string | null
  generated_at: string
  rowid?: number
}

let installedRecoveryGovernance: InstitutionalRecoveryGovernanceService | null = null

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

function hashValue(value: unknown) {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

function sortAttestations(rows: RuntimeContinuityAttestationRow[]) {
  return [...rows].sort((left, right) => {
    const byTime = left.generated_at.localeCompare(right.generated_at)
    if (byTime !== 0) {
      return byTime
    }

    return (left.rowid ?? 0) - (right.rowid ?? 0)
  })
}

export class InstitutionalRecoveryGovernanceService {
  private status: RecoveryGovernanceStatus = {
    recoveryState: 'safe',
    replayRestorationState: 'pending',
    lineageReconciliationState: 'pending',
    continuityRestorationState: 'pending',
    semanticIntegrityState: 'pending',
    attestationReconstructionState: 'pending',
    recoveryLockdownState: 'inactive',
    institutionalUnlockAllowed: true,
    replayDriftClassification: 'none',
    reconstructedAttestations: 0,
  }

  constructor(private readonly options: InstitutionalRecoveryGovernanceServiceOptions) {}

  getStatus(): RecoveryGovernanceStatus {
    return {
      ...this.status,
      recoveryAttestation: this.status.recoveryAttestation ? { ...this.status.recoveryAttestation } : undefined,
    }
  }

  isLockdownActive() {
    return this.status.recoveryLockdownState === 'active'
  }

  async initializeRecovery(trigger: RecoveryTrigger): Promise<RecoveryGovernanceStatus> {
    if (!trigger.startupValidation.recoveryRequired && !trigger.runtimeAttestationValidation.recoveryRequired) {
      this.status = {
        recoveryState: 'safe',
        replayRestorationState: 'verified',
        lineageReconciliationState: 'verified',
        continuityRestorationState: 'verified',
        semanticIntegrityState: 'verified',
        attestationReconstructionState: 'verified',
        recoveryLockdownState: 'inactive',
        institutionalUnlockAllowed: true,
        replayDriftClassification: 'none',
        reconstructedAttestations: 0,
      }
      return this.getStatus()
    }

    const recoveryId = randomUUID()
    const startedAt = this.now()
    this.updateStatus({
      recoveryState: 'recovery_required',
      recoveryLockdownState: 'active',
      institutionalUnlockAllowed: false,
      replayRestorationState: 'pending',
      lineageReconciliationState: 'pending',
      continuityRestorationState: 'pending',
      semanticIntegrityState: 'pending',
      attestationReconstructionState: 'pending',
      reconstructedAttestations: 0,
    })
    this.options.observability?.incrementMetric('institutional_recovery_total')
    this.options.logger?.warn({
      event: 'institutional-recovery.initialized',
      recoveryId,
      reasons: trigger.startupValidation.reasons,
    }, 'Institutional recovery initialized')

    try {
      this.updateStatus({ recoveryState: 'recovery_initializing' })
      const provisionalReplayRestoration = await this.restoreReplay(trigger)

      this.updateStatus({
        recoveryState: 'replay_restoring',
        replayRestorationState: provisionalReplayRestoration.replayRestored ? 'verified' : 'failed',
        replayDriftClassification: provisionalReplayRestoration.driftClassification,
      })

      this.updateStatus({ recoveryState: 'attestation_reconstructing' })
      const reconstruction = await this.reconstructAttestations(recoveryId)
      const recoveredAttestationValidation = await this.options.runtimeContinuityAttestationService.validateRecovery({
        shutdownIntegrityState: trigger.shutdownIntegrityState,
      })
      const replayRestoration = await this.restoreReplay({
        ...trigger,
        runtimeAttestationValidation: recoveredAttestationValidation,
      })
      const replayDriftClassification = provisionalReplayRestoration.driftClassification !== 'none'
        ? provisionalReplayRestoration.driftClassification
        : replayRestoration.driftClassification

      this.updateStatus({
        attestationReconstructionState: reconstruction.verified ? 'verified' : 'failed',
        reconstructedAttestations: reconstruction.reconstructedAttestations,
        replayRestorationState: replayRestoration.replayRestored ? 'verified' : 'failed',
        replayDriftClassification,
      })

      this.updateStatus({ recoveryState: 'lineage_reconciling' })
      const continuityReconciliation = await this.reconcileContinuity(recoveredAttestationValidation)
      this.updateStatus({
        lineageReconciliationState: continuityReconciliation.lineageReconciled ? 'verified' : 'failed',
        continuityRestorationState: continuityReconciliation.continuityRestored ? 'verified' : 'failed',
      })

      this.updateStatus({ recoveryState: 'recovery_verifying' })
      const semanticContinuity = await this.verifySemanticContinuity()
      this.updateStatus({
        semanticIntegrityState: semanticContinuity.verified ? 'verified' : 'failed',
      })

      const bootstrapReplayFreezeValid = !reconstruction.coldStartBootstrapApplied
        || (
          trigger.replayIdentityOperationalFreezeStatus.freezeStatus === 'frozen'
          && !trigger.replayIdentityOperationalFreezeStatus.driftDetected
        )

      const verified = replayRestoration.replayRestored
        && continuityReconciliation.lineageReconciled
        && continuityReconciliation.continuityRestored
        && reconstruction.verified
        && semanticContinuity.verified
        && bootstrapReplayFreezeValid

      const bootstrapVerificationFailed = reconstruction.coldStartBootstrapApplied && !verified

      const recoveryState: RecoveryState = verified
        ? 'recovery_complete'
        : bootstrapVerificationFailed
          ? 'recovery_failed'
        : provisionalReplayRestoration.replayCorruptionIsolated
          || replayRestoration.replayCorruptionIsolated
          || replayDriftClassification !== 'none'
          ? 'recovery_degraded'
          : 'recovery_failed'

      const recoveryAttestation = await this.persistRecoveryAttestation({
        recoveryId,
        recoveryState,
        replayRestored: replayRestoration.replayRestored,
        lineageReconciled: continuityReconciliation.lineageReconciled,
        continuityRestored: continuityReconciliation.continuityRestored,
        semanticIntegrityVerified: semanticContinuity.verified,
        reconstructedAttestations: reconstruction.reconstructedAttestations,
        replayDriftDetected: replayRestoration.replayDriftDetected,
        recoveryLineageHash: hashValue({
          replayFingerprint: replayRestoration.replayFingerprint,
          replayLineageHash: replayRestoration.replayLineageHash,
          continuity: continuityReconciliation,
          semantic: semanticContinuity,
          reconstruction,
        }),
        verified,
        startedAt,
        completedAt: this.now(),
        replayRestorationState: replayRestoration.replayRestored ? 'verified' : 'failed',
        lineageReconciliationState: continuityReconciliation.lineageReconciled ? 'verified' : 'failed',
        continuityRestorationState: continuityReconciliation.continuityRestored ? 'verified' : 'failed',
        semanticIntegrityState: semanticContinuity.verified ? 'verified' : 'failed',
        attestationReconstructionState: reconstruction.verified ? 'verified' : 'failed',
        recoveryLockdownState: verified ? 'inactive' : 'active',
        institutionalUnlockAllowed: verified,
        recoveryMetadataJson: stableStringify({
          replayRestoration,
          continuityReconciliation,
          semanticContinuity,
          reconstruction,
          bootstrapReplayFreezeValid,
          bootstrapVerificationPassed: !bootstrapVerificationFailed,
          startupReasons: trigger.startupValidation.reasons,
        }),
      })

      if (verified) {
        await this.options.continuityGovernance.completeRecovery({
          reason: 'governed institutional recovery verified',
          now: recoveryAttestation.completedAt,
        })
        this.options.logger?.info({
          event: 'institutional-recovery.unlock-granted',
          recoveryId,
          recoveryLineageHash: recoveryAttestation.recoveryLineageHash,
        }, 'Institutional unlock granted')
      } else {
        this.options.observability?.incrementMetric('institutional_recovery_failed_total')
        this.options.logger?.warn({
          event: 'institutional-recovery.verification-failed',
          recoveryId,
          recoveryState,
        }, 'Recovery verification failed')
      }

      this.updateStatus({
        recoveryState,
        recoveryLockdownState: verified ? 'inactive' : 'active',
        institutionalUnlockAllowed: verified,
        recoveryAttestation,
      })

      return this.getStatus()
    } catch (error) {
      this.options.observability?.incrementMetric('institutional_recovery_failed_total')
      this.updateStatus({
        recoveryState: 'recovery_failed',
        recoveryLockdownState: 'active',
        institutionalUnlockAllowed: false,
      })
      this.options.logger?.warn({
        event: 'institutional-recovery.failed',
        recoveryId,
        error: error instanceof Error ? error.message : 'unknown_error',
      }, 'Institutional recovery failed')
      throw error
    }
  }

  private async restoreReplay(trigger: RecoveryTrigger): Promise<ReplayRestorationResult> {
    this.options.observability?.incrementMetric('replay_restoration_total')

    const attestationStatus = trigger.runtimeAttestationValidation
    const rows = await this.options.db.all<RuntimeContinuityAttestationRow[]>(
      `
        SELECT rowid, *
        FROM flowmind_runtime_continuity_attestation
        ORDER BY generated_at ASC, rowid ASC
      `,
    )
    const sortedRows = sortAttestations(rows)
    const replayFingerprint = hashValue(sortedRows.map((row) => ({
      continuityEpoch: row.continuity_epoch,
      runtimeId: row.runtime_id,
      phase: row.shutdown_phase,
      replayFingerprint: row.replay_fingerprint ?? '',
      lineageHash: row.lineage_hash,
    })))
    const replayLineageHash = hashValue({
      replayFingerprint,
      replayVerificationState: attestationStatus.replayVerificationState,
      freezeStatus: trigger.replayIdentityOperationalFreezeStatus.freezeStatus,
      driftDetected: trigger.replayIdentityOperationalFreezeStatus.driftDetected,
    })

    let driftClassification: ReplayDriftClassification = 'none'
    if (trigger.replayIdentityOperationalFreezeStatus.driftDetected) {
      driftClassification = 'replay_discontinuity'
    } else if (attestationStatus.queueContinuityState === 'fork_detected') {
      driftClassification = 'lineage_fork'
    } else if (attestationStatus.checkpointAttestationState === 'orphan_detected') {
      driftClassification = 'orphan_lineage'
    } else if (attestationStatus.replayVerificationState === 'failed') {
      driftClassification = 'replay_corruption_isolated'
    }

    const replayCorruptionIsolated = driftClassification === 'replay_corruption_isolated'
    if (replayCorruptionIsolated) {
      this.options.logger?.warn({
        event: 'institutional-recovery.replay-restoration-failed',
        driftClassification,
      }, 'Replay restoration failed')
    }

    return {
      replayRestored: driftClassification === 'none',
      deterministic: true,
      replayLineageVerified: attestationStatus.lineageContinuityState === 'verified',
      replayContinuityReconciled: attestationStatus.replayVerificationState === 'verified',
      replayCorruptionIsolated,
      replayDriftDetected: driftClassification !== 'none',
      driftClassification,
      replayFingerprint,
      replayLineageHash,
    }
  }

  private async reconcileContinuity(attestationValidation: RuntimeContinuityRecoveryValidationResult): Promise<ContinuityReconciliationResult> {
    const semanticCount = await this.options.db.get<{ count: number; invalid_count: number }>(
      `
        SELECT
          COUNT(*) AS count,
          SUM(CASE WHEN verified = 0 OR replay_fingerprint = '' OR mutation_lineage_hash = '' THEN 1 ELSE 0 END) AS invalid_count
        FROM flowmind_semantic_mutation_attestation
      `,
    )
    const authCount = await this.options.db.get<{ count: number; invalid_count: number; unsafe_count: number }>(
      `
        SELECT
          COUNT(*) AS count,
          SUM(CASE WHEN lineage_hash = '' OR lineage_hash IS NULL THEN 1 ELSE 0 END) AS invalid_count,
          SUM(
            CASE
              WHEN governance_decision = 'blocked'
                OR attestation_integrity <> 'verified'
                OR replay_verification_state <> 'verified'
              THEN 1
              ELSE 0
            END
          ) AS unsafe_count
        FROM flowmind_auth_sovereign_attestation
      `,
    )

    const semanticMutationLineageState = Number(semanticCount?.invalid_count ?? 0) > 0 ? 'semantic_drift' : 'verified'
    const authLineageState = Number(authCount?.invalid_count ?? 0) > 0 || Number(authCount?.unsafe_count ?? 0) > 0
      ? 'gap_detected'
      : 'verified'
    const replayLineageState = attestationValidation.replayVerificationState === 'verified'
      ? 'verified'
      : attestationValidation.replayVerificationState === 'failed'
        ? 'drift_detected'
        : 'orphan_lineage'
    const queueLineageState = attestationValidation.queueContinuityState === 'fork_detected'
      ? 'fork_detected'
      : attestationValidation.queueContinuityState === 'missing'
        ? 'orphan_lineage'
        : 'verified'
    const checkpointLineageState = attestationValidation.checkpointAttestationState === 'orphan_detected'
      ? 'orphan_detected'
      : 'verified'

    const brokenChains = [
      ...attestationValidation.brokenAttestationChains,
      ...(semanticMutationLineageState === 'semantic_drift' ? ['semantic mutation lineage drift detected'] : []),
      ...(Number(authCount?.unsafe_count ?? 0) > 0 ? ['auth sovereignty state unsafe'] : []),
      ...(Number(authCount?.invalid_count ?? 0) > 0 ? ['auth lineage gap detected'] : []),
    ]

    const lineageReconciled = replayLineageState === 'verified'
      && queueLineageState === 'verified'
      && checkpointLineageState === 'verified'
    const continuityRestored = lineageReconciled
      && semanticMutationLineageState === 'verified'
      && authLineageState === 'verified'

    if (!lineageReconciled || !continuityRestored) {
      this.options.observability?.incrementMetric('lineage_reconciliation_failure_total')
    }

    return {
      lineageReconciled,
      continuityRestored,
      queueLineageState,
      replayLineageState,
      checkpointLineageState,
      semanticMutationLineageState,
      authLineageState,
      brokenChains,
    }
  }

  private async reconstructAttestations(recoveryId: string): Promise<AttestationReconstructionResult> {
    const rows = sortAttestations(await this.options.db.all<RuntimeContinuityAttestationRow[]>(
      `
        SELECT rowid, *
        FROM flowmind_runtime_continuity_attestation
        ORDER BY generated_at ASC, rowid ASC
      `,
    ))

    const latestEpoch = rows.at(-1)?.continuity_epoch
    if (!latestEpoch) {
      const bootstrapEpoch = `continuity:bootstrap:${this.now()}`
      const requiredPhases: Array<RuntimeContinuityAttestationRow['shutdown_phase']> = [
        'runtime_flush',
        'replay_flush',
        'queue_drain',
        'checkpoint_flush',
        'shutdown_complete',
      ]

      let previousLineageHash = ''
      for (const phase of requiredPhases) {
        const generatedAt = this.now()
        const lineageHash = buildRuntimeContinuityLineageHash({
          previousLineageHash,
          replayFingerprint: null,
          checkpointFingerprint: null,
          queueFingerprint: null,
          continuityEpoch: bootstrapEpoch,
        })
        const reconstructionLineageHash = hashValue({
          recoveryId,
          continuityEpoch: bootstrapEpoch,
          shutdownPhase: phase,
          lineageHash,
          source: 'cold_start_recovery_bootstrap',
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
              reconstructed_on_recovery,
              reconstruction_lineage_hash,
              reconstruction_source,
              generated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          randomUUID(),
          `recovery-bootstrap:${phase}`,
          bootstrapEpoch,
          lineageHash,
          null,
          null,
          null,
          phase,
          'attested',
          1,
          1,
          reconstructionLineageHash,
          'cold_start_recovery_bootstrap',
          generatedAt,
        )

        previousLineageHash = lineageHash
        this.options.observability?.incrementMetric('attestation_reconstruction_total')
        this.options.logger?.warn({
          event: 'institutional-recovery.attestation-cold-start-bootstrap',
          continuityEpoch: bootstrapEpoch,
          shutdownPhase: phase,
          reconstructionLineageHash,
        }, 'Cold-start attestation bootstrap reconstructed')
      }

      return {
        reconstructedAttestations: requiredPhases.length,
        reconstructedEpochs: [bootstrapEpoch],
        verified: true,
        coldStartBootstrapApplied: true,
        reconstructionSource: 'cold_start_recovery_bootstrap',
        bootstrapEpoch,
      }
    }

    const latestRows = rows.filter((row) => row.continuity_epoch === latestEpoch)
    const phaseMap = new Map(latestRows.map((row) => [row.shutdown_phase, row] as const))
    const requiredPhases: Array<RuntimeContinuityAttestationRow['shutdown_phase']> = [
      'runtime_flush',
      'replay_flush',
      'queue_drain',
      'checkpoint_flush',
      'shutdown_complete',
    ]

    let previousLineageHash = rows.at(-1)?.lineage_hash ?? ''
    let reconstructedAttestations = 0
    for (const phase of requiredPhases) {
      if (phaseMap.has(phase)) {
        previousLineageHash = phaseMap.get(phase)!.lineage_hash
        continue
      }

      const generatedAt = this.now()
      const lineageHash = buildRuntimeContinuityLineageHash({
        previousLineageHash,
        replayFingerprint: latestRows.at(-1)?.replay_fingerprint,
        checkpointFingerprint: latestRows.at(-1)?.checkpoint_fingerprint,
        queueFingerprint: latestRows.at(-1)?.queue_fingerprint,
        continuityEpoch: latestEpoch,
      })
      const reconstructionLineageHash = hashValue({
        recoveryId,
        continuityEpoch: latestEpoch,
        shutdownPhase: phase,
        lineageHash,
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
            reconstructed_on_recovery,
            reconstruction_lineage_hash,
            reconstruction_source,
            generated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        randomUUID(),
        `recovery:${phase}`,
        latestEpoch,
        lineageHash,
        latestRows.at(-1)?.replay_fingerprint ?? null,
        latestRows.at(-1)?.queue_fingerprint ?? null,
        latestRows.at(-1)?.checkpoint_fingerprint ?? null,
        phase,
        'attested',
        1,
        1,
        reconstructionLineageHash,
        'institutional_recovery_governance',
        generatedAt,
      )

      reconstructedAttestations += 1
      previousLineageHash = lineageHash
      this.options.observability?.incrementMetric('attestation_reconstruction_total')
      this.options.logger?.warn({
        event: 'institutional-recovery.attestation-reconstructed',
        continuityEpoch: latestEpoch,
        shutdownPhase: phase,
        reconstructionLineageHash,
      }, 'Attestation reconstructed')
    }

    return {
      reconstructedAttestations,
      reconstructedEpochs: reconstructedAttestations > 0 ? [latestEpoch] : [],
      verified: true,
      coldStartBootstrapApplied: false,
      reconstructionSource: reconstructedAttestations > 0 ? 'institutional_recovery_governance' : null,
    }
  }

  private async verifySemanticContinuity(): Promise<SemanticContinuityVerificationResult> {
    const row = await this.options.db.get<{
      replay_relevant_missing: number
      invalid_verified: number
    }>(
      `
        SELECT
          SUM(CASE WHEN replay_relevant = 1 AND replay_fingerprint = '' THEN 1 ELSE 0 END) AS replay_relevant_missing,
          SUM(CASE WHEN verified = 0 THEN 1 ELSE 0 END) AS invalid_verified
        FROM flowmind_semantic_mutation_attestation
      `,
    )
    const meaningConflictRow = await this.options.db.get<{ conflict_count: number }>(
      `
        SELECT COUNT(*) AS conflict_count
        FROM (
          SELECT mutation_lineage_hash
          FROM flowmind_semantic_mutation_attestation
          GROUP BY mutation_lineage_hash
          HAVING COUNT(DISTINCT institutional_meaning) > 1
        )
      `,
    )

    const reasons: string[] = []
    if (Number(row?.replay_relevant_missing ?? 0) > 0) {
      reasons.push('replay relevant semantic mutation missing replay fingerprint')
    }
    if (Number(row?.invalid_verified ?? 0) > 0) {
      reasons.push('semantic mutation verification gap detected')
    }
    if (Number(meaningConflictRow?.conflict_count ?? 0) > 0) {
      reasons.push('semantic continuity mismatch detected')
    }

    const verified = reasons.length === 0
    if (!verified) {
      this.options.observability?.incrementMetric('semantic_recovery_drift_total')
      this.options.logger?.warn({
        event: 'institutional-recovery.semantic-continuity-mismatch',
        reasons,
      }, 'Semantic continuity mismatch')
    }

    return {
      verified,
      semanticDivergenceDetected: !verified,
      semanticMeaningStable: Number(meaningConflictRow?.conflict_count ?? 0) === 0,
      replaySemanticEquivalence: Number(row?.replay_relevant_missing ?? 0) === 0,
      reasons,
    }
  }

  private async persistRecoveryAttestation(args: RecoveryAttestation & {
    replayRestorationState: string
    lineageReconciliationState: string
    continuityRestorationState: string
    semanticIntegrityState: string
    attestationReconstructionState: string
    recoveryLockdownState: string
    institutionalUnlockAllowed: boolean
    recoveryMetadataJson?: string
  }) {
    await this.options.db.run(
      `
        INSERT INTO flowmind_recovery_attestation (
          recovery_id,
          recovery_state,
          replay_restored,
          lineage_reconciled,
          continuity_restored,
          semantic_integrity_verified,
          reconstructed_attestations,
          replay_drift_detected,
          recovery_lineage_hash,
          verified,
          replay_restoration_state,
          lineage_reconciliation_state,
          continuity_restoration_state,
          semantic_integrity_state,
          attestation_reconstruction_state,
          recovery_lockdown_state,
          institutional_unlock_allowed,
          recovery_metadata_json,
          started_at,
          completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args.recoveryId,
      args.recoveryState,
      args.replayRestored ? 1 : 0,
      args.lineageReconciled ? 1 : 0,
      args.continuityRestored ? 1 : 0,
      args.semanticIntegrityVerified ? 1 : 0,
      args.reconstructedAttestations,
      args.replayDriftDetected ? 1 : 0,
      args.recoveryLineageHash,
      args.verified ? 1 : 0,
      args.replayRestorationState,
      args.lineageReconciliationState,
      args.continuityRestorationState,
      args.semanticIntegrityState,
      args.attestationReconstructionState,
      args.recoveryLockdownState,
      args.institutionalUnlockAllowed ? 1 : 0,
      args.recoveryMetadataJson ?? null,
      args.startedAt,
      args.completedAt ?? null,
    )

    return args
  }

  private updateStatus(next: Partial<RecoveryGovernanceStatus>) {
    this.status = {
      ...this.status,
      ...next,
    }
  }

  private now() {
    return this.options.now?.() ?? new Date().toISOString()
  }
}

export function createInstitutionalRecoveryGovernanceService(options: InstitutionalRecoveryGovernanceServiceOptions) {
  return new InstitutionalRecoveryGovernanceService(options)
}

export function installInstitutionalRecoveryGovernanceService(service: InstitutionalRecoveryGovernanceService) {
  installedRecoveryGovernance = service
}

export function getInstitutionalRecoveryGovernanceService() {
  if (!installedRecoveryGovernance) {
    throw new Error('Institutional recovery governance service is not installed.')
  }

  return installedRecoveryGovernance
}
