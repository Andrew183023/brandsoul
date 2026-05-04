import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityRelationalTraceRecord } from '../domain/entityRelationalTrace.js'
import type { StoredEntityProfile } from '../domain/entityProfile.js'
import type { FlowMindAuthorityObservation, FlowMindDecisionComparison, FlowMindServiceSummary } from '../services/flowMindPort.js'
import type {
  DashboardFlowMindMetrics,
  DashboardFlowMindMetricsEndpoint,
  DashboardFlowMindMetricsFilters,
  DashboardFlowMindAuthorityAggregation,
  DashboardFlowMindComparisonWindowLabel,
  DashboardPublicFlowMindPartialPortfolio,
  DashboardPublicFlowMindPartialPortfolioFilters,
  DashboardPublicFlowMindPartialPortfolioEntry,
  DashboardPublicFlowMindPartialAggregation,
  DashboardPublicFlowMindShadowAggregation,
  DashboardPublicFlowMindShadowReadiness,
  DashboardPublicFlowMindShadowPatternEntry,
  DashboardFlowMindRolloutReadiness,
  DashboardDeprecatedFallback,
  DashboardRelationalTraceEntry,
  DashboardRecentEvent,
  DashboardRecentSignal,
  DashboardRecentUiEffect,
  DashboardSparkStateResponse,
  HydrateRuntimeResponse,
  SparkPresenceIntensity,
  SparkPresenceTrend,
} from './contracts.js'
import { FLOW_MIND_POST_SAFE_MAPPING_MARKER, listFlowMindServiceSnapshots } from './flowMindComparison.js'
import { DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS } from './flowMindAuthorityPolicy.js'
import { listPublicFlowMindShadowSnapshots } from '../services/publicFlowMindShadowService.js'
import { buildPublicFlowMindPartialAggregation, listPublicFlowMindPartialTelemetrySnapshots } from '../services/publicFlowMindPartialService.js'

const HOUR_MS = 60 * 60 * 1000

const DEFAULT_PUBLIC_SHADOW_READINESS_THRESHOLDS = {
  minSampleSize: 5,
  maxAverageDivergenceScore: 0.22,
  minAverageResponseTextSimilarity: 0.82,
  maxAverageBackendLatencyMs: 450,
  maxAverageLatencyDeltaMs: 250,
  maxIntentChangedRate: 0.2,
  maxActionChangedRate: 0.2,
  maxFallbackRate: 0.15,
} as const

const DEFAULT_FLOWMIND_METRICS_FILTERS: DashboardFlowMindMetricsFilters = {
  endpoint: 'all',
  period: '24h',
}

type FlowMindMetricsObservation = {
  endpoint: Exclude<DashboardFlowMindMetricsEndpoint, 'all'>
  observedAt: string
  observedAtMs: number
  decisionServed: {
    backendSuccess: boolean
    degradedMode: boolean
    decisionSource?: string
    lowRiskLaneUsed: boolean
    latencyMs: number
  }
  decisionEvaluated?: {
    backendSuccess: boolean
    degradedMode: boolean
    decisionSource?: string
    lowRiskLaneUsed: boolean
    latencyMs: number
  }
  errorTypes: string[]
}

type FlowMindMetricsDecisionAccumulator = {
  sampleSize: number
  backendSuccess: number
  degradedMode: number
  adaptiveCore: number
  heuristicFallback: number
  lowRiskLaneUsed: number
  latencyValues: number[]
}

function createFlowMindMetricsDecisionAccumulator(): FlowMindMetricsDecisionAccumulator {
  return {
    sampleSize: 0,
    backendSuccess: 0,
    degradedMode: 0,
    adaptiveCore: 0,
    heuristicFallback: 0,
    lowRiskLaneUsed: 0,
    latencyValues: [],
  }
}

function accumulateFlowMindMetricsDecision(
  accumulator: FlowMindMetricsDecisionAccumulator,
  observation?: FlowMindMetricsObservation['decisionEvaluated'] | FlowMindMetricsObservation['decisionServed'],
) {
  if (!observation) {
    return
  }

  accumulator.sampleSize += 1
  accumulator.backendSuccess += observation.backendSuccess ? 1 : 0
  accumulator.degradedMode += observation.degradedMode ? 1 : 0
  accumulator.adaptiveCore += observation.decisionSource === 'adaptive-core' ? 1 : 0
  accumulator.heuristicFallback += observation.decisionSource !== undefined && observation.decisionSource !== 'adaptive-core' ? 1 : 0
  accumulator.lowRiskLaneUsed += observation.lowRiskLaneUsed ? 1 : 0
  accumulator.latencyValues.push(observation.latencyMs)
}

function buildFlowMindMetricsDecisionView(accumulator: FlowMindMetricsDecisionAccumulator) {
  return {
    sampleSize: accumulator.sampleSize,
    backendSuccessRate: accumulator.sampleSize > 0 ? roundMetricRate(accumulator.backendSuccess / accumulator.sampleSize) : 0,
    degradedModeRate: accumulator.sampleSize > 0 ? roundMetricRate(accumulator.degradedMode / accumulator.sampleSize) : 0,
    adaptiveCoreRate: accumulator.sampleSize > 0 ? roundMetricRate(accumulator.adaptiveCore / accumulator.sampleSize) : 0,
    heuristicFallbackRate: accumulator.sampleSize > 0 ? roundMetricRate(accumulator.heuristicFallback / accumulator.sampleSize) : 0,
    lowRiskLaneUsageRate: accumulator.sampleSize > 0 ? roundMetricRate(accumulator.lowRiskLaneUsed / accumulator.sampleSize) : 0,
    latency: {
      p50Ms: computeLatencyPercentile(accumulator.latencyValues, 50),
      p95Ms: computeLatencyPercentile(accumulator.latencyValues, 95),
    },
  }
}

function parseTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function roundMetricRate(value: number) {
  return Math.round(value * 1000) / 1000
}

function clampMetricScore(value: number) {
  return Math.min(1, Math.max(0, value))
}

function normalizePublicPartialPortfolioFilters(filters?: Partial<DashboardPublicFlowMindPartialPortfolioFilters>): DashboardPublicFlowMindPartialPortfolioFilters {
  return {
    operationalRisk: filters?.operationalRisk ?? 'all',
    readinessState: filters?.readinessState ?? 'all',
    automationMode: filters?.automationMode ?? 'all',
    trend: filters?.trend ?? 'all',
    minSampleSize: typeof filters?.minSampleSize === 'number' && Number.isFinite(filters.minSampleSize)
      ? Math.max(0, Math.round(filters.minSampleSize))
      : 0,
  }
}

