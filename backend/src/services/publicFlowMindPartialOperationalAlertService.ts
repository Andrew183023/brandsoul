import { resolvePublicFlowMindPartialOperationalSettings } from './publicFlowMindPartialService.js'

type JsonRecord = Record<string, unknown>

type OperationalAlert = {
  code: string
  severity: 'warning' | 'critical'
  title: string
  summary: string
  recommendedAction?: string
}

type PolicyRecommendation = {
  action?: string
  status?: string
  currentRolloutPercentage?: number
  targetRolloutPercentage?: number
}

type PartialAggregation = {
  alerts?: OperationalAlert[]
  fallbackRate?: number
  avgDivergenceScore?: number
  shadowComparison?: {
    divergenceDelta?: number
  }
  avgLatencyFlowMind?: number
  criticalInconsistencyCount?: number
  inconsistencyRate?: number
  rolloutPercentage?: number
  readinessState?: string
  automationMode?: string
  policyEnabled?: boolean
  operationalRisk?: string
  policyRecommendation: PolicyRecommendation
}

type EventLogRepositoryLike = {
  logEvent(input: {
    entityId: string
    type: string
    timestamp: string
    payload: JsonRecord
  }): Promise<unknown>
}

type ObservabilityLike = {
  incrementMetric?(name: string, value?: number, tags?: Record<string, string>): void
}

type LoggerLike = {
  warn(payload: Record<string, unknown>, message?: string): void
  error(payload: Record<string, unknown>, message?: string): void
}

type EntityProfileLike = {
  runtime?: {
    flowMind?: {
      publicPartial?: {
        autoRolloutPolicy?: {
          operationalAlertState?: Record<string, OperationalAlertState>
        }
      }
    }
  }
} & Record<string, unknown>

type OperationalAlertState = {
  fingerprint: string
  severity: OperationalAlert['severity']
  active: boolean
  lastObservedAt: string
  lastEmittedAt?: string
  lastResolvedAt?: string
}

type WebhookPublisher = {
  publish(alert: JsonRecord): Promise<void>
}

export type PublicFlowMindPartialOperationalAlertEventRecord = {
  entityId: string
  type: 'flowmind.public_partial.alert.triggered'
  timestamp: string
  payload: JsonRecord
}

const DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_REEMIT_WINDOW_MS = 5 * 60 * 1000
const PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_RETRY_DELAY_MS = 250

function parseTimestamp(value?: string) {
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildOperationalAlertFingerprint(args: {
  entityId: string
  code: string
  severity: OperationalAlert['severity']
}) {
  return `${args.entityId}:${args.code}:${args.severity}`
}

function toJsonObject<T>(value: T): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableWebhookStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function buildWebhookTransportError(message: string, status?: number) {
  const error = new Error(message) as Error & { status?: number }
  if (typeof status === 'number') {
    error.status = status
  }
  return error
}

function resolveAlertWebhookConfig(entityProfile?: EntityProfileLike) {
  if (!entityProfile) {
    return undefined
  }

  const config = resolvePublicFlowMindPartialOperationalSettings(entityProfile as never).alertWebhook
  if (!config.enabled || !config.url) {
    return undefined
  }

  return {
    url: config.url,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
  }
}

export function resolvePublicFlowMindPartialOperationalAlertWebhookPublisher(args: {
  entityProfile?: EntityProfileLike
  fetchImpl?: typeof fetch
}): WebhookPublisher | undefined {
  const config = resolveAlertWebhookConfig(args.entityProfile)
  if (!config) {
    return undefined
  }

  const fetchImpl = args.fetchImpl ?? fetch

  return {
    async publish(alert) {
      let lastError: Error | undefined

      for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

        try {
          const response = await fetchImpl(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(alert),
            signal: controller.signal,
          })

          if (response.ok) {
            clearTimeout(timeout)
            return
          }

          const errorBody = await response.text()
          const statusMessage = errorBody.trim() ? ` ${errorBody.trim()}` : ''
          const error = buildWebhookTransportError(
            `Webhook responded with status ${response.status}.${statusMessage}`.trim(),
            response.status,
          )

          if (!isRetryableWebhookStatus(response.status) || attempt >= config.retryCount) {
            clearTimeout(timeout)
            throw error
          }

          lastError = error
        } catch (error) {
          const normalizedError =
            error instanceof Error
              ? error.name === 'AbortError'
                ? buildWebhookTransportError(`Webhook request timed out after ${config.timeoutMs}ms`)
                : error
              : new Error(String(error))

          if (attempt >= config.retryCount) {
            clearTimeout(timeout)
            throw normalizedError
          }

          lastError = normalizedError
        } finally {
          clearTimeout(timeout)
        }

        await delay(PUBLIC_FLOWMIND_PARTIAL_ALERT_WEBHOOK_RETRY_DELAY_MS)
      }

      throw lastError ?? new Error('Webhook request failed')
    },
  }
}

