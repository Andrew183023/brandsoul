import { createHash } from 'node:crypto'

import type {
  AdaptiveEquilibriumEvidenceEvent,
  AdaptiveHeatmapConcentrationCell,
  AdaptiveHeatmapSnapshot,
  AdaptiveRankingDistributionCell,
  AdaptiveScopeHeatmapCell,
} from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import {
  buildAdaptiveEvidenceCompatibilitySummary,
  type AdaptiveEvidenceCompatibilitySummary,
} from '../persistence/adaptiveEvidenceContract.js'

export type AdaptiveHeatmapHotspotClassification = 'nominal' | 'watch' | 'hot' | 'critical'

export type AdaptiveHeatmapTrendDirection = 'rising' | 'stable' | 'falling'

export type AdaptiveHeatmapTrack = {
  dimension: 'category' | 'entity' | 'adaptive_scope' | 'ranking_distribution' | 'systemic'
  key: string
  label: string
  observationCount: number
  hotspotObservationCount: number
  hotspotRatio: number
  averageIntensity: number
  maxIntensity: number
  latestIntensity: number
  latestClassification: AdaptiveHeatmapHotspotClassification
  currentStreak: number
  longestStreak: number
  trendDirection: AdaptiveHeatmapTrendDirection
  firstSeenAt: string
  lastSeenAt: string
}

export type AdaptiveHeatmapCurrentHotspot = {
  dimension: AdaptiveHeatmapTrack['dimension']
  key: string
  label: string
  intensity: number
  classification: AdaptiveHeatmapHotspotClassification
  observedAt: string
}

export type AdaptiveHeatmapPayload = {
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
    longitudinalTracking: true
  }
  compatibility: AdaptiveEvidenceCompatibilitySummary
  concentrationScoring: {
    reducers: string[]
    weights: {
      volumeShare: number
      scoreShare: number
      adaptiveWeight: number
      rankDominance: number
    }
    hotspotThresholds: {
      watch: number
      hot: number
      critical: number
    }
  }
  heatmaps: {
    category: {
      current: AdaptiveHeatmapConcentrationCell[]
      longitudinal: AdaptiveHeatmapTrack[]
    }
    entity: {
      current: AdaptiveHeatmapConcentrationCell[]
      longitudinal: AdaptiveHeatmapTrack[]
    }
    adaptiveScope: {
      current: AdaptiveScopeHeatmapCell[]
      longitudinal: AdaptiveHeatmapTrack[]
    }
    rankingDistribution: {
      current: AdaptiveRankingDistributionCell[]
      longitudinal: AdaptiveHeatmapTrack[]
    }
    replayDivergence: {
      current: AdaptiveHeatmapSnapshot['replayDivergence'] | null
      timeSeries: Array<{
        timestamp: string
        replayDivergenceIntensityScore: number
        divergenceRatio: number
        oscillationFrequency: number
        equivalentFingerprintRatio: number
      }>
    }
  }
  hotspots: {
    current: AdaptiveHeatmapCurrentHotspot[]
    longitudinalTracking: AdaptiveHeatmapTrack[]
  }
  observability: {
    sourceEvidenceCount: number
    heatmapSnapshotCount: number
    oldestGeneratedAt: string | null
    latestGeneratedAt: string | null
    historyLimit: number
  }
  payloadFingerprint: string
}

type AdaptiveHeatmapServiceDependencies = {
  listEvidenceChronological: (args?: { limit?: number }) => Promise<AdaptiveEquilibriumEvidenceEvent[]>
  now?: () => string
}

export type BuildAdaptiveHeatmapInput = {
  historyLimit?: number
  hotspotLimit?: number
}

const DEFAULT_HISTORY_LIMIT = 720
const DEFAULT_HOTSPOT_LIMIT = 24
const WATCH_THRESHOLD = 0.45
const HOT_THRESHOLD = 0.65
const CRITICAL_THRESHOLD = 0.85
const CONCENTRATION_WEIGHTS = {
  volumeShare: 0.3,
  scoreShare: 0.35,
  adaptiveWeight: 0.15,
  rankDominance: 0.2,
}

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

function classifyHotspot(intensity: number): AdaptiveHeatmapHotspotClassification {
  if (intensity >= CRITICAL_THRESHOLD) {
    return 'critical'
  }

  if (intensity >= HOT_THRESHOLD) {
    return 'hot'
  }

  if (intensity >= WATCH_THRESHOLD) {
    return 'watch'
  }

  return 'nominal'
}

function normalizeHistoryLimit(limit?: number) {
  return Math.max(1, Math.min(10_000, Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT)))
}

function normalizeHotspotLimit(limit?: number) {
  return Math.max(1, Math.min(100, Math.trunc(limit ?? DEFAULT_HOTSPOT_LIMIT)))
}

