import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { RuntimeControl } from '../brain/domain/orchestration/contracts/RuntimeControl.js'
import type { FlowMindAuthorityObservation, FlowMindDecisionComparison, FlowMindServiceSummary } from '../services/flowMindPort.js'
import type { OrchestratorCommandSource, OrchestratorFrame, OrchestratorRuntimeControl, OrchestratorState } from './orchestratorState.js'
import type { EntityScheduledTask, FlowMindDecisionEnvelope, FlowMindUiEffect } from './flowMindContracts.js'

export type OrchestratorCommandRequest = {
  type: 'command'
  name: 'start_birth' | 'pause_birth' | 'resume_birth' | 'set_stage' | 'apply_control' | 'trigger_export'
  commandId: string
  issuedAt: string
  source?: OrchestratorCommandSource
  payload?: {
    stageId?: string
    control?: RuntimeControl
    exportFormat?: 'current' | 'square' | 'vertical' | 'post' | 'story'
    summary?: string
  }
}

export type OrchestratorRuntimeStatePayload = {
  sessionId: string
  entityId: string
  currentStage?: string
  currentTime: number
  sessionStatus: OrchestratorState['sessionStatus']
  sequence: number
  runtimeControl: OrchestratorRuntimeControl
  lastCommand?: OrchestratorState['lastCommand']
  metadata: {
    createdAt: string
    updatedAt: string
  }
}

export type OrchestratorSessionMetadata = {
  hydratedAt: string
  source: 'snapshot' | 'initialized'
  snapshotId?: string
  restoredFromEventLog: boolean
  eventLogWindowSize: number
}

export type HydrateRuntimeResponse = {
  entityId: string
  state: OrchestratorRuntimeStatePayload
  frame: OrchestratorFrame
  session: OrchestratorSessionMetadata
  lastEvent?: EntityEventLogRecord
  pendingUiEffects: FlowMindUiEffect[]
  pendingScheduledTasks: EntityScheduledTask[]
}

export type SparkPresenceTrend = 'forming' | 'expanding' | 'stable' | 'returning' | 'cooling'

export type SparkPresenceIntensity = 'low' | 'medium' | 'high'

export type DashboardRecentSignal = {
  label: string
  eventType: string
  occurredAt: string
}

export type DashboardRecentEvent = {
  eventId: string
  eventType: string
  occurredAt: string
  commandId?: string
  summary: string
  topic?: string
  interactionType?: string
}

export type DashboardRecentUiEffect = {
  effectId: string
  kind: FlowMindUiEffect['kind']
  title: string
  createdAt: string
  body?: string
  question?: string
  href?: string
  ctaLabel?: string
  exportFormat?: Extract<FlowMindUiEffect, { kind: 'export' }>['exportFormat']
}

export type DashboardDeprecatedFallback = {
  key: string
  reason: string
  replacement: string
}

export type DashboardRelationalTraceEntry = {
  traceId: string
  eventId: string
  eventType: string
  occurredAt: string
  summary?: string
  deltas: {
    bindingStrength: number
    xp: number
    continuityConfidence: number
  }
  guardrails: Array<{
    key: string
    label: string
    tone: 'neutral' | 'warning' | 'cooling'
  }>
}

export type DashboardFlowMindDeniedReasonCount = {
  reason: string
  count: number
}

export type DashboardFlowMindDeniedByCommand = {
  command: 'start_birth' | 'pause_birth' | 'resume_birth' | 'set_stage' | 'apply_control' | 'trigger_export' | 'register_interaction' | 'register_return_visit' | 'register_share'
  deniedCount: number
  grantedCount: number
  topDeniedReason?: string
}

export type DashboardFlowMindDeniedByZone = {
  zone: 'safe' | 'prohibited' | 'future'
  deniedCount: number
}

export type DashboardFlowMindAuthorityPatternEntry = {
  observedAt: string
  command: 'start_birth' | 'pause_birth' | 'resume_birth' | 'set_stage' | 'apply_control' | 'trigger_export' | 'register_interaction' | 'register_return_visit' | 'register_share'
  zone: 'safe' | 'prohibited' | 'future'
  outcome: 'granted' | 'denied'
  deniedReason?: string
}