function buildOperationalAlertRecord(args: {
  entityId: string
  requestId: string
  observedAt: string
  aggregation: PartialAggregation
  alert: OperationalAlert
}) {
  return {
    event: 'flowmind.public_partial.alert',
    level: args.alert.severity,
    entityId: args.entityId,
    requestId: args.requestId,
    observedAt: args.observedAt,
    code: args.alert.code,
    title: args.alert.title,
    summary: args.alert.summary,
    recommendedAction: args.alert.recommendedAction,
    metrics: {
      fallbackRate: args.aggregation.fallbackRate,
      avgDivergenceScore: args.aggregation.avgDivergenceScore,
      divergenceDelta: args.aggregation.shadowComparison?.divergenceDelta,
      avgLatencyFlowMind: args.aggregation.avgLatencyFlowMind,
      criticalInconsistencyCount: args.aggregation.criticalInconsistencyCount,
      inconsistencyRate: args.aggregation.inconsistencyRate,
      rolloutPercentage: args.aggregation.rolloutPercentage,
    },
    policy: {
      readinessState: args.aggregation.readinessState,
      automationMode: args.aggregation.automationMode,
      policyEnabled: args.aggregation.policyEnabled,
      operationalRisk: args.aggregation.operationalRisk,
    },
    recommendation: {
      action: args.aggregation.policyRecommendation?.action,
      status: args.aggregation.policyRecommendation?.status,
      currentRolloutPercentage: args.aggregation.policyRecommendation?.currentRolloutPercentage,
      targetRolloutPercentage: args.aggregation.policyRecommendation?.targetRolloutPercentage,
    },
  }
}

function readOperationalAlertState(entityProfile?: EntityProfileLike) {
  return entityProfile?.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.operationalAlertState ?? {}
}

function shouldEmitOperationalAlert(args: {
  entityId: string
  observedAt: string
  alert: OperationalAlert
  previousState?: OperationalAlertState
}) {
  const fingerprint = buildOperationalAlertFingerprint({
    entityId: args.entityId,
    code: args.alert.code,
    severity: args.alert.severity,
  })

  const previous = args.previousState
  if (!previous) {
    return true
  }
  if (previous.fingerprint !== fingerprint) {
    return true
  }
  if (!previous.active) {
    return true
  }

  const observedAtMs = parseTimestamp(args.observedAt)
  const lastEmittedAtMs = parseTimestamp(previous.lastEmittedAt)
  if (typeof observedAtMs !== 'number' || typeof lastEmittedAtMs !== 'number') {
    return true
  }

  return observedAtMs - lastEmittedAtMs >= DEFAULT_PUBLIC_FLOWMIND_PARTIAL_ALERT_REEMIT_WINDOW_MS
}

