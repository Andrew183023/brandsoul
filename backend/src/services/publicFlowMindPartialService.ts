import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type {
  DashboardPublicFlowMindPartialAggregation,
  DashboardPublicFlowMindPartialAdjustmentAudit,
  DashboardPublicFlowMindPartialAlert,
  DashboardPublicFlowMindPartialAlertSeverity,
  DashboardPublicFlowMindPartialAutomationMode,
  DashboardPublicFlowMindPartialAutomationGuard,
  DashboardPublicFlowMindPartialIncidentState,
  DashboardPublicFlowMindPartialLatencyBucket,
  DashboardPublicFlowMindPartialOperationalRisk,
  DashboardPublicFlowMindPartialPatternEntry,
  DashboardPublicFlowMindPartialPolicyRecommendation,
  DashboardPublicFlowMindPartialRecommendedAction,
  DashboardPublicFlowMindShadowAggregation,
} from '../orchestrator/contracts.js'
import type { DashboardPublicFlowMindShadowReadiness } from '../orchestrator/contracts.js'
import {
  buildPublicFlowMindDecisionComparison,
  clampPublicFlowMindMetric,
  isPublicFlowMindShadowBackendDecisionCandidate,
  isPublicFlowMindShadowFrontendDecisionCandidate,
  roundPublicFlowMindMetric,
  type PublicFlowMindShadowBackendDecision,
  type PublicFlowMindShadowFrontendDecision,
} from './publicFlowMindShadowService.js'

export const PUBLIC_FLOWMIND_PARTIAL_NOTE_PREFIX = 'flowmind-public-partial:'
export const PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_NOTE_PREFIX = 'flowmind-public-partial-sampled:'

const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_LATENCY_BUDGET_MS = 900
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_CRITICAL_DIVERGENCE_THRESHOLD = 0.34
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_INCIDENT_STALE_TTL_MS = 15 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_MISSING_TELEMETRY_GRACE_MS = 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_TTL_MS = 5 * 60 * 1000
export const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_TIMEOUT_MS = 3_000
export const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_RETRY_COUNT = 2

export type PublicFlowMindPartialEngine = 'frontend' | 'flowmind'

export type PublicFlowMindPartialFallbackReason =
  | 'backend-unavailable'
  | 'backend-disabled'
  | 'backend-latency-too-high'
  | 'critical-inconsistency'
  | 'flowmind-reported-fallback'

export type PublicFlowMindPartialConfig = {
  readinessState: DashboardPublicFlowMindShadowReadiness['publicShadowReadinessState']
  readinessScore?: number
  rolloutPercentage: number
  latencyBudgetMs: number
  criticalDivergenceThreshold: number
  killSwitchEnabled: boolean
  automationMode?: DashboardPublicFlowMindPartialAutomationMode
  enabled: boolean
  activationReason: string
}

export type PublicFlowMindPartialTelemetrySnapshot = {
  version: 1
  requestId: string
  decidedAt: string
  rolloutBucket: number
  engineUsed: PublicFlowMindPartialEngine
  fallbackOccurred: boolean
  fallbackReason?: PublicFlowMindPartialFallbackReason
  policy: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
  comparison?: ReturnType<typeof buildPublicFlowMindDecisionComparison>
  metrics: {
    frontendLatencyMs: number
    backendLatencyMs?: number
    chosenLatencyMs: number
    divergenceScore?: number
  }
}

export type PublicFlowMindPartialResolution = {
  responseText: string
  engineUsed: PublicFlowMindPartialEngine
  fallbackOccurred: boolean
  fallbackReason?: PublicFlowMindPartialFallbackReason
  comparison?: ReturnType<typeof buildPublicFlowMindDecisionComparison>
}

export type PublicFlowMindPartialTelemetryInput = {
  version: 1
  requestId: string
  decidedAt: string
  policy: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
}

export type PublicFlowMindPartialSampledRequestState = 'pending' | 'consolidated' | 'reconciled' | 'expired' | 'missing_telemetry'

export type PublicFlowMindPartialSampledRequestRecord = {
  version: 1
  requestKey: string
  requestId: string
  rolloutBucket: number
  sampledAt: string
  expiresAt: string
  state: PublicFlowMindPartialSampledRequestState
  policy: PublicFlowMindPartialConfig
  lastObservedAt: string
  consolidatedAt?: string
  reconciledAt?: string
  expiredAt?: string
  telemetryDecidedAt?: string
}

export type PublicFlowMindPartialTelemetryReconciliation = {
  entityProfile: EntityProfile
  status: 'consolidated' | 'reconciled'
  duplicateTelemetry: boolean
}

export type PublicFlowMindPartialControlUpdate = {
  rolloutPercentage: number
  killSwitchEnabled: boolean
  automationMode?: DashboardPublicFlowMindPartialAutomationMode
}

export type PublicFlowMindPartialAlertWebhookSettings = {
  enabled: boolean
  url: string
  timeoutMs: number
  retryCount: number
}

export type PublicFlowMindPartialOperationalSettings = {
  rolloutPercentage: number
  killSwitchEnabled: boolean
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  latencyBudgetMs: number
  criticalDivergenceThreshold: number
  alertWebhook: PublicFlowMindPartialAlertWebhookSettings
}

export type PublicFlowMindPartialOperationalSettingsUpdate = {
  rolloutPercentage?: unknown
  killSwitchEnabled?: unknown
  automationMode?: unknown
  latencyBudgetMs?: unknown
  criticalDivergenceThreshold?: unknown
  alertWebhook?: {
    enabled?: unknown
    url?: unknown
    timeoutMs?: unknown
    retryCount?: unknown
  }
}

export type PublicFlowMindPartialPolicyRecommendation = DashboardPublicFlowMindPartialPolicyRecommendation

export type PublicFlowMindPartialAdjustmentAudit = DashboardPublicFlowMindPartialAdjustmentAudit

type PublicFlowMindPartialAggregationBase = Omit<
  DashboardPublicFlowMindPartialAggregation,
  'alerts' | 'operationalRisk' | 'degradationSummary' | 'automationGuard' | 'policyRecommendation' | 'lastAdjustment'
>

const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_AUTOMATION_MODE: DashboardPublicFlowMindPartialAutomationMode = 'recommendation-only'
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_LOOKBACK_MS = 6 * 60 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS = 90 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_WINDOW_MS = 45 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_COOLDOWN_MS = 6 * 60 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_STEP_PERCENTAGE = 5
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_STEP_PERCENTAGE = 10
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MAX_AUTOMATED_ROLLOUT_PERCENTAGE = 40
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE = 6
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_MIN_SAMPLE_SIZE = 4
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_MIN_SAMPLE_SIZE = 2
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_HYSTERESIS_RECOVERY_MS = 8 * 60 * 60 * 1000
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_FALLBACK_RATE = 0.12
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_FALLBACK_RATE = 0.18
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_DIVERGENCE = 0.18
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_DIVERGENCE = 0.24
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_DIVERGENCE_DELTA = 0.05
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_DIVERGENCE_DELTA = 0.1
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_FALLBACK_RATE = 0.3
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_DIVERGENCE = 0.28
const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_DIVERGENCE_DELTA = 0.1

function parseTimeMs(value?: string) {
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildPublicFlowMindPartialSampledRequestKey(requestId: string) {
  return `partial-sampled:${requestId}`
}

function buildFutureTimestamp(base: string, deltaMs: number) {
  const baseMs = parseTimeMs(base) ?? Date.now()
  return new Date(baseMs + deltaMs).toISOString()
}

function isPublicFlowMindPartialSampledRequestRecordCandidate(value: unknown): value is PublicFlowMindPartialSampledRequestRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const policy = record.policy as Record<string, unknown> | undefined

  return record.version === 1
    && typeof record.requestKey === 'string'
    && typeof record.requestId === 'string'
    && typeof record.rolloutBucket === 'number'
    && typeof record.sampledAt === 'string'
    && typeof record.expiresAt === 'string'
    && (record.state === 'pending'
      || record.state === 'consolidated'
      || record.state === 'reconciled'
      || record.state === 'expired'
      || record.state === 'missing_telemetry')
    && !!policy
    && typeof policy.readinessState === 'string'
    && typeof policy.rolloutPercentage === 'number'
    && typeof policy.latencyBudgetMs === 'number'
    && typeof policy.criticalDivergenceThreshold === 'number'
    && typeof policy.killSwitchEnabled === 'boolean'
    && typeof policy.enabled === 'boolean'
    && typeof policy.activationReason === 'string'
    && typeof record.lastObservedAt === 'string'
    && (record.consolidatedAt === undefined || typeof record.consolidatedAt === 'string')
    && (record.reconciledAt === undefined || typeof record.reconciledAt === 'string')
    && (record.expiredAt === undefined || typeof record.expiredAt === 'string')
    && (record.telemetryDecidedAt === undefined || typeof record.telemetryDecidedAt === 'string')
}

export function buildPublicFlowMindPartialSampledRequestRecord(args: {
  requestId: string
  policy: PublicFlowMindPartialConfig
  sampledAt?: string
}): PublicFlowMindPartialSampledRequestRecord {
  const sampledAt = args.sampledAt ?? new Date().toISOString()

  return {
    version: 1,
    requestKey: buildPublicFlowMindPartialSampledRequestKey(args.requestId),
    requestId: args.requestId,
    rolloutBucket: computePublicFlowMindPartialRolloutBucket(args.requestId),
    sampledAt,
    expiresAt: buildFutureTimestamp(sampledAt, DEFAULT_PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_TTL_MS),
    state: 'pending',
    policy: args.policy,
    lastObservedAt: sampledAt,
  }
}

