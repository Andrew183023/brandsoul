import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'

export type ReplayGraphMetricKey =
  | 'replayDegradation'
  | 'fingerprintEquivalence'
  | 'divergenceAccumulation'
  | 'replayCollapseTrend'
  | 'replayInstabilityTrend'
  | 'replayConsistencyEvolution'

export type ReplayGraphHistoricalPoint = {
  evidenceId: string
  timestamp: string
  replayFingerprint: string
  governanceClassification: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
  recommendation: AdaptiveEquilibriumEvidenceEvent['recommendation']
  sustainedEquilibriumEvidence: boolean
  metrics: Record<ReplayGraphMetricKey, number>
  deltas: Record<ReplayGraphMetricKey, number>
}

export type ReplayGraphRollingAverage = {
  label: string
  hours: number
  windowStart: string
  windowEnd: string
  sampleCount: number
  averages: Record<ReplayGraphMetricKey, number>
}

export type ReplayGraphDegradationDeltaPoint = {
  timestamp: string
  evidenceId: string
  replayDegradationDelta: number
  divergenceAccumulationDelta: number
  replayInstabilityDelta: number
  replayConsistencyDelta: number
}

export type ReplayGraphCollapseSummary = {
  totalSamples: number
  totalCollapsedSamples: number
  collapseRatio: number
  rollingCollapseRatios: Array<{
    label: string
    hours: number
    sampleCount: number
    collapsedSampleCount: number
    collapseRatio: number
  }>
}

export type ReplayGraphConsistencyBucket = {
  bucketIndex: number
  minInclusive: number
  maxExclusive: number
  label: string
  count: number
  ratio: number
}

export type ReplayGraphVariancePoint = {
  metric: ReplayGraphMetricKey
  sampleCount: number
  mean: number
  variance: number
  standardDeviation: number
  minimum: number
  maximum: number
}

const METRIC_KEYS: ReplayGraphMetricKey[] = [
  'replayDegradation',
  'fingerprintEquivalence',
  'divergenceAccumulation',
  'replayCollapseTrend',
  'replayInstabilityTrend',
  'replayConsistencyEvolution',
]

const DEFAULT_ROLLING_HOURS = [6, 24, 72]
const COLLAPSE_CONSISTENCY_THRESHOLD = 0.8
const COLLAPSE_DEGRADATION_THRESHOLD = 0.4

function roundMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number(value.toFixed(6))
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, roundMetric(value)))
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

function isCollapsed(event: AdaptiveEquilibriumEvidenceEvent) {
  return (
    clampUnit(event.replayConsistencyEquilibrium) < COLLAPSE_CONSISTENCY_THRESHOLD
    || clampUnit(event.replayDegradationPersistence) >= COLLAPSE_DEGRADATION_THRESHOLD
    || event.governanceClassification === 'UNSAFE'
  )
}

function toMetrics(args: {
  current: AdaptiveEquilibriumEvidenceEvent
  previous: AdaptiveEquilibriumEvidenceEvent | null
}): Record<ReplayGraphMetricKey, number> {
  const current = args.current
  const previous = args.previous

  const replayDegradation = clampUnit(current.replayDegradationPersistence)
  const fingerprintEquivalence = previous
    ? (current.replayFingerprint === previous.replayFingerprint ? 1 : 0)
    : 1
  const divergenceAccumulation = clampUnit(
    ((1 - clampUnit(current.replayConsistencyEquilibrium))
      + replayDegradation
      + clampUnit(current.projectionLockInPersistence)) / 3,
  )
  const replayCollapseTrend = isCollapsed(current) ? 1 : 0
  const replayInstabilityTrend = clampUnit(
    (clampUnit(current.reinforcementEscalationPersistence)
      + clampUnit(current.saturationEquilibrium)
      + (1 - clampUnit(current.oscillationDamping))
      + clampUnit(current.lowConfidenceAmplificationPersistence)) / 4,
  )
  const replayConsistencyEvolution = clampUnit(current.replayConsistencyEquilibrium)

  return {
    replayDegradation,
    fingerprintEquivalence,
    divergenceAccumulation,
    replayCollapseTrend,
    replayInstabilityTrend,
    replayConsistencyEvolution,
  }
}

