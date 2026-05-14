import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import { buildServer } from '../../server.js'
import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import type { RevenueAttributionRecord } from '../../execution/revenue/revenueAttributionEngine.js'
import { createRevenueAttributionSnapshotStore } from '../../execution/revenue/runtime/revenueAttributionSnapshotStore.js'
import type { SovereignExecutionRecord } from '../../execution/contracts/SovereignExecutionRecord.js'
import { createSovereignExecutionSnapshotStore } from '../../execution/runtime/sovereignExecutionSnapshotStore.js'
import { createOpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import type { OpportunityLead } from '../../market-signals/opportunities/contracts/OpportunityLead.js'
import { createEconomicMemoryRepository } from '../../persistence/economic/economicMemoryRepository.js'
import { createRevenueAttributionRepository } from '../../persistence/revenue/revenueAttributionRepository.js'
import { createNegativeOutcomeRepository } from '../persistence/negativeOutcomeRepository.js'
import { createLearningCheckpointRepository } from '../persistence/learningCheckpointRepository.js'
import { createLearningLedgerRepository } from '../persistence/learningLedgerRepository.js'
import { EconomicFeedbackRuntime } from './economicFeedbackRuntime.js'
import { runWithMutationAuthority } from '../../sovereignty/authorityBoundary.js'

const ECONOMIC_FEEDBACK_RUNTIME_NAME = 'economic-feedback-runtime'
const ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME = 'economic-feedback-negative-outcome-runtime'

type AppWithContext = FastifyInstance & {
  backendContext: {
    jobWorker: {
      stop(): Promise<void>
    }
    terminalFailureDetectionRuntime: {
      getStatus(): {
        started: boolean
      }
    }
    negativeAttributionRuntime: {
      getStatus(): {
        started: boolean
      }
    }
    economicFeedbackRuntime: {
      refresh(): Promise<void>
      getStatus(): {
        started: boolean
        lastError: string | null
        lastAppendedEventCount: number
        lastProcessedAttributionCount: number
        replayLag: number
        negativeProcessedCount: number
        negativeReplayLag: number
        lastProcessedAttributionWatermark: {
          attributionId: string
          attributedAt: string
        } | null
        lastDurableNegativeOutcomeWatermark: {
          attributionId: string
          attributedAt: string
        } | null
      }
    }
    learningLedgerRepository: {
      countLearningEvents(): Promise<number>
      listLearningEvents(limit?: number): Promise<Array<{
        learningEventId: string
        attributionId: string
        outcomeType: 'revenue_positive' | 'revenue_negative' | 'conversion_positive' | 'conversion_negative'
      }>>
      appendLearningEvent(input: {
        attributionId: string
        marketSignalId: string
        opportunityId: string
        proposalId: string
        executionId: string
        entityId: string
        category: string
        signalKeyword: string
        outcomeType: 'revenue_positive' | 'revenue_negative' | 'conversion_positive' | 'conversion_negative'
        attributedRevenue: number
        conversionSuccess: boolean
        observedAt: string
      }): Promise<unknown>
    }
    negativeOutcomeRepository: {
      listNegativeOutcomes(limit?: number): Promise<Array<{ outcomeId: string }>>
    }
    negativeAttributionRepository: {
      listNegativeAttributions(limit?: number): Promise<Array<{ attributionId: string }>>
    }
    economicMemoryRepository: {
      listAllEconomicMemory(): Promise<Array<{
        memoryId: string
        memoryScope: string
        category: string
        signalKeyword: string
        entityId: string | null
        successCount: number
        failureCount: number
        sampleCount: number
        totalRevenue: number
        averageConversion: number
      }>>
    }
    learningCheckpointRepository: {
      getCheckpointByRuntimeName(runtimeName: string): Promise<{
        checkpointId: string
        runtimeName: string
        lastProcessedAttributionId: string | null
        lastProcessedAttributedAt: string | null
        updatedAt: string
      } | null>
    }
    revenueAttributionSnapshotStore: {
      setSnapshot(snapshot: {
        status: 'warming' | 'ready'
        generatedAt: string
        attributions: RevenueAttributionRecord[]
        metrics: {
          attributionCount: number
          attributedRevenue: number
          unresolvedRevenueEventCount: number
        }
      }): void
    }
    opportunitySnapshotStore: {
      setSnapshot(snapshot: {
        status: 'warming' | 'ready'
        generatedAt: string
        opportunities: OpportunityLead[]
        suggestions: []
        topOpportunity: OpportunityLead
      }): void
    }
    sovereignExecutionSnapshotStore: {
      setSnapshot(snapshot: {
        status: 'warming' | 'ready'
        generatedAt: string
        executions: SovereignExecutionRecord[]
        metrics: {
          executionCount: number
          successCount: number
          failedCount: number
          revenueAttributed: number
        }
      }): void
    }
  }
}

async function seedNegativeOutcome(sqliteFile: string) {
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  try {
    const repository = createNegativeOutcomeRepository(db)
    return await runWithMutationAuthority({
      source: 'backend/src/learning/runtime/economicFeedbackRuntime.bootIntegration.test.ts#seedNegativeOutcome',
      viaExecutor: true,
    }, async () => repository.appendNegativeOutcome({
      outcomeType: 'proposal_rejected',
      entityId: 'entity-1',
      marketSignalId: 'signal-1',
      opportunityId: 'opportunity-1',
      proposalId: 'proposal-1',
      executionId: 'none',
      category: 'legal',
      signalKeyword: 'labor lawyer',
      detectedAt: '2026-05-08T10:00:00.000Z',
      reason: 'seeded governance rejection',
    }))
  } finally {
    await db.close()
  }
}

function canonicalizeMemory(records: Awaited<ReturnType<AppWithContext['backendContext']['economicMemoryRepository']['listAllEconomicMemory']>>) {
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
      totalRevenue: record.totalRevenue,
      averageConversion: record.averageConversion,
    }))
    .sort((left, right) => left.memoryId.localeCompare(right.memoryId))
}

