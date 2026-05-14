import type { RevenueAttributionAggregate } from '../../persistence/revenue/revenueAttributionRepository.js'
import type { EconomicMemoryRecord } from '../../persistence/economic/economicMemoryRepository.js'
import type { AdaptiveWeightRecord } from '../../learning/runtime/adaptiveWeightSnapshotRuntime.js'

export type ShadowImpactEstimatorInput = {
  marketSignalId: string
  category: string
  signalKeyword: string
  entityId: string | null
  historicalAttributions: RevenueAttributionAggregate[]
  economicMemory: EconomicMemoryRecord[]
  adaptiveWeights: {
    signalWeights: AdaptiveWeightRecord[]
    categoryWeights: AdaptiveWeightRecord[]
    entityWeights: AdaptiveWeightRecord[]
  }
}

export type ShadowImpactEstimatorResult = {
  projectedRevenueImpact: number
  projectedRankingChange: number
  projectedOpportunityShift: number
  reasoning: string
}

type BaselineMetrics = {
  attributionCount: number
  totalRevenue: number
  averageRevenue: number
  conversionRate: number
}

const MAX_REVENUE_IMPACT = 500
const MAX_RANKING_CHANGE = 20
const MAX_OPPORTUNITY_SHIFT = 0.6

const REVENUE_SENSITIVITY = 0.55
const CONVERSION_SENSITIVITY = 0.25
const MEMORY_SENSITIVITY = 0.2

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function toFinite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function selectAttributionBaseline(
  marketSignalId: string,
  attributions: RevenueAttributionAggregate[],
): BaselineMetrics {
  const scoped = attributions
    .filter((item) => normalizeKey(item.marketSignalId) === normalizeKey(marketSignalId))
    .sort((left, right) => left.attributionId.localeCompare(right.attributionId))

  const attributionCount = scoped.length
  const totalRevenue = scoped.reduce((sum, item) => sum + Math.max(0, toFinite(item.attributedRevenue)), 0)
  const averageRevenue = attributionCount > 0 ? totalRevenue / attributionCount : 0
  const conversionCount = scoped.filter((item) => Math.max(0, toFinite(item.attributedRevenue)) > 0).length
  const conversionRate = attributionCount > 0 ? conversionCount / attributionCount : 0.5

  return {
    attributionCount,
    totalRevenue: roundMetric(totalRevenue),
    averageRevenue: roundMetric(averageRevenue),
    conversionRate: roundMetric(clamp(conversionRate, 0, 1)),
  }
}

function selectMemoryRecord(args: {
  records: EconomicMemoryRecord[]
  scope: EconomicMemoryRecord['memoryScope']
  category: string
  signalKeyword: string
  entityId: string | null
}) {
  const targetCategory = normalizeKey(args.category)
  const targetSignal = normalizeKey(args.signalKeyword)
  const targetEntity = normalizeKey(args.entityId)

  const candidates = args.records.filter((record) => {
    if (record.memoryScope !== args.scope) {
      return false
    }

    if (normalizeKey(record.category) !== targetCategory) {
      return false
    }

    if (args.scope === 'signal') {
      return normalizeKey(record.signalKeyword) === targetSignal
    }

    if (args.scope === 'entity') {
      return normalizeKey(record.entityId) === targetEntity
    }

    return true
  })

  return candidates
    .slice()
    .sort((left, right) => {
      if (left.sampleCount !== right.sampleCount) {
        return right.sampleCount - left.sampleCount
      }

      const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt)
      if (byUpdatedAt !== 0) {
        return byUpdatedAt
      }

      return left.memoryId.localeCompare(right.memoryId)
    })[0] ?? null
}

function selectWeight(weights: AdaptiveWeightRecord[], predicate: (value: AdaptiveWeightRecord) => boolean) {
  const candidates = weights.filter(predicate)

  return candidates
    .slice()
    .sort((left, right) => {
      if (left.weight !== right.weight) {
        return right.weight - left.weight
      }

      if (left.sampleCount !== right.sampleCount) {
        return right.sampleCount - left.sampleCount
      }

      return left.weightId.localeCompare(right.weightId)
    })[0] ?? null
}

function resolveAdaptiveMultiplier(input: ShadowImpactEstimatorInput) {
  const signalKey = normalizeKey(input.signalKeyword)
  const categoryKey = normalizeKey(input.category)
  const entityKey = normalizeKey(input.entityId)

  const signalWeight = selectWeight(
    input.adaptiveWeights.signalWeights,
    (weight) => normalizeKey(weight.signalKeyword) === signalKey,
  )
  const categoryWeight = selectWeight(
    input.adaptiveWeights.categoryWeights,
    (weight) => normalizeKey(weight.category) === categoryKey,
  )
  const entityWeight = selectWeight(
    input.adaptiveWeights.entityWeights,
    (weight) => normalizeKey(weight.entityId) === entityKey,
  )

  const weights = [signalWeight?.weight, categoryWeight?.weight, entityWeight?.weight]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (weights.length === 0) {
    return 1
  }

  return roundMetric(clamp(weights.reduce((sum, value) => sum + value, 0) / weights.length, 0.75, 1.35))
}

