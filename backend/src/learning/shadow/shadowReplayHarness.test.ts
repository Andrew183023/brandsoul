import assert from 'node:assert/strict'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createOpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import { classifyDivergence } from '../../shadow/divergence/divergenceClassifier.js'
import type { AdaptiveWeightSnapshotRuntime } from '../runtime/adaptiveWeightSnapshotRuntime.js'
import type { AdaptiveWeightSnapshotState } from '../runtime/adaptiveWeightSnapshotRuntime.js'
import { createShadowProposalConfidenceRuntime } from './shadowProposalConfidenceRuntime.js'

type LiveTableCounts = {
  proposalCount: number
  executionCount: number
}

type ShadowReplayProjection = {
  projectionIds: string[]
  comparisonIds: string[]
  orderedOutputFingerprint: string
  adaptiveScores: number[]
  divergenceLevels: string[]
  orderingFingerprint: string
}

function stableJsonString(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonString(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableJsonString(val)}`).join(',')}}`
}

function buildAdaptiveSnapshotState(): AdaptiveWeightSnapshotState {
  return {
    snapshot: {
      generatedAt: '2026-05-07T10:00:00.000Z',
      signalWeights: [
        {
          weightId: 'signal-weight:legal:advogado-trabalhista',
          memoryId: 'memory:signal:legal:advogado-trabalhista',
          scope: 'signal',
          category: 'legal',
          signalKeyword: 'advogado trabalhista',
          entityId: null,
          weight: 1.12,
          sampleCount: 40,
          confidenceLevel: 'high',
          decayFactor: 0.95,
          lastUpdated: '2026-05-07T09:00:00.000Z',
        },
        {
          weightId: 'signal-weight:legal:divorcio-consensual',
          memoryId: 'memory:signal:legal:divorcio-consensual',
          scope: 'signal',
          category: 'legal',
          signalKeyword: 'divorcio consensual',
          entityId: null,
          weight: 0.91,
          sampleCount: 20,
          confidenceLevel: 'medium',
          decayFactor: 0.9,
          lastUpdated: '2026-05-07T09:00:00.000Z',
        },
      ],
      categoryWeights: [
        {
          weightId: 'category-weight:legal',
          memoryId: 'memory:category:legal',
          scope: 'category',
          category: 'legal',
          signalKeyword: '*',
          entityId: null,
          weight: 1.04,
          sampleCount: 90,
          confidenceLevel: 'high',
          decayFactor: 0.96,
          lastUpdated: '2026-05-07T09:00:00.000Z',
        },
      ],
      entityWeights: [
        {
          weightId: 'entity-weight:entity-labor',
          memoryId: 'memory:entity:entity-labor',
          scope: 'entity',
          category: 'legal',
          signalKeyword: '*',
          entityId: 'entity-labor',
          weight: 1.08,
          sampleCount: 60,
          confidenceLevel: 'high',
          decayFactor: 0.97,
          lastUpdated: '2026-05-07T09:00:00.000Z',
        },
        {
          weightId: 'entity-weight:entity-family',
          memoryId: 'memory:entity:entity-family',
          scope: 'entity',
          category: 'legal',
          signalKeyword: '*',
          entityId: 'entity-family',
          weight: 0.89,
          sampleCount: 26,
          confidenceLevel: 'medium',
          decayFactor: 0.9,
          lastUpdated: '2026-05-07T09:00:00.000Z',
        },
      ],
      metadata: {
        recordCount: 5,
        boundedMin: 0.75,
        boundedMax: 1.35,
        refreshIntervalMs: 60_000,
        lastRefreshDurationMs: 5,
        lastError: null,
      },
    },
    freshness: {
      ready: true,
      updatedAt: '2026-05-07T10:00:00.000Z',
      ageMs: 0,
      refreshIntervalMs: 60_000,
      lastRefreshDurationMs: 5,
      refreshing: false,
      lastError: null,
    },
    runtimeState: {
      ready: true,
      warming: false,
      error: null,
    },
  }
}

function buildRuntime() {
  const opportunitySnapshotStore = createOpportunitySnapshotStore()
  opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-07T10:00:00.000Z',
    opportunities: [
      {
        id: 'opportunity-legal-labor',
        keyword: 'advogado trabalhista',
        category: 'legal',
        economicRelevance: 0.9,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:advogado-trabalhista:1',
        detectedAt: '2026-05-07T10:00:00.000Z',
        recommendedAction: 'route_legal_lead',
      },
      {
        id: 'opportunity-legal-family',
        keyword: 'divorcio consensual',
        category: 'legal',
        economicRelevance: 0.66,
        leadProbability: 'medium',
        sourceSignalId: 'market-signal:legal:divorcio-consensual:1',
        detectedAt: '2026-05-07T10:00:00.000Z',
        recommendedAction: 'route_legal_lead',
      },
    ],
    suggestions: [
      {
        entityId: 'entity-labor',
        entityName: 'Labor Office',
        suggestedAction: 'route_legal_lead',
        confidence: 0.76,
        reasoning: 'Matched legal signal "advogado trabalhista" using terms: lawyer.',
      },
      {
        entityId: 'entity-family',
        entityName: 'Family Office',
        suggestedAction: 'route_legal_lead',
        confidence: 0.6,
        reasoning: 'Matched legal signal "divorcio consensual" using terms: legal.',
      },
    ],
  })

  const adaptiveSnapshot = buildAdaptiveSnapshotState()
  const adaptiveWeightSnapshotRuntime = {
    getSnapshot() {
      return adaptiveSnapshot
    },
  } as unknown as AdaptiveWeightSnapshotRuntime

  return createShadowProposalConfidenceRuntime({
    opportunitySnapshotStore,
    adaptiveWeightSnapshotRuntime,
  })
}

