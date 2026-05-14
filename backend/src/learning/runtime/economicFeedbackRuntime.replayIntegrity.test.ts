import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { RevenueAttributionRecord } from '../../execution/revenue/revenueAttributionEngine.js'
import type { SovereignExecutionRecord } from '../../execution/contracts/SovereignExecutionRecord.js'
import { createRevenueAttributionSnapshotStore } from '../../execution/revenue/runtime/revenueAttributionSnapshotStore.js'
import { createSovereignExecutionSnapshotStore } from '../../execution/runtime/sovereignExecutionSnapshotStore.js'
import { createOpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import type { OpportunityLead } from '../../market-signals/opportunities/contracts/OpportunityLead.js'
import {
  EconomicFeedbackRuntime,
  type EconomicFeedbackRuntimeStatus,
} from './economicFeedbackRuntime.js'
import { buildLearningLedgerEventId, type AppendLearningLedgerEventInput, type LearningLedgerEvent } from '../persistence/LearningLedgerEvent.js'
import type { EconomicMemoryRecord } from '../../persistence/economic/economicMemoryRepository.js'
import type { UpsertLearningCheckpointInput } from '../persistence/learningCheckpointRepository.js'
import type { NegativeEconomicOutcome, AppendNegativeEconomicOutcomeInput } from '../negative-outcomes/NegativeEconomicOutcome.js'
import { buildNegativeEconomicOutcomeId } from '../negative-outcomes/NegativeEconomicOutcome.js'
import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createInstitutionalContinuityGovernanceService } from '../../services/institutionalContinuityGovernanceService.js'
import { createObservabilityService } from '../../services/observabilityService.js'
import { createRuntimeContinuityAttestationService } from '../../services/runtimeContinuityAttestationService.js'
import { createRuntimeGovernanceService } from '../../services/runtimeGovernanceService.js'
import { createInstitutionalSovereignMutationGate, installInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { createSemanticMutationExecutor, installSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'

const ECONOMIC_RUNTIME_NAME = 'economic-feedback-runtime'
const NEGATIVE_RUNTIME_NAME = 'economic-feedback-negative-outcome-runtime'

class FakeLearningLedgerRepository {
  private readonly events = new Map<string, LearningLedgerEvent>()

  insertedCount = 0
  conflictCount = 0

  async appendLearningEvent(input: AppendLearningLedgerEventInput): Promise<{ learningEvent: LearningLedgerEvent; inserted: boolean }> {
    const learningEventId = input.learningEventId ?? buildLearningLedgerEventId({
      attributionId: input.attributionId,
      marketSignalId: input.marketSignalId,
      opportunityId: input.opportunityId,
      proposalId: input.proposalId,
      executionId: input.executionId,
      entityId: input.entityId,
      category: input.category,
      signalKeyword: input.signalKeyword,
      outcomeType: input.outcomeType,
      attributedRevenue: input.attributedRevenue,
      conversionSuccess: input.conversionSuccess,
      observedAt: input.observedAt,
    })

    const existing = this.events.get(learningEventId)
    if (existing) {
      this.conflictCount += 1
      return { learningEvent: existing, inserted: false }
    }

    const learningEvent: LearningLedgerEvent = {
      learningEventId,
      attributionId: input.attributionId,
      marketSignalId: input.marketSignalId,
      opportunityId: input.opportunityId,
      proposalId: input.proposalId,
      executionId: input.executionId,
      entityId: input.entityId,
      category: input.category,
      signalKeyword: input.signalKeyword,
      outcomeType: input.outcomeType,
      attributedRevenue: input.attributedRevenue,
      conversionSuccess: input.conversionSuccess,
      observedAt: input.observedAt,
    }

    this.events.set(learningEventId, learningEvent)
    this.insertedCount += 1
    return { learningEvent, inserted: true }
  }
}

class FakeEconomicMemoryRepository {
  mutationCount = 0
  mutationByLearningEventId = new Map<string, number>()

  async aggregateLearningEvent(event: LearningLedgerEvent): Promise<EconomicMemoryRecord[]> {
    this.mutationCount += 1
    const current = this.mutationByLearningEventId.get(event.learningEventId) ?? 0
    this.mutationByLearningEventId.set(event.learningEventId, current + 1)

    return [
      {
        memoryId: `memory:${event.learningEventId}`,
        memoryScope: 'signal',
        category: event.category,
        signalKeyword: event.signalKeyword,
        entityId: null,
        successCount: event.conversionSuccess ? 1 : 0,
        failureCount: event.conversionSuccess ? 0 : 1,
        sampleCount: 1,
        minimumSampleCount: 3,
        totalRevenue: event.attributedRevenue,
        averageConversion: event.conversionSuccess ? 1 : 0,
        timeDecayWeight: 1,
        decayHalfLifeDays: 30,
        lastSeenAt: event.observedAt,
        updatedAt: event.observedAt,
      },
    ]
  }
}

type CheckpointRecord = {
  checkpointId: string
  runtimeName: string
  lastProcessedAttributionId: string | null
  lastProcessedAttributedAt: string | null
  updatedAt: string
}

class FakeLearningCheckpointRepository {
  private readonly byRuntime = new Map<string, CheckpointRecord>()
  private readonly failNext = new Set<string>()

  failNextUpsert(runtimeName: string) {
    this.failNext.add(runtimeName)
  }

  async upsertCheckpoint(input: UpsertLearningCheckpointInput): Promise<CheckpointRecord> {
    if (this.failNext.has(input.runtimeName)) {
      this.failNext.delete(input.runtimeName)
      throw new Error(`simulated checkpoint failure for ${input.runtimeName}`)
    }

    const record: CheckpointRecord = {
      checkpointId: input.checkpointId ?? `checkpoint:${input.runtimeName}`,
      runtimeName: input.runtimeName,
      lastProcessedAttributionId: input.lastProcessedAttributionId,
      lastProcessedAttributedAt: input.lastProcessedAttributedAt,
      updatedAt: input.updatedAt,
    }

    this.byRuntime.set(input.runtimeName, record)
    return record
  }

  async getCheckpointByRuntimeName(runtimeName: string): Promise<CheckpointRecord | null> {
    return this.byRuntime.get(runtimeName) ?? null
  }
}

class FakeNegativeOutcomeRepository {
  constructor(private readonly outcomes: NegativeEconomicOutcome[]) {}

  async listNegativeOutcomes(limit = 200): Promise<NegativeEconomicOutcome[]> {
    return this.outcomes.slice(0, limit)
  }
}

function buildAttribution(args: {
  attributionId: string
  attributedAt: string
  revenue: number
}): RevenueAttributionRecord {
  return {
    attributionId: args.attributionId,
    marketSignalId: 'signal-1',
    opportunityId: 'opportunity-1',
    proposalId: 'proposal-1',
    executionId: 'execution-1',
    generatedLeadId: 'lead-1',
    revenue: args.revenue,
    currency: 'USD',
    recognizedAt: args.attributedAt,
    revenueEventId: `revenue-event:${args.attributionId}`,
    invoiceId: `invoice:${args.attributionId}`,
    paymentId: `payment:${args.attributionId}`,
    contractId: `contract:${args.attributionId}`,
    sourceSystem: 'test',
    lineageKey: 'lineage:test',
    revenueFingerprint: `fingerprint:${args.attributionId}`,
    attributedAt: args.attributedAt,
    lineage: [],
    resultSummary: 'test attribution',
  }
}

function buildOpportunity(): OpportunityLead {
  return {
    id: 'opportunity-1',
    keyword: 'labor lawyer',
    category: 'legal',
    economicRelevance: 92,
    leadProbability: 'high',
    sourceSignalId: 'signal-1',
    detectedAt: '2026-05-07T00:00:00.000Z',
    recommendedAction: 'offer_consultation',
  }
}

function buildExecution(): SovereignExecutionRecord {
  return {
    executionId: 'execution-1',
    proposalId: 'proposal-1',
    entityId: 'entity-1',
    actionType: 'send_message',
    executionStatus: 'completed',
    startedAt: '2026-05-07T00:00:00.000Z',
    completedAt: '2026-05-07T00:01:00.000Z',
    generatedLeadId: 'lead-1',
    revenueAttributed: 100,
  }
}

function buildNegativeOutcome(input: AppendNegativeEconomicOutcomeInput): NegativeEconomicOutcome {
  return {
    outcomeId: input.outcomeId ?? buildNegativeEconomicOutcomeId(input),
    ...input,
  }
}

function buildRuntime(args: {
  attributions: RevenueAttributionRecord[]
  negativeOutcomes: NegativeEconomicOutcome[]
  checkpointRepository: FakeLearningCheckpointRepository
  ledgerRepository: FakeLearningLedgerRepository
  memoryRepository: FakeEconomicMemoryRepository
}) {
  const revenueStore = createRevenueAttributionSnapshotStore()
  revenueStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-07T00:00:00.000Z',
    attributions: args.attributions,
    metrics: {
      attributionCount: args.attributions.length,
      attributedRevenue: args.attributions.reduce((total, item) => total + item.revenue, 0),
      unresolvedRevenueEventCount: 0,
    },
  })

  const opportunityStore = createOpportunitySnapshotStore()
  opportunityStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-07T00:00:00.000Z',
    opportunities: [buildOpportunity()],
    suggestions: [],
  })

  const executionStore = createSovereignExecutionSnapshotStore()
  executionStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-07T00:00:00.000Z',
    executions: [buildExecution()],
    metrics: {
      executionCount: 1,
      successCount: 1,
      failedCount: 0,
      revenueAttributed: 100,
    },
  })

  const runtime = new EconomicFeedbackRuntime({
    revenueAttributionSnapshotStore: revenueStore,
    opportunitySnapshotStore: opportunityStore,
    sovereignExecutionSnapshotStore: executionStore,
    negativeOutcomeRepository: new FakeNegativeOutcomeRepository(args.negativeOutcomes) as unknown as import('../persistence/negativeOutcomeRepository.js').NegativeOutcomeRepository,
    learningLedgerRepository: args.ledgerRepository as unknown as import('../persistence/learningLedgerRepository.js').LearningLedgerRepository,
    economicMemoryRepository: args.memoryRepository as unknown as import('../../persistence/economic/economicMemoryRepository.js').EconomicMemoryRepository,
    learningCheckpointRepository: args.checkpointRepository as unknown as import('../persistence/learningCheckpointRepository.js').LearningCheckpointRepository,
  })

  return runtime
}

