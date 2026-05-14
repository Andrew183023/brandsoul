import assert from 'node:assert/strict'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import {
  createEconomicMemoryRepository,
  type EconomicMemoryRecord,
} from '../../persistence/economic/economicMemoryRepository.js'
import {
  createLearningLedgerRepository,
  type LearningLedgerRepository,
} from '../persistence/learningLedgerRepository.js'
import {
  type AppendLearningLedgerEventInput,
} from '../persistence/LearningLedgerEvent.js'
import { createEconomicMemoryRebuildEngine } from './economicMemoryRebuildEngine.js'
import { createEconomicMemoryRebuildService } from './economicMemoryRebuildService.js'
import { runWithMutationAuthority } from '../../sovereignty/authorityBoundary.js'

function canonicalizeRecords(records: EconomicMemoryRecord[]) {
  return records
    .map((record) => ({
      memoryId: record.memoryId,
      memoryScope: record.memoryScope,
      category: record.category,
      signalKeyword: record.signalKeyword,
      entityId: record.entityId,
      successCount: record.successCount,
      failureCount: record.failureCount,
      sampleCount: record.sampleCount,
      minimumSampleCount: record.minimumSampleCount,
      totalRevenue: record.totalRevenue,
      averageConversion: record.averageConversion,
      timeDecayWeight: record.timeDecayWeight,
      decayHalfLifeDays: record.decayHalfLifeDays,
      lastSeenAt: record.lastSeenAt,
      updatedAt: record.updatedAt,
    }))
    .sort((left, right) => left.memoryId.localeCompare(right.memoryId))
}

async function createTestDatabase() {
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile: ':memory:',
  })

  await initializeDatabase(db)
  return db
}

async function appendLedgerEvents(
  ledgerRepository: LearningLedgerRepository,
  events: AppendLearningLedgerEventInput[],
) {
  const insertedEvents = [] as Awaited<ReturnType<LearningLedgerRepository['appendLearningEvent']>>[]

  for (const input of events) {
    insertedEvents.push(await runWithMutationAuthority({
      source: 'economicMemoryRebuild.integrity.test.ts',
      viaExecutor: true,
    }, () => ledgerRepository.appendLearningEvent(input)))
  }

  return insertedEvents
}

async function runAsExecutor<T>(work: () => Promise<T>) {
  return runWithMutationAuthority({
    source: 'economicMemoryRebuild.integrity.test.ts',
    viaExecutor: true,
  }, work)
}

function buildEvent(input: {
  attributionId: string
  outcomeType: AppendLearningLedgerEventInput['outcomeType']
  conversionSuccess: boolean
  attributedRevenue: number
  observedAt: string
  signalKeyword?: string
  category?: string
  entityId?: string
}): AppendLearningLedgerEventInput {
  return {
    attributionId: input.attributionId,
    marketSignalId: 'signal-1',
    opportunityId: 'opportunity-1',
    proposalId: 'proposal-1',
    executionId: 'execution-1',
    entityId: input.entityId ?? 'entity-1',
    category: input.category ?? 'legal',
    signalKeyword: input.signalKeyword ?? 'labor-lawyer',
    outcomeType: input.outcomeType,
    attributedRevenue: input.attributedRevenue,
    conversionSuccess: input.conversionSuccess,
    observedAt: input.observedAt,
  }
}