function resolveFlowMindMetricsWindowStart(period: DashboardFlowMindMetricsFilters['period'], windowEndMs: number) {
  if (period === '24h') {
    return windowEndMs - 24 * HOUR_MS
  }

  if (period === '7d') {
    return windowEndMs - 7 * 24 * HOUR_MS
  }

  if (period === '30d') {
    return windowEndMs - 30 * 24 * HOUR_MS
  }

  return undefined
}

function normalizeFlowMindMetricsFilters(filters?: Partial<DashboardFlowMindMetricsFilters>): DashboardFlowMindMetricsFilters {
  return {
    endpoint: filters?.endpoint ?? DEFAULT_FLOWMIND_METRICS_FILTERS.endpoint,
    period: filters?.period ?? DEFAULT_FLOWMIND_METRICS_FILTERS.period,
  }
}

function computeLatencyPercentile(latencies: number[], percentile: number) {
  if (latencies.length === 0) {
    return undefined
  }

  const sorted = [...latencies].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1))
  return sorted[index]
}

function resolveMetricsObservationFromShadowSnapshot(
  snapshot: ReturnType<typeof listPublicFlowMindShadowSnapshots>[number],
): FlowMindMetricsObservation {
  const errorTypes: string[] = []

  if (snapshot.backendDecision.fallbackUsed) {
    errorTypes.push(snapshot.backendDecision.fallbackReason ?? 'flowmind-reported-fallback')
  }

  return {
    endpoint: 'public-shadow',
    observedAt: snapshot.comparedAt,
    observedAtMs: parseTimestamp(snapshot.comparedAt),
    decisionServed: {
      backendSuccess: snapshot.backendDecision.fallbackUsed === false,
      degradedMode: snapshot.backendDecision.fallbackUsed,
      decisionSource: snapshot.backendDecision.authority.decisionSource,
      lowRiskLaneUsed: snapshot.backendDecision.lowRiskLaneUsed === true,
      latencyMs: snapshot.metrics.latencyMs.backend,
    },
    decisionEvaluated: {
      backendSuccess: snapshot.backendDecision.fallbackUsed === false,
      degradedMode: snapshot.backendDecision.fallbackUsed,
      decisionSource: snapshot.backendDecision.authority.decisionSource,
      lowRiskLaneUsed: snapshot.backendDecision.lowRiskLaneUsed === true,
      latencyMs: snapshot.metrics.latencyMs.backend,
    },
    errorTypes,
  }
}

function resolveMetricsObservationFromPartialSnapshot(
  snapshot: ReturnType<typeof listPublicFlowMindPartialTelemetrySnapshots>[number],
): FlowMindMetricsObservation {
  const errorTypes: string[] = []

  if (snapshot.fallbackOccurred) {
    errorTypes.push(snapshot.fallbackReason ?? (snapshot.engineUsed === 'frontend' ? 'frontend-fallback' : 'degraded-mode'))
  }

  return {
    endpoint: 'public-partial',
    observedAt: snapshot.decidedAt,
    observedAtMs: parseTimestamp(snapshot.decidedAt),
    decisionServed: {
      backendSuccess: snapshot.engineUsed === 'flowmind' && snapshot.fallbackOccurred === false,
      degradedMode: snapshot.engineUsed !== 'flowmind' || snapshot.fallbackOccurred,
      decisionSource: snapshot.engineUsed === 'flowmind'
        ? snapshot.backendDecision?.authority.decisionSource
        : snapshot.frontendDecision.authority.decisionSource,
      lowRiskLaneUsed: snapshot.engineUsed === 'flowmind' && snapshot.backendDecision?.lowRiskLaneUsed === true,
      latencyMs: snapshot.metrics.chosenLatencyMs,
    },
    decisionEvaluated: snapshot.backendDecision
      ? {
        backendSuccess: snapshot.backendDecision.fallbackUsed === false,
        degradedMode: snapshot.backendDecision.fallbackUsed,
        decisionSource: snapshot.backendDecision.authority.decisionSource,
        lowRiskLaneUsed: snapshot.backendDecision.lowRiskLaneUsed === true,
        latencyMs: snapshot.metrics.backendLatencyMs ?? snapshot.backendDecision.latencyMs,
      }
      : undefined,
    errorTypes,
  }
}

function computePublicPartialRiskScore(aggregation: DashboardPublicFlowMindPartialAggregation) {
  const fallbackComponent = aggregation.fallbackRate * 0.35
  const divergenceComponent = (aggregation.avgDivergenceScore ?? 0) * 0.25
  const inconsistencyComponent = aggregation.inconsistencyRate * 0.2
  const latencyComponent = clampMetricScore((aggregation.avgLatencyFlowMind ?? 0) / 900) * 0.1
  const criticalComponent = Math.min(aggregation.criticalInconsistencyCount / 3, 1) * 0.1
  const operationalBoost = aggregation.operationalRisk === 'critical'
    ? 0.12
    : aggregation.operationalRisk === 'warning'
      ? 0.05
      : 0

  return roundMetricRate(clampMetricScore(
    fallbackComponent
      + divergenceComponent
      + inconsistencyComponent
      + latencyComponent
      + criticalComponent
      + operationalBoost,
  ))
}

function mapIncidentStatePriority(state: DashboardPublicFlowMindPartialAggregation['incidentState']) {
  if (state === 'critical') return 4
  if (state === 'stale') return 3
  if (state === 'degraded') return 2
  if (state === 'watch') return 1
  if (state === 'absent') return 1
  return 0
}

function buildPublicPartialPortfolioEntry(args: {
  entityId: string
  entityName?: string
  aggregation: DashboardPublicFlowMindPartialAggregation
}): DashboardPublicFlowMindPartialPortfolioEntry {
  const riskScore = computePublicPartialRiskScore(args.aggregation)

  return {
    entityId: args.entityId,
    entityName: args.entityName,
    sampleSize: args.aggregation.totalInteractions,
    rolloutPercentage: args.aggregation.rolloutPercentage,
    readinessState: args.aggregation.readinessState,
    automationMode: args.aggregation.automationMode,
    operationalRisk: args.aggregation.operationalRisk,
    incidentState: args.aggregation.incidentState,
    incidentUpdatedAt: args.aggregation.incidentUpdatedAt,
    recentTrend: args.aggregation.recentTrend,
    fallbackRate: args.aggregation.fallbackRate,
    avgDivergenceScore: args.aggregation.avgDivergenceScore,
    avgLatencyFlowMind: args.aggregation.avgLatencyFlowMind,
    inconsistencyRate: args.aggregation.inconsistencyRate,
    criticalInconsistencyCount: args.aggregation.criticalInconsistencyCount,
    flowMindUsageRate: args.aggregation.flowMindUsageRate,
    performanceScore: roundMetricRate(clampMetricScore(1 - riskScore)),
    riskScore,
  }
}