function buildStablePayloadForFingerprint(payload: Omit<AdaptiveHeatmapPayload, 'payloadFingerprint'>) {
  return {
    aggregationArchitecture: payload.aggregationArchitecture,
    compatibility: payload.compatibility,
    concentrationScoring: payload.concentrationScoring,
    heatmaps: payload.heatmaps,
    hotspots: payload.hotspots,
    observability: payload.observability,
  }
}

function sortEvidenceChronological(events: AdaptiveEquilibriumEvidenceEvent[]) {
  return [...events].sort((left, right) => {
    const byTime = left.generatedAt.localeCompare(right.generatedAt)
    if (byTime !== 0) {
      return byTime
    }

    return left.evidenceId.localeCompare(right.evidenceId)
  })
}

function compareTracks(left: AdaptiveHeatmapTrack, right: AdaptiveHeatmapTrack) {
  if (right.latestIntensity !== left.latestIntensity) {
    return right.latestIntensity - left.latestIntensity
  }

  if (right.maxIntensity !== left.maxIntensity) {
    return right.maxIntensity - left.maxIntensity
  }

  return left.label.localeCompare(right.label)
}

function toTrack(args: {
  dimension: AdaptiveHeatmapTrack['dimension']
  key: string
  label: string
  observations: Array<{ timestamp: string, intensity: number }>
}) {
  const hotspotObservations = args.observations.filter((entry) => classifyHotspot(entry.intensity) !== 'nominal')
  const intensities = args.observations.map((entry) => entry.intensity)
  const latestIntensity = intensities[intensities.length - 1] ?? 0
  const averageIntensity = intensities.length > 0
    ? roundMetric(intensities.reduce((sum, value) => sum + value, 0) / intensities.length)
    : 0
  const maxIntensity = intensities.length > 0 ? roundMetric(Math.max(...intensities)) : 0

  let currentStreak = 0
  let longestStreak = 0
  let runningStreak = 0
  for (const observation of args.observations) {
    if (classifyHotspot(observation.intensity) !== 'nominal') {
      runningStreak += 1
      longestStreak = Math.max(longestStreak, runningStreak)
    } else {
      runningStreak = 0
    }
  }

  for (let index = args.observations.length - 1; index >= 0; index -= 1) {
    const observation = args.observations[index]
    if (!observation || classifyHotspot(observation.intensity) === 'nominal') {
      break
    }

    currentStreak += 1
  }

  const firstIntensity = intensities[0] ?? latestIntensity
  const trendDelta = latestIntensity - firstIntensity
  const trendDirection: AdaptiveHeatmapTrendDirection = Math.abs(trendDelta) < 0.025
    ? 'stable'
    : (trendDelta > 0 ? 'rising' : 'falling')

  return {
    dimension: args.dimension,
    key: args.key,
    label: args.label,
    observationCount: args.observations.length,
    hotspotObservationCount: hotspotObservations.length,
    hotspotRatio: args.observations.length > 0 ? roundMetric(hotspotObservations.length / args.observations.length) : 0,
    averageIntensity,
    maxIntensity,
    latestIntensity,
    latestClassification: classifyHotspot(latestIntensity),
    currentStreak,
    longestStreak,
    trendDirection,
    firstSeenAt: args.observations[0]?.timestamp ?? '',
    lastSeenAt: args.observations[args.observations.length - 1]?.timestamp ?? '',
  } satisfies AdaptiveHeatmapTrack
}

function buildConcentrationTrackMap(
  events: AdaptiveEquilibriumEvidenceEvent[],
  selector: (snapshot: AdaptiveHeatmapSnapshot) => AdaptiveHeatmapConcentrationCell[],
  dimension: 'category' | 'entity',
) {
  const trackMap = new Map<string, { label: string, observations: Array<{ timestamp: string, intensity: number }> }>()

  for (const event of events) {
    const snapshot = event.heatmapSnapshot
    if (!snapshot) {
      continue
    }

    for (const cell of selector(snapshot)) {
      const existing = trackMap.get(cell.key) ?? { label: cell.label, observations: [] }
      existing.label = cell.label
      existing.observations.push({
        timestamp: event.generatedAt,
        intensity: clampUnit(cell.concentrationScore),
      })
      trackMap.set(cell.key, existing)
    }
  }

  return Array.from(trackMap.entries())
    .map(([key, value]) => toTrack({
      dimension,
      key,
      label: value.label,
      observations: value.observations,
    }))
    .sort(compareTracks)
}

