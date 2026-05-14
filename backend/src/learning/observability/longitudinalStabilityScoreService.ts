import { createHash } from 'node:crypto'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import {
  buildAdaptiveEvidenceCompatibilitySummary,
  type AdaptiveEvidenceCompatibilitySummary,
} from '../persistence/adaptiveEvidenceContract.js'

type StabilityComponentKey =
  | 'replayConsistency'
  | 'driftStability'
  | 'saturationStability'
  | 'reinforcementStability'
  | 'oscillationStability'
  | 'entropyEvolution'
  | 'replayIntegrity'
  | 'equilibriumConvergence'

type StabilityPenaltyKey =
  | 'replayDegradationPenalty'
  | 'driftPersistencePenalty'
  | 'saturationPersistencePenalty'
  | 'reinforcementEscalationPenalty'
  | 'oscillationPersistencePenalty'

export type LongitudinalStabilityClassification = 'SAFE' | 'CAUTION' | 'UNSAFE'
export type LongitudinalStabilityTrendDirection = 'improving' | 'stable' | 'degrading'

export type LongitudinalStabilityConfidenceInterval = {
  confidenceLevel: number
  lowerBound: number
  upperBound: number
  marginOfError: number
  sampleCount: number
}

export type LongitudinalStabilityScorePoint = {
  evidenceId: string
  generatedAt: string
  replayFingerprint: string
  weightedBaseScore: number
  degradationPenalty: number
  finalScore: number
  classification: LongitudinalStabilityClassification
  components: Record<StabilityComponentKey, number>
  penalties: Record<StabilityPenaltyKey, number>
  confidenceInterval: LongitudinalStabilityConfidenceInterval
}

export type LongitudinalStabilityRollingAverage = {
  label: string
  hours: number
  windowStart: string
  windowEnd: string
  sampleCount: number
  averageScore: number
  averageBaseScore: number
  averagePenalty: number
  classification: LongitudinalStabilityClassification
  confidenceInterval: LongitudinalStabilityConfidenceInterval
  components: Record<StabilityComponentKey, number>
  penalties: Record<StabilityPenaltyKey, number>
}

export type LongitudinalStabilityPayload = {
  generatedAt: string
  aggregationArchitecture: {
    observationOnly: true
    derivedOnly: true
    noMutation: true
    noRollout: true
    noAdaptiveExecution: true
    noGovernanceMutation: true
    replaySafe: true
    deterministic: true
    weightedLongitudinalScoring: true
  }
  compatibility: AdaptiveEvidenceCompatibilitySummary
  stabilityScoringArchitecture: {
    weightedCalculation: {
      components: Record<StabilityComponentKey, number>
      degradationPenaltyMultiplier: number
    }
    componentSemantics: Record<StabilityComponentKey, {
      reducer: string
      sourceFields: string[]
      description: string
      proxyBased: boolean
    }>
    confidenceIntervalLogic: {
      confidenceLevel: number
      zScore: number
      minimumSampleCount: number
      method: 'normal_approximation'
    }
    classificationThresholds: {
      safeMinimum: number
      cautionMinimum: number
      unsafeBelow: number
    }
    longitudinalScoringReducers: string[]
  }
  currentScore: LongitudinalStabilityScorePoint | null
  historicalScores: LongitudinalStabilityScorePoint[]
  rollingAverages: LongitudinalStabilityRollingAverage[]
  longitudinalEvolution: {
    direction: LongitudinalStabilityTrendDirection
    currentScore: number
    previousScore: number
    delta: number
    changeRatio: number
    averageScore: number
    scoreVolatility: number
    degradationPressure: number
  }
  replaySafePayload: {
    classification: LongitudinalStabilityClassification | null
    confidenceInterval: LongitudinalStabilityConfidenceInterval | null
    sourceEvidenceCount: number
  }
  payloadFingerprint: string
}

type LongitudinalStabilityScoreServiceDependencies = {
  listEvidenceChronological: (args?: { limit?: number }) => Promise<AdaptiveEquilibriumEvidenceEvent[]>
  now?: () => string
}

export type BuildLongitudinalStabilityScoreInput = {
  historyLimit?: number
  rollingHours?: number[]
}