function assertNoDuplicateMutations(memoryRepository: FakeEconomicMemoryRepository) {
  for (const count of memoryRepository.mutationByLearningEventId.values()) {
    assert.equal(count, 1)
  }
}

function readStatus(runtime: EconomicFeedbackRuntime): EconomicFeedbackRuntimeStatus {
  return runtime.getStatus()
}

async function installTestSovereignMutationGate() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'economic-feedback-replay-integrity-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  const observability = createObservabilityService()
  const runtimeGovernance = createRuntimeGovernanceService({ observability })
  const continuityGovernance = createInstitutionalContinuityGovernanceService({
    db: connection,
    observability,
  })
  await continuityGovernance.initialize()
  const runtimeContinuityAttestationService = createRuntimeContinuityAttestationService({
    db: connection,
    observability,
  })

  ;(runtimeContinuityAttestationService as unknown as {
    getStatus(): Record<string, unknown>
  }).getStatus = () => ({
    attestationIntegrity: 'verified',
    replayVerificationState: 'verified',
    recoveryRequired: false,
    brokenAttestationChains: [],
  })

  installInstitutionalSovereignMutationGate(createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
  }))
  installSemanticMutationExecutor(createSemanticMutationExecutor({
    db: connection,
    observability,
  }))

  return async () => {
    await connection.close()
    await rm(workspace, { recursive: true, force: true })
  }
}

