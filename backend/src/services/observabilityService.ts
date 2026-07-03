export type CounterName =
  | 'entities_created'
  | 'exports_generated'
  | 'export_failures'
  | 'social_signals'
  | 'jobs_processed'
  | 'jobs_failed'
  | 'job_retries'
  | 'auth_failures'
  | 'auth_login_success'
  | 'auth_login_failure'
  | 'auth_refresh_success'
  | 'auth_refresh_failure'
  | 'auth_refresh_reuse_detected'
  | 'auth_logout'
  | 'auth_logout_all'
  | 'auth_token_emitted'
  | 'auth_token_validation_failed'
  | 'storage_failures'
  | 'orchestrator_events'
  | 'requests_total'

export type TimingMetric = {
  count: number
  totalMs: number
  avgMs: number
  maxMs: number
}

type ObservabilityServiceOptions = {
  maxSeries?: number
}

const DEFAULT_MAX_SERIES = 1000
const ALLOWED_LABEL_KEYS = new Set([
  'tenant_id',
  'entity_id',
  'source',
  'reason',
  'status',
  'event',
  'result',
  'pipeline',
  'stage',
  'operation',
  'mode',
  'decision',
])

const PROHIBITED_LABEL_KEYS = new Set([
  'requestid',
  'token',
  'fingerprint',
  'email',
  'phone',
  'telefone',
  'whatsapp',
  'clientname',
  'objective',
  'body',
  'timestamp',
])

export type EndpointMetric = {
  routeKey: string
  count: number
  totalMs: number
  avgMs: number
  maxMs: number
  lastStatusCode?: number
}

export type JobMetric = {
  jobType: string
  processed: number
  failed: number
  retried: number
  totalDurationMs: number
  avgDurationMs: number
  maxDurationMs: number
}

export class ObservabilityService {
  private readonly counters = new Map<CounterName, number>()
  private readonly endpointMetrics = new Map<string, EndpointMetric>()
  private readonly jobMetrics = new Map<string, JobMetric>()
  private readonly customCounters = new Map<string, number>()
  private readonly customCounterSeries = new Map<string, number>()
  private readonly customGauges = new Map<string, number>()
  private readonly customTimings = new Map<string, TimingMetric>()

  constructor(private readonly options: ObservabilityServiceOptions = {}) {}

  private normalizeLabelValue(value: string) {
    return value.trim().replace(/\s+/g, '_').toLowerCase()
  }

  private normalizeLabels(labels?: Record<string, string>) {
    if (!labels || Object.keys(labels).length === 0) {
      return undefined
    }

    const normalized: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(labels)) {
      const key = rawKey.trim().toLowerCase()
      if (!key) {
        return undefined
      }

      if (PROHIBITED_LABEL_KEYS.has(key) || !ALLOWED_LABEL_KEYS.has(key)) {
        return undefined
      }

      const value = this.normalizeLabelValue(String(rawValue))
      if (!value) {
        return undefined
      }

      normalized[key] = value
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined
  }

  private buildSeriesKey(name: string, labels?: Record<string, string>) {
    const normalizedLabels = this.normalizeLabels(labels)
    if (!normalizedLabels) {
      return name
    }

    const serializedLabels = Object.entries(normalizedLabels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(',')

    return `${name}{${serializedLabels}}`
  }

  private canCreateSeries(target: Map<string, unknown>, key: string) {
    if (target.has(key)) {
      return true
    }

    return target.size < (this.options.maxSeries ?? DEFAULT_MAX_SERIES)
  }

  increment(name: CounterName, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value)
  }

  incrementMetric(name: string, value = 1, labels?: Record<string, string>) {
    this.customCounters.set(name, (this.customCounters.get(name) ?? 0) + value)

    const key = this.buildSeriesKey(name, labels)
    if (key !== name && this.canCreateSeries(this.customCounterSeries, key)) {
      this.customCounterSeries.set(key, (this.customCounterSeries.get(key) ?? 0) + value)
    }
  }

  setGauge(name: string, value: number, labels?: Record<string, string>) {
    const key = this.buildSeriesKey(name, labels)
    if (key === name || this.canCreateSeries(this.customGauges, key)) {
      this.customGauges.set(key, value)
    }
  }