function buildScopeTrackMap(events: AdaptiveEquilibriumEvidenceEvent[]) {
  const trackMap = new Map<string, { label: string, observations: Array<{ timestamp: string, intensity: number }> }>()

  for (const event of events) {
    const snapshot = event.heatmapSnapshot
    if (!snapshot) {
      continue
    }

    for (const cell of snapshot.adaptiveScope) {
      const key = cell.scope
      const existing = trackMap.get(key) ?? { label: cell.scope, observations: [] }
      existing.observations.push({
        timestamp: event.generatedAt,
        intensity: clampUnit(cell.concentrationScore),
      })
      trackMap.set(key, existing)
    }
  }

  return Array.from(trackMap.entries())
    .map(([key, value]) => toTrack({
      dimension: 'adaptive_scope',
      key,
      label: value.label,
      observations: value.observations,
    }))
    .sort(compareTracks)
}

function buildRankingTracks(events: AdaptiveEquilibriumEvidenceEvent[]) {
  const trackMap = new Map<string, { label: string, observations: Array<{ timestamp: string, intensity: number }> }>()

  for (const event of events) {
    const snapshot = event.heatmapSnapshot
    if (!snapshot) {
      continue
    }

    for (const cell of snapshot.rankingDistribution) {
      const key = `rank:${cell.rank}`
      const existing = trackMap.get(key) ?? { label: `rank_${cell.rank}`, observations: [] }
      existing.observations.push({
        timestamp: event.generatedAt,
        intensity: clampUnit(cell.dominanceScore),
      })
      trackMap.set(key, existing)
    }
  }

  return Array.from(trackMap.entries())
    .map(([key, value]) => toTrack({
      dimension: 'ranking_distribution',
      key,
      label: value.label,
      observations: value.observations,
    }))
    .sort(compareTracks)
}

function buildSystemicTracks(events: AdaptiveEquilibriumEvidenceEvent[]) {
  const dimensions: Array<{
    key: string
    label: string
    selector: (snapshot: AdaptiveHeatmapSnapshot) => number
  }> = [
    { key: 'replay_divergence', label: 'replay_divergence', selector: (snapshot) => snapshot.replayDivergence.replayDivergenceIntensityScore },
    { key: 'saturation', label: 'saturation', selector: (snapshot) => snapshot.summary.saturationIntensityScore },
    { key: 'reinforcement', label: 'reinforcement', selector: (snapshot) => snapshot.summary.reinforcementIntensityScore },
    { key: 'oscillation', label: 'oscillation', selector: (snapshot) => snapshot.summary.oscillationIntensityScore },
  ]

  return dimensions.map((dimension) => {
    const observations = events
      .filter((event) => event.heatmapSnapshot)
      .map((event) => ({
        timestamp: event.generatedAt,
        intensity: clampUnit(dimension.selector(event.heatmapSnapshot as AdaptiveHeatmapSnapshot)),
      }))

    return toTrack({
      dimension: 'systemic',
      key: dimension.key,
      label: dimension.label,
      observations,
    })
  }).sort(compareTracks)
}

function buildCurrentHotspots(latestEvent: AdaptiveEquilibriumEvidenceEvent | null) {
  const snapshot = latestEvent?.heatmapSnapshot
  if (!snapshot || !latestEvent) {
    return [] as AdaptiveHeatmapCurrentHotspot[]
  }

  const hotspots: AdaptiveHeatmapCurrentHotspot[] = []
  const observedAt = latestEvent.generatedAt

  for (const cell of snapshot.category) {
    const classification = classifyHotspot(cell.concentrationScore)
    if (classification !== 'nominal') {
      hotspots.push({
        dimension: 'category',
        key: cell.key,
        label: cell.label,
        intensity: clampUnit(cell.concentrationScore),
        classification,
        observedAt,
      })
    }
  }

  for (const cell of snapshot.entity) {
    const classification = classifyHotspot(cell.concentrationScore)
    if (classification !== 'nominal') {
      hotspots.push({
        dimension: 'entity',
        key: cell.key,
        label: cell.label,
        intensity: clampUnit(cell.concentrationScore),
        classification,
        observedAt,
      })
    }
  }

  for (const cell of snapshot.adaptiveScope) {
    const classification = classifyHotspot(cell.concentrationScore)
    if (classification !== 'nominal') {
      hotspots.push({
        dimension: 'adaptive_scope',
        key: cell.scope,
        label: cell.scope,
        intensity: clampUnit(cell.concentrationScore),
        classification,
        observedAt,
      })
    }
  }

  for (const metric of [
    { key: 'replay_divergence', label: 'replay_divergence', intensity: snapshot.replayDivergence.replayDivergenceIntensityScore },
    { key: 'saturation', label: 'saturation', intensity: snapshot.summary.saturationIntensityScore },
    { key: 'reinforcement', label: 'reinforcement', intensity: snapshot.summary.reinforcementIntensityScore },
    { key: 'oscillation', label: 'oscillation', intensity: snapshot.summary.oscillationIntensityScore },
  ]) {
    const classification = classifyHotspot(metric.intensity)
    if (classification !== 'nominal') {
      hotspots.push({
        dimension: 'systemic',
        key: metric.key,
        label: metric.label,
        intensity: clampUnit(metric.intensity),
        classification,
        observedAt,
      })
    }
  }

  return hotspots.sort((left, right) => right.intensity - left.intensity)
}

