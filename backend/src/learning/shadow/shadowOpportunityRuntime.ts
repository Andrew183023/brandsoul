import { createHash } from 'node:crypto'

import type { AdaptiveWeightRecord, AdaptiveWeightSnapshotRuntime } from '../runtime/adaptiveWeightSnapshotRuntime.js'
import { createShadowDecisionProjection, type ShadowDecisionProjection } from './ShadowDecisionProjection.js'
import type { MarketSignalSnapshotStore } from '../../market-signals/runtime/marketSignalSnapshotStore.js'
import type { MarketSignal } from '../../market-signals/contracts/MarketSignal.js'

type ShadowOpportunityRuntimeDependencies = {
  marketSignalSnapshotStore: MarketSignalSnapshotStore
  adaptiveWeightSnapshotRuntime: AdaptiveWeightSnapshotRuntime
  refreshIntervalMs?: number
  divergenceThreshold?: number
}

export type ShadowProjectionDivergenceMetrics = {
  projectionCount: number
  divergenceCount: number
  divergenceRatio: number
  averageScoreDelta: number
  maxAbsScoreDelta: number
  generatedAt: string
}

export type ShadowOpportunityRuntimeSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  projections: ShadowDecisionProjection[]
  metrics: ShadowProjectionDivergenceMetrics
}

export type ShadowOpportunityRuntimeFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type ShadowOpportunityRuntimeState = {
  snapshot: ShadowOpportunityRuntimeSnapshot
  freshness: ShadowOpportunityRuntimeFreshness
  runtime: {
    started: boolean
    advisoryOnly: true
    replaySafe: true
    deterministic: true
    immutableProjectionRecords: true
  }
}

type ProjectionCandidate = {
  marketSignalId: string
  marketSignalKeyword: string
  marketSignalCategory: string
  entityId: string
  baseScore: number
  adaptiveMultiplier: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const DEFAULT_DIVERGENCE_THRESHOLD = 0.05
const SCORE_MIN = 0
const SCORE_MAX = 1

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildMarketSignalId(signal: MarketSignal) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeIdPart(signal.keyword),
      normalizeIdPart(signal.category),
      signal.source,
      signal.detectedAt,
    ].join(':'))
    .digest('hex')

  return [
    'market-signal',
    normalizeIdPart(signal.category).slice(0, 24) || 'category',
    normalizeIdPart(signal.keyword).slice(0, 32) || 'keyword',
    fingerprint.slice(0, 16),
  ].join(':').slice(0, 128)
}

function sortSignalsDeterministically(signals: MarketSignal[]) {
  return [...signals].sort((left, right) => {
    const scoreOrder = right.opportunityScore - left.opportunityScore
    if (scoreOrder !== 0) {
      return scoreOrder
    }

    const categoryOrder = left.category.localeCompare(right.category)
    if (categoryOrder !== 0) {
      return categoryOrder
    }

    const keywordOrder = left.keyword.localeCompare(right.keyword)
    if (keywordOrder !== 0) {
      return keywordOrder
    }

    return left.detectedAt.localeCompare(right.detectedAt)
  })
}

function sortEntityWeightsDeterministically(weights: AdaptiveWeightRecord[]) {
  return [...weights].sort((left, right) => {
    const byWeight = right.weight - left.weight
    if (byWeight !== 0) {
      return byWeight
    }

    return left.weightId.localeCompare(right.weightId)
  })
}

function buildSignalWeightLookup(weights: AdaptiveWeightRecord[]) {
  const lookup = new Map<string, AdaptiveWeightRecord>()

  for (const weight of weights) {
    const key = normalizeIdPart(weight.signalKeyword)
    if (!lookup.has(key)) {
      lookup.set(key, weight)
    }
  }

  return lookup
}

function buildCategoryWeightLookup(weights: AdaptiveWeightRecord[]) {
  const lookup = new Map<string, AdaptiveWeightRecord>()

  for (const weight of weights) {
    const key = normalizeIdPart(weight.category)
    if (!lookup.has(key)) {
      lookup.set(key, weight)
    }
  }

  return lookup
}

function selectEntityCandidates(signal: MarketSignal, entityWeights: AdaptiveWeightRecord[]) {
  const keywordKey = normalizeIdPart(signal.keyword)
  const categoryKey = normalizeIdPart(signal.category)

  const scoped = entityWeights.filter((weight) => {
    if (!weight.entityId) {
      return false
    }

    const sameKeyword = normalizeIdPart(weight.signalKeyword) === keywordKey
    const sameCategory = normalizeIdPart(weight.category) === categoryKey

    return sameKeyword || sameCategory
  })

  if (scoped.length > 0) {
    return scoped
  }

  return [
    {
      weightId: 'adaptive-weight:fallback:entity',
      memoryId: 'fallback',
      scope: 'entity',
      category: signal.category,
      signalKeyword: signal.keyword,
      entityId: 'portfolio-default',
      weight: 1,
      sampleCount: 0,
      confidenceLevel: 'low',
      decayFactor: 1,
      lastUpdated: signal.detectedAt,
    } satisfies AdaptiveWeightRecord,
  ]
}

