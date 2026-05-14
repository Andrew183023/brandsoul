import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createLearningCheckpointRepository } from '../learning/persistence/learningCheckpointRepository.js'
import {
  buildRuntimeContinuityLineageHash,
  createRuntimeContinuityAttestationService,
} from './runtimeContinuityAttestationService.js'
import { createInstitutionalContinuityGovernanceService } from './institutionalContinuityGovernanceService.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'runtime-attestation-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  const checkpointRepository = createLearningCheckpointRepository(connection)
  await connection.run(
    `
      INSERT INTO flowmind_learning_checkpoint (
        checkpoint_id,
        runtime_name,
        last_processed_attribution_id,
        last_processed_attributed_at,
        checkpoint_version,
        lineage_key,
        lineage_metadata_json,
        checkpoint_payload_json,
        continuity_fingerprint,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'learning-checkpoint:economic-feedback-runtime',
    'economic-feedback-runtime',
    'attr-1',
    '2026-05-12T00:00:00.000Z',
    1,
    'economic-feedback-runtime',
    '{"checkpointCount":1}',
    '{"checkpoint":true}',
    'replay:fingerprint:1',
    '2026-05-12T00:00:00.000Z',
  )

  const service = createRuntimeContinuityAttestationService({
    db: connection,
    now: () => '2026-05-12T10:00:00.000Z',
  })
  const continuity = createInstitutionalContinuityGovernanceService({ db: connection })
  await continuity.initialize()

  return {
    workspace,
    connection,
    service,
    continuity,
    checkpointRepository,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('runtime flush attestation persisted', async () => {
  const harness = await createHarness()

  try {
    const result = await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'governance-runtime-plane',
      continuityEpoch: 'continuity:2026-05-12T10:00:00.000Z',
      shutdownPhase: 'runtime_flush',
    })

    assert.equal(result.flushCompleted, true)
    assert.equal(result.attestationPersisted, true)

    const row = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_runtime_continuity_attestation',
    )
    assert.equal(row?.count, 1)
  } finally {
    await harness.close()
  }
})

test('replay attestation chain is deterministic across phases', async () => {
  const harness = await createHarness()

  try {
    const epoch = 'continuity:2026-05-12T10:00:00.000Z'
    const first = await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'governance-runtime-plane',
      continuityEpoch: epoch,
      shutdownPhase: 'runtime_flush',
    })
    const second = await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'replay-runtime-plane',
      continuityEpoch: epoch,
      shutdownPhase: 'replay_flush',
    })

    const expected = buildRuntimeContinuityLineageHash({
      previousLineageHash: first.lineageHash,
      replayFingerprint: second.replayFingerprint,
      checkpointFingerprint: second.checkpointFingerprint,
      queueFingerprint: second.queueFingerprint,
      continuityEpoch: epoch,
    })

    assert.equal(second.lineageHash, expected)
  } finally {
    await harness.close()
  }
})

test('queue lineage fork detected during recovery validation', async () => {
  const harness = await createHarness()

  try {
    const epoch = 'continuity:2026-05-12T10:00:00.000Z'
    const firstLineage = buildRuntimeContinuityLineageHash({
      continuityEpoch: epoch,
      replayFingerprint: 'r1',
      queueFingerprint: 'q1',
      checkpointFingerprint: 'c1',
    })
    const secondLineage = buildRuntimeContinuityLineageHash({
      previousLineageHash: firstLineage,
      continuityEpoch: epoch,
      replayFingerprint: 'r1',
      queueFingerprint: 'q2',
      checkpointFingerprint: 'c1',
    })

    await harness.connection.run(
      `
        INSERT INTO flowmind_runtime_continuity_attestation (
          attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
          checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'att-1',
      'mutation-queue',
      epoch,
      firstLineage,
      'r1',
      'q1',
      'c1',
      'queue_drain',
      'attested',
      0,
      '2026-05-12T10:00:00.000Z',
    )
    await harness.connection.run(
      `
        INSERT INTO flowmind_runtime_continuity_attestation (
          attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
          checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'att-2',
      'mutation-queue',
      epoch,
      secondLineage,
      'r1',
      'q2',
      'c1',
      'queue_drain',
      'attested',
      0,
      '2026-05-12T10:00:01.000Z',
    )

    const result = await harness.service.validateRecovery({
      shutdownIntegrityState: 'shutdown_completed',
    })

    assert.equal(result.queueContinuityState, 'fork_detected')
    assert.equal(result.recoveryRequired, true)
  } finally {
    await harness.close()
  }
})

test('orphan checkpoint attestation detected during recovery validation', async () => {
  const harness = await createHarness()

  try {
    const epoch = 'continuity:2026-05-12T10:00:00.000Z'
    const lineage = buildRuntimeContinuityLineageHash({
      continuityEpoch: epoch,
      replayFingerprint: 'r1',
      checkpointFingerprint: 'c1',
      queueFingerprint: 'q1',
    })

    await harness.connection.run(
      `
        INSERT INTO flowmind_runtime_continuity_attestation (
          attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
          checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'att-checkpoint',
      'checkpoint-store',
      epoch,
      lineage,
      'r1',
      'q1',
      'c1',
      'checkpoint_flush',
      'attested',
      0,
      '2026-05-12T10:00:00.000Z',
    )

    const result = await harness.service.validateRecovery({
      shutdownIntegrityState: 'shutdown_completed',
    })

    assert.equal(result.checkpointAttestationState, 'orphan_detected')
    assert.equal(result.recoveryRequired, true)
  } finally {
    await harness.close()
  }
})