const DEFAULT_HISTORY_LIMIT = 720
const DEFAULT_ROLLING_HOURS = [6, 24, 72]
const TREND_EPSILON = 0.025
const CONFIDENCE_LEVEL = 0.95
const CONFIDENCE_Z_SCORE = 1.96
const MINIMUM_CONFIDENCE_SAMPLE_COUNT = 2
const STABILITY_COMPONENT_WEIGHTS: Record<StabilityComponentKey, number> = {
  replayConsistency: 0.2,
  driftStability: 0.12,
  saturationStability: 0.1,
  reinforcementStability: 0.1,
  oscillationStability: 0.1,
  entropyEvolution: 0.1,
  replayIntegrity: 0.13,
  equilibriumConvergence: 0.15,
}
const STABILITY_PENALTY_WEIGHTS: Record<StabilityPenaltyKey, number> = {
  replayDegradationPenalty: 0.4,
  driftPersistencePenalty: 0.2,
  saturationPersistencePenalty: 0.15,
  reinforcementEscalationPenalty: 0.15,
  oscillationPersistencePenalty: 0.1,
}
const DEGRADATION_PENALTY_MULTIPLIER = 0.35
const SAFE_MINIMUM = 0.72
const CAUTION_MINIMUM = 0.45

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number(value.toFixed(6))
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, roundMetric(value)))
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function variance(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  const mean = average(values)
  return roundMetric(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length)
}

function standardDeviation(values: number[]) {
  return roundMetric(Math.sqrt(variance(values)))
}

function classifyScore(score: number): LongitudinalStabilityClassification {
  if (score >= SAFE_MINIMUM) {
    return 'SAFE'
  }

  if (score >= CAUTION_MINIMUM) {
    return 'CAUTION'
  }

  return 'UNSAFE'
}

function computeDriftPressure(event: AdaptiveEquilibriumEvidenceEvent) {
  return average([
    clampUnit(event.projectionLockInPersistence),
    clampUnit(event.lowConfidenceAmplificationPersistence),
  ])
}

function toComponents(event: AdaptiveEquilibriumEvidenceEvent): Record<StabilityComponentKey, number> {
  return {
    replayConsistency: clampUnit(event.replayConsistencyEquilibrium),
    driftStability: clampUnit(1 - computeDriftPressure(event)),
    saturationStability: clampUnit(1 - event.saturationEquilibrium),
    reinforcementStability: clampUnit(1 - event.reinforcementEscalationPersistence),
    oscillationStability: clampUnit(event.oscillationDamping),
    entropyEvolution: clampUnit(event.entropyEvolution),
    replayIntegrity: clampUnit(1 - event.replayDegradationPersistence),
    equilibriumConvergence: clampUnit(event.projectionStabilityConvergence),
  }
}

function toPenalties(event: AdaptiveEquilibriumEvidenceEvent): Record<StabilityPenaltyKey, number> {
  return {
    replayDegradationPenalty: clampUnit(event.replayDegradationPersistence),
    driftPersistencePenalty: clampUnit(1 - event.projectionStabilityConvergence),
    saturationPersistencePenalty: clampUnit(event.saturationEquilibrium),
    reinforcementEscalationPenalty: clampUnit(event.reinforcementEscalationPersistence),
    oscillationPersistencePenalty: clampUnit(1 - event.oscillationDamping),
  }
}

function computeWeightedBaseScore(components: Record<StabilityComponentKey, number>) {
  return roundMetric(
    Object.entries(STABILITY_COMPONENT_WEIGHTS)
      .reduce((sum, [key, weight]) => sum + (components[key as StabilityComponentKey] * weight), 0),
  )
}

function computeDegradationPenalty(penalties: Record<StabilityPenaltyKey, number>) {
  const normalizedPenalty = Object.entries(STABILITY_PENALTY_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + (penalties[key as StabilityPenaltyKey] * weight), 0)

  return roundMetric(clampUnit(normalizedPenalty) * DEGRADATION_PENALTY_MULTIPLIER)
}

function buildConfidenceInterval(values: number[]): LongitudinalStabilityConfidenceInterval {
  const sampleCount = values.length
  if (sampleCount < MINIMUM_CONFIDENCE_SAMPLE_COUNT) {
    const fallbackValue = clampUnit(values[0] ?? 0)
    return {
      confidenceLevel: CONFIDENCE_LEVEL,
      lowerBound: fallbackValue,
      upperBound: fallbackValue,
      marginOfError: 0,
      sampleCount,
    }
  }

  const mean = average(values)
  const stdDev = standardDeviation(values)
  const marginOfError = roundMetric(CONFIDENCE_Z_SCORE * (stdDev / Math.sqrt(sampleCount)))

  return {
    confidenceLevel: CONFIDENCE_LEVEL,
    lowerBound: clampUnit(mean - marginOfError),
    upperBound: clampUnit(mean + marginOfError),
    marginOfError,
    sampleCount,
  }
}

function sortChronological(events: AdaptiveEquilibriumEvidenceEvent[]) {
  return [...events].sort((left, right) => {
    const byTime = left.generatedAt.localeCompare(right.generatedAt)
    if (byTime !== 0) {
      return byTime
    }

    return left.evidenceId.localeCompare(right.evidenceId)
  })
}

function normalizeHistoryLimit(limit?: number) {
  return Math.max(1, Math.min(10_000, Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT)))
}

