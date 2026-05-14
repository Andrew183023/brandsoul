import type { RevenueAttributionAggregate } from '../../persistence/revenue/revenueAttributionRepository.js'
import type { EconomicMemoryRecord } from '../../persistence/economic/economicMemoryRepository.js'

type PerformanceInput = {
  conversionRate: number
  revenuePerSample: number
  sampleCount: number
  stability: number
  decayWeight: number
  source: 'memory' | 'override'
}

export type EconomicDeltaEstimatorInput = {
  marketSignalId: string
  category: string
  entityId: string | null
  historicalAttributions: RevenueAttributionAggregate[]
  economicMemory: EconomicMemoryRecord[]
  categoryPerformance?: Omit<PerformanceInput, 'source'>
  entityPerformance?: Omit<PerformanceInput, 'source'>
}

export type EstimatedEconomicDelta = {
  estimatedGain: number
  estimatedLoss: number
  estimatedMissedOpportunity: number
  estimatedRiskReduction: number
  netDelta: number
}

export type EconomicDeltaEstimatorEvidence = {
  baseline: {
    attributionCount: number
    totalAttributedRevenue: number
    averageAttributedRevenue: number
    baselineConversionRate: number
  }
  category: {
    memoryId: string | null
    performance: PerformanceInput
  }
  entity: {
    memoryId: string | null
    performance: PerformanceInput
  }
  bounds: {
    referenceRevenue: number
    maxAbsoluteDelta: number
  }
  heuristics: {
    combinedConversion: number
    combinedStability: number
    combinedDecayWeight: number
    coverage: number
    consistency: number
  }
}

export type EconomicDeltaEstimatorResult = {
  estimatedEconomicDelta: EstimatedEconomicDelta
  confidence: number
  reasoning: string[]
  evidence: EconomicDeltaEstimatorEvidence
}

const MIN_CONVERSION = 0
const MAX_CONVERSION = 1
const MIN_DECAY = 0
const MAX_DECAY = 1
const MIN_STABILITY = 0
const MAX_STABILITY = 1
const MAX_MULTIPLIER = 3

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normalizeRevenue(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Number(value))
}

function defaultPerformance(source: PerformanceInput['source']): PerformanceInput {
  return {
    conversionRate: 0.5,
    revenuePerSample: 0,
    sampleCount: 0,
    stability: 0,
    decayWeight: 0,
    source,
  }
}

function normalizePerformance(input: Omit<PerformanceInput, 'source'>, source: PerformanceInput['source']): PerformanceInput {
  return {
    conversionRate: roundMetric(clamp(input.conversionRate, MIN_CONVERSION, MAX_CONVERSION)),
    revenuePerSample: roundMetric(normalizeRevenue(input.revenuePerSample)),
    sampleCount: Math.max(0, Math.trunc(input.sampleCount)),
    stability: roundMetric(clamp(input.stability, MIN_STABILITY, MAX_STABILITY)),
    decayWeight: roundMetric(clamp(input.decayWeight, MIN_DECAY, MAX_DECAY)),
    source,
  }
}

function selectBestMemoryRecord(
  records: EconomicMemoryRecord[],
  predicate: (record: EconomicMemoryRecord) => boolean,
): EconomicMemoryRecord | null {
  const matched = records.filter(predicate)

  if (matched.length === 0) {
    return null
  }

  const sorted = [...matched].sort((left, right) => {
    if (left.sampleCount !== right.sampleCount) {
      return right.sampleCount - left.sampleCount
    }

    const updatedAtOrder = right.updatedAt.localeCompare(left.updatedAt)
    if (updatedAtOrder !== 0) {
      return updatedAtOrder
    }

    return left.memoryId.localeCompare(right.memoryId)
  })

  return sorted[0] ?? null
}

function performanceFromMemory(record: EconomicMemoryRecord | null): PerformanceInput {
  if (!record) {
    return defaultPerformance('memory')
  }

  const minimumTarget = Math.max(1, record.minimumSampleCount * 2)
  const stability = clamp(record.sampleCount / minimumTarget, 0, 1)
  const revenuePerSample = record.sampleCount > 0 ? record.totalRevenue / record.sampleCount : 0

  return {
    conversionRate: roundMetric(clamp(record.averageConversion, MIN_CONVERSION, MAX_CONVERSION)),
    revenuePerSample: roundMetric(normalizeRevenue(revenuePerSample)),
    sampleCount: Math.max(0, Math.trunc(record.sampleCount)),
    stability: roundMetric(stability),
    decayWeight: roundMetric(clamp(record.timeDecayWeight, MIN_DECAY, MAX_DECAY)),
    source: 'memory',
  }
}