export function resolvePublicFlowMindPartialDecision(args: {
  config: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
}): PublicFlowMindPartialResolution {
  if (!args.backendDecision) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-unavailable',
    }
  }

  const comparison = buildPublicFlowMindDecisionComparison({
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
  })
  const criticalInconsistency = comparison.intentChanged
    || comparison.actionChanged
    || comparison.authorityChanged
    || comparison.divergenceScore >= args.config.criticalDivergenceThreshold

  if (args.backendDecision.fallbackUsed) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'flowmind-reported-fallback',
      comparison,
    }
  }

  if (args.backendDecision.latencyMs > args.config.latencyBudgetMs) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-latency-too-high',
      comparison,
    }
  }

  if (criticalInconsistency) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'critical-inconsistency',
      comparison,
    }
  }

  return {
    responseText: args.backendDecision.responseText,
    engineUsed: 'flowmind',
    fallbackOccurred: false,
    comparison,
  }
}

function resolveAutomationMode(entityProfile?: EntityProfile): DashboardPublicFlowMindPartialAutomationMode {
  return entityProfile?.runtime?.flowMind?.publicPartial?.automationMode === 'auto-apply'
    ? 'auto-apply'
    : DEFAULT_PUBLIC_FLOWMIND_PARTIAL_AUTOMATION_MODE
}

function resolveStoredPolicyState(entityProfile?: EntityProfile) {
  return entityProfile?.runtime?.flowMind?.publicPartial?.autoRolloutPolicy
}

function resolveStoredLastAdjustment(entityProfile?: EntityProfile): PublicFlowMindPartialAdjustmentAudit | undefined {
  const adjustment = resolveStoredPolicyState(entityProfile)?.lastAdjustment
  if (!adjustment) {
    return undefined
  }

  return {
    action: adjustment.action,
    source: adjustment.source,
    fromRolloutPercentage: adjustment.fromRolloutPercentage,
    toRolloutPercentage: adjustment.toRolloutPercentage,
    reason: adjustment.reason,
    changedAt: adjustment.changedAt,
  }
}

function summarizeRecommendationAction(action: PublicFlowMindPartialPolicyRecommendation['action']) {
  if (action === 'increase') return 'Aumentar rollout gradualmente.'
  if (action === 'reduce') return 'Reduzir rollout para conter risco.'
  if (action === 'rollback') return 'Executar rollback conservador do partial.'
  return 'Manter rollout atual.'
}

function buildBlockedRecommendation(args: {
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  currentRolloutPercentage: number
  sampleSize: number
  minSampleSize: number
  evaluatedAt: string
  minimumWindowMinutes: number
  summary: string
  reasons: string[]
  blockedReason: string
  windowStartAt?: string
  windowEndAt?: string
  cooldownUntil?: string
  cooldownRemainingMinutes?: number
  rollbackArmed?: boolean
}): PublicFlowMindPartialPolicyRecommendation {
  return {
    automationMode: args.automationMode,
    action: 'maintain',
    status: 'blocked',
    currentRolloutPercentage: args.currentRolloutPercentage,
    targetRolloutPercentage: args.currentRolloutPercentage,
    stepPercentage: 0,
    sampleSize: args.sampleSize,
    minSampleSize: args.minSampleSize,
    evaluatedAt: args.evaluatedAt,
    windowStartAt: args.windowStartAt,
    windowEndAt: args.windowEndAt,
    minimumWindowMinutes: args.minimumWindowMinutes,
    cooldownUntil: args.cooldownUntil,
    cooldownRemainingMinutes: args.cooldownRemainingMinutes,
    summary: args.summary,
    reasons: args.reasons,
    blockedReason: args.blockedReason,
    hysteresisActive: true,
    rollbackArmed: args.rollbackArmed === true,
  }
}

function buildPolicyRecommendation(args: {
  automationMode: DashboardPublicFlowMindPartialAutomationMode
  action: PublicFlowMindPartialPolicyRecommendation['action']
  status: PublicFlowMindPartialPolicyRecommendation['status']
  currentRolloutPercentage: number
  targetRolloutPercentage: number
  sampleSize: number
  minSampleSize: number
  evaluatedAt: string
  minimumWindowMinutes: number
  reasons: string[]
  blockedReason?: string
  windowStartAt?: string
  windowEndAt?: string
  cooldownUntil?: string
  cooldownRemainingMinutes?: number
  rollbackArmed?: boolean
}): PublicFlowMindPartialPolicyRecommendation {
  return {
    automationMode: args.automationMode,
    action: args.action,
    status: args.status,
    currentRolloutPercentage: args.currentRolloutPercentage,
    targetRolloutPercentage: args.targetRolloutPercentage,
    stepPercentage: Math.abs(args.targetRolloutPercentage - args.currentRolloutPercentage),
    sampleSize: args.sampleSize,
    minSampleSize: args.minSampleSize,
    evaluatedAt: args.evaluatedAt,
    windowStartAt: args.windowStartAt,
    windowEndAt: args.windowEndAt,
    minimumWindowMinutes: args.minimumWindowMinutes,
    cooldownUntil: args.cooldownUntil,
    cooldownRemainingMinutes: args.cooldownRemainingMinutes,
    summary: summarizeRecommendationAction(args.action),
    reasons: args.reasons,
    blockedReason: args.blockedReason,
    hysteresisActive: true,
    rollbackArmed: args.rollbackArmed === true,
  }
}

function resolvePolicyWindowSnapshots(snapshots: PublicFlowMindPartialTelemetrySnapshot[], now: string) {
  const nowMs = parseTimeMs(now) ?? Date.now()
  return snapshots.filter((snapshot) => {
    const decidedAtMs = parseTimeMs(snapshot.decidedAt)
    return typeof decidedAtMs === 'number' && nowMs - decidedAtMs <= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_LOOKBACK_MS
  })
}

function resolveWindowSpanMs(snapshots: PublicFlowMindPartialTelemetrySnapshot[]) {
  const newest = parseTimeMs(snapshots[0]?.decidedAt)
  const oldest = parseTimeMs(snapshots[snapshots.length - 1]?.decidedAt)
  if (typeof newest !== 'number' || typeof oldest !== 'number') {
    return 0
  }

  return Math.max(0, newest - oldest)
}

function resolveWindowEdges(snapshots: PublicFlowMindPartialTelemetrySnapshot[]) {
  return {
    windowStartAt: snapshots[snapshots.length - 1]?.decidedAt,
    windowEndAt: snapshots[0]?.decidedAt,
  }
}

function resolvePartialTelemetryNow(now?: string) {
  return now ?? new Date().toISOString()
}

function isPublicFlowMindPartialSnapshotStale(args: {
  snapshot?: PublicFlowMindPartialTelemetrySnapshot
  now: string
}) {
  const snapshotMs = parseTimeMs(args.snapshot?.decidedAt)
  const nowMs = parseTimeMs(args.now) ?? Date.now()

  return typeof snapshotMs !== 'number' || nowMs - snapshotMs > DEFAULT_PUBLIC_FLOWMIND_PARTIAL_INCIDENT_STALE_TTL_MS
}

function resolveStoredIncidentState(entityProfile?: EntityProfile) {
  return entityProfile?.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState
}

function resolveIncidentTimeline(args: {
  entityProfile?: EntityProfile
  incidentState: DashboardPublicFlowMindPartialIncidentState
  observedAt: string
}) {
  const stored = resolveStoredIncidentState(args.entityProfile)
  if (stored?.state === args.incidentState) {
    return {
      incidentEnteredAt: stored.enteredAt,
      incidentUpdatedAt: args.observedAt,
    }
  }

  return {
    incidentEnteredAt: args.observedAt,
    incidentUpdatedAt: args.observedAt,
  }
}

function resolveRecentRolloutDropState(args: {
  entityProfile: EntityProfile
  now: string
}) {
  const lastAdjustment = resolveStoredLastAdjustment(args.entityProfile)
  const changedAtMs = parseTimeMs(lastAdjustment?.changedAt)
  const nowMs = parseTimeMs(args.now) ?? Date.now()
  const dropDetected = typeof changedAtMs === 'number'
    && changedAtMs <= nowMs
    && (
      lastAdjustment?.action === 'rollback'
      || (
        typeof lastAdjustment?.fromRolloutPercentage === 'number'
        && typeof lastAdjustment?.toRolloutPercentage === 'number'
        && lastAdjustment.toRolloutPercentage < lastAdjustment.fromRolloutPercentage
      )
    )

  if (!dropDetected || typeof changedAtMs !== 'number') {
    return {
      active: false,
      remainingMinutes: undefined,
      adjustment: lastAdjustment,
    }
  }

  const recoveryUntilMs = changedAtMs + DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_HYSTERESIS_RECOVERY_MS
  if (recoveryUntilMs <= nowMs) {
    return {
      active: false,
      remainingMinutes: undefined,
      adjustment: lastAdjustment,
    }
  }

  return {
    active: true,
    remainingMinutes: Math.ceil((recoveryUntilMs - nowMs) / 60_000),
    adjustment: lastAdjustment,
  }
}

function buildOperationalAlert(args: {
  severity: DashboardPublicFlowMindPartialAlertSeverity
  code: DashboardPublicFlowMindPartialAlert['code']
  title: string
  summary: string
  recommendedAction: DashboardPublicFlowMindPartialRecommendedAction
}): DashboardPublicFlowMindPartialAlert {
  return {
    severity: args.severity,
    code: args.code,
    title: args.title,
    summary: args.summary,
    recommendedAction: args.recommendedAction,
  }
}

function resolveOperationalRisk(alerts: DashboardPublicFlowMindPartialAlert[]): DashboardPublicFlowMindPartialOperationalRisk {
  if (alerts.some((alert) => alert.severity === 'critical')) {
    return 'critical'
  }

  if (alerts.length > 0) {
    return 'warning'
  }

  return 'normal'
}