function normalizeRollingHours(hours?: number[]) {
  return (hours ?? DEFAULT_ROLLING_HOURS)
    .map((value) => Math.max(1, Math.trunc(value)))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => left - right)
}

function buildHistoricalScores(events: AdaptiveEquilibriumEvidenceEvent[]) {
  const history: LongitudinalStabilityScorePoint[] = []

  for (const event of events) {
    const components = toComponents(event)
    const penalties = toPenalties(event)
    const weightedBaseScore = computeWeightedBaseScore(components)
    const degradationPenalty = computeDegradationPenalty(penalties)
    const finalScore = clampUnit(weightedBaseScore - degradationPenalty)
    const seriesValues = [...history.map((point) => point.finalScore), finalScore]

    history.push({
      evidenceId: event.evidenceId,
      generatedAt: event.generatedAt,
      replayFingerprint: event.replayFingerprint,
      weightedBaseScore,
      degradationPenalty,
      finalScore,
      classification: classifyScore(finalScore),
      components,
      penalties,
      confidenceInterval: buildConfidenceInterval(seriesValues),
    })
  }

  return history
}

function buildRollingAverages(args: {
  history: LongitudinalStabilityScorePoint[]
  anchorIso: string
  rollingHours: number[]
}) {
  const nowMs = Number.isFinite(Date.parse(args.anchorIso))
    ? Date.parse(args.anchorIso)
    : Date.now()

  return args.rollingHours.map((hours) => {
    const windowStartMs = nowMs - (hours * 60 * 60 * 1000)
    const selected = args.history.filter((point) => {
      const timestampMs = Date.parse(point.generatedAt)
      return Number.isFinite(timestampMs) && timestampMs >= windowStartMs && timestampMs <= nowMs
    })

    const scoreValues = selected.map((point) => point.finalScore)
    const baseValues = selected.map((point) => point.weightedBaseScore)
    const penaltyValues = selected.map((point) => point.degradationPenalty)
    const componentAverages = Object.fromEntries(
      Object.keys(STABILITY_COMPONENT_WEIGHTS).map((key) => [
        key,
        average(selected.map((point) => point.components[key as StabilityComponentKey])),
      ]),
    ) as Record<StabilityComponentKey, number>
    const penaltyAverages = Object.fromEntries(
      Object.keys(STABILITY_PENALTY_WEIGHTS).map((key) => [
        key,
        average(selected.map((point) => point.penalties[key as StabilityPenaltyKey])),
      ]),
    ) as Record<StabilityPenaltyKey, number>
    const averageScore = average(scoreValues)

    return {
      label: `rolling_${hours}h`,
      hours,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(nowMs).toISOString(),
      sampleCount: selected.length,
      averageScore,
      averageBaseScore: average(baseValues),
      averagePenalty: average(penaltyValues),
      classification: classifyScore(averageScore),
      confidenceInterval: buildConfidenceInterval(scoreValues),
      components: componentAverages,
      penalties: penaltyAverages,
    } satisfies LongitudinalStabilityRollingAverage
  })
}

function buildLongitudinalEvolution(history: LongitudinalStabilityScorePoint[]) {
  const values = history.map((point) => point.finalScore)
  const currentScore = values[values.length - 1] ?? 0
  const previousScore = values.length > 1
    ? average(values.slice(0, -1))
    : currentScore
  const delta = roundMetric(currentScore - previousScore)
  const direction: LongitudinalStabilityTrendDirection = Math.abs(delta) < TREND_EPSILON
    ? 'stable'
    : (delta > 0 ? 'improving' : 'degrading')

  return {
    direction,
    currentScore: roundMetric(currentScore),
    previousScore: roundMetric(previousScore),
    delta,
    changeRatio: previousScore > 0 ? roundMetric(delta / previousScore) : 0,
    averageScore: average(values),
    scoreVolatility: standardDeviation(values),
    degradationPressure: average(history.map((point) => point.degradationPenalty)),
  }
}

function buildStablePayloadForFingerprint(payload: Omit<LongitudinalStabilityPayload, 'payloadFingerprint'>) {
  return {
    aggregationArchitecture: payload.aggregationArchitecture,
    compatibility: payload.compatibility,
    stabilityScoringArchitecture: payload.stabilityScoringArchitecture,
    currentScore: payload.currentScore,
    historicalScores: payload.historicalScores,
    rollingAverages: payload.rollingAverages,
    longitudinalEvolution: payload.longitudinalEvolution,
    replaySafePayload: payload.replaySafePayload,
  }
}

export type LongitudinalStabilityScoreService = {
  buildStabilityScore: (input?: BuildLongitudinalStabilityScoreInput) => Promise<LongitudinalStabilityPayload>
}