function resolveMemorySignal(input: ShadowImpactEstimatorInput) {
  const signalMemory = selectMemoryRecord({
    records: input.economicMemory,
    scope: 'signal',
    category: input.category,
    signalKeyword: input.signalKeyword,
    entityId: input.entityId,
  })
  const categoryMemory = selectMemoryRecord({
    records: input.economicMemory,
    scope: 'category',
    category: input.category,
    signalKeyword: input.signalKeyword,
    entityId: input.entityId,
  })
  const entityMemory = selectMemoryRecord({
    records: input.economicMemory,
    scope: 'entity',
    category: input.category,
    signalKeyword: input.signalKeyword,
    entityId: input.entityId,
  })

  const conversionSignal = [
    signalMemory?.averageConversion,
    categoryMemory?.averageConversion,
    entityMemory?.averageConversion,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const revenueSignal = [
    signalMemory?.totalRevenue,
    categoryMemory?.totalRevenue,
    entityMemory?.totalRevenue,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const sampleSignal = [
    signalMemory?.sampleCount,
    categoryMemory?.sampleCount,
    entityMemory?.sampleCount,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const memoryConversion = conversionSignal.length > 0
    ? clamp(conversionSignal.reduce((sum, value) => sum + value, 0) / conversionSignal.length, 0, 1)
    : 0.5
  const memoryRevenue = revenueSignal.length > 0
    ? Math.max(0, revenueSignal.reduce((sum, value) => sum + value, 0) / revenueSignal.length)
    : 0
  const memorySampleCount = sampleSignal.length > 0
    ? Math.max(0, sampleSignal.reduce((sum, value) => sum + value, 0) / sampleSignal.length)
    : 0

  const confidence = clamp(Math.log10(memorySampleCount + 1) / 2, 0, 1)

  return {
    memoryConversion: roundMetric(memoryConversion),
    memoryRevenue: roundMetric(memoryRevenue),
    memorySampleCount: Math.round(memorySampleCount),
    confidence: roundMetric(confidence),
  }
}

export function estimateShadowImpact(input: ShadowImpactEstimatorInput): ShadowImpactEstimatorResult {
  const baseline = selectAttributionBaseline(input.marketSignalId, input.historicalAttributions)
  const adaptiveMultiplier = resolveAdaptiveMultiplier(input)
  const memorySignal = resolveMemorySignal(input)

  const conversionDelta = roundMetric((adaptiveMultiplier - 1) * baseline.conversionRate)
  const memoryContribution = roundMetric((memorySignal.memoryConversion - baseline.conversionRate) * memorySignal.confidence)

  const projectedOpportunityShiftRaw = roundMetric(
    conversionDelta * CONVERSION_SENSITIVITY
      + memoryContribution * MEMORY_SENSITIVITY
      + (adaptiveMultiplier - 1) * REVENUE_SENSITIVITY,
  )

  const projectedOpportunityShift = roundMetric(
    clamp(projectedOpportunityShiftRaw, -MAX_OPPORTUNITY_SHIFT, MAX_OPPORTUNITY_SHIFT),
  )

  const revenueAnchor = Math.max(baseline.averageRevenue, memorySignal.memoryRevenue / Math.max(memorySignal.memorySampleCount, 1), 25)
  const projectedRevenueImpact = roundMetric(
    clamp(revenueAnchor * projectedOpportunityShift, -MAX_REVENUE_IMPACT, MAX_REVENUE_IMPACT),
  )

  const projectedRankingChange = roundMetric(
    clamp(projectedOpportunityShift * 20, -MAX_RANKING_CHANGE, MAX_RANKING_CHANGE),
  )

  return {
    projectedRevenueImpact,
    projectedRankingChange,
    projectedOpportunityShift,
    reasoning: [
      `Deterministic adaptive multiplier=${adaptiveMultiplier} from signal/category/entity weights.`,
      `Baseline attribution count=${baseline.attributionCount}, baseline conversion=${baseline.conversionRate}, baseline avg revenue=${baseline.averageRevenue}.`,
      `Economic memory conversion=${memorySignal.memoryConversion}, sampleCount=${memorySignal.memorySampleCount}, confidence=${memorySignal.confidence}.`,
      `Bounded projections applied: revenue ±${MAX_REVENUE_IMPACT}, ranking ±${MAX_RANKING_CHANGE}, opportunity shift ±${MAX_OPPORTUNITY_SHIFT}.`,
      `Final projections: revenueImpact=${projectedRevenueImpact}, rankingChange=${projectedRankingChange}, opportunityShift=${projectedOpportunityShift}.`,
      'Advisory-only estimator: no live runtime mutation performed.',
    ].join(' '),
  }
}

export const SHADOW_IMPACT_ESTIMATOR_MODE = 'advisory-only' as const
export const SHADOW_IMPACT_ESTIMATOR_PROPERTIES = {
  deterministic: true,
  boundedProjection: true,
  replaySafe: true,
  mutatesLiveRuntime: false,
} as const