test('replay after crash between ledger/memory and checkpoint does not double-mutate memory', async () => {
  const cleanup = await installTestSovereignMutationGate()
  const checkpointRepository = new FakeLearningCheckpointRepository()
  checkpointRepository.failNextUpsert(ECONOMIC_RUNTIME_NAME)

  const ledgerRepository = new FakeLearningLedgerRepository()
  const memoryRepository = new FakeEconomicMemoryRepository()
  const runtime = buildRuntime({
    attributions: [buildAttribution({ attributionId: 'attribution-1', attributedAt: '2026-05-07T00:02:00.000Z', revenue: 100 })],
    negativeOutcomes: [],
    checkpointRepository,
    ledgerRepository,
    memoryRepository,
  })

  await assert.rejects(() => runtime.refresh(), /simulated checkpoint failure/)
  assert.equal(memoryRepository.mutationCount, 1)

  await runtime.refresh()

  assert.equal(memoryRepository.mutationCount, 1)
  assert.equal(ledgerRepository.insertedCount, 1)
  assert.equal(ledgerRepository.conflictCount, 0)
  assertNoDuplicateMutations(memoryRepository)
  await cleanup()
})

test('duplicate attribution replay keeps economic memory stable', async () => {
  const cleanup = await installTestSovereignMutationGate()
  const checkpointRepository = new FakeLearningCheckpointRepository()
  const ledgerRepository = new FakeLearningLedgerRepository()
  const memoryRepository = new FakeEconomicMemoryRepository()

  const runtime = buildRuntime({
    attributions: [buildAttribution({ attributionId: 'attribution-dup', attributedAt: '2026-05-07T00:03:00.000Z', revenue: 75 })],
    negativeOutcomes: [],
    checkpointRepository,
    ledgerRepository,
    memoryRepository,
  })

  await runtime.refresh()
  const firstMutationCount = memoryRepository.mutationCount

  await runtime.refresh()

  assert.equal(firstMutationCount, 1)
  assert.equal(memoryRepository.mutationCount, firstMutationCount)
  assertNoDuplicateMutations(memoryRepository)
  await cleanup()
})

