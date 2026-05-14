import { createHash } from 'node:crypto'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import {
  buildAdaptiveEvidenceCompatibilitySummary,
  type AdaptiveEvidenceCompatibilitySummary,
} from '../persistence/adaptiveEvidenceContract.js'
import {
  deriveEpistemicConfidenceMetadata,
  type EpistemicConfidenceMetadata,
} from './epistemicConfidence.js'

type TimelineMetricKey =
  | 'replayConsistency'
  | 'driftAccumulation'
  | 'reinforcementEscalation'
  | 'saturationPersistence'
  | 'oscillationPersistence'
  | 'entropyEvolution'
  | 'equilibriumScore'

export type TrendDirection = 'improving' | 'stable' | 'degrading'

export type TimelineMetricSeriesPoint = {
  metric: TimelineMetricKey
  value: number
}

export type TimelineWindowAggregate = {
  windowStart: string
  windowEnd: string
  sampleCount: number
  averages: Record<TimelineMetricKey, number>
  minimums: Record<TimelineMetricKey, number>
  maximums: Record<TimelineMetricKey, number>
}

export type TimelineHistoricalSnapshot = {
  evidenceId: string
  generatedAt: string
  replayFingerprint: string
  metrics: Record<TimelineMetricKey, number>
  governanceClassification: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
  recommendation: AdaptiveEquilibriumEvidenceEvent['recommendation']
  sustainedEquilibriumEvidence: boolean
}

export type TimelineLongitudinalTrend = {
  metric: TimelineMetricKey
  direction: TrendDirection
  current: number
  previous: number
  delta: number
  changeRatio: number
}

export type AdaptiveTimelineDashboardPayload = {
  generatedAt: string
  aggregationArchitecture: {
    observationOnly: true
    derivedOnly: true
    noMutation: true
    noRollout: true
    noAdaptiveExecution: true
    noGovernanceMutation: true
    replaySafe: true
  }
  compatibility: AdaptiveEvidenceCompatibilitySummary
  epistemicConfidence: EpistemicConfidenceMetadata
  historicalSnapshots: TimelineHistoricalSnapshot[]
  hourlyWindows: TimelineWindowAggregate[]
  dailyWindows: TimelineWindowAggregate[]
  rollingWindows: Array<{
    label: string
    hours: number
    aggregate: TimelineWindowAggregate
  }>
  longitudinalTrends: TimelineLongitudinalTrend[]
  payloadFingerprint: string
}

type AdaptiveTimelineDashboardServiceDependencies = {
  listEvidenceChronological: (args?: { limit?: number }) => Promise<AdaptiveEquilibriumEvidenceEvent[]>
  now?: () => string
}

type BuildTimelineDashboardInput = {
  historyLimit?: number
  rollingHours?: number[]
}

const METRIC_KEYS: TimelineMetricKey[] = [
  'replayConsistency',
  'driftAccumulation',
  'reinforcementEscalation',
  'saturationPersistence',
  'oscillationPersistence',
  'entropyEvolution',
  'equilibriumScore',
]

const DEFAULT_HISTORY_LIMIT = 720
const DEFAULT_ROLLING_HOURS = [6, 24, 72]
const TREND_EPSILON = 0.025

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
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

function toTimelineMetrics(event: AdaptiveEquilibriumEvidenceEvent): Record<TimelineMetricKey, number> {
  const replayConsistency = clampUnit(event.replayConsistencyEquilibrium)
  const driftAccumulation = clampUnit(1 - event.projectionStabilityConvergence)
  const reinforcementEscalation = clampUnit(event.reinforcementEscalationPersistence)
  const saturationPersistence = clampUnit(event.saturationEquilibrium)
  const oscillationPersistence = clampUnit(1 - event.oscillationDamping)
  const entropyEvolution = clampUnit(event.entropyEvolution)
  const equilibriumScore = clampUnit(
    (replayConsistency
      + event.projectionStabilityConvergence
      + event.rankingDiversityPreservation
      + event.oscillationDamping
      + (1 - event.replayDegradationPersistence)) / 5,
  )

  return {
    replayConsistency,
    driftAccumulation,
    reinforcementEscalation,
    saturationPersistence,
    oscillationPersistence,
    entropyEvolution,
    equilibriumScore,
  }
}

function sortChronologically(records: TimelineHistoricalSnapshot[]) {
  return [...records].sort((left, right) => {
    const byTime = left.generatedAt.localeCompare(right.generatedAt)
    if (byTime !== 0) {
      return byTime
    }

    return left.evidenceId.localeCompare(right.evidenceId)
  })
}

function normalizeToHourStart(isoTimestamp: string) {
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  parsed.setUTCMinutes(0, 0, 0)
  return parsed
}