function resolvePublicFlowMindPartialIncidentState(args: {
  aggregation: PublicFlowMindPartialAggregationBase
  alerts: DashboardPublicFlowMindPartialAlert[]
}): DashboardPublicFlowMindPartialIncidentState {
  const divergenceDelta = args.aggregation.shadowComparison?.divergenceDelta ?? 0

  if (
    args.alerts.some((alert) => alert.severity === 'critical')
    || args.aggregation.fallbackRate >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_FALLBACK_RATE
    || (args.aggregation.avgDivergenceScore ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_DIVERGENCE
    || divergenceDelta >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_DIVERGENCE_DELTA
    || args.aggregation.criticalInconsistencyCount >= 2
  ) {
    return 'critical'
  }

  if (
    args.alerts.some((alert) => alert.severity === 'warning')
    || args.aggregation.fallbackRate >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_FALLBACK_RATE
    || (args.aggregation.avgDivergenceScore ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_DIVERGENCE
    || divergenceDelta >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_DIVERGENCE_DELTA
    || args.aggregation.criticalInconsistencyCount >= 1
    || args.aggregation.recentTrend === 'degrading'
  ) {
    return 'degraded'
  }

  if (
    args.aggregation.fallbackRate > 0
    || (args.aggregation.avgDivergenceScore ?? 0) >= 0.08
    || divergenceDelta >= 0.02
    || args.aggregation.inconsistencyRate >= 0.05
    || args.aggregation.recentTrend === 'forming'
  ) {
    return 'watch'
  }

  return 'normal'
}

export function applyPublicFlowMindPartialIncidentState(args: {
  entityProfile: EntityProfile
  incidentState: DashboardPublicFlowMindPartialIncidentState
  observedAt: string
}) {
  const previousIncident = resolveStoredIncidentState(args.entityProfile)
  const nextIncident = previousIncident?.state === args.incidentState
    ? {
      state: args.incidentState,
      enteredAt: previousIncident.enteredAt,
      updatedAt: args.observedAt,
    }
    : {
      state: args.incidentState,
      enteredAt: args.observedAt,
      updatedAt: args.observedAt,
    }

  return {
    ...args.entityProfile,
    runtime: {
      ...args.entityProfile.runtime,
      flowMind: {
        ...args.entityProfile.runtime?.flowMind,
        publicPartial: {
          ...args.entityProfile.runtime?.flowMind?.publicPartial,
          autoRolloutPolicy: {
            ...args.entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy,
            incidentState: nextIncident,
          },
        },
      },
    },
  }
}

function buildPublicFlowMindPartialAlerts(args: {
  aggregation: PublicFlowMindPartialAggregationBase
  policy: PublicFlowMindPartialConfig
}) {
  const alerts: DashboardPublicFlowMindPartialAlert[] = []
  const divergenceDelta = args.aggregation.shadowComparison?.divergenceDelta
  const criticalLatencyThreshold = Math.max(Math.round(args.policy.latencyBudgetMs * 1.25), 750)

  if (args.aggregation.fallbackRate >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_FALLBACK_RATE) {
    alerts.push(buildOperationalAlert({
      severity: 'critical',
      code: 'fallback-rate-high',
      title: 'Fallback acima do limite seguro',
      summary: `fallbackRate em ${Math.round(args.aggregation.fallbackRate * 100)}% indica degradação operacional do partial.`,
      recommendedAction: 'rollback-now',
    }))
  } else if (args.aggregation.fallbackRate >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_FALLBACK_RATE) {
    alerts.push(buildOperationalAlert({
      severity: 'warning',
      code: 'fallback-rate-high',
      title: 'Fallback em observação',
      summary: `fallbackRate em ${Math.round(args.aggregation.fallbackRate * 100)}% sugere pressão crescente sobre o fallback.`,
      recommendedAction: 'reduce-rollout',
    }))
  }

  if (
    (args.aggregation.avgDivergenceScore ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_DIVERGENCE
    || (divergenceDelta ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_CRITICAL_DIVERGENCE_DELTA
  ) {
    alerts.push(buildOperationalAlert({
      severity: 'critical',
      code: 'divergence-rising',
      title: 'Divergência em alta crítica',
      summary: `divergência média ${Math.round((args.aggregation.avgDivergenceScore ?? 0) * 100)}% com delta ${typeof divergenceDelta === 'number' ? `${Math.round(divergenceDelta * 100)}% vs shadow` : 'sem delta comparável'}.`,
      recommendedAction: 'rollback-now',
    }))
  } else if (
    (args.aggregation.avgDivergenceScore ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_DIVERGENCE
    || (divergenceDelta ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WARNING_DIVERGENCE_DELTA
  ) {
    alerts.push(buildOperationalAlert({
      severity: 'warning',
      code: 'divergence-rising',
      title: 'Divergência em observação',
      summary: `divergência média ${Math.round((args.aggregation.avgDivergenceScore ?? 0) * 100)}% mostra afastamento do shadow público.`,
      recommendedAction: 'inspect-divergence',
    }))
  }

  if (args.aggregation.criticalInconsistencyCount >= 2) {
    alerts.push(buildOperationalAlert({
      severity: 'critical',
      code: 'critical-inconsistency-growing',
      title: 'Inconsistência crítica crescente',
      summary: `${args.aggregation.criticalInconsistencyCount} ocorrências críticas recentes exigem contenção imediata.`,
      recommendedAction: 'keep-shadow-only',
    }))
  } else if (args.aggregation.criticalInconsistencyCount >= 1) {
    alerts.push(buildOperationalAlert({
      severity: 'warning',
      code: 'critical-inconsistency-growing',
      title: 'Inconsistência crítica em observação',
      summary: `${args.aggregation.criticalInconsistencyCount} ocorrência crítica recente já justifica supervisão manual mais próxima.`,
      recommendedAction: 'keep-shadow-only',
    }))
  }

  if ((args.aggregation.avgLatencyFlowMind ?? 0) >= criticalLatencyThreshold) {
    alerts.push(buildOperationalAlert({
      severity: 'critical',
      code: 'latency-over-budget',
      title: 'Latência fora do budget crítico',
      summary: `latência média FlowMind em ${args.aggregation.avgLatencyFlowMind} ms supera o budget operacional de ${args.policy.latencyBudgetMs} ms.`,
      recommendedAction: 'keep-shadow-only',
    }))
  } else if ((args.aggregation.avgLatencyFlowMind ?? 0) > args.policy.latencyBudgetMs) {
    alerts.push(buildOperationalAlert({
      severity: 'warning',
      code: 'latency-over-budget',
      title: 'Latência acima do budget',
      summary: `latência média FlowMind em ${args.aggregation.avgLatencyFlowMind} ms está acima do budget de ${args.policy.latencyBudgetMs} ms.`,
      recommendedAction: 'inspect-latency',
    }))
  }

  if (args.aggregation.recentTrend === 'degrading') {
    alerts.push(buildOperationalAlert({
      severity: alerts.some((alert) => alert.severity === 'critical') ? 'critical' : 'warning',
      code: 'degradation-trend',
      title: 'Tendência de degradação',
      summary: 'o padrão recente mostra piora consistente e pede operação mais conservadora.',
      recommendedAction: alerts.some((alert) => alert.severity === 'critical') ? 'rollback-now' : 'reduce-rollout',
    }))
  }

  const operationalRisk = resolveOperationalRisk(alerts)
  const incidentState = resolvePublicFlowMindPartialIncidentState({
    aggregation: args.aggregation,
    alerts,
  })
  const degradationSummary = operationalRisk === 'critical'
    ? 'Entidade em risco crítico no partial público.'
    : operationalRisk === 'warning'
      ? 'Entidade em observação no partial público.'
      : 'Sem sinais relevantes de degradação operacional no partial público.'

  return {
    alerts,
    operationalRisk,
    incidentState,
    degradationSummary,
  }
}

function buildPublicFlowMindPartialAutomationGuard(args: {
  aggregation: PublicFlowMindPartialAggregationBase
  recommendation: PublicFlowMindPartialPolicyRecommendation
}): DashboardPublicFlowMindPartialAutomationGuard {
  if (args.aggregation.readinessState !== 'ready') {
    return {
      autoApplyAllowed: false,
      requiresConfirmation: true,
      blockedReason: 'readiness-not-ready',
      guidance: 'Mantenha recommendation-only até o partial público atingir readiness ready.',
    }
  }

  if (args.recommendation.sampleSize < args.recommendation.minSampleSize) {
    return {
      autoApplyAllowed: false,
      requiresConfirmation: true,
      blockedReason: 'insufficient-sample-size',
      guidance: `Mantenha recommendation-only até a janela mínima (${args.recommendation.minSampleSize} amostras) ser atingida.`,
    }
  }

  return {
    autoApplyAllowed: true,
    requiresConfirmation: true,
    guidance: 'Auto-apply só deve ser ativado com operador atento, readiness ready e sem alertas críticos ativos.',
  }
}

function evaluatePublicFlowMindPartialPolicy(args: {
  entityProfile: EntityProfile
  aggregation: PublicFlowMindPartialAggregationBase
  now?: string
}): PublicFlowMindPartialPolicyRecommendation {
  const now = args.now ?? new Date().toISOString()
  const automationMode = resolveAutomationMode(args.entityProfile)
  const policyState = resolveStoredPolicyState(args.entityProfile)
  const currentRolloutPercentage = args.aggregation.rolloutPercentage
  const snapshots = resolvePolicyWindowSnapshots(listPublicFlowMindPartialTelemetrySnapshots(args.entityProfile), now)
  const sampleSize = snapshots.length
  const spanMs = resolveWindowSpanMs(snapshots)
  const { windowStartAt, windowEndAt } = resolveWindowEdges(snapshots)
  const cooldownUntil = policyState?.cooldownUntil
  const cooldownUntilMs = parseTimeMs(cooldownUntil)
  const nowMs = parseTimeMs(now) ?? Date.now()
  const cooldownRemainingMinutes = typeof cooldownUntilMs === 'number' && cooldownUntilMs > nowMs
    ? Math.ceil((cooldownUntilMs - nowMs) / 60_000)
    : undefined
  const recentRolloutDrop = resolveRecentRolloutDropState({
    entityProfile: args.entityProfile,
    now,
  })
  const divergenceDelta = args.aggregation.shadowComparison?.divergenceDelta
  const recommendationReasons = [
    `fallback ${Math.round(args.aggregation.fallbackRate * 100)}%`,
    `latência ${typeof args.aggregation.avgLatencyFlowMind === 'number' ? `${args.aggregation.avgLatencyFlowMind} ms` : 'sem backend suficiente'}`,
    `divergência ${typeof args.aggregation.avgDivergenceScore === 'number' ? Math.round(args.aggregation.avgDivergenceScore * 100) : 0}%`,
    `inconsistência ${Math.round(args.aggregation.inconsistencyRate * 100)}%`,
    `trend ${args.aggregation.recentTrend}`,
    `amostra ${sampleSize}`,
  ]
  const rollbackArmed = sampleSize >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_MIN_SAMPLE_SIZE
    && spanMs >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_WINDOW_MS
    && (
      args.aggregation.fallbackRate >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_FALLBACK_RATE
      || (args.aggregation.avgDivergenceScore ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_DIVERGENCE
      || (divergenceDelta ?? 0) >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_DIVERGENCE_DELTA
      || (args.aggregation.avgLatencyFlowMind ?? 0) >= 1_200
      || args.aggregation.inconsistencyRate >= 0.45
      || args.aggregation.criticalInconsistencyCount >= 2
    )

  if (args.aggregation.killSwitchEnabled) {
    return buildBlockedRecommendation({
      automationMode,
      currentRolloutPercentage,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
      summary: 'Automação bloqueada pelo kill switch da entidade.',
      reasons: [...recommendationReasons, 'kill switch ativo'],
      blockedReason: 'kill-switch-enabled',
      windowStartAt,
      windowEndAt,
      cooldownUntil,
      cooldownRemainingMinutes,
      rollbackArmed,
    })
  }

  if (!args.aggregation.policyEnabled || args.aggregation.readinessState !== 'ready') {
    return buildBlockedRecommendation({
      automationMode,
      currentRolloutPercentage,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
      summary: 'Automação bloqueada até o partial público atingir prontidão operacional.',
      reasons: [...recommendationReasons, `readiness ${args.aggregation.readinessState}`],
      blockedReason: 'readiness-not-ready',
      windowStartAt,
      windowEndAt,
      cooldownUntil,
      cooldownRemainingMinutes,
      rollbackArmed,
    })
  }

  if (rollbackArmed) {
    return buildPolicyRecommendation({
      automationMode,
      action: 'rollback',
      status: 'recommended',
      currentRolloutPercentage,
      targetRolloutPercentage: 0,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_ROLLBACK_WINDOW_MS / 60_000),
      reasons: [...recommendationReasons, 'gatilho crítico de rollback armado'],
      windowStartAt,
      windowEndAt,
      rollbackArmed: true,
    })
  }

  const reductionEligible = sampleSize >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_MIN_SAMPLE_SIZE
    && spanMs >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_WINDOW_MS
    && (
      args.aggregation.fallbackRate >= 0.18
      || (args.aggregation.avgLatencyFlowMind ?? 0) >= 750
      || (args.aggregation.avgDivergenceScore ?? 0) >= 0.24
      || args.aggregation.inconsistencyRate >= 0.22
      || args.aggregation.criticalInconsistencyCount >= 1
      || args.aggregation.recentTrend === 'degrading'
    )

  if (reductionEligible) {
    return buildPolicyRecommendation({
      automationMode,
      action: 'reduce',
      status: 'recommended',
      currentRolloutPercentage,
      targetRolloutPercentage: Math.max(0, currentRolloutPercentage - DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_STEP_PERCENTAGE),
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_REDUCE_WINDOW_MS / 60_000),
      reasons: [...recommendationReasons, 'guardrail de redução acionado'],
      windowStartAt,
      windowEndAt,
    })
  }

  const increaseHealthy = sampleSize >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE
    && spanMs >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS
    && args.aggregation.fallbackRate <= 0.08
    && (args.aggregation.avgLatencyFlowMind ?? Number.POSITIVE_INFINITY) <= 450
    && (args.aggregation.avgDivergenceScore ?? Number.POSITIVE_INFINITY) <= 0.14
    && args.aggregation.inconsistencyRate <= 0.12
    && args.aggregation.criticalInconsistencyCount === 0
    && (args.aggregation.recentTrend === 'stable' || args.aggregation.recentTrend === 'improving')

  if (!increaseHealthy) {
    return buildPolicyRecommendation({
      automationMode,
      action: 'maintain',
      status: 'recommended',
      currentRolloutPercentage,
      targetRolloutPercentage: currentRolloutPercentage,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
      reasons: [...recommendationReasons, 'histerese conservadora ainda segura o rollout'],
      windowStartAt,
      windowEndAt,
    })
  }

  if (currentRolloutPercentage >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MAX_AUTOMATED_ROLLOUT_PERCENTAGE) {
    return buildBlockedRecommendation({
      automationMode,
      currentRolloutPercentage,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
      summary: 'A recomendação de aumento foi bloqueada pelo cap conservador de rollout.',
      reasons: [...recommendationReasons, `cap automático ${DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MAX_AUTOMATED_ROLLOUT_PERCENTAGE}%`],
      blockedReason: 'max-automated-rollout-reached',
      windowStartAt,
      windowEndAt,
      cooldownUntil,
      cooldownRemainingMinutes,
    })
  }

  if (typeof cooldownRemainingMinutes === 'number' && cooldownRemainingMinutes > 0) {
    return buildBlockedRecommendation({
      automationMode,
      currentRolloutPercentage,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
      summary: 'A recomendação de aumento foi bloqueada pelo cooldown entre mudanças.',
      reasons: [...recommendationReasons, `cooldown ${cooldownRemainingMinutes} min restantes`],
      blockedReason: 'cooldown-active',
      windowStartAt,
      windowEndAt,
      cooldownUntil,
      cooldownRemainingMinutes,
    })
  }

  if (recentRolloutDrop.active) {
    const recentAdjustmentLabel = recentRolloutDrop.adjustment?.action === 'rollback'
      ? 'rollback recente'
      : 'redução recente'

    return buildBlockedRecommendation({
      automationMode,
      currentRolloutPercentage,
      sampleSize,
      minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
      evaluatedAt: now,
      minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
      summary: 'A recomendação de aumento foi bloqueada pela histerese após uma queda recente de rollout.',
      reasons: [...recommendationReasons, `${recentAdjustmentLabel} · recuperação ${recentRolloutDrop.remainingMinutes ?? 0} min restantes`],
      blockedReason: 'hysteresis-recovery-active',
      windowStartAt,
      windowEndAt,
      cooldownUntil,
      cooldownRemainingMinutes,
      rollbackArmed,
    })
  }

  return buildPolicyRecommendation({
    automationMode,
    action: 'increase',
    status: 'recommended',
    currentRolloutPercentage,
    targetRolloutPercentage: Math.min(
      DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MAX_AUTOMATED_ROLLOUT_PERCENTAGE,
      currentRolloutPercentage + DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_STEP_PERCENTAGE,
    ),
    sampleSize,
    minSampleSize: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_INCREASE_MIN_SAMPLE_SIZE,
    evaluatedAt: now,
    minimumWindowMinutes: Math.round(DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_MIN_WINDOW_MS / 60_000),
    reasons: [...recommendationReasons, 'janela saudável e estável para aumento pequeno'],
    windowStartAt,
    windowEndAt,
  })
}

export function applyPublicFlowMindPartialPolicyEvaluation(args: {
  entityProfile: EntityProfile
  recommendation: PublicFlowMindPartialPolicyRecommendation
}): EntityProfile {
  return {
    ...args.entityProfile,
    runtime: {
      ...args.entityProfile.runtime,
      flowMind: {
        ...args.entityProfile.runtime?.flowMind,
        publicPartial: {
          ...args.entityProfile.runtime?.flowMind?.publicPartial,
          automationMode: args.recommendation.automationMode,
          autoRolloutPolicy: {
            ...args.entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy,
            lastEvaluationAt: args.recommendation.evaluatedAt,
            cooldownUntil: args.recommendation.cooldownUntil,
            lastRecommendation: {
              action: args.recommendation.action,
              status: args.recommendation.status,
              currentRolloutPercentage: args.recommendation.currentRolloutPercentage,
              targetRolloutPercentage: args.recommendation.targetRolloutPercentage,
              stepPercentage: args.recommendation.stepPercentage,
              sampleSize: args.recommendation.sampleSize,
              minSampleSize: args.recommendation.minSampleSize,
              minimumWindowMinutes: args.recommendation.minimumWindowMinutes,
              windowStartAt: args.recommendation.windowStartAt,
              windowEndAt: args.recommendation.windowEndAt,
              summary: args.recommendation.summary,
              reasons: args.recommendation.reasons,
              blockedReason: args.recommendation.blockedReason,
              hysteresisActive: args.recommendation.hysteresisActive,
              rollbackArmed: args.recommendation.rollbackArmed,
              evaluatedAt: args.recommendation.evaluatedAt,
            },
          },
          updatedAt: args.recommendation.evaluatedAt,
        },
        updatedAt: args.recommendation.evaluatedAt,
      },
    },
  }
}

export function applyPublicFlowMindPartialPolicyAdjustment(args: {
  entityProfile: EntityProfile
  recommendation: PublicFlowMindPartialPolicyRecommendation
  source: PublicFlowMindPartialAdjustmentAudit['source']
  reason?: string
}): { entityProfile: EntityProfile; adjustment?: PublicFlowMindPartialAdjustmentAudit } {
  const currentRolloutPercentage = clampRolloutPercentage(args.entityProfile.runtime?.flowMind?.publicPartial?.rolloutPercentage)
  const nextRolloutPercentage = clampRolloutPercentage(args.recommendation.targetRolloutPercentage)

  if (currentRolloutPercentage === nextRolloutPercentage || args.recommendation.action === 'maintain') {
    return {
      entityProfile: applyPublicFlowMindPartialPolicyEvaluation(args),
      adjustment: undefined,
    }
  }

  const changedAt = args.recommendation.evaluatedAt
  const adjustment: PublicFlowMindPartialAdjustmentAudit = {
    action: args.recommendation.action,
    source: args.source,
    fromRolloutPercentage: currentRolloutPercentage,
    toRolloutPercentage: nextRolloutPercentage,
    reason: args.reason ?? args.recommendation.reasons[0] ?? 'public-partial-policy-adjustment',
    changedAt,
  }
  const cooldownUntil = new Date((parseTimeMs(changedAt) ?? Date.now()) + DEFAULT_PUBLIC_FLOWMIND_PARTIAL_POLICY_COOLDOWN_MS).toISOString()

  return {
    entityProfile: {
      ...args.entityProfile,
      runtime: {
        ...args.entityProfile.runtime,
        flowMind: {
          ...args.entityProfile.runtime?.flowMind,
          publicPartial: {
            ...args.entityProfile.runtime?.flowMind?.publicPartial,
            rolloutPercentage: nextRolloutPercentage,
            automationMode: args.recommendation.automationMode,
            autoRolloutPolicy: {
              ...args.entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy,
              lastEvaluationAt: changedAt,
              cooldownUntil,
              lastRecommendation: {
                action: args.recommendation.action,
                status: 'applied',
                currentRolloutPercentage,
                targetRolloutPercentage: nextRolloutPercentage,
                stepPercentage: Math.abs(nextRolloutPercentage - currentRolloutPercentage),
                sampleSize: args.recommendation.sampleSize,
                minSampleSize: args.recommendation.minSampleSize,
                minimumWindowMinutes: args.recommendation.minimumWindowMinutes,
                windowStartAt: args.recommendation.windowStartAt,
                windowEndAt: args.recommendation.windowEndAt,
                summary: args.recommendation.summary,
                reasons: args.recommendation.reasons,
                blockedReason: args.recommendation.blockedReason,
                hysteresisActive: args.recommendation.hysteresisActive,
                rollbackArmed: args.recommendation.rollbackArmed,
                evaluatedAt: changedAt,
              },
              lastAdjustment: adjustment,
            },
            updatedAt: changedAt,
          },
          updatedAt: changedAt,
        },
      },
    },
    adjustment,
  }
}

function clampRolloutPercentage(value: unknown) {
  return Math.round(clampPublicFlowMindMetric(typeof value === 'number' ? value / 100 : 0, 0, 1) * 100)
}

export function normalizePublicFlowMindPartialControlUpdate(value: {
  rolloutPercentage?: unknown
  killSwitchEnabled?: unknown
  automationMode?: unknown
}) {
  return {
    rolloutPercentage: clampRolloutPercentage(value.rolloutPercentage),
    killSwitchEnabled: value.killSwitchEnabled === true,
    automationMode: value.automationMode === 'auto-apply' ? 'auto-apply' : DEFAULT_PUBLIC_FLOWMIND_PARTIAL_AUTOMATION_MODE,
  }
}

function clampLatencyBudget(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PUBLIC_FLOWMIND_PARTIAL_LATENCY_BUDGET_MS
  }

  return Math.round(Math.min(Math.max(value, 150), 3_000))
}

function clampCriticalDivergenceThreshold(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PUBLIC_FLOWMIND_PARTIAL_CRITICAL_DIVERGENCE_THRESHOLD
  }

  return roundPublicFlowMindMetric(clampPublicFlowMindMetric(value, 0.15, 0.95))
}

function hashToBucket(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100
  }

  return Math.abs(hash % 100)
}

export function computePublicFlowMindPartialRolloutBucket(requestId: string) {
  return hashToBucket(requestId)
}

export function resolvePublicFlowMindPartialConfig(args: {
  entityProfile: EntityProfile
  readiness?: DashboardPublicFlowMindShadowReadiness
}): PublicFlowMindPartialConfig {
  const partialConfig = args.entityProfile.runtime?.flowMind?.publicPartial
  const rolloutPercentage = clampRolloutPercentage(partialConfig?.rolloutPercentage)
  const readinessState = args.readiness?.publicShadowReadinessState ?? 'not-ready'
  const killSwitchEnabled = args.entityProfile.runtime?.flowMind?.killSwitchEnabled === true || partialConfig?.killSwitchEnabled === true
  const latencyBudgetMs = clampLatencyBudget(partialConfig?.latencyBudgetMs)
  const criticalDivergenceThreshold = clampCriticalDivergenceThreshold(partialConfig?.criticalDivergenceThreshold)

  let activationReason = 'public-shadow-not-ready'
  if (killSwitchEnabled) {
    activationReason = 'kill-switch-enabled'
  } else if (readinessState !== 'ready') {
    activationReason = `readiness-${readinessState}`
  } else if (rolloutPercentage <= 0) {
    activationReason = 'rollout-percentage-zero'
  } else {
    activationReason = 'eligible-for-public-partial'
  }

  return {
    readinessState,
    readinessScore: args.readiness?.publicShadowReadinessScore,
    rolloutPercentage,
    latencyBudgetMs,
    criticalDivergenceThreshold,
    killSwitchEnabled,
    automationMode: resolveAutomationMode(args.entityProfile),
    enabled: !killSwitchEnabled && readinessState === 'ready' && rolloutPercentage > 0,
    activationReason,
  }
}

export function isPublicFlowMindPartialTelemetryCandidate(value: unknown): value is PublicFlowMindPartialTelemetrySnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const policy = record.policy as Record<string, unknown> | undefined
  const metrics = record.metrics as Record<string, unknown> | undefined

  return record.version === 1
    && typeof record.requestId === 'string'
    && typeof record.decidedAt === 'string'
    && typeof record.rolloutBucket === 'number'
    && (record.engineUsed === 'frontend' || record.engineUsed === 'flowmind')
    && typeof record.fallbackOccurred === 'boolean'
    && (record.fallbackReason === undefined || typeof record.fallbackReason === 'string')
    && !!policy
    && typeof policy.readinessState === 'string'
    && typeof policy.rolloutPercentage === 'number'
    && typeof policy.latencyBudgetMs === 'number'
    && typeof policy.criticalDivergenceThreshold === 'number'
    && typeof policy.killSwitchEnabled === 'boolean'
    && typeof policy.enabled === 'boolean'
    && typeof policy.activationReason === 'string'
    && isPublicFlowMindShadowFrontendDecisionCandidate(record.frontendDecision)
    && (record.backendDecision === undefined || isPublicFlowMindShadowBackendDecisionCandidate(record.backendDecision))
    && !!metrics
    && typeof metrics.frontendLatencyMs === 'number'
    && (metrics.backendLatencyMs === undefined || typeof metrics.backendLatencyMs === 'number')
    && typeof metrics.chosenLatencyMs === 'number'
    && (metrics.divergenceScore === undefined || typeof metrics.divergenceScore === 'number')
}

export function isPublicFlowMindPartialTelemetryInputCandidate(value: unknown): value is PublicFlowMindPartialTelemetryInput {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const policy = record.policy as Record<string, unknown> | undefined

  return record.version === 1
    && typeof record.requestId === 'string'
    && typeof record.decidedAt === 'string'
    && !!policy
    && typeof policy.readinessState === 'string'
    && typeof policy.rolloutPercentage === 'number'
    && typeof policy.latencyBudgetMs === 'number'
    && typeof policy.criticalDivergenceThreshold === 'number'
    && typeof policy.killSwitchEnabled === 'boolean'
    && typeof policy.enabled === 'boolean'
    && typeof policy.activationReason === 'string'
    && isPublicFlowMindShadowFrontendDecisionCandidate(record.frontendDecision)
    && (record.backendDecision === undefined || isPublicFlowMindShadowBackendDecisionCandidate(record.backendDecision))
}

export function serializePublicFlowMindPartialTelemetrySnapshot(snapshot: PublicFlowMindPartialTelemetrySnapshot) {
  return `${PUBLIC_FLOWMIND_PARTIAL_NOTE_PREFIX}${JSON.stringify(snapshot)}`
}

export function serializePublicFlowMindPartialSampledRequestRecord(record: PublicFlowMindPartialSampledRequestRecord) {
  return `${PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_NOTE_PREFIX}${JSON.stringify(record)}`
}

export function parsePublicFlowMindPartialTelemetrySnapshot(note: string): PublicFlowMindPartialTelemetrySnapshot | undefined {
  if (!note.startsWith(PUBLIC_FLOWMIND_PARTIAL_NOTE_PREFIX)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(note.slice(PUBLIC_FLOWMIND_PARTIAL_NOTE_PREFIX.length)) as unknown
    if (!isPublicFlowMindPartialTelemetryCandidate(parsed)) {
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

export function parsePublicFlowMindPartialSampledRequestRecord(note: string): PublicFlowMindPartialSampledRequestRecord | undefined {
  if (!note.startsWith(PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_NOTE_PREFIX)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(note.slice(PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_NOTE_PREFIX.length)) as unknown
    if (!isPublicFlowMindPartialSampledRequestRecordCandidate(parsed)) {
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

export function listPublicFlowMindPartialTelemetrySnapshots(entityProfile?: Pick<EntityProfile, 'metadata'>) {
  return (entityProfile?.metadata.notes ?? [])
    .map((note) => parsePublicFlowMindPartialTelemetrySnapshot(note))
    .filter((snapshot): snapshot is PublicFlowMindPartialTelemetrySnapshot => snapshot !== undefined)
}

function resolvePublicFlowMindPartialSampledRequestState(args: {
  record: PublicFlowMindPartialSampledRequestRecord
  now: string
}): PublicFlowMindPartialSampledRequestRecord {
  if (args.record.state === 'consolidated' || args.record.state === 'reconciled' || args.record.state === 'expired') {
    return args.record
  }

  const sampledAtMs = parseTimeMs(args.record.sampledAt)
  const nowMs = parseTimeMs(args.now)
  if (sampledAtMs === undefined || nowMs === undefined) {
    return args.record
  }

  const ageMs = Math.max(0, nowMs - sampledAtMs)
  if (ageMs >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_TTL_MS) {
    return {
      ...args.record,
      state: 'expired',
      expiredAt: args.record.expiredAt ?? args.now,
      lastObservedAt: args.now,
    }
  }

  if (ageMs >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_MISSING_TELEMETRY_GRACE_MS) {
    return {
      ...args.record,
      state: 'missing_telemetry',
      lastObservedAt: args.now,
    }
  }

  return args.record
}

function writePublicFlowMindPartialSampledRequestRecords(
  entityProfile: EntityProfile,
  records: PublicFlowMindPartialSampledRequestRecord[],
): EntityProfile {
  const notes = entityProfile.metadata.notes ?? []
  const nonSampledNotes = notes.filter((note) => !note.startsWith(PUBLIC_FLOWMIND_PARTIAL_SAMPLED_REQUEST_NOTE_PREFIX))

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      notes: [
        ...records.map((record) => serializePublicFlowMindPartialSampledRequestRecord(record)),
        ...nonSampledNotes,
      ].slice(0, 64),
    },
  }
}

export function listPublicFlowMindPartialSampledRequestRecords(args: {
  entityProfile?: Pick<EntityProfile, 'metadata'>
  now?: string
}) {
  const records = (args.entityProfile?.metadata.notes ?? [])
    .map((note) => parsePublicFlowMindPartialSampledRequestRecord(note))
    .filter((record): record is PublicFlowMindPartialSampledRequestRecord => record !== undefined)

  if (!args.now) {
    return records
  }

  return records.map((record) => resolvePublicFlowMindPartialSampledRequestState({
    record,
    now: args.now!,
  }))
}

export function syncPublicFlowMindPartialSampledRequestRecords(args: {
  entityProfile: EntityProfile
  now?: string
}) {
  const now = args.now ?? new Date().toISOString()
  const records = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: args.entityProfile,
    now,
  })

  return writePublicFlowMindPartialSampledRequestRecords(args.entityProfile, records)
}

export function registerPublicFlowMindPartialSampledRequest(args: {
  entityProfile: EntityProfile
  requestId: string
  policy: PublicFlowMindPartialConfig
  sampledAt?: string
}) {
  const sampledAt = args.sampledAt ?? new Date().toISOString()
  const syncedEntity = syncPublicFlowMindPartialSampledRequestRecords({
    entityProfile: args.entityProfile,
    now: sampledAt,
  })
  const existingRecords = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: syncedEntity,
  })
  const requestKey = buildPublicFlowMindPartialSampledRequestKey(args.requestId)
  const existingRecord = existingRecords.find((record) => record.requestKey === requestKey)

  if (existingRecord) {
    return {
      entityProfile: syncedEntity,
      record: existingRecord,
    }
  }

  const nextRecord = buildPublicFlowMindPartialSampledRequestRecord({
    requestId: args.requestId,
    policy: args.policy,
    sampledAt,
  })

  return {
    entityProfile: writePublicFlowMindPartialSampledRequestRecords(syncedEntity, [nextRecord, ...existingRecords]),
    record: nextRecord,
  }
}

export function reconcilePublicFlowMindPartialTelemetry(args: {
  entityProfile: EntityProfile
  snapshot: PublicFlowMindPartialTelemetrySnapshot
  now?: string
}): PublicFlowMindPartialTelemetryReconciliation {
  const now = args.now ?? new Date().toISOString()
  const syncedEntity = syncPublicFlowMindPartialSampledRequestRecords({
    entityProfile: args.entityProfile,
    now,
  })
  const existingSnapshots = listPublicFlowMindPartialTelemetrySnapshots(syncedEntity)
  const records = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: syncedEntity,
  })
  const requestKey = buildPublicFlowMindPartialSampledRequestKey(args.snapshot.requestId)
  const matchedRecord = records.find((record) => record.requestKey === requestKey)

  if (existingSnapshots.some((snapshot) => snapshot.requestId === args.snapshot.requestId)) {
    const duplicateRecord = matchedRecord ?? buildPublicFlowMindPartialSampledRequestRecord({
      requestId: args.snapshot.requestId,
      policy: args.snapshot.policy,
      sampledAt: args.snapshot.decidedAt,
    })
    const nextRecord: PublicFlowMindPartialSampledRequestRecord = {
      ...duplicateRecord,
      state: 'reconciled',
      reconciledAt: now,
      telemetryDecidedAt: args.snapshot.decidedAt,
      lastObservedAt: now,
    }

    return {
      entityProfile: writePublicFlowMindPartialSampledRequestRecords(
        syncedEntity,
        [nextRecord, ...records.filter((record) => record.requestKey !== requestKey)],
      ),
      status: 'reconciled',
      duplicateTelemetry: true,
    }
  }

  if (!matchedRecord) {
    const appendedEntity = appendPublicFlowMindPartialTelemetrySnapshot(syncedEntity, args.snapshot)
    const reconciledRecord: PublicFlowMindPartialSampledRequestRecord = {
      ...buildPublicFlowMindPartialSampledRequestRecord({
        requestId: args.snapshot.requestId,
        policy: args.snapshot.policy,
        sampledAt: args.snapshot.decidedAt,
      }),
      state: 'reconciled',
      reconciledAt: now,
      telemetryDecidedAt: args.snapshot.decidedAt,
      lastObservedAt: now,
    }

    return {
      entityProfile: writePublicFlowMindPartialSampledRequestRecords(appendedEntity, [reconciledRecord, ...records]),
      status: 'reconciled',
      duplicateTelemetry: false,
    }
  }

  if (matchedRecord.state === 'expired') {
    const reconciledRecord: PublicFlowMindPartialSampledRequestRecord = {
      ...matchedRecord,
      state: 'reconciled',
      reconciledAt: now,
      telemetryDecidedAt: args.snapshot.decidedAt,
      lastObservedAt: now,
    }

    return {
      entityProfile: writePublicFlowMindPartialSampledRequestRecords(
        syncedEntity,
        [reconciledRecord, ...records.filter((record) => record.requestKey !== requestKey)],
      ),
      status: 'reconciled',
      duplicateTelemetry: false,
    }
  }

  const appendedEntity = appendPublicFlowMindPartialTelemetrySnapshot(syncedEntity, args.snapshot)
  const consolidatedRecord: PublicFlowMindPartialSampledRequestRecord = {
    ...matchedRecord,
    state: 'consolidated',
    consolidatedAt: now,
    telemetryDecidedAt: args.snapshot.decidedAt,
    lastObservedAt: now,
  }

  return {
    entityProfile: writePublicFlowMindPartialSampledRequestRecords(
      appendedEntity,
      [consolidatedRecord, ...records.filter((record) => record.requestKey !== requestKey)],
    ),
    status: 'consolidated',
    duplicateTelemetry: false,
  }
}

