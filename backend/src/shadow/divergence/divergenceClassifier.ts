export type DivergenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type DivergenceClassificationInput = {
  scoreDelta: number
  confidenceDelta: number
  projectedRankingChange: number
  projectedRevenueImpact: number
}

export type DivergenceClassificationResult = {
  divergenceLevel: DivergenceLevel
  reasoning: string
}

type WeightedSignals = {
  scoreDeltaAbs: number
  confidenceDeltaAbs: number
  rankingChangeAbs: number
  revenueImpactAbs: number
  normalizedScoreDelta: number
  normalizedConfidenceDelta: number
  normalizedRankingChange: number
  normalizedRevenueImpact: number
  weightedScore: number
}

const SCORE_DELTA_DENOMINATOR = 0.35
const CONFIDENCE_DELTA_DENOMINATOR = 0.35
const RANKING_CHANGE_DENOMINATOR = 8
const REVENUE_IMPACT_DENOMINATOR = 250

const SCORE_WEIGHT = 0.3
const CONFIDENCE_WEIGHT = 0.25
const RANKING_WEIGHT = 0.15
const REVENUE_WEIGHT = 0.3

const LOW_MAX = 0.2
const MEDIUM_MAX = 0.4
const HIGH_MAX = 0.65

const CRITICAL_SCORE_DELTA = 0.3
const CRITICAL_CONFIDENCE_DELTA = 0.3
const CRITICAL_RANKING_CHANGE = 6
const CRITICAL_REVENUE_IMPACT = 180
const CRITICAL_WEIGHTED_SCORE = 0.75

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function toFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Divergence classification requires finite ${label}.`)
  }

  return value
}

function normalizeScore(valueAbs: number, denominator: number) {
  if (denominator <= 0) {
    return 0
  }

  return roundMetric(clamp(valueAbs / denominator, 0, 1))
}

function buildWeightedSignals(input: DivergenceClassificationInput): WeightedSignals {
  const scoreDeltaAbs = Math.abs(toFinite(input.scoreDelta, 'scoreDelta'))
  const confidenceDeltaAbs = Math.abs(toFinite(input.confidenceDelta, 'confidenceDelta'))
  const rankingChangeAbs = Math.abs(toFinite(input.projectedRankingChange, 'projectedRankingChange'))
  const revenueImpactAbs = Math.abs(toFinite(input.projectedRevenueImpact, 'projectedRevenueImpact'))

  const normalizedScoreDelta = normalizeScore(scoreDeltaAbs, SCORE_DELTA_DENOMINATOR)
  const normalizedConfidenceDelta = normalizeScore(confidenceDeltaAbs, CONFIDENCE_DELTA_DENOMINATOR)
  const normalizedRankingChange = normalizeScore(rankingChangeAbs, RANKING_CHANGE_DENOMINATOR)
  const normalizedRevenueImpact = normalizeScore(revenueImpactAbs, REVENUE_IMPACT_DENOMINATOR)

  const weightedScore = roundMetric(
    normalizedScoreDelta * SCORE_WEIGHT
      + normalizedConfidenceDelta * CONFIDENCE_WEIGHT
      + normalizedRankingChange * RANKING_WEIGHT
      + normalizedRevenueImpact * REVENUE_WEIGHT,
  )

  return {
    scoreDeltaAbs,
    confidenceDeltaAbs,
    rankingChangeAbs,
    revenueImpactAbs,
    normalizedScoreDelta,
    normalizedConfidenceDelta,
    normalizedRankingChange,
    normalizedRevenueImpact,
    weightedScore,
  }
}

function isCritical(signals: WeightedSignals) {
  return (
    signals.scoreDeltaAbs >= CRITICAL_SCORE_DELTA
    || signals.confidenceDeltaAbs >= CRITICAL_CONFIDENCE_DELTA
    || signals.rankingChangeAbs >= CRITICAL_RANKING_CHANGE
    || signals.revenueImpactAbs >= CRITICAL_REVENUE_IMPACT
    || signals.weightedScore >= CRITICAL_WEIGHTED_SCORE
  )
}

function resolveDivergenceLevel(signals: WeightedSignals): DivergenceLevel {
  if (isCritical(signals)) {
    return 'CRITICAL'
  }

  if (signals.weightedScore <= LOW_MAX) {
    return 'LOW'
  }

  if (signals.weightedScore <= MEDIUM_MAX) {
    return 'MEDIUM'
  }

  if (signals.weightedScore <= HIGH_MAX) {
    return 'HIGH'
  }

  return 'CRITICAL'
}

function buildReasoning(level: DivergenceLevel, signals: WeightedSignals) {
  return [
    `Deterministic weighted divergence score=${signals.weightedScore} produced level=${level}.`,
    `Score delta abs=${roundMetric(signals.scoreDeltaAbs)} (normalized=${signals.normalizedScoreDelta}, weight=${SCORE_WEIGHT}).`,
    `Confidence delta abs=${roundMetric(signals.confidenceDeltaAbs)} (normalized=${signals.normalizedConfidenceDelta}, weight=${CONFIDENCE_WEIGHT}).`,
    `Projected ranking change abs=${roundMetric(signals.rankingChangeAbs)} (normalized=${signals.normalizedRankingChange}, weight=${RANKING_WEIGHT}).`,
    `Projected revenue impact abs=${roundMetric(signals.revenueImpactAbs)} (normalized=${signals.normalizedRevenueImpact}, weight=${REVENUE_WEIGHT}).`,
    `Critical guards: score>=${CRITICAL_SCORE_DELTA}, confidence>=${CRITICAL_CONFIDENCE_DELTA}, ranking>=${CRITICAL_RANKING_CHANGE}, revenue>=${CRITICAL_REVENUE_IMPACT}, weighted>=${CRITICAL_WEIGHTED_SCORE}.`,
  ].join(' ')
}

export function classifyDivergence(input: DivergenceClassificationInput): DivergenceClassificationResult {
  const signals = buildWeightedSignals(input)
  const divergenceLevel = resolveDivergenceLevel(signals)

  return {
    divergenceLevel,
    reasoning: buildReasoning(divergenceLevel, signals),
  }
}

export const DIVERGENCE_CLASSIFIER_MODE = 'advisory-only' as const
export const DIVERGENCE_CLASSIFIER_PROPERTIES = {
  deterministic: true,
  replaySafe: true,
  explainable: true,
} as const
