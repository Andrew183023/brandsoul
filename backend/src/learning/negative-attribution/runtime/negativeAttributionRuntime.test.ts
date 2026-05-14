import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../../db/index.js'
import { runWithMutationAuthority } from '../../../sovereignty/authorityBoundary.js'
import { createNegativeOutcomeRepository } from '../../persistence/negativeOutcomeRepository.js'
import { createNegativeAttributionRepository } from '../../persistence/negativeAttributionRepository.js'
import { createNegativeAttributionSnapshotStore } from './negativeAttributionSnapshotStore.js'
import { createNegativeAttributionRuntime } from './negativeAttributionRuntime.js'

async function createTempDatabase() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-negative-attribution-runtime-'))
  const sqliteFile = path.join(workspace, 'runtime.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  return {
    db,
    async close() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

async function appendSeedNegativeOutcome(
  repository: ReturnType<typeof createNegativeOutcomeRepository>,
  input: Parameters<typeof repository.appendNegativeOutcome>[0],
) {
  return runWithMutationAuthority({
    source: 'backend/src/learning/negative-attribution/runtime/negativeAttributionRuntime.test.ts#appendSeedNegativeOutcome',
    viaExecutor: true,
  }, async () => repository.appendNegativeOutcome(input))
}

test('negative attribution runtime maps terminal negative outcomes into causal attribution events', async () => {
  const harness = await createTempDatabase()

  try {
    const negativeOutcomeRepository = createNegativeOutcomeRepository(harness.db)
    const negativeAttributionRepository = createNegativeAttributionRepository(harness.db)
    const negativeAttributionSnapshotStore = createNegativeAttributionSnapshotStore()

    await appendSeedNegativeOutcome(negativeOutcomeRepository, {
      outcomeType: 'failed_execution',
      entityId: 'entity-1',
      marketSignalId: 'signal-1',
      opportunityId: 'opportunity-1',
      proposalId: 'proposal-1',
      executionId: 'execution-1',
      category: 'legal',
      signalKeyword: 'labor lawyer',
      detectedAt: '2026-05-08T10:00:00.000Z',
      reason: 'Provider returned terminal delivery failure.',
      metadata: {
        completedAt: '2026-05-08T09:59:00.000Z',
      },
    })

    await appendSeedNegativeOutcome(negativeOutcomeRepository, {
      outcomeType: 'proposal_rejected',
      entityId: 'entity-2',
      marketSignalId: 'signal-2',
      opportunityId: 'opportunity-2',
      proposalId: 'proposal-2',
      executionId: 'none',
      category: 'finance',
      signalKeyword: 'mortgage quote',
      detectedAt: '2026-05-08T11:00:00.000Z',
      reason: 'Governance rejected outbound action.',
    })

    await appendSeedNegativeOutcome(negativeOutcomeRepository, {
      outcomeType: 'opportunity_expired',
      entityId: 'unassigned',
      marketSignalId: 'signal-3',
      opportunityId: 'opportunity-3',
      proposalId: 'none',
      executionId: 'none',
      category: 'logistics',
      signalKeyword: 'freight quote',
      detectedAt: '2026-05-08T12:00:00.000Z',
      reason: 'Opportunity exceeded lifecycle timeout.',
    })

    const runtime = createNegativeAttributionRuntime({
      negativeOutcomeRepository,
      negativeAttributionRepository,
      negativeAttributionSnapshotStore,
      refreshIntervalMs: 60_000,
    })

    await runtime.start()

    const attributions = await negativeAttributionRepository.listNegativeAttributions()
    const status = runtime.getStatus()
    const snapshotState = negativeAttributionSnapshotStore.getSnapshot()

    assert.equal(status.started, true)
    assert.equal(status.ready, true)
    assert.equal(status.error, false)
    assert.equal(status.lastError, null)
    assert.equal(attributions.length, 3)
    assert.equal(snapshotState.snapshot.metrics.attributionCount, 3)

    const failedExecution = attributions.find((item) => item.outcomeType === 'failed_execution')
    assert.equal(failedExecution?.lineageQuality, 'complete')
    assert.equal(failedExecution?.severity, 'critical')
    assert.equal(failedExecution?.occurredAt, '2026-05-08T09:59:00.000Z')
    assert.equal(failedExecution?.executionId, 'execution-1')

    const proposalRejected = attributions.find((item) => item.outcomeType === 'proposal_rejected')
    assert.equal(proposalRejected?.lineageQuality, 'complete')
    assert.equal(proposalRejected?.severity, 'medium')
    assert.equal(proposalRejected?.executionId, null)

    const opportunityExpired = attributions.find((item) => item.outcomeType === 'opportunity_expired')
    assert.equal(opportunityExpired?.lineageQuality, 'synthetic')
    assert.equal(opportunityExpired?.entityId, null)
    assert.equal(opportunityExpired?.proposalId, null)
    assert.equal(opportunityExpired?.executionId, null)

    await runtime.stop()
  } finally {
    await harness.close()
  }
})

test('negative attribution runtime is replay-safe across duplicate boot and refresh cycles', async () => {
  const harness = await createTempDatabase()

  try {
    const negativeOutcomeRepository = createNegativeOutcomeRepository(harness.db)
    const negativeAttributionRepository = createNegativeAttributionRepository(harness.db)
    const negativeAttributionSnapshotStore = createNegativeAttributionSnapshotStore()

    await appendSeedNegativeOutcome(negativeOutcomeRepository, {
      outcomeType: 'failed_execution',
      entityId: 'entity-1',
      marketSignalId: 'signal-1',
      opportunityId: 'opportunity-1',
      proposalId: 'proposal-1',
      executionId: 'execution-1',
      category: 'legal',
      signalKeyword: 'labor lawyer',
      detectedAt: '2026-05-08T10:00:00.000Z',
      reason: 'Provider returned terminal delivery failure.',
    })

    const runtime = createNegativeAttributionRuntime({
      negativeOutcomeRepository,
      negativeAttributionRepository,
      negativeAttributionSnapshotStore,
      refreshIntervalMs: 60_000,
    })

    await runtime.start()
    await runtime.start()
    await runtime.refresh()
    await runtime.refresh()

    const attributions = await negativeAttributionRepository.listNegativeAttributions()
    const snapshotState = negativeAttributionSnapshotStore.getSnapshot()

    assert.equal(attributions.length, 1)
    assert.equal(snapshotState.snapshot.metrics.attributionCount, 1)
    assert.equal(snapshotState.freshness.ready, true)

    await runtime.stop()
  } finally {
    await harness.close()
  }
})