function resolveLatencyBucket(latencyMs: number): DashboardPublicFlowMindPartialLatencyBucket['bucket'] {
  if (latencyMs <= 150) return '<=150ms'
  if (latencyMs <= 300) return '151-300ms'
  if (latencyMs <= 600) return '301-600ms'
  if (latencyMs <= 900) return '601-900ms'
  return '>900ms'
}

function resolvePartialPatternOutcome(snapshot: PublicFlowMindPartialTelemetrySnapshot): DashboardPublicFlowMindPartialPatternEntry['outcome'] {
  if (!snapshot.policy.enabled || snapshot.policy.killSwitchEnabled) {
    return 'disabled'
  }

  const criticalInconsistency = snapshot.fallbackReason === 'critical-inconsistency'
    || snapshot.comparison?.intentChanged === true
    || snapshot.comparison?.actionChanged === true
    || snapshot.comparison?.authorityChanged === true
    || ((snapshot.comparison?.divergenceScore ?? 0) >= snapshot.policy.criticalDivergenceThreshold)

  if (snapshot.fallbackOccurred || criticalInconsistency) {
    return 'unstable'
  }

  if ((snapshot.comparison?.divergenceScore ?? 0) > 0.2 || snapshot.metrics.chosenLatencyMs > snapshot.policy.latencyBudgetMs * 0.75) {
    return 'watch'
  }

  return 'healthy'
}

