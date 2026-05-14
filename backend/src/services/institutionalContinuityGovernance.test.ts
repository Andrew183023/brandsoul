import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createLearningCheckpointRepository } from '../learning/persistence/learningCheckpointRepository.js'
import {
  createInstitutionalContinuityGovernanceService,
} from './institutionalContinuityGovernanceService.js'

function buildFreezeStatus(overrides: Partial<{
  freezeStatus: 'frozen' | 'drift_detected' | 'override_active'
  driftDetected: boolean
}> = {}) {
  return {
    freezeStatus: overrides.freezeStatus ?? 'frozen',
    currentManifestHash: 'manifest-current',
    expectedManifestHash: 'manifest-current',
    identityFields: ['mode'],
    operationalCouplingFields: [],
    prohibitedFields: [],
    driftDetected: overrides.driftDetected ?? false,
    driftWarnings: [],
    observationModeLocked: true,
  }
}

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'institutional-continuity-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)
  const service = createInstitutionalContinuityGovernanceService({
    db: connection,
  })
  await service.initialize()

  return {
    workspace,
    connection,
    checkpointRepository: createLearningCheckpointRepository(connection),
    service,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('continuity governance blocks startup on replay continuity failure', async () => {
  const harness = await createHarness()

  try {
    const result = await harness.service.validateStartup({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus({
        freezeStatus: 'drift_detected',
        driftDetected: true,
      }),
      learningCheckpointRepository: harness.checkpointRepository,
    })

    assert.equal(result.failStartup, true)
    assert.equal(result.restartIntegrityState, 'replay_continuity_failed')
    assert.equal(result.recoveryRequired, true)
  } finally {
    await harness.close()
  }
})

test('interrupted shutdown is detected on restart and enters recovery required mode', async () => {
  const harness = await createHarness()

  try {
    await harness.service.markRuntimeStarted('2026-05-12T10:00:00.000Z')
    await harness.connection.close()

    const connection = await createDatabaseConnection({
      provider: 'sqlite',
      sqliteFile: path.join(harness.workspace, 'backend.sqlite'),
    })
    const service = createInstitutionalContinuityGovernanceService({ db: connection })
    await service.initialize()

    const status = service.getStatus()
    assert.equal(status.unsafeShutdownDetected, true)
    assert.equal(status.continuityMode, 'recovery_required')
    assert.equal(status.recoveryRequired, true)
    assert.equal(status.restartIntegrityState, 'unsafe_shutdown_detected')
    await connection.close()
  } finally {
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('governed shutdown preserves flush ordering and completes shutdown marker', async () => {
  const harness = await createHarness()

  try {
    const executionOrder: string[] = []
    await harness.service.markRuntimeStarted('2026-05-12T10:00:00.000Z')
    const executed = await harness.service.executeGovernedShutdown([
      { name: 'governance-event-flush', run: async () => { executionOrder.push('governance-event-flush') } },
      { name: 'replay-runtime-flush', run: async () => { executionOrder.push('replay-runtime-flush') } },
      { name: 'mutation-queue-drain', run: async () => { executionOrder.push('mutation-queue-drain') } },
      { name: 'persistence-checkpoint-flush', run: async () => { executionOrder.push('persistence-checkpoint-flush') } },
    ])

    assert.deepEqual(executed, executionOrder)
    assert.deepEqual(executionOrder, [
      'governance-event-flush',
      'replay-runtime-flush',
      'mutation-queue-drain',
      'persistence-checkpoint-flush',
    ])
    assert.equal(harness.service.getStatus().shutdownIntegrityState, 'shutdown_completed')
  } finally {
    await harness.close()
  }
})

test('checkpoint corruption enters recovery required mode', async () => {
  const harness = await createHarness()

  try {
    await harness.connection.run(
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
      'checkpoint-corrupt',
      'economic-feedback-runtime',
      null,
      null,
      1,
      null,
      null,
      '{"payload":true}',
      null,
      '2026-05-12T10:00:00.000Z',
    )

    const result = await harness.service.validateStartup({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      learningCheckpointRepository: harness.checkpointRepository,
    })

    assert.equal(result.failStartup, false)
    assert.equal(result.continuityMode, 'recovery_required')
    assert.equal(result.restartIntegrityState, 'checkpoint_integrity_failed')
    assert.equal(result.recoveryRequired, true)
  } finally {
    await harness.close()
  }
})

test('degraded memory exposes metadata and allows only low-risk public reads by policy', async () => {
  const harness = await createHarness()

  try {
    await harness.service.registerDegradedMemoryFallback({
      entityId: 'entity-1',
      reason: 'repository read failed',
      now: '2026-05-12T10:00:00.000Z',
    })

    const status = harness.service.getStatus()
    assert.equal(status.continuityMode, 'degraded_memory')
    assert.equal(status.persistenceTruthfulness, 'degraded')
    assert.equal(status.degradedMemoryFallbackActive, true)

    const publicRead = harness.service.evaluateCapability({
      capability: 'public.read.low_risk',
      riskLevel: 'low',
      now: '2026-05-12T10:01:00.000Z',
    })
    assert.equal(publicRead.continuityDecision.allowed, true)
    assert.equal(publicRead.continuityDecision.reason, 'degraded-memory-low-risk-allowed')

    const replayRead = harness.service.evaluateCapability({
      capability: 'governance.replay.generate',
      riskLevel: 'high',
      now: '2026-05-12T10:01:00.000Z',
    })
    assert.equal(replayRead.continuityDecision.allowed, false)
    assert.equal(replayRead.continuityDecision.reason, 'degraded-memory-persistence-truth-not-guaranteed')
  } finally {
    await harness.close()
  }
})

test('continuity untrusted blocks high-risk operations and governance replay', async () => {
  const harness = await createHarness()

  try {
    await harness.service.registerPersistenceTruthfulnessFailure({
      entityId: 'entity-1',
      reason: 'repository write failed',
      now: '2026-05-12T10:00:00.000Z',
    })

    const mutation = harness.service.evaluateCapability({
      capability: 'sovereign.mutation',
      riskLevel: 'high',
    })
    assert.equal(mutation.continuityDecision.allowed, false)
    assert.equal(mutation.continuityDecision.reason, 'continuity-untrusted-blocked')

    const replay = harness.service.evaluateCapability({
      capability: 'governance.replay.generate',
      riskLevel: 'high',
    })
    assert.equal(replay.continuityDecision.allowed, false)
    assert.equal(replay.continuityDecision.reason, 'continuity-untrusted-blocked')
  } finally {
    await harness.close()
  }
})
