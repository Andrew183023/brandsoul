import assert from 'node:assert/strict'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import {
  createSovereignPersistenceCoordinationService,
  type SovereignPersistenceContext,
} from './sovereignPersistenceCoordinationService.js'

async function createHarness() {
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile: ':memory:',
  })
  await initializeDatabase(db)

  const service = createSovereignPersistenceCoordinationService({
    db,
    leaseDurationMs: 250,
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

function makeContext(input: Partial<SovereignPersistenceContext> & Pick<SovereignPersistenceContext, 'operationId'>): SovereignPersistenceContext {
  return {
    operationId: input.operationId,
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

test('1. SQLITE_BUSY retried safely', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    let attempts = 0
    const result = await harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'busy-retry-1', persistenceDomain: 'runtime' }),
      work: async () => {
        attempts += 1
        if (attempts <= 2) {
          throw new Error('SQLITE_BUSY: database is locked')
        }

        return 'ok'
      },
    })

    assert.equal(result, 'ok')
    assert.equal(attempts, 3)

    const status = await harness.service.getStatus()
    assert.equal(status.metrics.sovereign_persistence_retry_total >= 2, true)
    assert.equal(status.retryExhaustionState.retryExhausted, false)
  } finally {
    await harness.close()
  }
})

test('2. sovereign writes serialized deterministically', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const started: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const op1 = harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'serialize-1', persistenceDomain: 'governance' }),
      work: async () => {
        started.push('serialize-1')
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 20))
        inFlight -= 1
        return 'serialize-1'
      },
    })

    const op2 = harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'serialize-2', persistenceDomain: 'governance' }),
      work: async () => {
        started.push('serialize-2')
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 20))
        inFlight -= 1
        return 'serialize-2'
      },
    })

    const results = await Promise.all([op1, op2])

    assert.deepEqual(results, ['serialize-1', 'serialize-2'])
    assert.deepEqual(started, ['serialize-1', 'serialize-2'])
    assert.equal(maxInFlight, 1)
  } finally {
    await harness.close()
  }
})

test('3. replay persistence ordering deterministic', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const completed: string[] = []

    await Promise.all([
      harness.service.executeCoordinatedOperation({
        context: makeContext({ operationId: 'replay-order-1', persistenceDomain: 'replay', executionClass: 'replay', executionPriority: 'high', replayRelevant: true, replayFingerprint: 'fp-1', mutationLineageHash: 'ml-1' }),
        work: async () => {
          completed.push('replay-order-1')
          return 'replay-order-1'
        },
      }),
      harness.service.executeCoordinatedOperation({
        context: makeContext({ operationId: 'replay-order-2', persistenceDomain: 'replay', executionClass: 'replay', executionPriority: 'high', replayRelevant: true, replayFingerprint: 'fp-2', mutationLineageHash: 'ml-2' }),
        work: async () => {
          completed.push('replay-order-2')
          return 'replay-order-2'
        },
      }),
      harness.service.executeCoordinatedOperation({
        context: makeContext({ operationId: 'replay-order-3', persistenceDomain: 'replay', executionClass: 'replay', executionPriority: 'high', replayRelevant: true, replayFingerprint: 'fp-3', mutationLineageHash: 'ml-3' }),
        work: async () => {
          completed.push('replay-order-3')
          return 'replay-order-3'
        },
      }),
    ])

    assert.deepEqual(completed, ['replay-order-1', 'replay-order-2', 'replay-order-3'])
  } finally {
    await harness.close()
  }
})

test('4. recovery writes prioritized', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const completed: string[] = []

    const a = harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'bg-a', persistenceDomain: 'checkpoint', executionPriority: 'background', executionClass: 'runtime' }),
      work: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15))
        completed.push('bg-a')
        return 'bg-a'
      },
    })

    const b = harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'recovery-b', persistenceDomain: 'checkpoint', executionPriority: 'critical', executionClass: 'recovery', recoveryRelevant: true }),
      work: async () => {
        completed.push('recovery-b')
        return 'recovery-b'
      },
    })

    const c = harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'bg-c', persistenceDomain: 'checkpoint', executionPriority: 'background', executionClass: 'runtime' }),
      work: async () => {
        completed.push('bg-c')
        return 'bg-c'
      },
    })

    await Promise.all([a, b, c])

    assert.equal(completed.indexOf('recovery-b') < completed.indexOf('bg-c'), true)
    const status = await harness.service.getStatus()
    assert.equal(status.recoveryPriorityState.recoveryPriorityExecutionTotal >= 1, true)
  } finally {
    await harness.close()
  }
})