  recordTiming(name: string, durationMs: number, labels?: Record<string, string>) {
    const key = this.buildSeriesKey(name, labels)
    if (key !== name && !this.canCreateSeries(this.customTimings, key)) {
      return
    }

    const current = this.customTimings.get(key) ?? {
      count: 0,
      totalMs: 0,
      avgMs: 0,
      maxMs: 0,
    }

    current.count += 1
    current.totalMs += durationMs
    current.avgMs = current.totalMs / current.count
    current.maxMs = Math.max(current.maxMs, durationMs)
    this.customTimings.set(key, current)
  }

  recordEndpointLatency(routeKey: string, durationMs: number, statusCode?: number) {
    const current = this.endpointMetrics.get(routeKey) ?? {
      routeKey,
      count: 0,
      totalMs: 0,
      avgMs: 0,
      maxMs: 0,
      lastStatusCode: undefined,
    }

    current.count += 1
    current.totalMs += durationMs
    current.avgMs = current.totalMs / current.count
    current.maxMs = Math.max(current.maxMs, durationMs)
    current.lastStatusCode = statusCode
    this.endpointMetrics.set(routeKey, current)
  }

  private getJobMetric(jobType: string) {
    const current = this.jobMetrics.get(jobType) ?? {
      jobType,
      processed: 0,
      failed: 0,
      retried: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      maxDurationMs: 0,
    }

    this.jobMetrics.set(jobType, current)
    return current
  }

  recordJobExecution(jobType: string, durationMs: number) {
    const current = this.getJobMetric(jobType)
    current.processed += 1
    current.totalDurationMs += durationMs
    current.avgDurationMs = current.totalDurationMs / current.processed
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs)
  }

  recordJobFailure(jobType: string) {
    const current = this.getJobMetric(jobType)
    current.failed += 1
  }

  recordJobRetry(jobType: string) {
    const current = this.getJobMetric(jobType)
    current.retried += 1
  }

  getMetricsSnapshot() {
    return {
      counters: {
        entitiesCreated: this.counters.get('entities_created') ?? 0,
        exportsGenerated: this.counters.get('exports_generated') ?? 0,
        exportFailures: this.counters.get('export_failures') ?? 0,
        socialSignals: this.counters.get('social_signals') ?? 0,
        jobsProcessed: this.counters.get('jobs_processed') ?? 0,
        jobsFailed: this.counters.get('jobs_failed') ?? 0,
        jobRetries: this.counters.get('job_retries') ?? 0,
        authFailures: this.counters.get('auth_failures') ?? 0,
        authLoginSuccess: this.counters.get('auth_login_success') ?? 0,
        authLoginFailure: this.counters.get('auth_login_failure') ?? 0,
        authRefreshSuccess: this.counters.get('auth_refresh_success') ?? 0,
        authRefreshFailure: this.counters.get('auth_refresh_failure') ?? 0,
        authRefreshReuseDetected: this.counters.get('auth_refresh_reuse_detected') ?? 0,
        authLogout: this.counters.get('auth_logout') ?? 0,
        authLogoutAll: this.counters.get('auth_logout_all') ?? 0,
        authTokenEmitted: this.counters.get('auth_token_emitted') ?? 0,
        authTokenValidationFailed: this.counters.get('auth_token_validation_failed') ?? 0,
        storageFailures: this.counters.get('storage_failures') ?? 0,
        orchestratorEvents: this.counters.get('orchestrator_events') ?? 0,
        requestsTotal: this.counters.get('requests_total') ?? 0,
      },
      endpoints: Array.from(this.endpointMetrics.values())
        .sort((left, right) => right.count - left.count),
      jobs: Array.from(this.jobMetrics.values())
        .sort((left, right) => right.processed - left.processed),
      customCounters: Object.fromEntries(
        Array.from(this.customCounters.entries())
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      customCounterSeries: Object.fromEntries(
        Array.from(this.customCounterSeries.entries())
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      customGauges: Object.fromEntries(
        Array.from(this.customGauges.entries())
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      customTimings: Object.fromEntries(
        Array.from(this.customTimings.entries())
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      collectedAt: new Date().toISOString(),
    }
  }
}

export function createObservabilityService(options?: ObservabilityServiceOptions) {
  return new ObservabilityService(options)
}