function mergePerformance(
  memory: PerformanceInput,
  override: Omit<PerformanceInput, 'source'> | undefined,
): PerformanceInput {
  if (!override) {
    return memory
  }

  return normalizePerformance(override, 'override')
}

function computeBaseline(attributions: RevenueAttributionAggregate[]) {
  const attributionCount = attributions.length
  const totalAttributedRevenue = attributions.reduce((sum, item) => sum + normalizeRevenue(item.attributedRevenue), 0)
  const averageAttributedRevenue = attributionCount > 0 ? totalAttributedRevenue / attributionCount : 0

  const nonZeroCount = attributions.filter((item) => normalizeRevenue(item.attributedRevenue) > 0).length
  const baselineConversionRate = attributionCount > 0 ? nonZeroCount / attributionCount : 0.5

  return {
    attributionCount,
    totalAttributedRevenue: roundMetric(totalAttributedRevenue),
    averageAttributedRevenue: roundMetric(averageAttributedRevenue),
    baselineConversionRate: roundMetric(clamp(baselineConversionRate, 0, 1)),
  }
}

function computeConfidence(args: {
  baselineAttributionCount: number
  category: PerformanceInput
  entity: PerformanceInput
  consistency: number
}) {
  const attributionConfidence = clamp(Math.log10(args.baselineAttributionCount + 1) / 2, 0, 1)
  const stabilityConfidence = clamp((args.category.stability + args.entity.stability) / 2, 0, 1)
  const decayConfidence = clamp((args.category.decayWeight + args.entity.decayWeight) / 2, 0, 1)

  return roundMetric(
    clamp(
      (attributionConfidence * 0.4)
      + (stabilityConfidence * 0.25)
      + (decayConfidence * 0.2)
      + (args.consistency * 0.15),
      0,
      1,
    ),
  )
}

function buildReasoning(args: {
  estimated: EstimatedEconomicDelta
  confidence: number
  baseline: ReturnType<typeof computeBaseline>
  heuristics: EconomicDeltaEstimatorEvidence['heuristics']
  category: PerformanceInput
  entity: PerformanceInput
}) {
  return [
    `Deterministic heuristic model blended category/entity conversion (${args.heuristics.combinedConversion}) against baseline conversion (${args.baseline.baselineConversionRate}).`,
    `Reference revenue anchor was ${args.baseline.averageAttributedRevenue} from ${args.baseline.attributionCount} historical attributions; estimates are bounded to avoid runaway projections.`,
    `Coverage (${args.heuristics.coverage}), stability (${args.heuristics.combinedStability}), and decay weight (${args.heuristics.combinedDecayWeight}) adjusted missed-opportunity and risk-reduction components.`,
    `Category source=${args.category.source}, entity source=${args.entity.source}; confidence ${args.confidence} reflects sample depth, consistency, and recency weights.`,
    `Net advisory delta=${args.estimated.netDelta} (gain=${args.estimated.estimatedGain}, loss=${args.estimated.estimatedLoss}, missed=${args.estimated.estimatedMissedOpportunity}, riskReduction=${args.estimated.estimatedRiskReduction}).`,
  ]
}