test('missing attestation chain after shutdown marker requires recovery', async () => {
  const harness = await createHarness()

  try {
    const result = await harness.service.validateRecovery({
      shutdownIntegrityState: 'shutdown_completed',
    })

    assert.equal(result.attestationIntegrity, 'missing')
    assert.equal(result.recoveryRequired, true)
  } finally {
    await harness.close()
  }
})

test('recovery replay verification succeeds and marks epoch verified', async () => {
  const harness = await createHarness()

  try {
    const epoch = 'continuity:2026-05-12T10:00:00.000Z'
    await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'governance-runtime-plane',
      continuityEpoch: epoch,
      shutdownPhase: 'runtime_flush',
    })
    await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'replay-runtime-plane',
      continuityEpoch: epoch,
      shutdownPhase: 'replay_flush',
    })
    await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'mutation-queue',
      continuityEpoch: epoch,
      shutdownPhase: 'queue_drain',
    })
    await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'checkpoint-store',
      continuityEpoch: epoch,
      shutdownPhase: 'checkpoint_flush',
    })
    await harness.service.captureShutdownPhaseAttestation({
      runtimeId: 'institutional-runtime-plane',
      continuityEpoch: epoch,
      shutdownPhase: 'shutdown_complete',
    })

    const result = await harness.service.validateRecovery({
      shutdownIntegrityState: 'shutdown_completed',
    })

    assert.equal(result.attestationIntegrity, 'verified')
    assert.equal(result.replayVerificationState, 'verified')
    assert.equal(result.recoveryRequired, false)

    const verifiedCount = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_runtime_continuity_attestation WHERE verified_on_recovery = 1 AND continuity_epoch = ?',
      epoch,
    )
    assert.equal(verifiedCount?.count, 5)
  } finally {
    await harness.close()
  }
})

test('replay attestation corruption enters recovery required during startup validation', async () => {
  const harness = await createHarness()

  try {
    const epoch = 'continuity:2026-05-12T10:00:00.000Z'
    const lineage = buildRuntimeContinuityLineageHash({
      continuityEpoch: epoch,
      replayFingerprint: 'tampered-replay',
      queueFingerprint: 'q1',
      checkpointFingerprint: 'c1',
    })

    await harness.connection.run(
      `
        INSERT INTO flowmind_runtime_continuity_attestation (
          attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
          checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'att-bad-replay',
      'replay-runtime-plane',
      epoch,
      lineage,
      'tampered-replay',
      'q1',
      'c1',
      'replay_flush',
      'attested',
      0,
      '2026-05-12T10:00:00.000Z',
    )

    const attestationValidation = await harness.service.validateRecovery({
      shutdownIntegrityState: 'shutdown_completed',
    })

    const continuityValidation = await harness.continuity.validateStartup({
      replayIdentityOperationalFreezeStatus: {
        freezeStatus: 'frozen',
        currentManifestHash: 'manifest',
        expectedManifestHash: 'manifest',
        identityFields: ['mode'],
        operationalCouplingFields: [],
        prohibitedFields: [],
        driftDetected: false,
        driftWarnings: [],
        observationModeLocked: true,
      },
      learningCheckpointRepository: harness.checkpointRepository,
      runtimeContinuityAttestationValidationResult: attestationValidation,
    })

    assert.equal(continuityValidation.recoveryRequired, true)
    assert.equal(continuityValidation.restartIntegrityState, 'attestation_chain_failed')
    const mutationDecision = harness.continuity.evaluateCapability({
      capability: 'sovereign.mutation',
      riskLevel: 'high',
    })
    assert.equal(mutationDecision.continuityDecision.allowed, false)
  } finally {
    await harness.close()
  }
})