test('5. persistence lease conflict detected', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    harness.service.adoptExternalLease({
      persistenceDomain: 'runtime',
      ownerOperationId: 'external-owner',
      acquiredAt: '2026-05-13T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      leaseLineageHash: 'external-lease',
    })

    await harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'lease-conflict-1', persistenceDomain: 'runtime' }),
      work: async () => 'ok',
    })

    const status = await harness.service.getStatus()
    assert.equal(status.leaseCoordinationState.leaseConflictTotal >= 1, true)
  } finally {
    await harness.close()
  }
})

test('6. transactional queue lineage stable', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'queue-lineage-1', persistenceDomain: 'queue' }),
      work: async () => 'ok',
    })

    const rows = await harness.db.all<Array<{ queue_state: string; queue_lineage_hash: string }>>(
      'SELECT queue_state, queue_lineage_hash FROM flowmind_sovereign_persistence_queue WHERE operation_id = ? ORDER BY created_at ASC, queue_event_id ASC',
      'queue-lineage-1',
    )

    assert.equal(rows.length >= 3, true)
    assert.equal(rows.every((row) => typeof row.queue_lineage_hash === 'string' && row.queue_lineage_hash.length > 0), true)
  } finally {
    await harness.close()
  }
})

test('7. replay queue divergence prevented', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    let executed = 0

    const p1 = harness.service.executeCoordinatedOperation({
      context: makeContext({
        operationId: 'replay-dedupe-1',
        persistenceDomain: 'replay',
        executionClass: 'replay',
        executionPriority: 'high',
        replayRelevant: true,
        replayFingerprint: 'rfp-shared',
        mutationLineageHash: 'ml-shared',
      }),
      work: async () => {
        executed += 1
        await new Promise((resolve) => setTimeout(resolve, 25))
        return 'replay-result'
      },
    })

    const p2 = harness.service.executeCoordinatedOperation({
      context: makeContext({
        operationId: 'replay-dedupe-2',
        persistenceDomain: 'replay',
        executionClass: 'replay',
        executionPriority: 'high',
        replayRelevant: true,
        replayFingerprint: 'rfp-shared',
        mutationLineageHash: 'ml-shared',
      }),
      work: async () => {
        executed += 1
        return 'unexpected'
      },
    })

    const [r1, r2] = await Promise.all([p1, p2])
    assert.equal(r1, 'replay-result')
    assert.equal(r2, 'replay-result')
    assert.equal(executed, 1)

    const status = await harness.service.getStatus()
    assert.equal(status.replaySerializationState.replaySerializationTotal >= 1, true)
  } finally {
    await harness.close()
  }
})

test('8. retry exhaustion classified correctly', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await assert.rejects(
      () => harness.service.executeCoordinatedOperation({
        context: makeContext({ operationId: 'retry-exhausted-1', persistenceDomain: 'runtime' }),
        work: async () => {
          throw new Error('SQLITE_BUSY: database is locked')
        },
      }),
      /SQLITE_BUSY/i,
    )

    const status = await harness.service.getStatus()
    assert.equal(status.retryExhaustionState.retryExhausted, true)
    assert.equal(status.retryExhaustionState.total >= 1, true)
  } finally {
    await harness.close()
  }
})

test('9. recovery replay not starved', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const completed: string[] = []

    const jobs: Array<Promise<string>> = []
    for (let index = 0; index < 6; index += 1) {
      jobs.push(harness.service.executeCoordinatedOperation({
        context: makeContext({
          operationId: `bg-starve-${index}`,
          persistenceDomain: 'replay',
          executionClass: 'runtime',
          executionPriority: 'background',
          replayRelevant: true,
          replayFingerprint: `bg-fp-${index}`,
          mutationLineageHash: `bg-ml-${index}`,
        }),
        work: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          completed.push(`bg-starve-${index}`)
          return `bg-starve-${index}`
        },
      }))
    }

    jobs.push(harness.service.executeCoordinatedOperation({
      context: makeContext({
        operationId: 'recovery-priority-replay',
        persistenceDomain: 'replay',
        executionClass: 'recovery',
        executionPriority: 'critical',
        replayRelevant: true,
        recoveryRelevant: true,
        replayFingerprint: 'recovery-fp',
        mutationLineageHash: 'recovery-ml',
      }),
      work: async () => {
        completed.push('recovery-priority-replay')
        return 'recovery-priority-replay'
      },
    }))

    await Promise.all(jobs)

    assert.equal(completed.indexOf('recovery-priority-replay') < completed.length - 1, true)
  } finally {
    await harness.close()
  }
})