async function getLiveTableCounts(db: Awaited<ReturnType<typeof createDatabaseConnection>>): Promise<LiveTableCounts> {
  const proposalCountRow = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM flowmind_opportunity_proposals')
  const executionCountRow = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM flowmind_sovereign_executions')

  return {
    proposalCount: Number(proposalCountRow?.count ?? 0),
    executionCount: Number(executionCountRow?.count ?? 0),
  }
}

function extractProjection(snapshot: ReturnType<ReturnType<typeof buildRuntime>['getSnapshot']>): ShadowReplayProjection {
  const rows = snapshot.snapshot.comparisons.map((detail) => {
    const liveDecision = JSON.parse(detail.comparison.liveDecision) as {
      proposalConfidence?: number
    }
    const shadowDecision = JSON.parse(detail.comparison.shadowDecision) as {
      projectionId?: string
      shadowProposalConfidence?: number
    }

    const liveConfidence = Number(liveDecision.proposalConfidence ?? 0)
    const adaptiveConfidence = Number(shadowDecision.shadowProposalConfidence ?? 0)

    const divergenceLevel = classifyDivergence({
      scoreDelta: adaptiveConfidence - liveConfidence,
      confidenceDelta: adaptiveConfidence - liveConfidence,
      projectedRankingChange: 0,
      projectedRevenueImpact: detail.comparison.estimatedEconomicDelta,
    }).divergenceLevel

    return {
      projectionId: typeof shadowDecision.projectionId === 'string'
        ? shadowDecision.projectionId
        : detail.comparison.comparisonId,
      comparisonId: detail.comparison.comparisonId,
      adaptiveScore: adaptiveConfidence,
      divergenceLevel,
      createdAt: detail.comparison.generatedAt,
    }
  })

  return {
    projectionIds: rows.map((row) => row.projectionId),
    comparisonIds: rows.map((row) => row.comparisonId),
    orderedOutputFingerprint: stableJsonString(rows),
    adaptiveScores: rows.map((row) => row.adaptiveScore),
    divergenceLevels: rows.map((row) => row.divergenceLevel),
    orderingFingerprint: stableJsonString(rows.map((row) => ({
      projectionId: row.projectionId,
      comparisonId: row.comparisonId,
      createdAt: row.createdAt,
      adaptiveScore: row.adaptiveScore,
      divergenceLevel: row.divergenceLevel,
    }))),
  }
}

test('shadow replay harness enforces deterministic replay and zero live mutations', async (t) => {
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile: ':memory:',
  })
  await initializeDatabase(db)
  t.after(async () => {
    await db.close()
  })

  const runtime = buildRuntime()

  const beforeCounts = await getLiveTableCounts(db)
  assert.equal(beforeCounts.proposalCount, 0)
  assert.equal(beforeCounts.executionCount, 0)

  const firstSnapshot = await runtime.refresh('2026-05-07T10:00:00.000Z')
  const firstState = runtime.getSnapshot(new Date('2026-05-07T10:00:00.000Z'))
  const firstProjection = extractProjection(firstState)

  // Ensure a second refresh call executes a new deterministic replay cycle.
  await new Promise<void>((resolve) => {
    setImmediate(() => resolve())
  })

  const secondSnapshot = await runtime.refresh('2026-05-07T10:00:00.000Z')
  const secondState = runtime.getSnapshot(new Date('2026-05-07T10:00:00.000Z'))
  const secondProjection = extractProjection(secondState)

  assert.equal(firstSnapshot.generatedAt, secondSnapshot.generatedAt)

  // 1) Replay integrity: identical projection IDs, comparison IDs, ordering, adaptive scores, divergence levels.
  assert.deepEqual(firstProjection.projectionIds, secondProjection.projectionIds)
  assert.deepEqual(firstProjection.comparisonIds, secondProjection.comparisonIds)
  assert.equal(firstProjection.orderedOutputFingerprint, secondProjection.orderedOutputFingerprint)
  assert.deepEqual(firstProjection.adaptiveScores, secondProjection.adaptiveScores)
  assert.deepEqual(firstProjection.divergenceLevels, secondProjection.divergenceLevels)
  assert.equal(firstProjection.orderingFingerprint, secondProjection.orderingFingerprint)

  // 2) Shadow runtime produces zero live mutations (live proposal/execution rows unchanged).
  const afterCounts = await getLiveTableCounts(db)
  assert.deepEqual(afterCounts, beforeCounts)

  // 3) Shadow runtime never writes to live proposal/execution tables.
  assert.equal(afterCounts.proposalCount, 0)
  assert.equal(afterCounts.executionCount, 0)

  // 4) Adaptive projections remain advisory-only.
  assert.equal(firstState.runtime.advisoryOnly, true)
  assert.equal(firstState.runtime.mutatesLiveProposalConfidence, false)
  assert.equal(secondState.runtime.advisoryOnly, true)
  assert.equal(secondState.runtime.mutatesLiveProposalConfidence, false)

  // 5) Observability replay status is snapshot-aware and deterministic.
  assert.equal(firstState.snapshot.metrics.replayConsistencyStatus, 'not_evaluated')
  assert.equal(secondState.snapshot.metrics.replayConsistencyStatus, 'consistent')
  assert.equal(secondState.snapshot.metrics.projectionGenerationCount, secondState.snapshot.metrics.comparisonCount)
  assert.ok(secondState.snapshot.metrics.refreshDurationMs >= 0)
})