export function buildPublicFlowMindPartialPortfolio(args: {
  entities?: Array<StoredEntityProfile<EntityProfile>>
  filters?: Partial<DashboardPublicFlowMindPartialPortfolioFilters>
  now?: string
}): DashboardPublicFlowMindPartialPortfolio | undefined {
  const entities = args.entities ?? []
  if (entities.length === 0) {
    return undefined
  }
  const filters = normalizePublicPartialPortfolioFilters(args.filters)

  const entries = entities
    .map((entity) => {
      const shadowAggregation = buildPublicFlowMindShadowAggregation(entity.entityProfile)
      const readiness = buildPublicFlowMindShadowReadiness(shadowAggregation)
      const aggregation = buildPublicFlowMindPartialAggregation({
        entityProfile: entity.entityProfile,
        readiness,
        shadowAggregation,
      })

      if (!aggregation) {
        return undefined
      }

      return buildPublicPartialPortfolioEntry({
        entityId: entity.id,
        entityName: entity.entityProfile.social?.publicName ?? entity.id,
        aggregation,
      })
    })
    .filter((entry): entry is DashboardPublicFlowMindPartialPortfolioEntry => entry !== undefined)
    .filter((entry) => filters.operationalRisk === 'all' || entry.operationalRisk === filters.operationalRisk)
    .filter((entry) => filters.readinessState === 'all' || entry.readinessState === filters.readinessState)
    .filter((entry) => filters.automationMode === 'all' || entry.automationMode === filters.automationMode)
    .filter((entry) => filters.trend === 'all' || entry.recentTrend === filters.trend)
    .filter((entry) => entry.sampleSize >= (filters.minSampleSize ?? 0))

  if (entries.length === 0) {
    return {
      generatedAt: args.now ?? new Date().toISOString(),
      filters,
      totalEntities: entities.length,
      entitiesWithPartial: 0,
      orderedEntities: [],
      topPerformers: [],
      highestRisk: [],
      highestFallbackRate: [],
      highestDivergence: [],
    }
  }

  const byPerformance = [...entries]
    .sort((left, right) => right.performanceScore - left.performanceScore || right.sampleSize - left.sampleSize || left.entityId.localeCompare(right.entityId))
  const byRisk = [...entries]
    .sort((left, right) => mapIncidentStatePriority(right.incidentState) - mapIncidentStatePriority(left.incidentState) || right.riskScore - left.riskScore || right.fallbackRate - left.fallbackRate || right.criticalInconsistencyCount - left.criticalInconsistencyCount || left.entityId.localeCompare(right.entityId))
  const byFallback = [...entries]
    .sort((left, right) => right.fallbackRate - left.fallbackRate || right.riskScore - left.riskScore || left.entityId.localeCompare(right.entityId))
  const byDivergence = [...entries]
    .sort((left, right) => (right.avgDivergenceScore ?? -1) - (left.avgDivergenceScore ?? -1) || right.riskScore - left.riskScore || left.entityId.localeCompare(right.entityId))

  return {
    generatedAt: args.now ?? new Date().toISOString(),
    filters,
    totalEntities: entities.length,
    entitiesWithPartial: entries.length,
    orderedEntities: byRisk,
    topPerformers: byPerformance.slice(0, 5),
    highestRisk: byRisk.slice(0, 5),
    highestFallbackRate: byFallback.slice(0, 5),
    highestDivergence: byDivergence.slice(0, 5),
  }
}

function buildFlowMindMetrics(args: {
  entityId: string
  entityName?: string
  entityProfile?: EntityProfile
  windowEndAt?: string
  filters?: Partial<DashboardFlowMindMetricsFilters>
}): DashboardFlowMindMetrics {
  const filters = normalizeFlowMindMetricsFilters(args.filters)
  const windowEndMs = args.windowEndAt ? parseTimestamp(args.windowEndAt) : Date.now()
  const windowStartMs = resolveFlowMindMetricsWindowStart(filters.period, windowEndMs)
  const observations = [
    ...listPublicFlowMindShadowSnapshots(args.entityProfile).map((snapshot) => resolveMetricsObservationFromShadowSnapshot(snapshot)),
    ...listPublicFlowMindPartialTelemetrySnapshots(args.entityProfile).map((snapshot) => resolveMetricsObservationFromPartialSnapshot(snapshot)),
  ]
    .filter((observation) => filters.endpoint === 'all' || observation.endpoint === filters.endpoint)
    .filter((observation) => windowStartMs === undefined || observation.observedAtMs >= windowStartMs)

  const errorTypeCounts = new Map<string, number>()
  const endpointCounts = new Map<Exclude<DashboardFlowMindMetricsEndpoint, 'all'>, number>()
  const decisionServed = createFlowMindMetricsDecisionAccumulator()
  const decisionEvaluated = createFlowMindMetricsDecisionAccumulator()

  for (const observation of observations) {
    endpointCounts.set(observation.endpoint, (endpointCounts.get(observation.endpoint) ?? 0) + 1)
    accumulateFlowMindMetricsDecision(decisionServed, observation.decisionServed)
    accumulateFlowMindMetricsDecision(decisionEvaluated, observation.decisionEvaluated)

    for (const errorType of observation.errorTypes) {
      errorTypeCounts.set(errorType, (errorTypeCounts.get(errorType) ?? 0) + 1)
    }
  }

  const sampleSize = observations.length

  return {
    entityId: args.entityId,
    entityName: args.entityName,
    filters: {
      ...filters,
      windowStartAt: windowStartMs === undefined ? undefined : new Date(windowStartMs).toISOString(),
      windowEndAt: new Date(windowEndMs).toISOString(),
    },
    sampleSize,
    decisionServed: buildFlowMindMetricsDecisionView(decisionServed),
    decisionEvaluated: buildFlowMindMetricsDecisionView(decisionEvaluated),
    errorTypeCounts: Array.from(errorTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
      .slice(0, 6),
    endpointCounts: Array.from(endpointCounts.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((left, right) => right.count - left.count || left.endpoint.localeCompare(right.endpoint)),
  }
}

function parseFirstTopic(value: unknown) {
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).find(Boolean)
  }

  return undefined
}

function isFlowMindSummaryDecision(value: unknown): value is FlowMindServiceSummary['decision'] {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.intent === 'string'
    && typeof record.action === 'string'
    && typeof record.confidence === 'number'
}

function parseSovereignFlowMindSummary(entityProfile?: EntityProfile): FlowMindServiceSummary | undefined {
  return listFlowMindServiceSnapshots(entityProfile)[0]?.summary
}

function parseFlowMindComparison(entityProfile?: EntityProfile): FlowMindDecisionComparison | undefined {
  return listFlowMindServiceSnapshots(entityProfile)[0]?.comparison
}