export type DashboardFlowMindAuthorityAggregation = {
  sampleSize: number
  grantedCount: number
  deniedCount: number
  deniedReasonCounts: DashboardFlowMindDeniedReasonCount[]
  deniedByCommand: DashboardFlowMindDeniedByCommand[]
  deniedByZone: DashboardFlowMindDeniedByZone[]
  divergenceBySemanticDrift: number
  divergenceByActionDrift: number
  divergenceByConfidenceMargin: number
  recentPattern: DashboardFlowMindAuthorityPatternEntry[]
}

export type DashboardFlowMindRolloutReadinessState = 'not-ready' | 'forming' | 'ready'

export type DashboardFlowMindRolloutReadiness = {
  rolloutReadinessScore: number
  readinessState: DashboardFlowMindRolloutReadinessState
  summary: string
  sampleSize: number
  minSampleSize: number
  divergenceBySemanticDrift: number
  divergenceByActionDrift: number
  divergenceByConfidenceMargin: number
  confidenceMarginDominant: boolean
  oscillationLevel: 'low' | 'medium' | 'high'
}

export type DashboardFlowMindComparisonWindowLabel =
  | 'sem janela active'
  | 'histórico antigo apenas'
  | 'janela pós-safe-mapping inicial'
  | 'janela pós-safe-mapping suficiente'
  | 'histórico misto com janela pós-safe-mapping inicial'
  | 'histórico misto com janela pós-safe-mapping suficiente'

export type DashboardPublicFlowMindShadowInconsistencyCount = {
  key: string
  count: number
}

export type DashboardPublicFlowMindShadowPatternEntry = {
  observedAt: string
  divergenceScore: number
  responseTextSimilarity: number
  outcome: 'aligned' | 'watch' | 'diverged'
  topInconsistency?: string
}

export type DashboardPublicFlowMindShadowTrend = 'forming' | 'improving' | 'stable' | 'drifting'

export type DashboardPublicFlowMindShadowAggregation = {
  sampleSize: number
  averageDivergenceScore: number
  averageResponseTextSimilarity: number
  averageFrontendLatencyMs: number
  averageBackendLatencyMs: number
  averageLatencyDeltaMs: number
  fallbackRate: number
  intentChangedCount: number
  actionChangedCount: number
  authorityChangedCount: number
  responseTextChangedCount: number
  topSemanticInconsistencies: DashboardPublicFlowMindShadowInconsistencyCount[]
  recentPattern: DashboardPublicFlowMindShadowPatternEntry[]
  recentTrend: DashboardPublicFlowMindShadowTrend
}

export type DashboardPublicFlowMindShadowReadinessState = 'not-ready' | 'forming' | 'ready'

export type DashboardPublicFlowMindShadowReadiness = {
  publicShadowReadinessScore: number
  publicShadowReadinessState: DashboardPublicFlowMindShadowReadinessState
  summary: string
  sampleSize: number
  minSampleSize: number
  maxAverageDivergenceScore: number
  minAverageResponseTextSimilarity: number
  maxAverageBackendLatencyMs: number
  maxAverageLatencyDeltaMs: number
  maxIntentChangedRate: number
  maxActionChangedRate: number
  maxFallbackRate: number
  averageDivergenceScore: number
  averageResponseTextSimilarity: number
  averageBackendLatencyMs: number
  averageLatencyDeltaMs: number
  intentChangedRate: number
  actionChangedRate: number
  fallbackRate: number
  recentTrend: DashboardPublicFlowMindShadowTrend
}

export type DashboardPublicFlowMindPartialTrend = 'forming' | 'improving' | 'stable' | 'degrading' | 'disabled'

export type DashboardPublicFlowMindPartialAutomationMode = 'recommendation-only' | 'auto-apply'

export type DashboardPublicFlowMindPartialRecommendationAction = 'increase' | 'maintain' | 'reduce' | 'rollback'

export type DashboardPublicFlowMindPartialRecommendationStatus = 'recommended' | 'blocked' | 'applied'

export type DashboardPublicFlowMindPartialAlertSeverity = 'warning' | 'critical'

export type DashboardPublicFlowMindPartialOperationalRisk = 'normal' | 'warning' | 'critical'

export type DashboardPublicFlowMindPartialIncidentState = 'normal' | 'watch' | 'degraded' | 'critical' | 'stale' | 'absent'

export type DashboardPublicFlowMindPartialRecommendedAction =
  | 'reduce-rollout'
  | 'rollback-now'
  | 'keep-shadow-only'
  | 'inspect-divergence'
  | 'inspect-latency'