function applyOperationalAlertState(args: {
  entityProfile?: EntityProfileLike
  entityId: string
  observedAt: string
  aggregation: PartialAggregation
}) {
  const previousState = readOperationalAlertState(args.entityProfile)
  const nextState: Record<string, OperationalAlertState> = { ...previousState }
  const activeAlertCodes = new Set(args.aggregation?.alerts?.map((alert) => alert.code) ?? [])
  const alertsToEmit: OperationalAlert[] = []

  for (const [rawCode, state] of Object.entries(previousState)) {
    const code = rawCode
    if (!activeAlertCodes.has(code) && state.active) {
      nextState[code] = {
        ...state,
        active: false,
        lastObservedAt: args.observedAt,
        lastResolvedAt: args.observedAt,
      }
    }
  }

  for (const alert of args.aggregation?.alerts ?? []) {
    const previous = previousState[alert.code]
    const shouldEmit = shouldEmitOperationalAlert({
      entityId: args.entityId,
      observedAt: args.observedAt,
      alert,
      previousState: previous,
    })

    const fingerprint = buildOperationalAlertFingerprint({
      entityId: args.entityId,
      code: alert.code,
      severity: alert.severity,
    })

    nextState[alert.code] = {
      fingerprint,
      severity: alert.severity,
      active: true,
      lastObservedAt: args.observedAt,
      lastEmittedAt: shouldEmit ? args.observedAt : previous?.lastEmittedAt,
      lastResolvedAt: undefined,
    }

    if (shouldEmit) {
      alertsToEmit.push(alert)
    }
  }

  const entityProfile = args.entityProfile
    ? {
        ...args.entityProfile,
        runtime: {
          ...args.entityProfile.runtime,
          flowMind: {
            ...args.entityProfile.runtime?.flowMind,
            publicPartial: {
              ...args.entityProfile.runtime?.flowMind?.publicPartial,
              autoRolloutPolicy: {
                ...args.entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy,
                operationalAlertState: nextState,
              },
            },
          },
        },
      }
    : undefined

  return {
    entityProfile,
    alertsToEmit,
  }
}

export async function emitPublicFlowMindPartialOperationalAlerts(args: {
  entityProfile?: EntityProfileLike
  entityId: string
  requestId: string
  observedAt: string
  aggregation: PartialAggregation
  logger: LoggerLike
  observability?: ObservabilityLike
  eventLogRepository?: EventLogRepositoryLike
  webhookPublisher?: WebhookPublisher
}) {
  const { entityProfile, alertsToEmit } = applyOperationalAlertState({
    entityProfile: args.entityProfile,
    entityId: args.entityId,
    observedAt: args.observedAt,
    aggregation: args.aggregation,
  })
  const eventRecords: PublicFlowMindPartialOperationalAlertEventRecord[] = []

  for (const alert of alertsToEmit) {
    const record = buildOperationalAlertRecord({
      entityId: args.entityId,
      requestId: args.requestId,
      observedAt: args.observedAt,
      aggregation: args.aggregation,
      alert,
    })
    eventRecords.push({
      entityId: args.entityId,
      type: 'flowmind.public_partial.alert.triggered',
      timestamp: args.observedAt,
      payload: toJsonObject(record),
    })

    if (record.level === 'critical') {
      args.logger.error(record, `Public partial critical alert: ${record.code}`)
    } else {
      args.logger.warn(record, `Public partial warning alert: ${record.code}`)
    }

    args.observability?.incrementMetric?.('flowmind_public_partial_alert_total', 1, {
      code: record.code,
      level: record.level,
      entityId: record.entityId,
    })

    if (args.eventLogRepository) {
      try {
        await args.eventLogRepository.logEvent({
          entityId: args.entityId,
          type: 'flowmind.public_partial.alert.triggered',
          timestamp: args.observedAt,
          payload: toJsonObject(record),
        })
      } catch (error) {
        args.logger.error(
          {
            event: 'flowmind.public_partial.alert.log_failed',
            entityId: args.entityId,
            requestId: args.requestId,
            observedAt: args.observedAt,
            code: alert.code,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to persist public partial operational alert',
        )
      }
    }

    if (args.webhookPublisher) {
      try {
        await args.webhookPublisher.publish(record)
      } catch (error) {
        args.logger.error(
          {
            event: 'flowmind.public_partial.alert.webhook_failed',
            entityId: args.entityId,
            requestId: args.requestId,
            observedAt: args.observedAt,
            code: alert.code,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to publish public partial operational alert webhook',
        )
      }
    }
  }

  return {
    entityProfile,
    emittedAlerts: alertsToEmit,
    eventRecords,
  }
}