test('duplicate negative outcome replay does not duplicate aggregate mutation', async () => {
  const cleanup = await installTestSovereignMutationGate()
  const checkpointRepository = new FakeLearningCheckpointRepository()
  const ledgerRepository = new FakeLearningLedgerRepository()
  const memoryRepository = new FakeEconomicMemoryRepository()

  const negative = buildNegativeOutcome({
    outcomeType: 'failed_execution',
    entityId: 'entity-1',
    marketSignalId: 'signal-1',
    opportunityId: 'opportunity-1',
    proposalId: 'proposal-1',
    executionId: 'execution-1',
    category: 'legal',
    signalKeyword: 'labor lawyer',
    detectedAt: '2026-05-07T00:04:00.000Z',
    reason: 'execution failed in test',
  })

  const runtime = buildRuntime({
    attributions: [],
    negativeOutcomes: [negative],
    checkpointRepository,
    ledgerRepository,
    memoryRepository,
  })

  await runtime.refresh()
  const firstMutationCount = memoryRepository.mutationCount

  await runtime.refresh()

  assert.equal(firstMutationCount, 2)
  assert.equal(memoryRepository.mutationCount, firstMutationCount)
  assert.equal(ledgerRepository.insertedCount, 2)
  assert.equal(ledgerRepository.conflictCount, 0)
  assertNoDuplicateMutations(memoryRepository)
  await cleanup()
})