function parseFlowMindAuthority(entityProfile?: EntityProfile): FlowMindAuthorityObservation | undefined {
  return listFlowMindServiceSnapshots(entityProfile)[0]?.authority
}

function incrementCounter(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function classifyDivergenceDenial(snapshot: ReturnType<typeof listFlowMindServiceSnapshots>[number]) {
  if (snapshot.authority?.authorityDeniedReason !== 'divergence-too-high' || !snapshot.comparison) {
    return undefined
  }

  if (snapshot.comparison.semanticDifference.intentChanged) {
    return 'semantic-drift' as const
  }

  if (snapshot.comparison.semanticDifference.actionChanged) {
    return 'action-drift' as const
  }

  return 'confidence-margin' as const
}

function buildFlowMindAuthorityAggregationFromSnapshots(
  snapshots: Array<ReturnType<typeof listFlowMindServiceSnapshots>[number]>,
): DashboardFlowMindAuthorityAggregation | undefined {
  if (snapshots.length === 0) {
    return undefined
  }

  const deniedReasonCounts = new Map<string, number>()
  const zoneCounts = new Map<string, number>()
  const commandCounts = new Map<string, {
    command: DashboardFlowMindAuthorityAggregation['deniedByCommand'][number]['command']
    deniedCount: number
    grantedCount: number
    deniedReasons: Map<string, number>
  }>()

  const recentPattern = snapshots
    .slice(0, 8)
    .map((snapshot) => ({
      observedAt: snapshot.summary.invokedAt,
      command: snapshot.authority!.authorityCommand,
      zone: snapshot.authority!.authorityZone,
      outcome: snapshot.authority!.authorityGranted ? 'granted' as const : 'denied' as const,
      deniedReason: snapshot.authority!.authorityGranted ? undefined : snapshot.authority!.authorityDeniedReason,
    }))

  let grantedCount = 0
  let deniedCount = 0
  let divergenceBySemanticDrift = 0
  let divergenceByActionDrift = 0
  let divergenceByConfidenceMargin = 0

  for (const snapshot of snapshots) {
    const authority = snapshot.authority!
    const commandBucket = commandCounts.get(authority.authorityCommand) ?? {
      command: authority.authorityCommand,
      deniedCount: 0,
      grantedCount: 0,
      deniedReasons: new Map<string, number>(),
    }

    if (authority.authorityGranted) {
      grantedCount += 1
      commandBucket.grantedCount += 1
    } else {
      deniedCount += 1
      commandBucket.deniedCount += 1
      incrementCounter(zoneCounts, authority.authorityZone)

      if (authority.authorityDeniedReason) {
        incrementCounter(deniedReasonCounts, authority.authorityDeniedReason)
        incrementCounter(commandBucket.deniedReasons, authority.authorityDeniedReason)

        const divergenceClassification = classifyDivergenceDenial(snapshot)
        if (divergenceClassification === 'semantic-drift') {
          divergenceBySemanticDrift += 1
        } else if (divergenceClassification === 'action-drift') {
          divergenceByActionDrift += 1
        } else if (divergenceClassification === 'confidence-margin') {
          divergenceByConfidenceMargin += 1
        }
      }
    }

    commandCounts.set(authority.authorityCommand, commandBucket)
  }

  return {
    sampleSize: snapshots.length,
    grantedCount,
    deniedCount,
    deniedReasonCounts: Array.from(deniedReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
      .slice(0, 5),
    deniedByCommand: Array.from(commandCounts.values())
      .map((entry) => ({
        command: entry.command,
        deniedCount: entry.deniedCount,
        grantedCount: entry.grantedCount,
        topDeniedReason: Array.from(entry.deniedReasons.entries())
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0],
      }))
      .sort((left, right) => right.deniedCount - left.deniedCount || right.grantedCount - left.grantedCount || left.command.localeCompare(right.command))
      .slice(0, 5),
    deniedByZone: Array.from(zoneCounts.entries())
      .map(([zone, deniedCount]) => ({
        zone: zone as DashboardFlowMindAuthorityAggregation['deniedByZone'][number]['zone'],
        deniedCount,
      }))
      .sort((left, right) => right.deniedCount - left.deniedCount || left.zone.localeCompare(right.zone)),
    divergenceBySemanticDrift,
    divergenceByActionDrift,
    divergenceByConfidenceMargin,
    recentPattern,
  }
}

function getAuthoritySnapshotsByWindow(entityProfile?: EntityProfile) {
  const snapshots = listFlowMindServiceSnapshots(entityProfile)
    .filter((snapshot) => snapshot.summary.mode === 'active' && snapshot.authority)

  return {
    all: snapshots,
    preSafeMapping: snapshots.filter((snapshot) => snapshot.rolloutWindow !== FLOW_MIND_POST_SAFE_MAPPING_MARKER),
    postSafeMapping: snapshots.filter((snapshot) => snapshot.rolloutWindow === FLOW_MIND_POST_SAFE_MAPPING_MARKER),
  }
}

function buildComparisonWindowLabel(args: {
  preSafeMappingSampleSize: number
  postSafeMappingSampleSize: number
}): DashboardFlowMindComparisonWindowLabel {
  const postEnough = args.postSafeMappingSampleSize >= DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS.minSampleSize

  if (args.preSafeMappingSampleSize === 0 && args.postSafeMappingSampleSize === 0) {
    return 'sem janela active'
  }

  if (args.postSafeMappingSampleSize === 0) {
    return 'histórico antigo apenas'
  }

  if (args.preSafeMappingSampleSize === 0) {
    return postEnough ? 'janela pós-safe-mapping suficiente' : 'janela pós-safe-mapping inicial'
  }

  return postEnough
    ? 'histórico misto com janela pós-safe-mapping suficiente'
    : 'histórico misto com janela pós-safe-mapping inicial'
}

function buildPostSafeMappingReadiness(
  snapshots: Array<ReturnType<typeof listFlowMindServiceSnapshots>[number]>,
): DashboardFlowMindRolloutReadiness | undefined {
  const aggregation = buildFlowMindAuthorityAggregationFromSnapshots(snapshots)
  if (!aggregation) {
    return undefined
  }

  const sequence = snapshots
    .slice(0, 5)
    .reverse()
    .map((snapshot) => {
      if (snapshot.authority?.authorityGranted) {
        return 'granted'
      }

      const divergenceClass = classifyDivergenceDenial(snapshot)
      if (divergenceClass) {
        return divergenceClass
      }

      return snapshot.authority?.authorityDeniedReason ?? 'other-denial'
    })

  let transitions = 0
  for (let index = 1; index < sequence.length; index += 1) {
    if (sequence[index] !== sequence[index - 1]) {
      transitions += 1
    }
  }

  const oscillationLevel = transitions <= 1 ? 'low' : transitions <= 2 ? 'medium' : 'high'
  const confidenceMarginDominant = aggregation.divergenceByConfidenceMargin > 0
    && aggregation.divergenceByConfidenceMargin > (aggregation.divergenceByActionDrift + aggregation.divergenceBySemanticDrift)

  const sampleProgress = Math.min(aggregation.sampleSize / DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS.minSampleSize, 1)
  const semanticScore = aggregation.divergenceBySemanticDrift === 0 ? 25 : aggregation.divergenceBySemanticDrift === 1 ? 10 : 0
  const dominanceScore = confidenceMarginDominant ? 20 : aggregation.divergenceByConfidenceMargin > 0 ? 8 : 0
  const oscillationScore = oscillationLevel === 'low' ? 15 : oscillationLevel === 'medium' ? 7 : 0
  const rolloutReadinessScore = Math.round(sampleProgress * (40 + semanticScore + dominanceScore + oscillationScore))

  const readinessState = aggregation.sampleSize >= DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS.minSampleSize
    && aggregation.divergenceBySemanticDrift === 0
    && confidenceMarginDominant
    && oscillationLevel === 'low'
    ? 'ready'
    : rolloutReadinessScore >= 45 && aggregation.sampleSize >= Math.max(2, Math.ceil(DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS.minSampleSize / 2))
      ? 'forming'
      : 'not-ready'

  const summary = readinessState === 'ready'
    ? 'Janela pós-safe-mapping pronta para considerar revisão conservadora do gate, com confidence margin dominante e sem semantic drift.'
    : readinessState === 'forming'
      ? 'Janela pós-safe-mapping em formação: já existe sinal útil, mas ainda falta firmeza para revisão objetiva do gate.'
      : 'Janela pós-safe-mapping ainda não sustenta revisão do gate sem risco de decisão prematura.'

  return {
    rolloutReadinessScore,
    readinessState,
    summary,
    sampleSize: aggregation.sampleSize,
    minSampleSize: DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS.minSampleSize,
    divergenceBySemanticDrift: aggregation.divergenceBySemanticDrift,
    divergenceByActionDrift: aggregation.divergenceByActionDrift,
    divergenceByConfidenceMargin: aggregation.divergenceByConfidenceMargin,
    confidenceMarginDominant,
    oscillationLevel,
  }
}

function resolvePublicShadowPatternOutcome(divergenceScore: number): DashboardPublicFlowMindShadowPatternEntry['outcome'] {
  if (divergenceScore <= 0.2) {
    return 'aligned'
  }

  if (divergenceScore <= 0.45) {
    return 'watch'
  }

  return 'diverged'
}

function resolvePublicShadowTrend(
  recentPattern: DashboardPublicFlowMindShadowPatternEntry[],
): DashboardPublicFlowMindShadowAggregation['recentTrend'] {
  if (recentPattern.length < 2) {
    return 'forming'
  }

  const recentAverage = recentPattern.slice(0, 3).reduce((sum, entry) => sum + entry.divergenceScore, 0) / Math.min(recentPattern.length, 3)
  const previousWindow = recentPattern.slice(3, 6)

  if (previousWindow.length === 0) {
    if (recentAverage <= 0.22) {
      return 'stable'
    }

    return recentAverage >= 0.46 ? 'drifting' : 'forming'
  }

  const previousAverage = previousWindow.reduce((sum, entry) => sum + entry.divergenceScore, 0) / previousWindow.length

  if (recentAverage + 0.05 < previousAverage) {
    return 'improving'
  }

  if (recentAverage > previousAverage + 0.05) {
    return 'drifting'
  }

  return 'stable'
}

export function buildPublicFlowMindShadowAggregation(entityProfile?: EntityProfile): DashboardPublicFlowMindShadowAggregation | undefined {
  const snapshots = listPublicFlowMindShadowSnapshots(entityProfile)
  if (snapshots.length === 0) {
    return undefined
  }

  const inconsistencyCounts = new Map<string, number>()
  let divergenceScoreTotal = 0
  let responseTextSimilarityTotal = 0
  let frontendLatencyTotal = 0
  let backendLatencyTotal = 0
  let latencyDeltaTotal = 0
  let fallbackRateTotal = 0
  let intentChangedCount = 0
  let actionChangedCount = 0
  let authorityChangedCount = 0
  let responseTextChangedCount = 0

  const recentPattern = snapshots.slice(0, 6).map((snapshot) => {
    for (const inconsistency of snapshot.comparison.semanticInconsistencies) {
      incrementCounter(inconsistencyCounts, inconsistency)
    }

    divergenceScoreTotal += snapshot.comparison.divergenceScore
    responseTextSimilarityTotal += snapshot.comparison.responseTextSimilarity
    frontendLatencyTotal += snapshot.metrics.latencyMs.frontend
    backendLatencyTotal += snapshot.metrics.latencyMs.backend
    latencyDeltaTotal += snapshot.metrics.latencyMs.delta
    fallbackRateTotal += snapshot.backendDecision.fallbackUsed ? 1 : 0
    intentChangedCount += snapshot.comparison.intentChanged ? 1 : 0
    actionChangedCount += snapshot.comparison.actionChanged ? 1 : 0
    authorityChangedCount += snapshot.comparison.authorityChanged ? 1 : 0
    responseTextChangedCount += snapshot.comparison.responseTextChanged ? 1 : 0

    return {
      observedAt: snapshot.comparedAt,
      divergenceScore: snapshot.comparison.divergenceScore,
      responseTextSimilarity: snapshot.comparison.responseTextSimilarity,
      outcome: resolvePublicShadowPatternOutcome(snapshot.comparison.divergenceScore),
      topInconsistency: snapshot.comparison.semanticInconsistencies[0],
    }
  })

  for (const snapshot of snapshots.slice(6)) {
    for (const inconsistency of snapshot.comparison.semanticInconsistencies) {
      incrementCounter(inconsistencyCounts, inconsistency)
    }

    divergenceScoreTotal += snapshot.comparison.divergenceScore
    responseTextSimilarityTotal += snapshot.comparison.responseTextSimilarity
    frontendLatencyTotal += snapshot.metrics.latencyMs.frontend
    backendLatencyTotal += snapshot.metrics.latencyMs.backend
    latencyDeltaTotal += snapshot.metrics.latencyMs.delta
    fallbackRateTotal += snapshot.backendDecision.fallbackUsed ? 1 : 0
    intentChangedCount += snapshot.comparison.intentChanged ? 1 : 0
    actionChangedCount += snapshot.comparison.actionChanged ? 1 : 0
    authorityChangedCount += snapshot.comparison.authorityChanged ? 1 : 0
    responseTextChangedCount += snapshot.comparison.responseTextChanged ? 1 : 0
  }

  return {
    sampleSize: snapshots.length,
    averageDivergenceScore: Math.round((divergenceScoreTotal / snapshots.length) * 1000) / 1000,
    averageResponseTextSimilarity: Math.round((responseTextSimilarityTotal / snapshots.length) * 1000) / 1000,
    averageFrontendLatencyMs: Math.round(frontendLatencyTotal / snapshots.length),
    averageBackendLatencyMs: Math.round(backendLatencyTotal / snapshots.length),
    averageLatencyDeltaMs: Math.round(latencyDeltaTotal / snapshots.length),
    fallbackRate: Math.round((fallbackRateTotal / snapshots.length) * 1000) / 1000,
    intentChangedCount,
    actionChangedCount,
    authorityChangedCount,
    responseTextChangedCount,
    topSemanticInconsistencies: Array.from(inconsistencyCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
      .slice(0, 5),
    recentPattern,
    recentTrend: resolvePublicShadowTrend(recentPattern),
  }
}

export function buildPublicFlowMindShadowReadiness(
  aggregation?: DashboardPublicFlowMindShadowAggregation,
): DashboardPublicFlowMindShadowReadiness | undefined {
  if (!aggregation) {
    return undefined
  }

  const thresholds = DEFAULT_PUBLIC_SHADOW_READINESS_THRESHOLDS
  const intentChangedRate = aggregation.sampleSize > 0 ? aggregation.intentChangedCount / aggregation.sampleSize : 1
  const actionChangedRate = aggregation.sampleSize > 0 ? aggregation.actionChangedCount / aggregation.sampleSize : 1

  const sampleScore = Math.round(Math.min(aggregation.sampleSize / thresholds.minSampleSize, 1) * 25)
  const divergenceScore = aggregation.averageDivergenceScore <= thresholds.maxAverageDivergenceScore
    ? 20
    : aggregation.averageDivergenceScore <= thresholds.maxAverageDivergenceScore + 0.08
      ? 10
      : 0
  const similarityScore = aggregation.averageResponseTextSimilarity >= thresholds.minAverageResponseTextSimilarity
    ? 15
    : aggregation.averageResponseTextSimilarity >= thresholds.minAverageResponseTextSimilarity - 0.08
      ? 7
      : 0
  const backendLatencyScore = aggregation.averageBackendLatencyMs <= thresholds.maxAverageBackendLatencyMs
    ? 10
    : aggregation.averageBackendLatencyMs <= thresholds.maxAverageBackendLatencyMs * 1.5
      ? 5
      : 0
  const latencyDeltaScore = aggregation.averageLatencyDeltaMs <= thresholds.maxAverageLatencyDeltaMs
    ? 5
    : aggregation.averageLatencyDeltaMs <= thresholds.maxAverageLatencyDeltaMs * 1.5
      ? 2
      : 0
  const driftScore = (intentChangedRate <= thresholds.maxIntentChangedRate ? 5 : 0)
    + (actionChangedRate <= thresholds.maxActionChangedRate ? 5 : 0)
  const fallbackScore = aggregation.fallbackRate <= thresholds.maxFallbackRate
    ? 5
    : aggregation.fallbackRate <= thresholds.maxFallbackRate * 1.5
      ? 2
      : 0
  const trendScore = aggregation.recentTrend === 'improving'
    ? 10
    : aggregation.recentTrend === 'stable'
      ? 8
      : aggregation.recentTrend === 'forming'
        ? 4
        : 0

  const publicShadowReadinessScore = sampleScore + divergenceScore + similarityScore + backendLatencyScore + latencyDeltaScore + driftScore + fallbackScore + trendScore

  const publicShadowReadinessState = aggregation.sampleSize >= thresholds.minSampleSize
    && aggregation.averageDivergenceScore <= thresholds.maxAverageDivergenceScore
    && aggregation.averageResponseTextSimilarity >= thresholds.minAverageResponseTextSimilarity
    && aggregation.averageBackendLatencyMs <= thresholds.maxAverageBackendLatencyMs
    && aggregation.averageLatencyDeltaMs <= thresholds.maxAverageLatencyDeltaMs
    && intentChangedRate <= thresholds.maxIntentChangedRate
    && actionChangedRate <= thresholds.maxActionChangedRate
    && aggregation.fallbackRate <= thresholds.maxFallbackRate
    && (aggregation.recentTrend === 'stable' || aggregation.recentTrend === 'improving')
    ? 'ready'
    : publicShadowReadinessScore >= 55 && aggregation.sampleSize >= Math.max(2, Math.ceil(thresholds.minSampleSize / 2))
      ? 'forming'
      : 'not-ready'

  const summary = publicShadowReadinessState === 'ready'
    ? 'A entidade já apresenta convergência pública suficiente para considerar testes conservadores de partial público.'
    : publicShadowReadinessState === 'forming'
      ? 'A entidade mostra sinal útil de convergência pública, mas ainda precisa consolidar estabilidade antes de partial público.'
      : 'A entidade ainda não sustenta partial público com segurança objetiva.'

  return {
    publicShadowReadinessScore,
    publicShadowReadinessState,
    summary,
    sampleSize: aggregation.sampleSize,
    minSampleSize: thresholds.minSampleSize,
    maxAverageDivergenceScore: thresholds.maxAverageDivergenceScore,
    minAverageResponseTextSimilarity: thresholds.minAverageResponseTextSimilarity,
    maxAverageBackendLatencyMs: thresholds.maxAverageBackendLatencyMs,
    maxAverageLatencyDeltaMs: thresholds.maxAverageLatencyDeltaMs,
    maxIntentChangedRate: thresholds.maxIntentChangedRate,
    maxActionChangedRate: thresholds.maxActionChangedRate,
    maxFallbackRate: thresholds.maxFallbackRate,
    averageDivergenceScore: aggregation.averageDivergenceScore,
    averageResponseTextSimilarity: aggregation.averageResponseTextSimilarity,
    averageBackendLatencyMs: aggregation.averageBackendLatencyMs,
    averageLatencyDeltaMs: aggregation.averageLatencyDeltaMs,
    intentChangedRate: Math.round(intentChangedRate * 1000) / 1000,
    actionChangedRate: Math.round(actionChangedRate * 1000) / 1000,
    fallbackRate: aggregation.fallbackRate,
    recentTrend: aggregation.recentTrend,
  }
}

function buildEventSummary(event: EntityEventLogRecord) {
  const explicitSummary = typeof event.payload.summary === 'string' && event.payload.summary.trim().length > 0
    ? event.payload.summary.trim()
    : undefined
  if (explicitSummary) {
    return explicitSummary
  }

  if (event.type === 'interaction.registered') {
    return 'Interação registrada pela entidade.'
  }
  if (event.type === 'return.visit.registered' || event.type === 'return_visit.registered') {
    return 'Retorno recente registrado.'
  }
  if (event.type === 'share.registered') {
    return 'Compartilhamento recente registrado.'
  }
  if (event.type === 'birth.started') {
    return 'Sessão de nascimento iniciada.'
  }
  if (event.type === 'stage.changed') {
    return 'Stage da presença atualizado.'
  }
  if (event.type === 'export.triggered') {
    return 'Export oficial disparado.'
  }

  return event.type
}

function buildRecentEvents(events: EntityEventLogRecord[]): DashboardRecentEvent[] {
  return events.slice(0, 6).map((event) => ({
    eventId: event.id,
    eventType: event.type,
    occurredAt: event.timestamp,
    commandId: event.causedByCommandId,
    summary: buildEventSummary(event),
    topic: parseFirstTopic(event.payload.topics),
    interactionType: typeof event.payload.interactionType === 'string' ? event.payload.interactionType : undefined,
  }))
}

function buildRecentUiEffects(runtime: HydrateRuntimeResponse): DashboardRecentUiEffect[] {
  return runtime.pendingUiEffects.slice(0, 4).map((effect) => ({
    effectId: effect.effectId,
    kind: effect.kind,
    title: effect.title,
    createdAt: effect.createdAt,
    body: 'body' in effect ? effect.body : undefined,
    question: 'question' in effect ? effect.question : undefined,
    href: 'href' in effect ? effect.href : undefined,
    ctaLabel: 'ctaLabel' in effect ? effect.ctaLabel : undefined,
    exportFormat: effect.kind === 'export' ? effect.exportFormat : undefined,
  }))
}

function computeIntensity(events: EntityEventLogRecord[]): SparkPresenceIntensity {
  const now = Date.now()
  const score = events.slice(0, 8).reduce((accumulator, event) => {
    const ageHours = Math.max(0, (now - parseTimestamp(event.timestamp)) / HOUR_MS)
    const recencyFactor = ageHours <= 6 ? 1 : ageHours <= 24 ? 0.7 : ageHours <= 72 ? 0.35 : 0.15
    const eventWeight = event.type === 'share.registered'
      ? 0.9
      : event.type === 'interaction.registered'
        ? 0.75
        : event.type === 'return.visit.registered' || event.type === 'return_visit.registered'
          ? 1
          : event.type === 'export.triggered'
            ? 0.65
            : 0.45

    return accumulator + eventWeight * recencyFactor
  }, 0)

  if (score >= 2.6) {
    return 'high'
  }
  if (score >= 1.1) {
    return 'medium'
  }
  return 'low'
}

function computeTrend(args: {
  runtime: HydrateRuntimeResponse
  recentEvents: EntityEventLogRecord[]
}): SparkPresenceTrend {
  const lastEvent = args.runtime.lastEvent ?? args.recentEvents[0]
  const lastEventAgeHours = lastEvent ? (Date.now() - parseTimestamp(lastEvent.timestamp)) / HOUR_MS : Number.POSITIVE_INFINITY
  const relationalProjection = args.runtime.frame.relationalProjection

  if (!lastEvent) {
    return 'forming'
  }

  if (lastEventAgeHours > 96) {
    return 'cooling'
  }

  if (
    (lastEvent.type === 'return.visit.registered' || lastEvent.type === 'return_visit.registered')
    && lastEventAgeHours <= 36
  ) {
    return 'returning'
  }

  if (args.runtime.state.sessionStatus === 'running' || computeIntensity(args.recentEvents) === 'high') {
    return 'expanding'
  }

  if ((relationalProjection?.continuityConfidence ?? 0) >= 0.58 || args.runtime.state.sessionStatus === 'completed') {
    return 'stable'
  }

  return 'forming'
}

function buildSummary(args: {
  trend: SparkPresenceTrend
  runtime: HydrateRuntimeResponse
  recentEvents: EntityEventLogRecord[]
}) {
  const projection = args.runtime.frame.relationalProjection
  const relationshipTier = projection?.relationshipTier
  const continuityConfidence = projection?.continuityConfidence ?? 0

  if (args.trend === 'cooling') {
    return 'Presença esfriando; a entidade precisa de novos sinais para retomar continuidade.'
  }
  if (args.trend === 'returning') {
    return 'Retomada detectada; a presença voltou a receber sinais relevantes.'
  }
  if (continuityConfidence < 0.34) {
    return 'Continuidade baixa; a presença ainda não consolidou ritmo suficiente.'
  }
  if (relationshipTier === 'bonded' || relationshipTier === 'engaged') {
    return 'Vínculo crescente com presença mais estável e coerente.'
  }
  if (args.recentEvents.length >= 3) {
    return 'A presença está expandindo com sinais recentes consistentes.'
  }

  return 'A entidade está em formação e acumulando sinais iniciais de presença.'
}

function buildRecentSignals(events: EntityEventLogRecord[]): DashboardRecentSignal[] {
  return events.slice(0, 4).map((event) => ({
    label: buildEventSummary(event),
    eventType: event.type,
    occurredAt: event.timestamp,
  }))
}

function mapGuardrailTone(tag: string): 'neutral' | 'warning' | 'cooling' {
  if (tag === 'inactivity-decay') {
    return 'cooling'
  }
  if (tag === 'share-spam-guard' || tag === 'short-repeat' || tag === 'repeat-window' || tag === 'window-cap') {
    return 'warning'
  }
  return 'neutral'
}

function mapGuardrailLabel(tag: string) {
  if (tag === 'short-repeat') return 'spam mitigado'
  if (tag === 'repeat-window') return 'repetição mitigada'
  if (tag === 'window-cap') return 'cap aplicado'
  if (tag === 'share-spam-guard') return 'share sob proteção'
  if (tag === 'dense-activity-window') return 'janela densa'
  if (tag === 'inactivity-decay') return 'decay aplicado'
  if (tag === 'continuity-coalesced') return 'continuidade coalescida'
  return tag
}

function readGuardrailTags(trace: EntityRelationalTraceRecord) {
  const metadata = trace.metadataJson as Record<string, unknown>
  const guardrails = typeof metadata.guardrails === 'object' && metadata.guardrails !== null
    ? metadata.guardrails as Record<string, unknown>
    : undefined
  const tags = Array.isArray(guardrails?.tags)
    ? guardrails.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  return tags.map((tag) => ({
    key: tag,
    label: mapGuardrailLabel(tag),
    tone: mapGuardrailTone(tag),
  }))
}

function readTraceSummary(trace: EntityRelationalTraceRecord) {
  const metadata = trace.metadataJson as Record<string, unknown>
  return typeof metadata.summary === 'string' && metadata.summary.trim().length > 0
    ? metadata.summary.trim()
    : undefined
}

function buildRelationalTrace(traces: EntityRelationalTraceRecord[]): DashboardRelationalTraceEntry[] {
  return traces.slice(0, 6).map((trace) => ({
    traceId: trace.id,
    eventId: trace.eventId,
    eventType: trace.eventType,
    occurredAt: trace.occurredAt,
    summary: readTraceSummary(trace),
    deltas: {
      bindingStrength: trace.deltaBindingStrength,
      xp: trace.deltaXp,
      continuityConfidence: trace.deltaContinuityConfidence,
    },
    guardrails: readGuardrailTags(trace),
  }))
}

function buildDeprecatedFallbacks(args: {
  runtime: HydrateRuntimeResponse
  entityProfile?: EntityProfile
}): DashboardDeprecatedFallback[] {
  const fallbacks: DashboardDeprecatedFallback[] = []

  if (!args.entityProfile?.social.publicName && args.entityProfile?.id) {
    fallbacks.push({
      key: 'entityName.fallbackToEntityId',
      reason: 'O dashboard usou o entityId como nome por falta de publicName oficial disponível na leitura atual.',
      replacement: 'Expor displayName operacional oficial no backend.',
    })
  }

  if (!args.runtime.frame.renderSpec) {
    fallbacks.push({
      key: 'runtime.renderSpec.missing',
      reason: 'O frame oficial atual ainda não expôs renderSpec suficiente para a mini presença Pixi nesta leitura.',
      replacement: 'Projetar renderSpec oficial completo no frame autoritativo do orchestrator.',
    })
  }

  fallbacks.push({
    key: 'recentActivity.uiEffects.pendingOnly',
    reason: 'A lista de uiEffects reflete apenas effects pendentes na leitura oficial atual, não um histórico persistido.',
    replacement: 'Persistir trilha operacional de uiEffects para leitura histórica no dashboard.',
  })

  return fallbacks
}

export function buildDashboardSparkStateResponse(args: {
  runtime: HydrateRuntimeResponse
  recentEvents: EntityEventLogRecord[]
  relationalTrace?: EntityRelationalTraceRecord[]
  entityProfile?: EntityProfile
  relatedEntities?: Array<StoredEntityProfile<EntityProfile>>
  metricsFilters?: Partial<DashboardFlowMindMetricsFilters>
  publicPartialPortfolioFilters?: Partial<DashboardPublicFlowMindPartialPortfolioFilters>
}): DashboardSparkStateResponse {
  const lastEvent = args.runtime.lastEvent ?? args.recentEvents[0]
  const trend = computeTrend({
    runtime: args.runtime,
    recentEvents: args.recentEvents,
  })
  const authoritySnapshots = getAuthoritySnapshotsByWindow(args.entityProfile)
  const publicShadowAggregation = buildPublicFlowMindShadowAggregation(args.entityProfile)
  const publicShadowReadiness = buildPublicFlowMindShadowReadiness(publicShadowAggregation)
  const publicPartialAggregation: DashboardPublicFlowMindPartialAggregation | undefined = buildPublicFlowMindPartialAggregation({
    entityProfile: args.entityProfile,
    readiness: publicShadowReadiness,
    shadowAggregation: publicShadowAggregation,
    now: args.runtime.state.metadata.updatedAt,
  })

  return {
    entityId: args.runtime.entityId,
    entityName: args.entityProfile?.social.publicName ?? args.entityProfile?.id,
    runtime: args.runtime,
    sovereignFlowMind: parseSovereignFlowMindSummary(args.entityProfile),
    flowMindComparison: parseFlowMindComparison(args.entityProfile),
    flowMindAuthority: parseFlowMindAuthority(args.entityProfile),
    flowMindAuthorityAggregation: buildFlowMindAuthorityAggregationFromSnapshots(authoritySnapshots.all),
    publicShadowAggregation,
    publicShadowRecentPattern: publicShadowAggregation?.recentPattern,
    publicShadowSampleSize: publicShadowAggregation?.sampleSize,
    publicShadowReadiness,
    publicPartialAggregation,
    publicPartialPortfolio: buildPublicFlowMindPartialPortfolio({
      entities: args.relatedEntities,
      filters: args.publicPartialPortfolioFilters,
    }),
    flowMindMetrics: buildFlowMindMetrics({
      entityId: args.runtime.entityId,
      entityName: args.entityProfile?.social.publicName ?? args.entityProfile?.id,
      entityProfile: args.entityProfile,
      windowEndAt: args.runtime.state.metadata.updatedAt,
      filters: args.metricsFilters,
    }),
    preSafeMappingSampleSize: authoritySnapshots.preSafeMapping.length,
    postSafeMappingSampleSize: authoritySnapshots.postSafeMapping.length,
    postSafeMappingAggregation: buildFlowMindAuthorityAggregationFromSnapshots(authoritySnapshots.postSafeMapping),
    postSafeMappingReadiness: buildPostSafeMappingReadiness(authoritySnapshots.postSafeMapping),
    comparisonWindowLabel: buildComparisonWindowLabel({
      preSafeMappingSampleSize: authoritySnapshots.preSafeMapping.length,
      postSafeMappingSampleSize: authoritySnapshots.postSafeMapping.length,
    }),
    liveState: {
      stage: args.runtime.state.currentStage ?? args.runtime.frame.stage,
      sessionStatus: args.runtime.state.sessionStatus,
      sequence: args.runtime.state.sequence,
      lastCommand: args.runtime.state.lastCommand,
      lastEvent: lastEvent
        ? {
          eventId: lastEvent.id,
          eventType: lastEvent.type,
          occurredAt: lastEvent.timestamp,
        }
        : undefined,
      updatedAt: args.runtime.state.metadata.updatedAt,
    },
    relationalState: args.runtime.frame.relationalProjection,
    presenceHealth: {
      trend,
      intensity: computeIntensity(args.recentEvents),
      summary: buildSummary({
        trend,
        runtime: args.runtime,
        recentEvents: args.recentEvents,
      }),
      recentSignals: buildRecentSignals(args.recentEvents),
    },
    recentActivity: {
      events: buildRecentEvents(args.recentEvents),
      uiEffects: buildRecentUiEffects(args.runtime),
      lastCommandId: args.runtime.state.lastCommand?.commandId,
    },
    relationalTrace: buildRelationalTrace(args.relationalTrace ?? []),
    deprecatedFallbacks: buildDeprecatedFallbacks({
      runtime: args.runtime,
      entityProfile: args.entityProfile,
    }),
  }
}