function buildPositiveAttribution(): RevenueAttributionRecord {
  return {
    attributionId: 'positive-attribution-1',
    marketSignalId: 'signal-positive-1',
    opportunityId: 'opportunity-positive-1',
    proposalId: 'proposal-positive-1',
    executionId: 'execution-positive-1',
    generatedLeadId: 'lead-positive-1',
    revenue: 250,
    currency: 'USD',
    recognizedAt: '2026-05-08T12:00:00.000Z',
    revenueEventId: 'revenue-event-positive-1',
    invoiceId: 'invoice-positive-1',
    paymentId: 'payment-positive-1',
    contractId: 'contract-positive-1',
    sourceSystem: 'integration-test',
    lineageKey: 'lineage:positive-1',
    revenueFingerprint: 'revenue-fingerprint-positive-1',
    attributedAt: '2026-05-08T12:00:00.000Z',
    lineage: [],
    resultSummary: 'positive revenue attribution test fixture',
  }
}

function buildPositiveOpportunity(): OpportunityLead {
  return {
    id: 'opportunity-positive-1',
    keyword: 'labor lawyer',
    category: 'legal',
    economicRelevance: 92,
    leadProbability: 'high',
    sourceSignalId: 'signal-positive-1',
    detectedAt: '2026-05-08T11:00:00.000Z',
    recommendedAction: 'Generate legal intake flow',
  }
}

function buildPositiveExecution(): SovereignExecutionRecord {
  return {
    executionId: 'execution-positive-1',
    proposalId: 'proposal-positive-1',
    entityId: 'entity-positive-1',
    actionType: 'portfolio.lead.route',
    executionStatus: 'completed',
    startedAt: '2026-05-08T11:30:00.000Z',
    completedAt: '2026-05-08T11:45:00.000Z',
    generatedLeadId: 'lead-positive-1',
    revenueAttributed: 250,
    resultSummary: 'positive execution test fixture',
  }
}

async function seedPositiveRevenueAttribution(sqliteFile: string, attribution: RevenueAttributionRecord) {
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  try {
    const revenueAttributionRepository = createRevenueAttributionRepository(db)
    await runWithMutationAuthority({
      source: 'backend/src/learning/runtime/economicFeedbackRuntime.bootIntegration.test.ts#seedPositiveRevenueAttribution',
      viaExecutor: true,
    }, async () => revenueAttributionRepository.persistAttribution({
      attributionId: attribution.attributionId,
      marketSignalId: attribution.marketSignalId,
      opportunityId: attribution.opportunityId,
      proposalId: attribution.proposalId,
      executionId: attribution.executionId,
      leadId: attribution.generatedLeadId,
      revenueEventId: attribution.revenueEventId ?? null,
      attributedRevenue: attribution.revenue,
      createdAt: attribution.attributedAt,
    }))
  } finally {
    await db.close()
  }
}