test('restart recovery restores checkpoints and preserves replay consistency', async () => {
  const cleanup = await installTestSovereignMutationGate()
  const checkpointRepository = new FakeLearningCheckpointRepository()
  const ledgerRepository = new FakeLearningLedgerRepository()
  const memoryRepository = new FakeEconomicMemoryRepository()

  const negative = buildNegativeOutcome({
    outcomeType: 'proposal_rejected',
    entityId: 'entity-1',
    marketSignalId: 'signal-1',
    opportunityId: 'opportunity-1',
    proposalId: 'proposal-1',
    executionId: 'execution-1',
    category: 'legal',
    signalKeyword: 'labor lawyer',
    detectedAt: '2026-05-07T00:05:00.000Z',
    reason: 'rejected for replay test',
  })

  const runtimeA = buildRuntime({
    attributions: [buildAttribution({ attributionId: 'attribution-restart', attributedAt: '2026-05-07T00:05:30.000Z', revenue: 110 })],
    negativeOutcomes: [negative],
    checkpointRepository,
    ledgerRepository,
    memoryRepository,
  })

  await runtimeA.refresh()
  const memoryMutationsAfterFirstRun = memoryRepository.mutationCount

  const runtimeB = buildRuntime({
    attributions: [buildAttribution({ attributionId: 'attribution-restart', attributedAt: '2026-05-07T00:05:30.000Z', revenue: 110 })],
    negativeOutcomes: [negative],
    checkpointRepository,
    ledgerRepository,
    memoryRepository,
  })

  await runtimeB.start()
  await runtimeB.stop()

  assert.equal(memoryRepository.mutationCount, memoryMutationsAfterFirstRun)

  const status = readStatus(runtimeB)
  assert.notEqual(status.lastDurableAttributionWatermark, null)
  assert.notEqual(status.lastDurableNegativeOutcomeWatermark, null)
  assert.equal(status.negativeReplayLag, 0)
  assertNoDuplicateMutations(memoryRepository)
  await cleanup()
})

test('large negative backlog above 5000 is processed without starvation', async () => {
  const cleanup = await installTestSovereignMutationGate()
  const checkpointRepository = new FakeLearningCheckpointRepository()
  const ledgerRepository = new FakeLearningLedgerRepository()
  const memoryRepository = new FakeEconomicMemoryRepository()

  const totalNegativeOutcomes = 5_101
  const negativeOutcomes: NegativeEconomicOutcome[] = []

  for (let index = 0; index < totalNegativeOutcomes; index += 1) {
    const second = String(index % 60).padStart(2, '0')
    const minute = String(Math.floor(index / 60)).padStart(2, '0')

    negativeOutcomes.push(buildNegativeOutcome({
      outcomeType: 'proposal_rejected',
      outcomeId: `negative-${String(index).padStart(5, '0')}`,
      entityId: 'entity-1',
      marketSignalId: 'signal-1',
      opportunityId: 'opportunity-1',
      proposalId: `proposal-${index}`,
      executionId: 'execution-1',
      category: 'legal',
      signalKeyword: 'labor lawyer',
      detectedAt: `2026-05-07T${minute}:${second}.000Z`,
      reason: `rejected-${index}`,
    }))
  }

  const runtime = buildRuntime({
    attributions: [],
    negativeOutcomes,
    checkpointRepository,
    ledgerRepository,
    memoryRepository,
  })

  await runtime.refresh()

  const status = readStatus(runtime)
  assert.equal(status.negativeProcessedCount, totalNegativeOutcomes)
  assert.equal(status.negativePendingCount, 0)
  assert.equal(status.negativeReplayLag, 0)
  assert.equal(memoryRepository.mutationCount, totalNegativeOutcomes)
  assert.equal(status.lastDurableNegativeOutcomeWatermark?.attributionId, 'negative-05100')
  assertNoDuplicateMutations(memoryRepository)
  await cleanup()
})