export type DashboardPublicFlowMindPartialAlertCode =
  | 'fallback-rate-high'
  | 'divergence-rising'
  | 'critical-inconsistency-growing'
  | 'latency-over-budget'
  | 'degradation-trend'

export type DashboardPublicFlowMindPartialPatternEntry = {
  observedAt: string
  engineUsed: 'frontend' | 'flowmind'
  fallbackOccurred: boolean
  fallbackReason?: string
  chosenLatencyMs: number
  divergenceScore?: number
  outcome: 'healthy' | 'watch' | 'unstable' | 'disabled'
}

export type DashboardPublicFlowMindPartialFallbackReasonCount = {
  reason: string
  count: number
}

export type DashboardPublicFlowMindPartialLatencyBucket = {
  bucket: '<=150ms' | '151-300ms' | '301-600ms' | '601-900ms' | '>900ms'
  count: number
}

export type DashboardPublicFlowMindPartialShadowComparison = {
  shadowSampleSize: number
  shadowAverageDivergenceScore: number
  partialAverageDivergenceScore?: number
  shadowFallbackRate: number
  partialFallbackRate: number
  divergenceDelta?: number
  fallbackRateDelta: number
}

export type DashboardPublicFlowMindPartialPolicyRecommendation = {
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  action: DashboardPublicFlowMindPartialRecommendationAction
  status: DashboardPublicFlowMindPartialRecommendationStatus
  currentRolloutPercentage: number
  targetRolloutPercentage: number
  stepPercentage: number
  sampleSize: number
  minSampleSize: number
  evaluatedAt: string
  windowStartAt?: string
  windowEndAt?: string
  minimumWindowMinutes: number
  cooldownUntil?: string
  cooldownRemainingMinutes?: number
  summary: string
  reasons: string[]
  blockedReason?: string
  hysteresisActive: boolean
  rollbackArmed: boolean
}

export type DashboardPublicFlowMindPartialAdjustmentAudit = {
  action: 'increase' | 'reduce' | 'rollback' | 'manual-update'
  source: 'manual' | 'policy-auto-apply'
  fromRolloutPercentage: number
  toRolloutPercentage: number
  reason: string
  changedAt: string
}

export type DashboardPublicFlowMindPartialAlert = {
  severity: DashboardPublicFlowMindPartialAlertSeverity
  code: DashboardPublicFlowMindPartialAlertCode
  title: string
  summary: string
  recommendedAction: DashboardPublicFlowMindPartialRecommendedAction
}

export type DashboardPublicFlowMindPartialAutomationGuard = {
  autoApplyAllowed: boolean
  requiresConfirmation: boolean
  blockedReason?: 'readiness-not-ready' | 'insufficient-sample-size'
  guidance: string
}

export type DashboardPublicFlowMindPartialAggregation = {
  totalInteractions: number
  flowMindUsedCount: number
  frontendUsedCount: number
  fallbackCount: number
  fallbackRate: number
  avgLatencyFlowMind?: number
  avgLatencyFrontend?: number
  latencyDelta?: number
  avgDivergenceScore?: number
  inconsistencyRate: number
  criticalInconsistencyCount: number
  flowMindUsageRate: number
  rolloutPercentage: number
  killSwitchEnabled: boolean
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  readinessState: DashboardPublicFlowMindShadowReadinessState
  readinessScore?: number
  policyEnabled: boolean
  recentTrend: DashboardPublicFlowMindPartialTrend
  recentPattern: DashboardPublicFlowMindPartialPatternEntry[]
  fallbackReasonCounts: DashboardPublicFlowMindPartialFallbackReasonCount[]
  latencyDistribution: DashboardPublicFlowMindPartialLatencyBucket[]
  shadowComparison?: DashboardPublicFlowMindPartialShadowComparison
  alerts: DashboardPublicFlowMindPartialAlert[]
  operationalRisk: DashboardPublicFlowMindPartialOperationalRisk
  incidentState: DashboardPublicFlowMindPartialIncidentState
  incidentEnteredAt?: string
  incidentUpdatedAt?: string
  degradationSummary: string
  automationGuard: DashboardPublicFlowMindPartialAutomationGuard
  policyRecommendation: DashboardPublicFlowMindPartialPolicyRecommendation
  lastAdjustment?: DashboardPublicFlowMindPartialAdjustmentAudit
}