export function createLongitudinalStabilityScoreService(
  dependencies: LongitudinalStabilityScoreServiceDependencies,
): LongitudinalStabilityScoreService {
  const now = dependencies.now ?? (() => new Date().toISOString())

  return {
    async buildStabilityScore(input = {}) {
      const historyLimit = normalizeHistoryLimit(input.historyLimit)
      const rollingHours = normalizeRollingHours(input.rollingHours)
      const events = sortChronological(await dependencies.listEvidenceChronological({ limit: historyLimit }))
      const generatedAt = now()
      const historicalScores = buildHistoricalScores(events)
      const currentScore = historicalScores[historicalScores.length - 1] ?? null
      const anchorIso = currentScore?.generatedAt ?? generatedAt
      const compatibility = buildAdaptiveEvidenceCompatibilitySummary(events)
      const rollingAverages = buildRollingAverages({
        history: historicalScores,
        anchorIso,
        rollingHours,
      })
      const longitudinalEvolution = buildLongitudinalEvolution(historicalScores)

      const payload = {
        generatedAt,
        aggregationArchitecture: {
          observationOnly: true,
          derivedOnly: true,
          noMutation: true,
          noRollout: true,
          noAdaptiveExecution: true,
          noGovernanceMutation: true,
          replaySafe: true,
          deterministic: true,
          weightedLongitudinalScoring: true,
        },
        compatibility,
        stabilityScoringArchitecture: {
          weightedCalculation: {
            components: STABILITY_COMPONENT_WEIGHTS,
            degradationPenaltyMultiplier: DEGRADATION_PENALTY_MULTIPLIER,
          },
          componentSemantics: {
            replayConsistency: {
              reducer: 'replay_consistency_equilibrium_reducer',
              sourceFields: ['replayConsistencyEquilibrium'],
              description: 'Direct replay consistency equilibrium contribution.',
              proxyBased: false,
            },
            driftStability: {
              reducer: 'inverse_drift_pressure_reducer',
              sourceFields: ['projectionLockInPersistence', 'lowConfidenceAmplificationPersistence'],
              description: 'Inverse drift pressure derived from persistent projection lock-in and low-confidence amplification.',
              proxyBased: true,
            },
            saturationStability: {
              reducer: 'inverse_saturation_persistence_reducer',
              sourceFields: ['saturationEquilibrium'],
              description: 'Inverse saturation persistence contribution.',
              proxyBased: false,
            },
            reinforcementStability: {
              reducer: 'inverse_reinforcement_escalation_reducer',
              sourceFields: ['reinforcementEscalationPersistence'],
              description: 'Inverse reinforcement escalation contribution.',
              proxyBased: false,
            },
            oscillationStability: {
              reducer: 'oscillation_damping_reducer',
              sourceFields: ['oscillationDamping'],
              description: 'Direct oscillation damping contribution.',
              proxyBased: false,
            },
            entropyEvolution: {
              reducer: 'entropy_evolution_reducer',
              sourceFields: ['entropyEvolution'],
              description: 'Entropy evolution contribution.',
              proxyBased: false,
            },
            replayIntegrity: {
              reducer: 'inverse_replay_degradation_reducer',
              sourceFields: ['replayDegradationPersistence'],
              description: 'Inverse replay degradation contribution.',
              proxyBased: false,
            },
            equilibriumConvergence: {
              reducer: 'projection_stability_convergence_reducer',
              sourceFields: ['projectionStabilityConvergence'],
              description: 'Direct equilibrium convergence contribution from projection stability convergence.',
              proxyBased: false,
            },
          },
          confidenceIntervalLogic: {
            confidenceLevel: CONFIDENCE_LEVEL,
            zScore: CONFIDENCE_Z_SCORE,
            minimumSampleCount: MINIMUM_CONFIDENCE_SAMPLE_COUNT,
            method: 'normal_approximation' as const,
          },
          classificationThresholds: {
            safeMinimum: SAFE_MINIMUM,
            cautionMinimum: CAUTION_MINIMUM,
            unsafeBelow: CAUTION_MINIMUM,
          },
          longitudinalScoringReducers: [
            'weighted_component_reducer',
            'inverse_drift_pressure_reducer',
            'degradation_penalty_reducer',
            'rolling_average_reducer',
            'confidence_interval_reducer',
            'classification_threshold_reducer',
            'longitudinal_evolution_reducer',
          ],
        },
        currentScore,
        historicalScores,
        rollingAverages,
        longitudinalEvolution,
        replaySafePayload: {
          classification: currentScore?.classification ?? null,
          confidenceInterval: currentScore?.confidenceInterval ?? null,
          sourceEvidenceCount: events.length,
        },
      } satisfies Omit<LongitudinalStabilityPayload, 'payloadFingerprint'>

      const payloadFingerprint = createHash('sha256')
        .update(stableStringify(buildStablePayloadForFingerprint(payload)))
        .digest('hex')

      return {
        ...payload,
        payloadFingerprint,
      }
    },
  }
}