async function createPositiveRuntimeHarness(sqliteFile: string) {
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  const learningLedgerRepository = createLearningLedgerRepository(connection)
  const economicMemoryRepository = createEconomicMemoryRepository(connection)
  const learningCheckpointRepository = createLearningCheckpointRepository(connection)
  const negativeOutcomeRepository = createNegativeOutcomeRepository(connection)

  const attribution = buildPositiveAttribution()
  const opportunity = buildPositiveOpportunity()
  const execution = buildPositiveExecution()

  const revenueAttributionSnapshotStore = createRevenueAttributionSnapshotStore()
  revenueAttributionSnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: attribution.attributedAt,
    attributions: [attribution],
    metrics: {
      attributionCount: 1,
      attributedRevenue: attribution.revenue,
      unresolvedRevenueEventCount: 0,
    },
  })

  const opportunitySnapshotStore = createOpportunitySnapshotStore()
  opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: attribution.attributedAt,
    opportunities: [opportunity],
    suggestions: [],
    topOpportunity: opportunity,
  })

  const sovereignExecutionSnapshotStore = createSovereignExecutionSnapshotStore()
  sovereignExecutionSnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: attribution.attributedAt,
    executions: [execution],
    metrics: {
      executionCount: 1,
      successCount: 1,
      failedCount: 0,
      revenueAttributed: attribution.revenue,
    },
  })

  const runtime = new EconomicFeedbackRuntime({
    revenueAttributionSnapshotStore,
    opportunitySnapshotStore,
    sovereignExecutionSnapshotStore,
    negativeOutcomeRepository,
    learningLedgerRepository,
    economicMemoryRepository,
    learningCheckpointRepository,
  })

  return {
    runtime,
    learningLedgerRepository,
    economicMemoryRepository,
    learningCheckpointRepository,
    async close() {
      await runtime.stop()
      await connection.close()
    },
  }
}

async function createPersistentHarness(workspace: string) {
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const sqliteFile = path.join(workspace, 'runtime.sqlite')
  const configuredKid = 'economic-feedback-boot-test-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    jwtSecret: process.env.JWT_SECRET,
    sqliteFile: process.env.SQLITE_FILE,
    assetStorageDir: process.env.ASSET_STORAGE_DIR,
    authIssuer: process.env.AUTH_ISSUER,
    authAudience: process.env.AUTH_AUDIENCE,
    authKid: process.env.AUTH_ACTIVE_KID,
    authPrivateKeyRef: process.env.AUTH_PRIVATE_KEY_REF,
    authPublicKeyPath: process.env.AUTH_PUBLIC_KEY_PATH,
  }

  process.env.JWT_SECRET = 'economic-feedback-boot-test-secret'
  process.env.SQLITE_FILE = sqliteFile
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-economic-feedback-boot'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-economic-feedback-boot'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    sqliteFile,
    async close() {
      await app.close()

      if (typeof previousEnv.jwtSecret === 'undefined') delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousEnv.jwtSecret
      if (typeof previousEnv.sqliteFile === 'undefined') delete process.env.SQLITE_FILE
      else process.env.SQLITE_FILE = previousEnv.sqliteFile
      if (typeof previousEnv.assetStorageDir === 'undefined') delete process.env.ASSET_STORAGE_DIR
      else process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      if (typeof previousEnv.authIssuer === 'undefined') delete process.env.AUTH_ISSUER
      else process.env.AUTH_ISSUER = previousEnv.authIssuer
      if (typeof previousEnv.authAudience === 'undefined') delete process.env.AUTH_AUDIENCE
      else process.env.AUTH_AUDIENCE = previousEnv.authAudience
      if (typeof previousEnv.authKid === 'undefined') delete process.env.AUTH_ACTIVE_KID
      else process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      if (typeof previousEnv.authPrivateKeyRef === 'undefined') delete process.env.AUTH_PRIVATE_KEY_REF
      else process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      if (typeof previousEnv.authPublicKeyPath === 'undefined') delete process.env.AUTH_PUBLIC_KEY_PATH
      else process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
    },
  }
}