function toDeltaMetrics(args: {
  current: Record<ReplayGraphMetricKey, number>
  previous: Record<ReplayGraphMetricKey, number> | null
}) {
  const deltas = Object.fromEntries(METRIC_KEYS.map((metric) => [metric, 0])) as Record<ReplayGraphMetricKey, number>

  for (const metric of METRIC_KEYS) {
    const previousValue = args.previous?.[metric] ?? args.current[metric]
    deltas[metric] = roundMetric(args.current[metric] - previousValue)
  }

  return deltas
}

export function reduceReplayTimeSeries(events: AdaptiveEquilibriumEvidenceEvent[]) {
  const sorted = sortChronological(events)
  const points: ReplayGraphHistoricalPoint[] = []
  let previousEvent: AdaptiveEquilibriumEvidenceEvent | null = null

  for (const current of sorted) {
    const previousPoint = points[points.length - 1]
    const metrics = toMetrics({ current, previous: previousEvent })
    const deltas = toDeltaMetrics({
      current: metrics,
      previous: previousPoint?.metrics ?? null,
    })

    points.push({
      evidenceId: current.evidenceId,
      timestamp: current.generatedAt,
      replayFingerprint: current.replayFingerprint,
      governanceClassification: current.governanceClassification,
      recommendation: current.recommendation,
      sustainedEquilibriumEvidence: current.sustainedEquilibriumEvidence,
      metrics,
      deltas,
    })

    previousEvent = current
  }

  return points
}

function buildEmptyAverages() {
  return Object.fromEntries(METRIC_KEYS.map((metric) => [metric, 0])) as Record<ReplayGraphMetricKey, number>
}

export function reduceReplayRollingAverages(args: {
  timeSeries: ReplayGraphHistoricalPoint[]
  nowIso: string
  rollingHours?: number[]
}) {
  const nowMs = Number.isFinite(Date.parse(args.nowIso))
    ? Date.parse(args.nowIso)
    : Date.now()

  const rollingHours = (args.rollingHours ?? DEFAULT_ROLLING_HOURS)
    .map((hours) => Math.max(1, Math.trunc(hours)))
    .filter((hours, index, all) => all.indexOf(hours) === index)
    .sort((left, right) => left - right)

  return rollingHours.map((hours) => {
    const windowStartMs = nowMs - (hours * 60 * 60 * 1000)
    const selected = args.timeSeries.filter((point) => {
      const timestampMs = Date.parse(point.timestamp)
      return Number.isFinite(timestampMs) && timestampMs >= windowStartMs && timestampMs <= nowMs
    })

    const averages = buildEmptyAverages()
    for (const point of selected) {
      for (const metric of METRIC_KEYS) {
        averages[metric] += point.metrics[metric]
      }
    }

    for (const metric of METRIC_KEYS) {
      averages[metric] = selected.length > 0
        ? roundMetric(averages[metric] / selected.length)
        : 0
    }

    return {
      label: `rolling_${hours}h`,
      hours,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(nowMs).toISOString(),
      sampleCount: selected.length,
      averages,
    } satisfies ReplayGraphRollingAverage
  })
}

export function reduceReplayDegradationDeltas(timeSeries: ReplayGraphHistoricalPoint[]) {
  return timeSeries.map((point) => ({
    timestamp: point.timestamp,
    evidenceId: point.evidenceId,
    replayDegradationDelta: point.deltas.replayDegradation,
    divergenceAccumulationDelta: point.deltas.divergenceAccumulation,
    replayInstabilityDelta: point.deltas.replayInstabilityTrend,
    replayConsistencyDelta: point.deltas.replayConsistencyEvolution,
  })) satisfies ReplayGraphDegradationDeltaPoint[]
}