export type DashboardPublicFlowMindPartialPortfolioEntry = {
  entityId: string
  entityName?: string
  sampleSize: number
  rolloutPercentage: number
  readinessState: DashboardPublicFlowMindShadowReadinessState
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  operationalRisk: DashboardPublicFlowMindPartialOperationalRisk
  incidentState: DashboardPublicFlowMindPartialIncidentState
  incidentUpdatedAt?: string
  recentTrend: DashboardPublicFlowMindPartialTrend
  fallbackRate: number
  avgDivergenceScore?: number
  avgLatencyFlowMind?: number
  inconsistencyRate: number
  criticalInconsistencyCount: number
  flowMindUsageRate: number
  performanceScore: number
  riskScore: number
}

export type DashboardPublicFlowMindPartialPortfolioFilters = {
  operationalRisk?: DashboardPublicFlowMindPartialOperationalRisk | 'all'
  readinessState?: DashboardPublicFlowMindShadowReadinessState | 'all'
  automationMode?: DashboardPublicFlowMindPartialAutomationMode | 'all'
  trend?: DashboardPublicFlowMindPartialTrend | 'all'
  minSampleSize?: number
}

export type DashboardPublicFlowMindPartialPortfolio = {
  generatedAt: string
  filters: DashboardPublicFlowMindPartialPortfolioFilters
  totalEntities: number
  entitiesWithPartial: number
  orderedEntities: DashboardPublicFlowMindPartialPortfolioEntry[]
  topPerformers: DashboardPublicFlowMindPartialPortfolioEntry[]
  highestRisk: DashboardPublicFlowMindPartialPortfolioEntry[]
  highestFallbackRate: DashboardPublicFlowMindPartialPortfolioEntry[]
  highestDivergence: DashboardPublicFlowMindPartialPortfolioEntry[]
}

export type PublicFlowMindPartialAlertWebhookOperations = {
  enabled: boolean
  url: string
  timeoutMs: number
  retryCount: number
}

export type PublicFlowMindPartialOperations = {
  entityId: string
  rolloutPercentage: number
  killSwitchEnabled: boolean
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  latencyBudgetMs: number
  criticalDivergenceThreshold: number
  alertWebhook: PublicFlowMindPartialAlertWebhookOperations
}

export type DashboardFlowMindMetricsEndpoint = 'all' | 'public-shadow' | 'public-partial'

export type DashboardFlowMindMetricsPeriod = '24h' | '7d' | '30d' | 'all'

export type DashboardFlowMindMetricsFilters = {
  endpoint: DashboardFlowMindMetricsEndpoint
  period: DashboardFlowMindMetricsPeriod
}

export type DashboardFlowMindMetricsEndpointCount = {
  endpoint: Exclude<DashboardFlowMindMetricsEndpoint, 'all'>
  count: number
}

export type DashboardFlowMindMetricsErrorCount = {
  type: string
  count: number
}

export type DashboardFlowMindMetricsLatency = {
  p50Ms?: number
  p95Ms?: number
}

export type DashboardFlowMindMetricsDecisionView = {
  sampleSize: number
  backendSuccessRate: number
  degradedModeRate: number
  adaptiveCoreRate: number
  heuristicFallbackRate: number
  lowRiskLaneUsageRate: number
  latency: DashboardFlowMindMetricsLatency
}

export type DashboardFlowMindMetrics = {
  entityId: string
  entityName?: string
  filters: DashboardFlowMindMetricsFilters & {
    windowStartAt?: string
    windowEndAt: string
  }
  sampleSize: number
  decisionServed: DashboardFlowMindMetricsDecisionView
  decisionEvaluated: DashboardFlowMindMetricsDecisionView
  errorTypeCounts: DashboardFlowMindMetricsErrorCount[]
  endpointCounts: DashboardFlowMindMetricsEndpointCount[]
}

export type RelationalTraceDetailedGuardrail = {
  key: string
  label: string
  tone: 'neutral' | 'warning' | 'cooling'
}