function resolveGeneratedAt(now: string, marketSignalsGeneratedAt: string, adaptiveGeneratedAt: string) {
  const parsedMarket = Date.parse(marketSignalsGeneratedAt)
  const parsedAdaptive = Date.parse(adaptiveGeneratedAt)

  if (Number.isFinite(parsedMarket) && Number.isFinite(parsedAdaptive)) {
    return new Date(Math.max(parsedMarket, parsedAdaptive)).toISOString()
  }

  if (Number.isFinite(parsedMarket)) {
    return new Date(parsedMarket).toISOString()
  }

  if (Number.isFinite(parsedAdaptive)) {
    return new Date(parsedAdaptive).toISOString()
  }

  const parsedNow = Date.parse(now)
  if (Number.isFinite(parsedNow)) {
    return new Date(parsedNow).toISOString()
  }

  return new Date().toISOString()
}

function computeAdaptiveMultiplier(args: {
  signalWeight: AdaptiveWeightRecord | undefined
  categoryWeight: AdaptiveWeightRecord | undefined
  entityWeight: AdaptiveWeightRecord | undefined
}) {
  const factors = [args.signalWeight?.weight, args.categoryWeight?.weight, args.entityWeight?.weight]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (factors.length === 0) {
    return 1
  }

  const sum = factors.reduce((acc, value) => acc + value, 0)
  return roundMetric(sum / factors.length)
}

function buildProjectionCandidates(args: {
  signals: MarketSignal[]
  signalWeights: AdaptiveWeightRecord[]
  categoryWeights: AdaptiveWeightRecord[]
  entityWeights: AdaptiveWeightRecord[]
}) {
  const signalWeightLookup = buildSignalWeightLookup(args.signalWeights)
  const categoryWeightLookup = buildCategoryWeightLookup(args.categoryWeights)

  const orderedSignals = sortSignalsDeterministically(args.signals)
  const orderedEntityWeights = sortEntityWeightsDeterministically(args.entityWeights)
  const candidates: ProjectionCandidate[] = []

  for (const signal of orderedSignals) {
    const signalWeight = signalWeightLookup.get(normalizeIdPart(signal.keyword))
    const categoryWeight = categoryWeightLookup.get(normalizeIdPart(signal.category))
    const entityCandidates = selectEntityCandidates(signal, orderedEntityWeights)

    for (const entityWeight of entityCandidates) {
      const adaptiveMultiplier = computeAdaptiveMultiplier({
        signalWeight,
        categoryWeight,
        entityWeight,
      })

      candidates.push({
        marketSignalId: buildMarketSignalId(signal),
        marketSignalKeyword: signal.keyword,
        marketSignalCategory: signal.category,
        entityId: entityWeight.entityId ?? 'portfolio-default',
        baseScore: roundMetric(clamp(signal.opportunityScore, SCORE_MIN, SCORE_MAX)),
        adaptiveMultiplier,
      })
    }
  }

  return candidates
}

function sortProjectionsDeterministically(projections: ShadowDecisionProjection[]) {
  return [...projections].sort((left, right) => {
    if (left.adaptiveScore !== right.adaptiveScore) {
      return right.adaptiveScore - left.adaptiveScore
    }

    if (left.baseScore !== right.baseScore) {
      return right.baseScore - left.baseScore
    }

    return left.projectionId.localeCompare(right.projectionId)
  })
}

function computeDivergenceMetrics(projections: ShadowDecisionProjection[], divergenceThreshold: number, generatedAt: string) {
  const projectionCount = projections.length
  const divergenceCount = projections.filter((projection) => Math.abs(projection.scoreDelta) >= divergenceThreshold).length
  const totalDelta = projections.reduce((acc, projection) => acc + projection.scoreDelta, 0)
  const averageScoreDelta = projectionCount > 0 ? roundMetric(totalDelta / projectionCount) : 0
  const maxAbsScoreDelta = projections.reduce((acc, projection) => Math.max(acc, Math.abs(projection.scoreDelta)), 0)

  return {
    projectionCount,
    divergenceCount,
    divergenceRatio: projectionCount > 0 ? roundMetric(divergenceCount / projectionCount) : 0,
    averageScoreDelta,
    maxAbsScoreDelta: roundMetric(maxAbsScoreDelta),
    generatedAt,
  } satisfies ShadowProjectionDivergenceMetrics
}