export function estimateEconomicDelta(input: EconomicDeltaEstimatorInput): EconomicDeltaEstimatorResult {
  const categoryKey = normalizeKey(input.category)
  const entityKey = normalizeKey(input.entityId ?? '')

  const scopedAttributions = input.historicalAttributions
    .filter((item) => item.marketSignalId === input.marketSignalId)
    .sort((left, right) => left.attributionId.localeCompare(right.attributionId))

  const baseline = computeBaseline(scopedAttributions)

  const categoryRecord = selectBestMemoryRecord(
    input.economicMemory,
    (record) => record.memoryScope === 'category' && normalizeKey(record.category) === categoryKey,
  )

  const entityRecord = selectBestMemoryRecord(
    input.economicMemory,
    (record) => record.memoryScope === 'entity' && normalizeKey(record.entityId ?? '') === entityKey,
  )

  const categoryPerformance = mergePerformance(
    performanceFromMemory(categoryRecord),
    input.categoryPerformance,
  )
  const entityPerformance = mergePerformance(
    performanceFromMemory(entityRecord),
    input.entityPerformance,
  )

  const combinedConversion = roundMetric(
    clamp((categoryPerformance.conversionRate * 0.55) + (entityPerformance.conversionRate * 0.45), 0, 1),
  )
  const combinedStability = roundMetric(
    clamp((categoryPerformance.stability * 0.5) + (entityPerformance.stability * 0.5), 0, 1),
  )
  const combinedDecayWeight = roundMetric(
    clamp((categoryPerformance.decayWeight * 0.55) + (entityPerformance.decayWeight * 0.45), 0, 1),
  )

  const totalSamples = categoryPerformance.sampleCount + entityPerformance.sampleCount
  const coverage = roundMetric(clamp(totalSamples / 80, 0, 1))
  const consistency = roundMetric(1 - clamp(Math.abs(categoryPerformance.conversionRate - entityPerformance.conversionRate), 0, 1))

  const memoryRevenueBlend = roundMetric(
    (categoryPerformance.revenuePerSample * 0.6) + (entityPerformance.revenuePerSample * 0.4),
  )

  const referenceRevenue = roundMetric(Math.max(baseline.averageAttributedRevenue, memoryRevenueBlend, 0))
  const maxAbsoluteDelta = roundMetric(referenceRevenue * MAX_MULTIPLIER)

  const gainFactor = clamp(
    (combinedConversion - baseline.baselineConversionRate) + (combinedDecayWeight * 0.35) + (combinedStability * 0.2),
    0,
    1.2,
  )

  const lossFactor = clamp(
    (baseline.baselineConversionRate - combinedConversion) + ((1 - combinedDecayWeight) * 0.35) + ((1 - combinedStability) * 0.2),
    0,
    1.2,
  )

  const missedOpportunityFactor = clamp(
    ((1 - coverage) * 0.7) + ((1 - combinedStability) * 0.2) + Math.max(0, baseline.baselineConversionRate - combinedConversion),
    0,
    1.25,
  )

  const riskReductionFactor = clamp(
    (combinedDecayWeight * 0.45) + (combinedStability * 0.35) + (combinedConversion * 0.2) - 0.2,
    0,
    0.95,
  )

  const estimatedGain = roundMetric(clamp(referenceRevenue * gainFactor, 0, maxAbsoluteDelta))
  const estimatedLoss = roundMetric(clamp(referenceRevenue * lossFactor, 0, maxAbsoluteDelta))
  const estimatedMissedOpportunity = roundMetric(clamp(referenceRevenue * missedOpportunityFactor, 0, maxAbsoluteDelta))
  const estimatedRiskReduction = roundMetric(clamp(referenceRevenue * riskReductionFactor, 0, maxAbsoluteDelta))

  const netDelta = roundMetric(
    clamp(
      (estimatedGain + estimatedRiskReduction) - (estimatedLoss + estimatedMissedOpportunity),
      -maxAbsoluteDelta,
      maxAbsoluteDelta,
    ),
  )

  const confidence = computeConfidence({
    baselineAttributionCount: baseline.attributionCount,
    category: categoryPerformance,
    entity: entityPerformance,
    consistency,
  })

  const estimatedEconomicDelta: EstimatedEconomicDelta = {
    estimatedGain,
    estimatedLoss,
    estimatedMissedOpportunity,
    estimatedRiskReduction,
    netDelta,
  }

  const evidence: EconomicDeltaEstimatorEvidence = {
    baseline,
    category: {
      memoryId: categoryRecord?.memoryId ?? null,
      performance: categoryPerformance,
    },
    entity: {
      memoryId: entityRecord?.memoryId ?? null,
      performance: entityPerformance,
    },
    bounds: {
      referenceRevenue,
      maxAbsoluteDelta,
    },
    heuristics: {
      combinedConversion,
      combinedStability,
      combinedDecayWeight,
      coverage,
      consistency,
    },
  }

  return {
    estimatedEconomicDelta,
    confidence,
    reasoning: buildReasoning({
      estimated: estimatedEconomicDelta,
      confidence,
      baseline,
      heuristics: evidence.heuristics,
      category: categoryPerformance,
      entity: entityPerformance,
    }),
    evidence,
  }
}

export const ECONOMIC_DELTA_ESTIMATOR_MODE = 'advisory-only' as const
export const ECONOMIC_DELTA_ESTIMATOR_PROPERTIES = {
  replaySafe: true,
  deterministic: true,
  explainable: true,
  bounded: true,
} as const