export type RelationalTraceItemDetailed = {
  traceId: string
  eventId: string
  eventType: string
  occurredAt: string
  context?: {
    interactionType?: string
    topic?: string
    intent?: string
    actorId?: string
  }
  deltas: {
    binding?: number
    xp?: number
    continuity?: number
    returnCount?: number
    shareCount?: number
  }
  beforeAfter?: {
    binding?: [number, number]
    xp?: [number, number]
    continuity?: [number, number]
  }
  guardrails?: {
    capApplied?: boolean
    decayApplied?: boolean
    spamMitigated?: boolean
    coalescingApplied?: boolean
    items: RelationalTraceDetailedGuardrail[]
  }
  lineage?: {
    commandId?: string
    decisionTraceId?: string
    actionType?: string
  }
  summary?: string
  interpretiveExplanation?: string
}

export type RelationalTraceDetailedResponse = {
  entityId: string
  items: RelationalTraceItemDetailed[]
  deprecatedFallbacks: DashboardDeprecatedFallback[]
}

export type DashboardSparkStateResponse = {
  entityId: string
  entityName?: string
  runtime: HydrateRuntimeResponse
  sovereignFlowMind?: FlowMindServiceSummary
  flowMindComparison?: FlowMindDecisionComparison
  flowMindAuthority?: FlowMindAuthorityObservation
  flowMindAuthorityAggregation?: DashboardFlowMindAuthorityAggregation
  publicShadowAggregation?: DashboardPublicFlowMindShadowAggregation
  publicShadowRecentPattern?: DashboardPublicFlowMindShadowPatternEntry[]
  publicShadowSampleSize?: number
  publicShadowReadiness?: DashboardPublicFlowMindShadowReadiness
  publicPartialAggregation?: DashboardPublicFlowMindPartialAggregation
  publicPartialPortfolio?: DashboardPublicFlowMindPartialPortfolio
  flowMindMetrics?: DashboardFlowMindMetrics
  preSafeMappingSampleSize?: number
  postSafeMappingSampleSize?: number
  postSafeMappingAggregation?: DashboardFlowMindAuthorityAggregation
  postSafeMappingReadiness?: DashboardFlowMindRolloutReadiness
  comparisonWindowLabel?: DashboardFlowMindComparisonWindowLabel
  liveState: {
    stage?: string
    sessionStatus: OrchestratorState['sessionStatus']
    sequence: number
    lastCommand?: {
      commandId: string
      type: string
      issuedAt: string
      source: OrchestratorCommandSource
    }
    lastEvent?: {
      eventId: string
      eventType: string
      occurredAt: string
    }
    updatedAt: string
  }
  relationalState?: OrchestratorFrame['relationalProjection']
  presenceHealth: {
    trend: SparkPresenceTrend
    intensity: SparkPresenceIntensity
    summary: string
    recentSignals: DashboardRecentSignal[]
  }
  recentActivity: {
    events: DashboardRecentEvent[]
    uiEffects: DashboardRecentUiEffect[]
    lastCommandId?: string
  }
  relationalTrace: DashboardRelationalTraceEntry[]
  deprecatedFallbacks: DashboardDeprecatedFallback[]
}

export type CommandResponse = HydrateRuntimeResponse & {
  command: OrchestratorCommandRequest
  flowMind?: FlowMindDecisionEnvelope
  sovereignFlowMind?: FlowMindServiceSummary
  flowMindComparison?: FlowMindDecisionComparison
  flowMindAuthority?: FlowMindAuthorityObservation
  lineage?: {
    rootCommandId: string
    reentryBlocked: boolean
    followUps: Array<{
      commandId: string
      name: string
      classification: 'domain-command'
      appliedEventIds?: string[]
    }>
  }
}

export function createRuntimeStatePayload(state: OrchestratorState, runtimeControl: OrchestratorRuntimeControl): OrchestratorRuntimeStatePayload {
  const sessionId = state.sessionId ?? `orchestrator-session-pending-${state.entityId}`
  return {
    sessionId,
    entityId: state.entityId,
    currentStage: state.currentStage,
    currentTime: Math.max(0, Date.parse(state.metadata.updatedAt) - Date.parse(state.metadata.createdAt)),
    sessionStatus: state.sessionStatus,
    sequence: state.sequence,
    runtimeControl,
    metadata: {
      createdAt: state.metadata.createdAt,
      updatedAt: state.metadata.updatedAt,
    },
    lastCommand: state.lastCommand,
  }
}

export function withAuthoritativeFrame(frame: OrchestratorFrame): OrchestratorFrame {
  return {
    ...frame,
    authority: 'orchestrator',
  }
}