function normalizeToDayStart(isoTimestamp: string) {
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  parsed.setUTCHours(0, 0, 0, 0)
  return parsed
}

function aggregateSnapshots(snapshots: TimelineHistoricalSnapshot[]): TimelineWindowAggregate {
  const sampleCount = snapshots.length
  const firstGeneratedAt = snapshots[0]?.generatedAt ?? '1970-01-01T00:00:00.000Z'
  const lastGeneratedAt = snapshots[snapshots.length - 1]?.generatedAt ?? firstGeneratedAt

  const averages = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<TimelineMetricKey, number>
  const minimums = Object.fromEntries(METRIC_KEYS.map((key) => [key, 1])) as Record<TimelineMetricKey, number>
  const maximums = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<TimelineMetricKey, number>

  if (sampleCount === 0) {
    return {
      windowStart: firstGeneratedAt,
      windowEnd: lastGeneratedAt,
      sampleCount,
      averages,
      minimums,
      maximums,
    }
  }

  for (const snapshot of snapshots) {
    for (const metric of METRIC_KEYS) {
      const value = clampUnit(snapshot.metrics[metric])
      averages[metric] += value
      minimums[metric] = Math.min(minimums[metric], value)
      maximums[metric] = Math.max(maximums[metric], value)
    }
  }

  for (const metric of METRIC_KEYS) {
    averages[metric] = roundMetric(averages[metric] / sampleCount)
    minimums[metric] = roundMetric(minimums[metric])
    maximums[metric] = roundMetric(maximums[metric])
  }

  return {
    windowStart: firstGeneratedAt,
    windowEnd: lastGeneratedAt,
    sampleCount,
    averages,
    minimums,
    maximums,
  }
}

function reduceHourlyWindows(snapshots: TimelineHistoricalSnapshot[]) {
  const buckets = new Map<string, TimelineHistoricalSnapshot[]>()

  for (const snapshot of snapshots) {
    const hourStart = normalizeToHourStart(snapshot.generatedAt)
    if (!hourStart) {
      continue
    }

    const key = hourStart.toISOString()
    const bucket = buckets.get(key) ?? []
    bucket.push(snapshot)
    buckets.set(key, bucket)
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([windowStart, bucket]) => {
      const aggregate = aggregateSnapshots(sortChronologically(bucket))
      const end = new Date(windowStart)
      end.setUTCHours(end.getUTCHours() + 1)

      return {
        ...aggregate,
        windowStart,
        windowEnd: end.toISOString(),
      }
    })
}

function reduceDailyWindows(snapshots: TimelineHistoricalSnapshot[]) {
  const buckets = new Map<string, TimelineHistoricalSnapshot[]>()

  for (const snapshot of snapshots) {
    const dayStart = normalizeToDayStart(snapshot.generatedAt)
    if (!dayStart) {
      continue
    }

    const key = dayStart.toISOString()
    const bucket = buckets.get(key) ?? []
    bucket.push(snapshot)
    buckets.set(key, bucket)
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([windowStart, bucket]) => {
      const aggregate = aggregateSnapshots(sortChronologically(bucket))
      const end = new Date(windowStart)
      end.setUTCDate(end.getUTCDate() + 1)

      return {
        ...aggregate,
        windowStart,
        windowEnd: end.toISOString(),
      }
    })
}

function reduceRollingWindows(args: {
  snapshots: TimelineHistoricalSnapshot[]
  anchorIso: string
  rollingHours: number[]
}) {
  const nowMs = Number.isFinite(Date.parse(args.anchorIso))
    ? Date.parse(args.anchorIso)
    : Date.now()

  return args.rollingHours
    .map((hours) => Math.max(1, Math.trunc(hours)))
    .filter((hours, index, all) => all.indexOf(hours) === index)
    .sort((left, right) => left - right)
    .map((hours) => {
      const startMs = nowMs - (hours * 60 * 60 * 1000)
      const selected = args.snapshots.filter((snapshot) => {
        const generatedAtMs = Date.parse(snapshot.generatedAt)
        return Number.isFinite(generatedAtMs) && generatedAtMs >= startMs && generatedAtMs <= nowMs
      })

      const aggregate = aggregateSnapshots(sortChronologically(selected))

      return {
        label: `rolling_${hours}h`,
        hours,
        aggregate: {
          ...aggregate,
          windowStart: new Date(startMs).toISOString(),
          windowEnd: new Date(nowMs).toISOString(),
        },
      }
    })
}