async function hydratePositiveFeedbackSnapshot(app: AppWithContext) {
  const attribution = buildPositiveAttribution()
  const opportunity = buildPositiveOpportunity()
  const execution = buildPositiveExecution()

  app.backendContext.revenueAttributionSnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: attribution.attributedAt,
    attributions: [attribution],
    metrics: {
      attributionCount: 1,
      attributedRevenue: attribution.revenue,
      unresolvedRevenueEventCount: 0,
    },
  })
  app.backendContext.opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: attribution.attributedAt,
    opportunities: [opportunity],
    suggestions: [],
    topOpportunity: opportunity,
  })
  app.backendContext.sovereignExecutionSnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: attribution.attributedAt,
    executions: [execution],
    metrics: {
      executionCount: 1,
      successCount: 1,
      failedCount: 0,
      revenueAttributed: attribution.revenue,
    },
  })

  await app.backendContext.economicFeedbackRuntime.refresh()

  return {
    attribution,
    opportunity,
    execution,
  }
}

test('economic feedback runtime boots with preexisting negative outcomes and remains dedupe-safe across restart', { concurrency: false }, async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-economic-feedback-boot-'))
  const sqliteFile = path.join(workspace, 'runtime.sqlite')
  let firstBootMemory: ReturnType<typeof canonicalizeMemory> = []
  let firstOutcomeCount = 0
  let firstAttributionCount = 0

  try {
    await seedNegativeOutcome(sqliteFile)

    const firstHarness = await createPersistentHarness(workspace)

    try {
      const terminalStatus = firstHarness.app.backendContext.terminalFailureDetectionRuntime.getStatus()
      const negativeAttributionStatus = firstHarness.app.backendContext.negativeAttributionRuntime.getStatus()
      const firstStatus = firstHarness.app.backendContext.economicFeedbackRuntime.getStatus()
      const firstOutcomes = await firstHarness.app.backendContext.negativeOutcomeRepository.listNegativeOutcomes()
      const firstAttributions = await firstHarness.app.backendContext.negativeAttributionRepository.listNegativeAttributions()
      const firstLedgerCount = await firstHarness.app.backendContext.learningLedgerRepository.countLearningEvents()
      const firstMemory = canonicalizeMemory(await firstHarness.app.backendContext.economicMemoryRepository.listAllEconomicMemory())

      assert.equal(terminalStatus.started, true)
      assert.equal(negativeAttributionStatus.started, true)
      assert.equal(firstStatus.started, true)
      assert.equal(firstStatus.lastError, null)
      assert.equal(firstStatus.negativeProcessedCount, 1)
      assert.equal(firstStatus.negativeReplayLag, 0)
      assert.notEqual(firstStatus.lastDurableNegativeOutcomeWatermark, null)
      assert.equal(firstOutcomes.length, 1)
      assert.equal(firstAttributions.length, 1)
      assert.equal(firstLedgerCount, 1)
      assert.equal(firstMemory.length, 3)
      firstBootMemory = firstMemory
      firstOutcomeCount = firstOutcomes.length
      firstAttributionCount = firstAttributions.length

      await assert.rejects(
        () => firstHarness.app.backendContext.learningLedgerRepository.appendLearningEvent({
          attributionId: 'illegal-ledger-write',
          marketSignalId: 'signal-x',
          opportunityId: 'opportunity-x',
          proposalId: 'proposal-x',
          executionId: 'execution-x',
          entityId: 'entity-x',
          category: 'general',
          signalKeyword: 'forbidden',
          outcomeType: 'conversion_negative',
          attributedRevenue: 0,
          conversionSuccess: false,
          observedAt: '2026-05-08T11:00:00.000Z',
        }),
        /AUTHORITY_BOUNDARY_VIOLATION/,
      )
    } finally {
      await firstHarness.close()
    }

    const secondHarness = await createPersistentHarness(workspace)

    try {
      const terminalStatus = secondHarness.app.backendContext.terminalFailureDetectionRuntime.getStatus()
      const negativeAttributionStatus = secondHarness.app.backendContext.negativeAttributionRuntime.getStatus()
      const secondStatus = secondHarness.app.backendContext.economicFeedbackRuntime.getStatus()
      const secondOutcomes = await secondHarness.app.backendContext.negativeOutcomeRepository.listNegativeOutcomes()
      const secondAttributions = await secondHarness.app.backendContext.negativeAttributionRepository.listNegativeAttributions()
      const secondLedgerCount = await secondHarness.app.backendContext.learningLedgerRepository.countLearningEvents()
      const secondMemory = canonicalizeMemory(await secondHarness.app.backendContext.economicMemoryRepository.listAllEconomicMemory())

      assert.equal(terminalStatus.started, true)
      assert.equal(negativeAttributionStatus.started, true)
      assert.equal(secondStatus.started, true)
      assert.equal(secondStatus.lastError, null)
      assert.equal(secondStatus.negativeReplayLag, 0)
      assert.equal(secondOutcomes.length, firstOutcomeCount)
      assert.equal(secondAttributions.length, firstAttributionCount)
      assert.equal(secondLedgerCount, 1)
      assert.deepEqual(secondMemory, firstBootMemory)
      assert.equal(secondMemory.length, 3)
    } finally {
      await secondHarness.close()
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('economic feedback runtime processes preexisting positive revenue attribution once and remains dedupe-safe across restart', { concurrency: false }, async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-economic-feedback-positive-boot-'))
  const sqliteFile = path.join(workspace, 'runtime.sqlite')
  const attribution = buildPositiveAttribution()
  let firstMemory: ReturnType<typeof canonicalizeMemory> = []
  let firstEventIds: string[] = []

  try {
    await seedPositiveRevenueAttribution(sqliteFile, attribution)

    const firstHarness = await createPositiveRuntimeHarness(sqliteFile)

    try {
      await firstHarness.runtime.start()

      const firstStatus = firstHarness.runtime.getStatus()
      const firstEvents = (await firstHarness.learningLedgerRepository.listLearningEvents())
        .filter((event) => event.attributionId === attribution.attributionId)
      firstEventIds = firstEvents.map((event) => event.learningEventId).sort()
      const firstMemoryRecords = canonicalizeMemory(await firstHarness.economicMemoryRepository.listAllEconomicMemory())

      assert.equal(firstStatus.started, true)
      assert.equal(firstStatus.lastError, null)
      assert.equal(firstStatus.lastProcessedAttributionCount, 1)
      assert.equal(firstStatus.lastAppendedEventCount, 2)
      assert.equal(firstStatus.replayLag, 0)
      assert.deepEqual(firstStatus.lastProcessedAttributionWatermark, {
        attributionId: attribution.attributionId,
        attributedAt: attribution.attributedAt,
      })
      assert.equal(firstEvents.length, 2)
      assert.deepEqual(
        firstEvents.map((event) => event.outcomeType).sort(),
        ['conversion_positive', 'revenue_positive'],
      )
      assert.equal(firstMemoryRecords.length, 3)
      assert(firstMemoryRecords.every((record) => record.successCount === 1))
      assert(firstMemoryRecords.every((record) => record.failureCount === 0))
      assert(firstMemoryRecords.every((record) => record.sampleCount === 1))
      assert(firstMemoryRecords.every((record) => record.totalRevenue === 250))
      assert(firstMemoryRecords.every((record) => record.averageConversion === 1))
      firstMemory = firstMemoryRecords

      await assert.rejects(
        () => firstHarness.learningLedgerRepository.appendLearningEvent({
          attributionId: 'illegal-positive-ledger-write',
          marketSignalId: 'signal-illegal',
          opportunityId: 'opportunity-illegal',
          proposalId: 'proposal-illegal',
          executionId: 'execution-illegal',
          entityId: 'entity-illegal',
          category: 'general',
          signalKeyword: 'forbidden',
          outcomeType: 'revenue_positive',
          attributedRevenue: 1,
          conversionSuccess: true,
          observedAt: '2026-05-08T13:00:00.000Z',
        }),
        /AUTHORITY_BOUNDARY_VIOLATION/,
      )
    } finally {
      await firstHarness.close()
    }

    const secondHarness = await createPositiveRuntimeHarness(sqliteFile)

    try {
      await secondHarness.runtime.start()

      const secondStatus = secondHarness.runtime.getStatus()
      const secondEvents = (await secondHarness.learningLedgerRepository.listLearningEvents())
        .filter((event) => event.attributionId === attribution.attributionId)
      const secondEventIds = secondEvents.map((event) => event.learningEventId).sort()
      const secondMemoryRecords = canonicalizeMemory(await secondHarness.economicMemoryRepository.listAllEconomicMemory())

      assert.equal(secondStatus.started, true)
      assert.equal(secondStatus.lastError, null)
      assert.equal(secondStatus.lastProcessedAttributionCount, 0)
      assert.equal(secondStatus.lastAppendedEventCount, 0)
      assert.equal(secondStatus.replayLag, 0)
      assert.equal(secondEvents.length, 2)
      assert.deepEqual(secondEventIds, firstEventIds)
      assert.deepEqual(secondMemoryRecords, firstMemory)
    } finally {
      await secondHarness.close()
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('economic feedback runtime processes mixed positive and negative feedback during boot and restart without duplicate mutation', { concurrency: false }, async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-economic-feedback-mixed-boot-'))
  const sqliteFile = path.join(workspace, 'runtime.sqlite')
  const attribution = buildPositiveAttribution()
  let firstLedgerIds: string[] = []
  let firstMemory: ReturnType<typeof canonicalizeMemory> = []
  let firstPositiveCheckpointUpdatedAt: string | null = null
  let firstNegativeCheckpointUpdatedAt: string | null = null

  try {
    await seedPositiveRevenueAttribution(sqliteFile, attribution)
    const seededNegativeOutcome = await seedNegativeOutcome(sqliteFile)

    const firstHarness = await createPersistentHarness(workspace)

    try {
      const bootStatus = firstHarness.app.backendContext.economicFeedbackRuntime.getStatus()
      assert.equal(bootStatus.started, true)
      assert.equal(bootStatus.lastError, null)
      assert.equal(bootStatus.negativeProcessedCount, 1)
      assert.equal(bootStatus.negativeReplayLag, 0)
      assert.notEqual(bootStatus.lastDurableNegativeOutcomeWatermark, null)

      await hydratePositiveFeedbackSnapshot(firstHarness.app)

      const firstStatus = firstHarness.app.backendContext.economicFeedbackRuntime.getStatus()
      const firstEvents = await firstHarness.app.backendContext.learningLedgerRepository.listLearningEvents()
      const positiveEvents = firstEvents.filter((event) => event.attributionId === attribution.attributionId)
      const negativeEvents = firstEvents.filter(
        (event) => event.attributionId === `negative-outcome:${seededNegativeOutcome.outcomeId}`,
      )
      const firstMemoryRecords = canonicalizeMemory(
        await firstHarness.app.backendContext.economicMemoryRepository.listAllEconomicMemory(),
      )
      const positiveCheckpoint = await firstHarness.app.backendContext.learningCheckpointRepository.getCheckpointByRuntimeName(
        ECONOMIC_FEEDBACK_RUNTIME_NAME,
      )
      const negativeCheckpoint = await firstHarness.app.backendContext.learningCheckpointRepository.getCheckpointByRuntimeName(
        ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
      )

      assert.equal(firstStatus.lastError, null)
      assert.equal(firstStatus.lastProcessedAttributionCount, 1)
      assert.equal(firstStatus.lastAppendedEventCount, 2)
      assert.equal(firstStatus.replayLag, 0)
      assert.equal(firstStatus.negativeReplayLag, 0)
      assert.deepEqual(firstStatus.lastProcessedAttributionWatermark, {
        attributionId: attribution.attributionId,
        attributedAt: attribution.attributedAt,
      })
      assert.notEqual(firstStatus.lastDurableNegativeOutcomeWatermark, null)
      assert.equal(positiveEvents.length, 2)
      assert.deepEqual(
        positiveEvents.map((event) => event.outcomeType).sort(),
        ['conversion_positive', 'revenue_positive'],
      )
      assert.equal(negativeEvents.length, 1)
      assert.deepEqual(
        negativeEvents.map((event) => event.outcomeType),
        ['conversion_negative'],
      )
      assert.equal(firstEvents.length, 3)
      assert.equal(firstMemoryRecords.length, 4)

      const categoryRecord = firstMemoryRecords.find((record) => record.memoryScope === 'category')
      const signalRecord = firstMemoryRecords.find((record) => record.memoryScope === 'signal')
      const positiveEntityRecord = firstMemoryRecords.find(
        (record) => record.memoryScope === 'entity' && record.entityId === 'entity-positive-1',
      )
      const negativeEntityRecord = firstMemoryRecords.find(
        (record) => record.memoryScope === 'entity' && record.entityId === 'entity-1',
      )

      assert(categoryRecord)
      assert(signalRecord)
      assert(positiveEntityRecord)
      assert(negativeEntityRecord)

      assert.equal(categoryRecord.successCount, 1)
      assert.equal(categoryRecord.failureCount, 1)
      assert.equal(categoryRecord.sampleCount, 2)
      assert.equal(categoryRecord.totalRevenue, 250)
      assert.equal(categoryRecord.averageConversion, 0.5)
      assert.equal(signalRecord.successCount, 1)
      assert.equal(signalRecord.failureCount, 1)
      assert.equal(signalRecord.sampleCount, 2)
      assert.equal(signalRecord.totalRevenue, 250)
      assert.equal(signalRecord.averageConversion, 0.5)
      assert.equal(positiveEntityRecord.successCount, 1)
      assert.equal(positiveEntityRecord.failureCount, 0)
      assert.equal(positiveEntityRecord.sampleCount, 1)
      assert.equal(positiveEntityRecord.totalRevenue, 250)
      assert.equal(positiveEntityRecord.averageConversion, 1)
      assert.equal(negativeEntityRecord.successCount, 0)
      assert.equal(negativeEntityRecord.failureCount, 1)
      assert.equal(negativeEntityRecord.sampleCount, 1)
      assert.equal(negativeEntityRecord.totalRevenue, 0)
      assert.equal(negativeEntityRecord.averageConversion, 0)

      assert.notEqual(positiveCheckpoint, null)
      assert.notEqual(negativeCheckpoint, null)
      assert.equal(positiveCheckpoint?.lastProcessedAttributionId, attribution.attributionId)
      assert.equal(positiveCheckpoint?.lastProcessedAttributedAt, attribution.attributedAt)
      assert.equal(negativeCheckpoint?.lastProcessedAttributionId, seededNegativeOutcome.outcomeId)
      assert.equal(negativeCheckpoint?.lastProcessedAttributedAt, seededNegativeOutcome.detectedAt)

      firstLedgerIds = firstEvents.map((event) => event.learningEventId).sort()
      firstMemory = firstMemoryRecords
      firstPositiveCheckpointUpdatedAt = positiveCheckpoint?.updatedAt ?? null
      firstNegativeCheckpointUpdatedAt = negativeCheckpoint?.updatedAt ?? null

      await assert.rejects(
        () => firstHarness.app.backendContext.learningLedgerRepository.appendLearningEvent({
          attributionId: 'illegal-mixed-ledger-write',
          marketSignalId: 'signal-illegal',
          opportunityId: 'opportunity-illegal',
          proposalId: 'proposal-illegal',
          executionId: 'execution-illegal',
          entityId: 'entity-illegal',
          category: 'general',
          signalKeyword: 'forbidden',
          outcomeType: 'revenue_positive',
          attributedRevenue: 1,
          conversionSuccess: true,
          observedAt: '2026-05-08T13:30:00.000Z',
        }),
        /AUTHORITY_BOUNDARY_VIOLATION/,
      )
    } finally {
      await firstHarness.close()
    }

    const secondHarness = await createPersistentHarness(workspace)

    try {
      await hydratePositiveFeedbackSnapshot(secondHarness.app)

      const secondStatus = secondHarness.app.backendContext.economicFeedbackRuntime.getStatus()
      const secondEvents = await secondHarness.app.backendContext.learningLedgerRepository.listLearningEvents()
      const secondMemoryRecords = canonicalizeMemory(
        await secondHarness.app.backendContext.economicMemoryRepository.listAllEconomicMemory(),
      )
      const secondPositiveCheckpoint = await secondHarness.app.backendContext.learningCheckpointRepository.getCheckpointByRuntimeName(
        ECONOMIC_FEEDBACK_RUNTIME_NAME,
      )
      const secondNegativeCheckpoint = await secondHarness.app.backendContext.learningCheckpointRepository.getCheckpointByRuntimeName(
        ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
      )

      assert.equal(secondStatus.started, true)
      assert.equal(secondStatus.lastError, null)
      assert.equal(secondStatus.lastProcessedAttributionCount, 0)
      assert.equal(secondStatus.lastAppendedEventCount, 0)
      assert.equal(secondStatus.replayLag, 0)
      assert.equal(secondStatus.negativeReplayLag, 0)
      assert.deepEqual(
        secondEvents.map((event) => event.learningEventId).sort(),
        firstLedgerIds,
      )
      assert.deepEqual(secondMemoryRecords, firstMemory)
      assert.equal(secondPositiveCheckpoint?.updatedAt, firstPositiveCheckpointUpdatedAt)
      assert.equal(secondNegativeCheckpoint?.updatedAt, firstNegativeCheckpointUpdatedAt)
    } finally {
      await secondHarness.close()
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