test('10. persistence lineage deterministic', { concurrency: false }, async () => {
  const runOnce = async () => {
    const harness = await createHarness()

    try {
      await harness.service.executeCoordinatedOperation({
        context: makeContext({
          operationId: 'lineage-deterministic-op',
          persistenceDomain: 'semantic',
          executionClass: 'governance',
          executionPriority: 'high',
          requestedAt: '2026-05-13T01:00:00.000Z',
          replayFingerprint: 'lineage-fp',
          mutationLineageHash: 'lineage-ml',
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
        'lineage-deterministic-op',
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

test('11. replay serialization prevents duplicate writes', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    let writes = 0

    const contexts = ['a', 'b', 'c'].map((suffix) => makeContext({
      operationId: `dedupe-${suffix}`,
      persistenceDomain: 'replay',
      executionClass: 'replay',
      executionPriority: 'high',
      replayRelevant: true,
      replayFingerprint: 'dup-fp',
      mutationLineageHash: 'dup-ml',
    }))

    const results = await Promise.all(contexts.map((context) => harness.service.executeCoordinatedOperation({
      context,
      work: async () => {
        writes += 1
        await new Promise((resolve) => setTimeout(resolve, 15))
        return 'deduped'
      },
    })))

    assert.deepEqual(results, ['deduped', 'deduped', 'deduped'])
    assert.equal(writes, 1)
  } finally {
    await harness.close()
  }
})

test('12. queue drain replay-safe', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await Promise.all([
      harness.service.executeCoordinatedOperation({
        context: makeContext({ operationId: 'drain-r1', persistenceDomain: 'replay', executionClass: 'replay', executionPriority: 'high', replayRelevant: true, replayFingerprint: 'drain-fp-1', mutationLineageHash: 'drain-ml-1' }),
        work: async () => 'r1',
      }),
      harness.service.executeCoordinatedOperation({
        context: makeContext({ operationId: 'drain-r2', persistenceDomain: 'replay', executionClass: 'replay', executionPriority: 'high', replayRelevant: true, replayFingerprint: 'drain-fp-2', mutationLineageHash: 'drain-ml-2' }),
        work: async () => 'r2',
      }),
    ])

    const status = await harness.service.getStatus()
    assert.equal(status.transactionalQueueState.depth, 0)
    assert.equal(status.transactionalQueueState.drainedTotal >= 2, true)
  } finally {
    await harness.close()
  }
})

test('13. concurrent sovereign writes coordinated safely', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    let inFlight = 0
    let maxInFlight = 0

    const jobs = Array.from({ length: 20 }, (_, index) => harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: `concurrent-${index}`, persistenceDomain: 'governance', executionPriority: 'normal', executionClass: 'governance' }),
      work: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 2))
        inFlight -= 1
        return index
      },
    }))

    const results = await Promise.all(jobs)
    assert.equal(results.length, 20)
    assert.equal(maxInFlight, 1)
  } finally {
    await harness.close()
  }
})

test('14. SQLite contention storm mitigated', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    let attempts = 0

    const result = await harness.service.executeCoordinatedOperation({
      context: makeContext({ operationId: 'storm-1', persistenceDomain: 'runtime', executionPriority: 'high' }),
      work: async () => {
        attempts += 1
        if (attempts <= 5) {
          throw new Error('SQLITE_BUSY: database is locked')
        }

        return 'storm-cleared'
      },
    })

    assert.equal(result, 'storm-cleared')
    assert.equal(attempts, 6)

    const status = await harness.service.getStatus()
    assert.equal(status.sqliteContentionState.lockStormDetected, true)
    assert.equal(status.sqliteContentionState.contentionLoopDetected, true)
  } finally {
    await harness.close()
  }
})