function resolvePublicPartialTrend(recentPattern: DashboardPublicFlowMindPartialPatternEntry[], policyEnabled: boolean): DashboardPublicFlowMindPartialAggregation['recentTrend'] {
  if (!policyEnabled) {
    return 'disabled'
  }

  if (recentPattern.length < 2) {
    return 'forming'
  }

  const scoreFor = (entry: DashboardPublicFlowMindPartialPatternEntry) => {
    if (entry.outcome === 'healthy') return 0
    if (entry.outcome === 'watch') return 1
    return 2
  }

  const recentAverage = recentPattern.slice(0, 3).reduce((sum, entry) => sum + scoreFor(entry), 0) / Math.min(recentPattern.length, 3)
  const previousWindow = recentPattern.slice(3, 6)

  if (previousWindow.length === 0) {
    return recentAverage <= 0.3 ? 'stable' : recentAverage >= 1.5 ? 'degrading' : 'forming'
  }

  const previousAverage = previousWindow.reduce((sum, entry) => sum + scoreFor(entry), 0) / previousWindow.length
  if (recentAverage + 0.2 < previousAverage) {
    return 'improving'
  }

  if (recentAverage > previousAverage + 0.2) {
    return 'degrading'
  }

  return 'stable'
}

export function buildPublicFlowMindPartialAggregation(args: {
  entityProfile?: EntityProfile
  readiness?: DashboardPublicFlowMindShadowReadiness
  shadowAggregation?: DashboardPublicFlowMindShadowAggregation
  now?: string
}): DashboardPublicFlowMindPartialAggregation | undefined {
  if (!args.entityProfile) {
    return undefined
  }

  const snapshots = listPublicFlowMindPartialTelemetrySnapshots(args.entityProfile)
  const now = resolvePartialTelemetryNow(args.now)
  const policy = resolvePublicFlowMindPartialConfig({
    entityProfile: args.entityProfile,
    readiness: args.readiness,
  })

  if (snapshots.length === 0) {
    if (!policy.enabled && policy.rolloutPercentage === 0 && !policy.killSwitchEnabled) {
      return undefined
    }

    const emptyAggregationBase: PublicFlowMindPartialAggregationBase = {
      totalInteractions: 0,
      flowMindUsedCount: 0,
      frontendUsedCount: 0,
      fallbackCount: 0,
      fallbackRate: 0,
      avgLatencyFlowMind: undefined,
      avgLatencyFrontend: undefined,
      latencyDelta: undefined,
      avgDivergenceScore: undefined,
      inconsistencyRate: 0,
      criticalInconsistencyCount: 0,
      flowMindUsageRate: 0,
      rolloutPercentage: policy.rolloutPercentage,
      killSwitchEnabled: policy.killSwitchEnabled,
      automationMode: resolveAutomationMode(args.entityProfile),
      readinessState: policy.readinessState,
      readinessScore: policy.readinessScore,
      policyEnabled: policy.enabled,
      incidentState: 'absent',
      incidentEnteredAt: resolveStoredIncidentState(args.entityProfile)?.enteredAt,
      incidentUpdatedAt: resolveStoredIncidentState(args.entityProfile)?.updatedAt,
      recentTrend: policy.enabled ? 'forming' : 'disabled',
      recentPattern: [],
      fallbackReasonCounts: [],
      latencyDistribution: [
        { bucket: '<=150ms', count: 0 },
        { bucket: '151-300ms', count: 0 },
        { bucket: '301-600ms', count: 0 },
        { bucket: '601-900ms', count: 0 },
        { bucket: '>900ms', count: 0 },
      ],
      shadowComparison: args.shadowAggregation
        ? {
          shadowSampleSize: args.shadowAggregation.sampleSize,
          shadowAverageDivergenceScore: args.shadowAggregation.averageDivergenceScore,
          partialAverageDivergenceScore: undefined,
          shadowFallbackRate: args.shadowAggregation.fallbackRate,
          partialFallbackRate: 0,
          divergenceDelta: undefined,
          fallbackRateDelta: roundPublicFlowMindMetric(0 - args.shadowAggregation.fallbackRate),
        }
        : undefined,
    }
    const policyRecommendation = evaluatePublicFlowMindPartialPolicy({
      entityProfile: args.entityProfile,
      aggregation: emptyAggregationBase,
    })
    const alertState = buildPublicFlowMindPartialAlerts({
      aggregation: emptyAggregationBase,
      policy,
    })
    const incidentTimeline = resolveIncidentTimeline({
      entityProfile: args.entityProfile,
      incidentState: 'absent',
      observedAt: now,
    })

    return {
      ...emptyAggregationBase,
      alerts: [],
      operationalRisk: 'warning',
      degradationSummary: 'Sem telemetria disponivel para avaliar o partial publico.',
      ...incidentTimeline,
      automationGuard: buildPublicFlowMindPartialAutomationGuard({
        aggregation: emptyAggregationBase,
        recommendation: policyRecommendation,
      }),
      policyRecommendation,
      lastAdjustment: resolveStoredLastAdjustment(args.entityProfile),
    }
  }

  const fallbackReasonCounts = new Map<string, number>()
  const latencyDistributionCounts = new Map<DashboardPublicFlowMindPartialLatencyBucket['bucket'], number>([
    ['<=150ms', 0],
    ['151-300ms', 0],
    ['301-600ms', 0],
    ['601-900ms', 0],
    ['>900ms', 0],
  ])
  let flowMindUsedCount = 0
  let frontendUsedCount = 0
  let fallbackCount = 0
  let flowMindLatencyTotal = 0
  let frontendLatencyTotal = 0
  let divergenceTotal = 0
  let divergenceCount = 0
  let inconsistentCount = 0
  let criticalInconsistencyCount = 0

  const recentPattern = snapshots.slice(0, 6).map((snapshot) => {
    const chosenLatencyMs = snapshot.metrics.chosenLatencyMs
    latencyDistributionCounts.set(resolveLatencyBucket(chosenLatencyMs), (latencyDistributionCounts.get(resolveLatencyBucket(chosenLatencyMs)) ?? 0) + 1)

    if (snapshot.engineUsed === 'flowmind') {
      flowMindUsedCount += 1
      flowMindLatencyTotal += chosenLatencyMs
    } else {
      frontendUsedCount += 1
      frontendLatencyTotal += chosenLatencyMs
    }

    if (snapshot.fallbackOccurred) {
      fallbackCount += 1
    }

    if (snapshot.fallbackReason) {
      fallbackReasonCounts.set(snapshot.fallbackReason, (fallbackReasonCounts.get(snapshot.fallbackReason) ?? 0) + 1)
    }

    if (typeof snapshot.comparison?.divergenceScore === 'number') {
      divergenceTotal += snapshot.comparison.divergenceScore
      divergenceCount += 1
    }

    const inconsistent = snapshot.comparison?.intentChanged === true
      || snapshot.comparison?.actionChanged === true
      || snapshot.comparison?.authorityChanged === true
      || ((snapshot.comparison?.divergenceScore ?? 0) >= 0.2)
    const criticalInconsistency = snapshot.fallbackReason === 'critical-inconsistency'
      || snapshot.comparison?.intentChanged === true
      || snapshot.comparison?.actionChanged === true
      || snapshot.comparison?.authorityChanged === true
      || ((snapshot.comparison?.divergenceScore ?? 0) >= snapshot.policy.criticalDivergenceThreshold)

    if (inconsistent) {
      inconsistentCount += 1
    }

    if (criticalInconsistency) {
      criticalInconsistencyCount += 1
    }

    return {
      observedAt: snapshot.decidedAt,
      engineUsed: snapshot.engineUsed,
      fallbackOccurred: snapshot.fallbackOccurred,
      fallbackReason: snapshot.fallbackReason,
      chosenLatencyMs,
      divergenceScore: snapshot.comparison?.divergenceScore,
      outcome: resolvePartialPatternOutcome(snapshot),
    }
  })

  for (const snapshot of snapshots.slice(6)) {
    const chosenLatencyMs = snapshot.metrics.chosenLatencyMs
    latencyDistributionCounts.set(resolveLatencyBucket(chosenLatencyMs), (latencyDistributionCounts.get(resolveLatencyBucket(chosenLatencyMs)) ?? 0) + 1)

    if (snapshot.engineUsed === 'flowmind') {
      flowMindUsedCount += 1
      flowMindLatencyTotal += chosenLatencyMs
    } else {
      frontendUsedCount += 1
      frontendLatencyTotal += chosenLatencyMs
    }

    if (snapshot.fallbackOccurred) {
      fallbackCount += 1
    }

    if (snapshot.fallbackReason) {
      fallbackReasonCounts.set(snapshot.fallbackReason, (fallbackReasonCounts.get(snapshot.fallbackReason) ?? 0) + 1)
    }

    if (typeof snapshot.comparison?.divergenceScore === 'number') {
      divergenceTotal += snapshot.comparison.divergenceScore
      divergenceCount += 1
    }

    const inconsistent = snapshot.comparison?.intentChanged === true
      || snapshot.comparison?.actionChanged === true
      || snapshot.comparison?.authorityChanged === true
      || ((snapshot.comparison?.divergenceScore ?? 0) >= 0.2)
    const criticalInconsistency = snapshot.fallbackReason === 'critical-inconsistency'
      || snapshot.comparison?.intentChanged === true
      || snapshot.comparison?.actionChanged === true
      || snapshot.comparison?.authorityChanged === true
      || ((snapshot.comparison?.divergenceScore ?? 0) >= snapshot.policy.criticalDivergenceThreshold)

    if (inconsistent) {
      inconsistentCount += 1
    }

    if (criticalInconsistency) {
      criticalInconsistencyCount += 1
    }
  }

  const totalInteractions = snapshots.length
  const avgLatencyFlowMind = flowMindUsedCount > 0 ? Math.round(flowMindLatencyTotal / flowMindUsedCount) : undefined
  const avgLatencyFrontend = frontendUsedCount > 0 ? Math.round(frontendLatencyTotal / frontendUsedCount) : undefined
  const avgDivergenceScore = divergenceCount > 0 ? roundPublicFlowMindMetric(divergenceTotal / divergenceCount) : undefined

  const automationMode = resolveAutomationMode(args.entityProfile)
  const aggregation: PublicFlowMindPartialAggregationBase = {
    totalInteractions,
    flowMindUsedCount,
    frontendUsedCount,
    fallbackCount,
    fallbackRate: roundPublicFlowMindMetric(fallbackCount / totalInteractions),
    avgLatencyFlowMind,
    avgLatencyFrontend,
    latencyDelta: typeof avgLatencyFlowMind === 'number' && typeof avgLatencyFrontend === 'number'
      ? Math.round(avgLatencyFlowMind - avgLatencyFrontend)
      : undefined,
    avgDivergenceScore,
    inconsistencyRate: roundPublicFlowMindMetric(inconsistentCount / totalInteractions),
    criticalInconsistencyCount,
    flowMindUsageRate: roundPublicFlowMindMetric(flowMindUsedCount / totalInteractions),
    rolloutPercentage: policy.rolloutPercentage,
    killSwitchEnabled: policy.killSwitchEnabled,
    automationMode,
    readinessState: policy.readinessState,
    readinessScore: policy.readinessScore,
    policyEnabled: policy.enabled,
    incidentState: 'normal',
    incidentEnteredAt: undefined,
    incidentUpdatedAt: undefined,
    recentTrend: resolvePublicPartialTrend(recentPattern, policy.enabled),
    recentPattern,
    fallbackReasonCounts: Array.from(fallbackReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    latencyDistribution: Array.from(latencyDistributionCounts.entries())
      .map(([bucket, count]) => ({ bucket, count })),
    shadowComparison: args.shadowAggregation
      ? {
        shadowSampleSize: args.shadowAggregation.sampleSize,
        shadowAverageDivergenceScore: args.shadowAggregation.averageDivergenceScore,
        partialAverageDivergenceScore: avgDivergenceScore,
        shadowFallbackRate: args.shadowAggregation.fallbackRate,
        partialFallbackRate: roundPublicFlowMindMetric(fallbackCount / totalInteractions),
        divergenceDelta: typeof avgDivergenceScore === 'number'
          ? roundPublicFlowMindMetric(avgDivergenceScore - args.shadowAggregation.averageDivergenceScore)
          : undefined,
        fallbackRateDelta: roundPublicFlowMindMetric((fallbackCount / totalInteractions) - args.shadowAggregation.fallbackRate),
      }
      : undefined,
  }
  const policyRecommendation = evaluatePublicFlowMindPartialPolicy({
    entityProfile: args.entityProfile,
    aggregation,
  })
  const alertState = buildPublicFlowMindPartialAlerts({
    aggregation,
    policy,
  })
  const incidentTimeline = resolveIncidentTimeline({
    entityProfile: args.entityProfile,
    incidentState: isPublicFlowMindPartialSnapshotStale({ snapshot: snapshots[0], now }) ? 'stale' : alertState.incidentState,
    observedAt: now,
  })

  const staleSnapshot = isPublicFlowMindPartialSnapshotStale({ snapshot: snapshots[0], now })

  return {
    ...aggregation,
    ...(staleSnapshot
      ? {
        alerts: [],
        operationalRisk: 'warning' as const,
        incidentState: 'stale' as const,
        degradationSummary: 'A telemetria do partial publico venceu a janela de validade e nao deve ser lida como incidente ativo.',
      }
      : alertState),
    ...incidentTimeline,
    automationGuard: buildPublicFlowMindPartialAutomationGuard({
      aggregation,
      recommendation: policyRecommendation,
    }),
    policyRecommendation,
    lastAdjustment: resolveStoredLastAdjustment(args.entityProfile),
  }
}

export function appendPublicFlowMindPartialTelemetrySnapshot(
  entityProfile: EntityProfile,
  snapshot: PublicFlowMindPartialTelemetrySnapshot,
): EntityProfile {
  const notes = entityProfile.metadata.notes ?? []

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      notes: [
        serializePublicFlowMindPartialTelemetrySnapshot(snapshot),
        ...notes,
      ].slice(0, 48),
    },
  }
}