export type AdaptiveHeatmapService = {
  buildHeatmaps: (input?: BuildAdaptiveHeatmapInput) => Promise<AdaptiveHeatmapPayload>
}

export function createAdaptiveHeatmapService(
  dependencies: AdaptiveHeatmapServiceDependencies,
): AdaptiveHeatmapService {
  const now = dependencies.now ?? (() => new Date().toISOString())

  return {
    async buildHeatmaps(input = {}) {
      const historyLimit = normalizeHistoryLimit(input.historyLimit)
      const hotspotLimit = normalizeHotspotLimit(input.hotspotLimit)
      const events = sortEvidenceChronological(await dependencies.listEvidenceChronological({ limit: historyLimit }))
      const generatedAt = now()
      const latestEvent = events[events.length - 1] ?? null
      const latestSnapshot = latestEvent?.heatmapSnapshot ?? null
      const heatmapSnapshotCount = events.filter((event) => event.heatmapSnapshot).length
      const compatibility = buildAdaptiveEvidenceCompatibilitySummary(events)

      const categoryTracks = buildConcentrationTrackMap(events, (snapshot) => snapshot.category, 'category')
      const entityTracks = buildConcentrationTrackMap(events, (snapshot) => snapshot.entity, 'entity')
      const adaptiveScopeTracks = buildScopeTrackMap(events)
      const rankingTracks = buildRankingTracks(events)
      const systemicTracks = buildSystemicTracks(events)
      const currentHotspots = buildCurrentHotspots(latestEvent).slice(0, hotspotLimit)
      const longitudinalTracking = [
        ...categoryTracks,
        ...entityTracks,
        ...adaptiveScopeTracks,
        ...rankingTracks,
        ...systemicTracks,
      ]
        .filter((track) => track.hotspotObservationCount > 0)
        .sort(compareTracks)
        .slice(0, hotspotLimit)

      const timeSeries = events
        .filter((event) => event.heatmapSnapshot)
        .map((event) => ({
          timestamp: event.generatedAt,
          replayDivergenceIntensityScore: clampUnit(event.heatmapSnapshot?.replayDivergence.replayDivergenceIntensityScore ?? 0),
          divergenceRatio: clampUnit(event.heatmapSnapshot?.replayDivergence.divergenceRatio ?? 0),
          oscillationFrequency: clampUnit(event.heatmapSnapshot?.replayDivergence.oscillationFrequency ?? 0),
          equivalentFingerprintRatio: clampUnit(event.heatmapSnapshot?.replayDivergence.equivalentFingerprintRatio ?? 0),
        }))

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
          longitudinalTracking: true,
        },
        compatibility,
        concentrationScoring: {
          reducers: [
            'volume_share_reducer',
            'projected_score_share_reducer',
            'adaptive_weight_reducer',
            'rank_dominance_reducer',
            'hotspot_classification_reducer',
          ],
          weights: CONCENTRATION_WEIGHTS,
          hotspotThresholds: {
            watch: WATCH_THRESHOLD,
            hot: HOT_THRESHOLD,
            critical: CRITICAL_THRESHOLD,
          },
        },
        heatmaps: {
          category: {
            current: latestSnapshot?.category ?? [],
            longitudinal: categoryTracks.slice(0, hotspotLimit),
          },
          entity: {
            current: latestSnapshot?.entity ?? [],
            longitudinal: entityTracks.slice(0, hotspotLimit),
          },
          adaptiveScope: {
            current: latestSnapshot?.adaptiveScope ?? [],
            longitudinal: adaptiveScopeTracks.slice(0, hotspotLimit),
          },
          rankingDistribution: {
            current: latestSnapshot?.rankingDistribution ?? [],
            longitudinal: rankingTracks.slice(0, hotspotLimit),
          },
          replayDivergence: {
            current: latestSnapshot?.replayDivergence ?? null,
            timeSeries,
          },
        },
        hotspots: {
          current: currentHotspots,
          longitudinalTracking,
        },
        observability: {
          sourceEvidenceCount: events.length,
          heatmapSnapshotCount,
          oldestGeneratedAt: events[0]?.generatedAt ?? null,
          latestGeneratedAt: latestEvent?.generatedAt ?? null,
          historyLimit,
        },
      } satisfies Omit<AdaptiveHeatmapPayload, 'payloadFingerprint'>

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