test('rebuild from ledger produces the same memory as incremental runtime aggregation', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const memoryRepository = createEconomicMemoryRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)

  const events = await appendLedgerEvents(ledgerRepository, [
    buildEvent({ attributionId: 'attr-1', outcomeType: 'conversion_positive', conversionSuccess: true, attributedRevenue: 0, observedAt: '2026-05-07T10:00:00.000Z' }),
    buildEvent({ attributionId: 'attr-2', outcomeType: 'conversion_negative', conversionSuccess: false, attributedRevenue: 0, observedAt: '2026-05-07T10:01:00.000Z' }),
    buildEvent({ attributionId: 'attr-3', outcomeType: 'revenue_positive', conversionSuccess: true, attributedRevenue: 250, observedAt: '2026-05-07T10:02:00.000Z' }),
    buildEvent({ attributionId: 'attr-4', outcomeType: 'revenue_negative', conversionSuccess: false, attributedRevenue: 0, observedAt: '2026-05-07T10:03:00.000Z' }),
  ])

  for (const event of events) {
    if (event.inserted) {
      await runAsExecutor(() => memoryRepository.aggregateLearningEvent(event.learningEvent))
    }
  }

  const incrementalMemory = canonicalizeRecords(await memoryRepository.listAllEconomicMemory())

  await runAsExecutor(() => memoryRepository.clearEconomicMemory())

  const rebuilt = await rebuildEngine.rebuild({
    dryRun: false,
    scope: 'all',
    reason: 'integrity test incremental parity',
  })

  assert.equal(rebuilt.result.status, 'completed')
  assert.deepEqual(canonicalizeRecords(rebuilt.rebuiltRecords), incrementalMemory)
})

test('duplicate ledger events are not double counted', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)

  const duplicateEvent = buildEvent({
    attributionId: 'attr-dup',
    outcomeType: 'conversion_positive',
    conversionSuccess: true,
    attributedRevenue: 0,
    observedAt: '2026-05-07T11:00:00.000Z',
  })

  const first = await runAsExecutor(() => ledgerRepository.appendLearningEvent(duplicateEvent))
  const second = await runAsExecutor(() => ledgerRepository.appendLearningEvent(duplicateEvent))

  assert.equal(first.inserted, true)
  assert.equal(second.inserted, false)

  const rebuilt = await rebuildEngine.rebuild({
    dryRun: true,
    scope: 'all',
    reason: 'integrity test duplicate ledger event handling',
  })

  assert.equal(rebuilt.result.processedLedgerEvents, 1)
  const signalRecord = rebuilt.rebuiltRecords.find((record) => record.memoryScope === 'signal')
  assert.equal(signalRecord?.sampleCount, 1)
  assert.equal(signalRecord?.successCount, 1)
})

test('dry-run does not mutate economic memory', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const memoryRepository = createEconomicMemoryRepository(db)
  const rebuildService = createEconomicMemoryRebuildService(db)

  await appendLedgerEvents(ledgerRepository, [
    buildEvent({ attributionId: 'attr-dry-1', outcomeType: 'revenue_positive', conversionSuccess: true, attributedRevenue: 320, observedAt: '2026-05-07T12:00:00.000Z' }),
  ])

  await runAsExecutor(() => memoryRepository.updateEconomicMemory({
    memoryScope: 'signal',
    category: 'legacy',
    signalKeyword: 'legacy-signal',
    entityId: null,
    successCount: 3,
    failureCount: 1,
    sampleCount: 4,
    minimumSampleCount: 3,
    totalRevenue: 100,
    averageConversion: 0.75,
    timeDecayWeight: 1,
    decayHalfLifeDays: 30,
    lastSeenAt: '2026-05-07T09:59:00.000Z',
    updatedAt: '2026-05-07T09:59:00.000Z',
  }))

  const before = canonicalizeRecords(await memoryRepository.listAllEconomicMemory())
  const result = await rebuildService.rebuild({
    dryRun: true,
    scope: 'all',
    reason: 'integrity test dry-run immutability',
  })
  const after = canonicalizeRecords(await memoryRepository.listAllEconomicMemory())

  assert.equal(result.status, 'completed')
  assert.equal(result.dryRun, true)
  assert.deepEqual(after, before)
})