export function buildPublicFlowMindPartialTelemetrySnapshot(args: {
  requestId: string
  policy: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
  decidedAt?: string
}): PublicFlowMindPartialTelemetrySnapshot {
  const resolution = resolvePublicFlowMindPartialDecision({
    config: args.policy,
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
  })
  const chosenLatencyMs = resolution.engineUsed === 'flowmind'
    ? Math.round(args.backendDecision?.latencyMs ?? args.frontendDecision.latencyMs)
    : Math.round(args.frontendDecision.latencyMs)

  return {
    version: 1,
    requestId: args.requestId,
    decidedAt: args.decidedAt ?? new Date().toISOString(),
    rolloutBucket: computePublicFlowMindPartialRolloutBucket(args.requestId),
    engineUsed: resolution.engineUsed,
    fallbackOccurred: resolution.fallbackOccurred,
    fallbackReason: resolution.fallbackReason,
    policy: args.policy,
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
    comparison: resolution.comparison,
    metrics: {
      frontendLatencyMs: Math.round(args.frontendDecision.latencyMs),
      backendLatencyMs: args.backendDecision ? Math.round(args.backendDecision.latencyMs) : undefined,
      chosenLatencyMs,
      divergenceScore: resolution.comparison?.divergenceScore,
    },
  }
}