function buildInitialSnapshot(): ShadowOpportunityRuntimeSnapshot {
  const generatedAt = new Date().toISOString()
  return {
    status: 'warming',
    generatedAt,
    projections: [],
    metrics: {
      projectionCount: 0,
      divergenceCount: 0,
      divergenceRatio: 0,
      averageScoreDelta: 0,
      maxAbsScoreDelta: 0,
      generatedAt,
    },
  }
}

export class ShadowOpportunityRuntime {
  private readonly refreshIntervalMs: number
  private readonly divergenceThreshold: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<ShadowOpportunityRuntimeSnapshot> | null = null
  private snapshot: ShadowOpportunityRuntimeSnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null

  constructor(private readonly dependencies: ShadowOpportunityRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.divergenceThreshold = dependencies.divergenceThreshold ?? DEFAULT_DIVERGENCE_THRESHOLD
  }

  getSnapshot(now = new Date()): ShadowOpportunityRuntimeState {
    const ageMs = this.lastUpdatedAt ? Math.max(0, now.getTime() - Date.parse(this.lastUpdatedAt)) : null

    return {
      snapshot: this.snapshot,
      freshness: {
        ready: this.snapshot.status === 'ready',
        updatedAt: this.lastUpdatedAt,
        ageMs,
        refreshIntervalMs: this.refreshIntervalMs,
        lastRefreshDurationMs: this.lastRefreshDurationMs,
        refreshing: this.inFlightRefresh !== null,
        lastError: this.lastError,
      },
      runtime: {
        started: this.started,
        advisoryOnly: true,
        replaySafe: true,
        deterministic: true,
        immutableProjectionRecords: true,
      },
    }
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true

    try {
      await this.refresh()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'unknown_error'
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error) => {
        this.lastError = error instanceof Error ? error.message : 'unknown_error'
      })
    }, this.refreshIntervalMs)
  }

  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }

    this.started = false
    this.inFlightRefresh = null
  }

  async refresh(now = new Date().toISOString()): Promise<ShadowOpportunityRuntimeSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const startedAtMs = Date.now()

      try {
        const marketState = this.dependencies.marketSignalSnapshotStore.getSnapshot()
        const adaptiveState = this.dependencies.adaptiveWeightSnapshotRuntime.getSnapshot()
        const generatedAt = resolveGeneratedAt(
          now,
          marketState.snapshot.generatedAt,
          adaptiveState.snapshot.generatedAt,
        )

        const candidates = buildProjectionCandidates({
          signals: marketState.snapshot.signals,
          signalWeights: adaptiveState.snapshot.signalWeights,
          categoryWeights: adaptiveState.snapshot.categoryWeights,
          entityWeights: adaptiveState.snapshot.entityWeights,
        })

        const projections = sortProjectionsDeterministically(
          candidates.map((candidate) => {
            const adaptiveScore = roundMetric(clamp(candidate.baseScore * candidate.adaptiveMultiplier, SCORE_MIN, SCORE_MAX))

            return createShadowDecisionProjection({
              marketSignalId: candidate.marketSignalId,
              entityId: candidate.entityId,
              baseScore: candidate.baseScore,
              adaptiveScore,
              adaptiveMultiplier: candidate.adaptiveMultiplier,
              projectionType: 'opportunity_ranking',
              generatedAt,
            })
          }),
        )

        for (const projection of projections) {
          console.info('[shadow-runtime] projection.generated', {
            projectionId: projection.projectionId,
            marketSignalId: projection.marketSignalId,
            entityId: projection.entityId,
            baseScore: projection.baseScore,
            adaptiveScore: projection.adaptiveScore,
            scoreDelta: projection.scoreDelta,
            projectionType: projection.projectionType,
            generatedAt: projection.generatedAt,
            advisoryOnly: true,
          })

          if (Math.abs(projection.scoreDelta) >= this.divergenceThreshold) {
            console.info('[shadow-runtime] divergence.detected', {
              projectionId: projection.projectionId,
              marketSignalId: projection.marketSignalId,
              entityId: projection.entityId,
              scoreDelta: projection.scoreDelta,
              adaptiveMultiplier: projection.adaptiveMultiplier,
              threshold: this.divergenceThreshold,
            })
          }
        }

        const metrics = computeDivergenceMetrics(projections, this.divergenceThreshold, generatedAt)

        this.snapshot = {
          status: 'ready',
          generatedAt,
          projections,
          metrics,
        }
        this.lastUpdatedAt = generatedAt
        this.lastRefreshDurationMs = Math.max(0, Date.now() - startedAtMs)
        this.lastError = null

        return this.snapshot
      } catch (error) {
        this.lastRefreshDurationMs = Math.max(0, Date.now() - startedAtMs)
        this.lastError = error instanceof Error ? error.message : 'Failed to refresh shadow opportunity projections.'
        throw error
      } finally {
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createShadowOpportunityRuntime(dependencies: ShadowOpportunityRuntimeDependencies) {
  return new ShadowOpportunityRuntime(dependencies)
}