test('commit replaces economic memory deterministically', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const memoryRepository = createEconomicMemoryRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)
  const rebuildService = createEconomicMemoryRebuildService(db)

  await appendLedgerEvents(ledgerRepository, [
    buildEvent({ attributionId: 'attr-commit-1', outcomeType: 'conversion_positive', conversionSuccess: true, attributedRevenue: 0, observedAt: '2026-05-07T13:00:00.000Z' }),
    buildEvent({ attributionId: 'attr-commit-2', outcomeType: 'revenue_positive', conversionSuccess: true, attributedRevenue: 999, observedAt: '2026-05-07T13:01:00.000Z', signalKeyword: 'family-law' }),
  ])

  await runAsExecutor(() => memoryRepository.updateEconomicMemory({
    memoryScope: 'signal',
    category: 'stale',
    signalKeyword: 'stale-signal',
    entityId: null,
    successCount: 100,
    failureCount: 0,
    sampleCount: 100,
    minimumSampleCount: 3,
    totalRevenue: 5000,
    averageConversion: 1,
    timeDecayWeight: 1,
    decayHalfLifeDays: 30,
    lastSeenAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
  }))

  const expected = await rebuildEngine.rebuild({
    dryRun: false,
    scope: 'all',
    reason: 'integrity baseline expected output',
  })

  const firstCommit = await runAsExecutor(() => rebuildService.rebuild({
    dryRun: false,
    scope: 'all',
    reason: 'integrity test first commit',
  }))
  const afterFirstCommit = canonicalizeRecords(await memoryRepository.listAllEconomicMemory())

  const secondCommit = await runAsExecutor(() => rebuildService.rebuild({
    dryRun: false,
    scope: 'all',
    reason: 'integrity test second commit',
  }))
  const afterSecondCommit = canonicalizeRecords(await memoryRepository.listAllEconomicMemory())

  assert.equal(firstCommit.status, 'completed')
  assert.equal(secondCommit.status, 'completed')
  assert.deepEqual(afterFirstCommit, canonicalizeRecords(expected.rebuiltRecords))
  assert.deepEqual(afterSecondCommit, afterFirstCommit)
})

test('date range filtering works during rebuild', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)

  await appendLedgerEvents(ledgerRepository, [
    buildEvent({ attributionId: 'attr-range-1', outcomeType: 'conversion_positive', conversionSuccess: true, attributedRevenue: 0, observedAt: '2026-05-07T14:00:00.000Z' }),
    buildEvent({ attributionId: 'attr-range-2', outcomeType: 'conversion_negative', conversionSuccess: false, attributedRevenue: 0, observedAt: '2026-05-07T14:10:00.000Z' }),
    buildEvent({ attributionId: 'attr-range-3', outcomeType: 'revenue_positive', conversionSuccess: true, attributedRevenue: 700, observedAt: '2026-05-07T14:20:00.000Z' }),
  ])

  const rebuilt = await rebuildEngine.rebuild({
    dryRun: true,
    scope: 'all',
    reason: 'integrity test date range',
    fromObservedAt: '2026-05-07T14:05:00.000Z',
    toObservedAt: '2026-05-07T14:15:00.000Z',
  })

  assert.equal(rebuilt.result.status, 'completed')
  assert.equal(rebuilt.result.processedLedgerEvents, 1)
  const signalRecord = rebuilt.rebuiltRecords.find((record) => record.memoryScope === 'signal')
  assert.equal(signalRecord?.failureCount, 1)
  assert.equal(signalRecord?.successCount, 0)
})

