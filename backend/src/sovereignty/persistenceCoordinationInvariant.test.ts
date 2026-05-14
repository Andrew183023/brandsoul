import assert from 'node:assert/strict'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import {
  createSovereignPersistenceCoordinationService,
  type SovereignPersistenceContext,
} from './sovereignPersistenceCoordinationService.js'

async function createHarness() {
  const db = await createDatabaseConnection({ provider: 'sqlite', sqliteFile: ':memory:' })
  await initializeDatabase(db)

  const service = createSovereignPersistenceCoordinationService({
    db,
    leaseDurationMs: 300,
    starvationThresholdMs: 10,
  })

  return {
    db,
    service,
    async close() {
      await db.close()
    },
  }
}

function context(operationId: string, input: Partial<SovereignPersistenceContext> = {}): SovereignPersistenceContext {
  return {
    operationId,
    persistenceDomain: input.persistenceDomain ?? 'runtime',
    mutationLineageHash: input.mutationLineageHash,
    replayFingerprint: input.replayFingerprint,
    continuityEpoch: input.continuityEpoch,
    executionPriority: input.executionPriority ?? 'normal',
    executionClass: input.executionClass ?? 'runtime',
    replayRelevant: input.replayRelevant ?? false,
    continuityRelevant: input.continuityRelevant ?? true,
    recoveryRelevant: input.recoveryRelevant ?? false,
    actorId: input.actorId,
    requestedAt: input.requestedAt ?? '2026-05-13T00:00:00.000Z',
  }
}

test('critical writes always enter transactional coordination queue', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await harness.service.executeCoordinatedOperation({
      context: context('critical-write-1', {
        persistenceDomain: 'governance',
        executionPriority: 'critical',
        executionClass: 'recovery',
        recoveryRelevant: true,
      }),
      work: async () => 'ok',
    })

    const rows = await harness.db.all<Array<{ queue_state: string }>>(
      'SELECT queue_state FROM flowmind_sovereign_persistence_queue WHERE operation_id = ? ORDER BY created_at ASC, queue_event_id ASC',
      'critical-write-1',
    )

    const states = rows.map((row) => row.queue_state)
    assert.deepEqual(states.includes('queued'), true)
    assert.deepEqual(states.includes('started'), true)
    assert.deepEqual(states.includes('completed'), true)
  } finally {
    await harness.close()
  }
})

test('replay persistence cannot execute concurrently', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    let inFlight = 0
    let maxInFlight = 0

    await Promise.all([
      harness.service.executeCoordinatedOperation({
        context: context('replay-serialize-1', {
          persistenceDomain: 'replay',
          executionClass: 'replay',
          executionPriority: 'high',
          replayRelevant: true,
          replayFingerprint: 'replay-1',
          mutationLineageHash: 'lineage-1',
        }),
        work: async () => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 15))
          inFlight -= 1
          return 'a'
        },
      }),
      harness.service.executeCoordinatedOperation({
        context: context('replay-serialize-2', {
          persistenceDomain: 'replay',
          executionClass: 'replay',
          executionPriority: 'high',
          replayRelevant: true,
          replayFingerprint: 'replay-2',
          mutationLineageHash: 'lineage-2',
        }),
        work: async () => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 15))
          inFlight -= 1
          return 'b'
        },
      }),
    ])

    assert.equal(maxInFlight, 1)
  } finally {
    await harness.close()
  }
})

test('lease ownership conflicts are detected and surfaced', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    harness.service.adoptExternalLease({
      persistenceDomain: 'checkpoint',
      ownerOperationId: 'external-lock-holder',
      acquiredAt: '2026-05-13T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      leaseLineageHash: 'external-lock-lineage',
    })

    await harness.service.executeCoordinatedOperation({
      context: context('checkpoint-write-1', {
        persistenceDomain: 'checkpoint',
        executionClass: 'runtime',
        executionPriority: 'normal',
      }),
      work: async () => 'ok',
    })

    const status = await harness.service.getStatus()
    assert.equal(status.leaseCoordinationState.leaseConflictTotal >= 1, true)
  } finally {
    await harness.close()
  }
})

test('recovery replay work is not starved by background replay work', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const completed: string[] = []

    const work = Array.from({ length: 5 }, (_, idx) => harness.service.executeCoordinatedOperation({
      context: context(`bg-replay-${idx}`, {
        persistenceDomain: 'replay',
        executionClass: 'runtime',
        executionPriority: 'background',
        replayRelevant: true,
        replayFingerprint: `bg-fp-${idx}`,
        mutationLineageHash: `bg-lineage-${idx}`,
      }),
      work: async () => {
        await new Promise((resolve) => setTimeout(resolve, 4))
        completed.push(`bg-replay-${idx}`)
        return `bg-replay-${idx}`
      },
    }))

    work.push(harness.service.executeCoordinatedOperation({
      context: context('recovery-replay-1', {
        persistenceDomain: 'replay',
        executionClass: 'recovery',
        executionPriority: 'critical',
        replayRelevant: true,
        recoveryRelevant: true,
        replayFingerprint: 'recovery-fp',
        mutationLineageHash: 'recovery-lineage',
      }),
      work: async () => {
        completed.push('recovery-replay-1')
        return 'recovery-replay-1'
      },
    }))

    await Promise.all(work)

    assert.equal(completed.indexOf('recovery-replay-1') < completed.length - 1, true)
  } finally {
    await harness.close()
  }
})

test('queue lineage hash remains deterministic for same logical write', { concurrency: false }, async () => {
  const runOnce = async () => {
    const harness = await createHarness()

    try {
      await harness.service.executeCoordinatedOperation({
        context: context('deterministic-lineage-op', {
          persistenceDomain: 'entity',
          executionClass: 'runtime',
          executionPriority: 'high',
          replayFingerprint: 'same-fingerprint',
          mutationLineageHash: 'same-lineage',
          requestedAt: '2026-05-13T02:00:00.000Z',
        }),
        work: async () => 'ok',
      })

      const queued = await harness.db.get<{ queue_lineage_hash: string }>(
        `
          SELECT queue_lineage_hash
          FROM flowmind_sovereign_persistence_queue
          WHERE operation_id = ?
            AND queue_state = 'queued'
          LIMIT 1
        `,
        'deterministic-lineage-op',
      )

      return queued?.queue_lineage_hash ?? null
    } finally {
      await harness.close()
    }
  }

  const first = await runOnce()
  const second = await runOnce()

  assert.equal(typeof first, 'string')
  assert.equal(first, second)
})