export function reduceReplayCollapseSummary(args: {
  timeSeries: ReplayGraphHistoricalPoint[]
  rollingAverages: ReplayGraphRollingAverage[]
}) {
  const totalSamples = args.timeSeries.length
  const totalCollapsedSamples = args.timeSeries.filter((point) => point.metrics.replayCollapseTrend >= 1).length
  const collapseRatio = totalSamples > 0
    ? roundMetric(totalCollapsedSamples / totalSamples)
    : 0

  return {
    totalSamples,
    totalCollapsedSamples,
    collapseRatio,
    rollingCollapseRatios: args.rollingAverages.map((rolling) => {
      const collapsedSampleCount = roundMetric(rolling.averages.replayCollapseTrend * rolling.sampleCount)
      const normalizedCollapsedCount = Math.max(0, Math.min(rolling.sampleCount, Math.round(collapsedSampleCount)))

      return {
        label: rolling.label,
        hours: rolling.hours,
        sampleCount: rolling.sampleCount,
        collapsedSampleCount: normalizedCollapsedCount,
        collapseRatio: rolling.sampleCount > 0
          ? roundMetric(normalizedCollapsedCount / rolling.sampleCount)
          : 0,
      }
    }),
  } satisfies ReplayGraphCollapseSummary
}

export function reduceReplayConsistencyBuckets(args: {
  timeSeries: ReplayGraphHistoricalPoint[]
  bucketCount?: number
}) {
  const bucketCount = Math.max(2, Math.min(20, Math.trunc(args.bucketCount ?? 5)))
  const bucketSize = 1 / bucketCount
  const total = args.timeSeries.length

  const buckets = Array.from({ length: bucketCount }, (_, bucketIndex) => {
    const minInclusive = roundMetric(bucketIndex * bucketSize)
    const maxExclusive = bucketIndex === bucketCount - 1
      ? 1.000001
      : roundMetric((bucketIndex + 1) * bucketSize)

    return {
      bucketIndex,
      minInclusive,
      maxExclusive,
      label: `${minInclusive.toFixed(2)}-${Math.min(1, maxExclusive).toFixed(2)}`,
      count: 0,
      ratio: 0,
    } satisfies ReplayGraphConsistencyBucket
  })

  for (const point of args.timeSeries) {
    const value = clampUnit(point.metrics.replayConsistencyEvolution)
    const bucketIndex = Math.min(bucketCount - 1, Math.floor(value / bucketSize))
    buckets[bucketIndex].count += 1
  }

  for (const bucket of buckets) {
    bucket.ratio = total > 0
      ? roundMetric(bucket.count / total)
      : 0
  }

  return buckets
}

export function reduceReplayVariance(timeSeries: ReplayGraphHistoricalPoint[]) {
  return METRIC_KEYS.map((metric) => {
    const values = timeSeries.map((point) => clampUnit(point.metrics[metric]))
    const sampleCount = values.length

    if (sampleCount === 0) {
      return {
        metric,
        sampleCount,
        mean: 0,
        variance: 0,
        standardDeviation: 0,
        minimum: 0,
        maximum: 0,
      } satisfies ReplayGraphVariancePoint
    }

    const mean = roundMetric(values.reduce((sum, value) => sum + value, 0) / sampleCount)
    const variance = roundMetric(values
      .map((value) => (value - mean) ** 2)
      .reduce((sum, value) => sum + value, 0) / sampleCount)
    const standardDeviation = roundMetric(Math.sqrt(variance))
    const minimum = roundMetric(Math.min(...values))
    const maximum = roundMetric(Math.max(...values))

    return {
      metric,
      sampleCount,
      mean,
      variance,
      standardDeviation,
      minimum,
      maximum,
    } satisfies ReplayGraphVariancePoint
  })
}