function clampAlertWebhookTimeout(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_TIMEOUT_MS
  }

  return Math.round(Math.min(Math.max(value, 500), 10_000))
}

function clampAlertWebhookRetryCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_RETRY_COUNT
  }

  return Math.round(Math.min(Math.max(value, 0), 5))
}

function normalizeAlertWebhookUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolvePublicFlowMindPartialOperationalSettings(entityProfile: EntityProfile): PublicFlowMindPartialOperationalSettings {
  const partialConfig = entityProfile.runtime?.flowMind?.publicPartial
  const alertWebhook = partialConfig?.alertWebhook

  return {
    rolloutPercentage: clampRolloutPercentage(partialConfig?.rolloutPercentage),
    killSwitchEnabled: entityProfile.runtime?.flowMind?.killSwitchEnabled === true || partialConfig?.killSwitchEnabled === true,
    automationMode: resolveAutomationMode(entityProfile),
    latencyBudgetMs: clampLatencyBudget(partialConfig?.latencyBudgetMs),
    criticalDivergenceThreshold: clampCriticalDivergenceThreshold(partialConfig?.criticalDivergenceThreshold),
    alertWebhook: {
      enabled: alertWebhook?.enabled === true,
      url: normalizeAlertWebhookUrl(alertWebhook?.url),
      timeoutMs: clampAlertWebhookTimeout(alertWebhook?.timeoutMs),
      retryCount: clampAlertWebhookRetryCount(alertWebhook?.retryCount),
    },
  }
}