test('malformed events are skipped and warnings are emitted', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)

  await appendLedgerEvents(ledgerRepository, [
    buildEvent({ attributionId: 'attr-warn-valid', outcomeType: 'conversion_positive', conversionSuccess: true, attributedRevenue: 0, observedAt: '2026-05-07T15:00:00.000Z' }),
  ])

  await db.run(
    `
      INSERT INTO flowmind_learning_ledger (
        learning_event_id,
        attribution_id,
        market_signal_id,
        opportunity_id,
        proposal_id,
        execution_id,
        entity_id,
        category,
        signal_keyword,
        outcome_type,
        attributed_revenue,
        conversion_success,
        observed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'learning-ledger:malformed:event',
    'attr-warn-malformed',
    'signal-1',
    'opportunity-1',
    'proposal-1',
    'execution-1',
    '',
    'legal',
    'labor-lawyer',
    'conversion_negative',
    0,
    0,
    'not-a-date',
  )

  const rebuilt = await rebuildEngine.rebuild({
    dryRun: true,
    scope: 'all',
    reason: 'integrity test malformed warnings',
  })

  assert.equal(rebuilt.result.status, 'completed')
  assert.equal(rebuilt.result.processedLedgerEvents, 1)
  assert.equal(rebuilt.result.skippedEvents, 1)
  assert.equal(rebuilt.result.warnings.length, 1)
  assert.match(rebuilt.result.warnings[0] ?? '', /malformed identifiers or observed_at/i)
})

test('rebuild is deterministic across repeated runs', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)

  await appendLedgerEvents(ledgerRepository, [
    buildEvent({ attributionId: 'attr-det-1', outcomeType: 'conversion_positive', conversionSuccess: true, attributedRevenue: 0, observedAt: '2026-05-07T16:00:00.000Z', signalKeyword: 'employment-law' }),
    buildEvent({ attributionId: 'attr-det-2', outcomeType: 'conversion_negative', conversionSuccess: false, attributedRevenue: 0, observedAt: '2026-05-07T16:01:00.000Z', signalKeyword: 'employment-law' }),
    buildEvent({ attributionId: 'attr-det-3', outcomeType: 'revenue_positive', conversionSuccess: true, attributedRevenue: 450, observedAt: '2026-05-07T16:02:00.000Z', signalKeyword: 'employment-law' }),
  ])

  const plan = {
    dryRun: true,
    scope: 'all' as const,
    reason: 'integrity test deterministic reruns',
  }

  const runA = await rebuildEngine.rebuild(plan)
  const runB = await rebuildEngine.rebuild(plan)

  assert.equal(runA.result.status, 'completed')
  assert.equal(runB.result.status, 'completed')
  assert.equal(runA.result.processedLedgerEvents, runB.result.processedLedgerEvents)
  assert.equal(runA.result.rebuiltMemoryRecords, runB.result.rebuiltMemoryRecords)
  assert.equal(runA.result.skippedEvents, runB.result.skippedEvents)
  assert.deepEqual(runA.result.warnings, runB.result.warnings)
  assert.deepEqual(canonicalizeRecords(runA.rebuiltRecords), canonicalizeRecords(runB.rebuiltRecords))
})

test('negative learning ledger rebuild remains stable across repeated runs', async (t) => {
  const db = await createTestDatabase()
  t.after(async () => {
    await db.close()
  })

  const ledgerRepository = createLearningLedgerRepository(db)
  const rebuildEngine = createEconomicMemoryRebuildEngine(db)

  await appendLedgerEvents(ledgerRepository, [
    buildEvent({
      attributionId: 'neg-attr-1',
      outcomeType: 'conversion_negative',
      conversionSuccess: false,
      attributedRevenue: 0,
      observedAt: '2026-05-07T17:00:00.000Z',
      signalKeyword: 'freight-quote',
      category: 'logistics',
      entityId: 'entity-logistics',
    }),
    buildEvent({
      attributionId: 'neg-attr-2',
      outcomeType: 'revenue_negative',
      conversionSuccess: false,
      attributedRevenue: 0,
      observedAt: '2026-05-07T17:01:00.000Z',
      signalKeyword: 'freight-quote',
      category: 'logistics',
      entityId: 'entity-logistics',
    }),
  ])

  const runA = await rebuildEngine.rebuild({
    dryRun: true,
    scope: 'all',
    reason: 'negative replay rebuild stability A',
  })
  const runB = await rebuildEngine.rebuild({
    dryRun: true,
    scope: 'all',
    reason: 'negative replay rebuild stability B',
  })

  assert.equal(runA.result.status, 'completed')
  assert.equal(runB.result.status, 'completed')
  assert.equal(runA.result.processedLedgerEvents, 2)
  assert.equal(runB.result.processedLedgerEvents, 2)
  assert.deepEqual(canonicalizeRecords(runA.rebuiltRecords), canonicalizeRecords(runB.rebuiltRecords))

  const signalRecord = runA.rebuiltRecords.find((record) => record.memoryScope === 'signal')
  assert.equal(signalRecord?.failureCount, 1)
  assert.equal(signalRecord?.successCount, 0)
  assert.equal(signalRecord?.sampleCount, 1)
})