function classifyTrendDirection(metric: TimelineMetricKey, current: number, previous: number): TrendDirection {
  const delta = current - previous
  if (Math.abs(delta) <= TREND_EPSILON) {
    return 'stable'
  }

  const higherIsBetter = metric !== 'driftAccumulation'
    && metric !== 'reinforcementEscalation'
    && metric !== 'saturationPersistence'
    && metric !== 'oscillationPersistence'

  if (higherIsBetter) {
    return delta > 0 ? 'improving' : 'degrading'
  }

  return delta < 0 ? 'improving' : 'degrading'
}

function reduceLongitudinalTrends(hourlyWindows: TimelineWindowAggregate[]) {
  const current = hourlyWindows[hourlyWindows.length - 1]
  const previous = hourlyWindows[hourlyWindows.length - 2] ?? current

  return METRIC_KEYS.map((metric) => {
    const currentValue = roundMetric(current?.averages[metric] ?? 0)
    const previousValue = roundMetric(previous?.averages[metric] ?? currentValue)
    const delta = roundMetric(currentValue - previousValue)
    const changeRatio = previousValue === 0
      ? (currentValue === 0 ? 0 : 1)
      : roundMetric(delta / previousValue)

    return {
      metric,
      direction: classifyTrendDirection(metric, currentValue, previousValue),
      current: currentValue,
      previous: previousValue,
      delta,
      changeRatio,
    }
  })
}

function buildPayloadFingerprint(payload: unknown) {
  return createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 40)
}

function buildStablePayloadForFingerprint(payload: Pick<
  AdaptiveTimelineDashboardPayload,
  'aggregationArchitecture' | 'compatibility' | 'epistemicConfidence' | 'historicalSnapshots' | 'hourlyWindows' | 'dailyWindows' | 'rollingWindows' | 'longitudinalTrends'
>) {
  return {
    aggregationArchitecture: payload.aggregationArchitecture,
    compatibility: payload.compatibility,
    epistemicConfidence: payload.epistemicConfidence,
    historicalSnapshots: payload.historicalSnapshots,
    hourlyWindows: payload.hourlyWindows,
    dailyWindows: payload.dailyWindows,
    rollingWindows: payload.rollingWindows,
    longitudinalTrends: payload.longitudinalTrends,
  }
}

export class AdaptiveTimelineDashboardService {
  constructor(private readonly dependencies: AdaptiveTimelineDashboardServiceDependencies) {}

  async buildDashboard(input: BuildTimelineDashboardInput = {}): Promise<AdaptiveTimelineDashboardPayload> {
    const historyLimit = Math.max(10, Math.min(10_000, Math.trunc(input.historyLimit ?? DEFAULT_HISTORY_LIMIT)))
    const rollingHours = input.rollingHours ?? DEFAULT_ROLLING_HOURS
    const records = await this.dependencies.listEvidenceChronological({ limit: historyLimit })
    const nowIso = this.dependencies.now?.() ?? new Date().toISOString()

    const historicalSnapshots = sortChronologically(records.map((record) => ({
      evidenceId: record.evidenceId,
      generatedAt: record.generatedAt,
      replayFingerprint: record.replayFingerprint,
      metrics: toTimelineMetrics(record),
      governanceClassification: record.governanceClassification,
      recommendation: record.recommendation,
      sustainedEquilibriumEvidence: record.sustainedEquilibriumEvidence,
    })))

    const hourlyWindows = reduceHourlyWindows(historicalSnapshots)
    const dailyWindows = reduceDailyWindows(historicalSnapshots)
    const fingerprintAnchorIso = historicalSnapshots[historicalSnapshots.length - 1]?.generatedAt ?? nowIso
    const compatibility = buildAdaptiveEvidenceCompatibilitySummary(records)
    const epistemicConfidence = deriveEpistemicConfidenceMetadata(records)
    const rollingWindows = reduceRollingWindows({
      snapshots: historicalSnapshots,
      anchorIso: fingerprintAnchorIso,
      rollingHours,
    })
    const longitudinalTrends = reduceLongitudinalTrends(hourlyWindows)

    const payloadWithoutFingerprint: Omit<AdaptiveTimelineDashboardPayload, 'payloadFingerprint'> = {
      generatedAt: nowIso,
      aggregationArchitecture: {
        observationOnly: true,
        derivedOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveExecution: true,
        noGovernanceMutation: true,
        replaySafe: true,
      },
      compatibility,
      epistemicConfidence,
      historicalSnapshots,
      hourlyWindows,
      dailyWindows,
      rollingWindows,
      longitudinalTrends,
    }

    return {
      ...payloadWithoutFingerprint,
      payloadFingerprint: buildPayloadFingerprint(buildStablePayloadForFingerprint(payloadWithoutFingerprint)),
    }
  }
}

export function createAdaptiveTimelineDashboardService(dependencies: AdaptiveTimelineDashboardServiceDependencies) {
  return new AdaptiveTimelineDashboardService(dependencies)
}