export function normalizePublicFlowMindPartialOperationalSettingsUpdate(
  value: PublicFlowMindPartialOperationalSettingsUpdate,
  entityProfile?: EntityProfile,
): PublicFlowMindPartialOperationalSettings {
  const current = entityProfile
    ? resolvePublicFlowMindPartialOperationalSettings(entityProfile)
    : {
      rolloutPercentage: 0,
      killSwitchEnabled: false,
      automationMode: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_AUTOMATION_MODE,
      latencyBudgetMs: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_LATENCY_BUDGET_MS,
      criticalDivergenceThreshold: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_CRITICAL_DIVERGENCE_THRESHOLD,
      alertWebhook: {
        enabled: false,
        url: '',
        timeoutMs: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_TIMEOUT_MS,
        retryCount: DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_RETRY_COUNT,
      },
    }

  return {
    rolloutPercentage: typeof value.rolloutPercentage === 'undefined'
      ? current.rolloutPercentage
      : clampRolloutPercentage(value.rolloutPercentage),
    killSwitchEnabled: typeof value.killSwitchEnabled === 'undefined'
      ? current.killSwitchEnabled
      : value.killSwitchEnabled === true,
    automationMode: typeof value.automationMode === 'undefined'
      ? current.automationMode
      : value.automationMode === 'auto-apply' ? 'auto-apply' : DEFAULT_PUBLIC_FLOWMIND_PARTIAL_AUTOMATION_MODE,
    latencyBudgetMs: typeof value.latencyBudgetMs === 'undefined'
      ? current.latencyBudgetMs
      : clampLatencyBudget(value.latencyBudgetMs),
    criticalDivergenceThreshold: typeof value.criticalDivergenceThreshold === 'undefined'
      ? current.criticalDivergenceThreshold
      : clampCriticalDivergenceThreshold(value.criticalDivergenceThreshold),
    alertWebhook: {
      enabled: typeof value.alertWebhook?.enabled === 'undefined'
        ? current.alertWebhook.enabled
        : value.alertWebhook.enabled === true,
      url: typeof value.alertWebhook?.url === 'undefined'
        ? current.alertWebhook.url
        : normalizeAlertWebhookUrl(value.alertWebhook.url),
      timeoutMs: typeof value.alertWebhook?.timeoutMs === 'undefined'
        ? current.alertWebhook.timeoutMs
        : clampAlertWebhookTimeout(value.alertWebhook.timeoutMs),
      retryCount: typeof value.alertWebhook?.retryCount === 'undefined'
        ? current.alertWebhook.retryCount
        : clampAlertWebhookRetryCount(value.alertWebhook.retryCount),
    },
  }
}

export function applyPublicFlowMindPartialOperationalSettingsUpdate(args: {
  entityProfile: EntityProfile
  settings: PublicFlowMindPartialOperationalSettings
  changedAt: string
}) {
  const previousSettings = resolvePublicFlowMindPartialOperationalSettings(args.entityProfile)
  const manualReason = previousSettings.automationMode !== args.settings.automationMode
    ? `manual-admin-control:${args.settings.automationMode}`
    : 'manual-admin-control'

  return {
    ...args.entityProfile,
    runtime: {
      ...args.entityProfile.runtime,
      flowMind: {
        ...args.entityProfile.runtime?.flowMind,
        publicPartial: {
          ...args.entityProfile.runtime?.flowMind?.publicPartial,
          rolloutPercentage: args.settings.rolloutPercentage,
          killSwitchEnabled: args.settings.killSwitchEnabled,
          automationMode: args.settings.automationMode,
          latencyBudgetMs: args.settings.latencyBudgetMs,
          criticalDivergenceThreshold: args.settings.criticalDivergenceThreshold,
          alertWebhook: {
            enabled: args.settings.alertWebhook.enabled,
            url: args.settings.alertWebhook.url,
            timeoutMs: args.settings.alertWebhook.timeoutMs,
            retryCount: args.settings.alertWebhook.retryCount,
          },
          autoRolloutPolicy: {
            ...args.entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy,
            lastAdjustment: {
              action: 'manual-update',
              source: 'manual',
              fromRolloutPercentage: previousSettings.rolloutPercentage,
              toRolloutPercentage: args.settings.rolloutPercentage,
              reason: manualReason,
              changedAt: args.changedAt,
            },
          },
          updatedAt: args.changedAt,
        },
        updatedAt: args.changedAt,
      },
    },
  }
}
