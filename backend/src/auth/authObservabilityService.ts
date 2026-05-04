import type { FastifyBaseLogger } from 'fastify'

import type { RefreshSessionRepository } from './repositories/refreshSessionRepository.js'
import type { SigningKeyRepository } from './repositories/signingKeyRepository.js'
import type { ObservabilityService } from '../services/observabilityService.js'

type AuthObservabilityLevel = 'info' | 'warn' | 'error'

type AuthEventPayload = {
  event: string
  flow: string
  reason?: string
  userId?: number
  tenantId?: number
  traceId?: string
  jti?: string
  kid?: string
}

type AuthRecentEvent = AuthEventPayload & {
  level: AuthObservabilityLevel
  timestamp: string
}

type RefreshSessionStatusCounts = Partial<Record<'active' | 'revoked' | 'reuse_detected' | 'rotated' | 'expired', number>>

type AuthObservabilitySnapshot = {
  counters: unknown[]
  gauges: unknown[]
  timings: unknown[]
  sessions: {
    active: number
    revoked: number
    reuseDetected: number
    byStatus: RefreshSessionStatusCounts
  }
  keys: {
    activeKid?: string
    validationKids: string[]
    latestRotationAt?: string
  }
  recentEvents: AuthRecentEvent[]
  collectedAt: string
}

type ObservabilityCompat = ObservabilityService & {
  incrementMetric?: (name: string, value?: number, labels?: Record<string, string>) => void
  setGauge?: (name: string, value: number, labels?: Record<string, string>) => void
  recordTiming?: (name: string, durationMs: number, labels?: Record<string, string>) => void
}

type RefreshSessionRepositoryCompat = RefreshSessionRepository & {
  countByStatus?: () => Promise<RefreshSessionStatusCounts>
}

function normalizeReason(reason: unknown) {
  const normalized = String(reason ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || 'unknown'
}

function mapAuthErrorReason(error: unknown) {
  const authError = error as {
    code?: string
    details?: {
      reason?: string
    }
  }

  if (typeof authError?.details?.reason === 'string') {
    return normalizeReason(authError.details.reason)
  }

  if (typeof authError?.code === 'string') {
    return normalizeReason(authError.code)
  }

  return 'unknown'
}

export class AuthObservabilityService {
  private readonly recentEvents: AuthRecentEvent[] = []

  constructor(
    private readonly observability: ObservabilityCompat,
    private readonly refreshSessionRepository: RefreshSessionRepositoryCompat,
    private readonly signingKeyRepository: SigningKeyRepository,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private incrementMetric(name: string, value = 1, labels?: Record<string, string>) {
    if (typeof this.observability.incrementMetric === 'function') {
      this.observability.incrementMetric(name, value, labels)
      return
    }

    // Compat fallback for the restored backend runtime.
    if (name === 'auth_login_success_total') this.observability.increment('auth_login_success', value)
    else if (name === 'auth_login_failure_total') this.observability.increment('auth_login_failure', value)
    else if (name === 'auth_refresh_success_total') this.observability.increment('auth_refresh_success', value)
    else if (name === 'auth_refresh_failure_total') this.observability.increment('auth_refresh_failure', value)
    else if (name === 'auth_refresh_reuse_detected_total') this.observability.increment('auth_refresh_reuse_detected', value)
    else if (name === 'auth_logout_total') this.observability.increment('auth_logout', value)
    else if (name === 'auth_logout_all_total') this.observability.increment('auth_logout_all', value)
    else if (name === 'auth_token_issued_total') this.observability.increment('auth_token_emitted', value)
    else if (name === 'auth_token_validation_failed_total') this.observability.increment('auth_token_validation_failed', value)
    else if (name === 'auth_jwks_failures_total') this.observability.increment('auth_failures', value)
  }

  private setGauge(name: string, value: number, labels?: Record<string, string>) {
    if (typeof this.observability.setGauge === 'function') {
      this.observability.setGauge(name, value, labels)
    }
  }

  private pushEvent(level: AuthObservabilityLevel, payload: AuthEventPayload) {
    const entry: AuthRecentEvent = {
      level,
      timestamp: new Date().toISOString(),
      ...payload,
    }

    this.recentEvents.unshift(entry)
    if (this.recentEvents.length > 100) {
      this.recentEvents.length = 100
    }

    this.logger[level](entry, `Auth event: ${entry.event}`)
  }

  recordLoginSuccess(args: { userId: number; tenantId: number; traceId?: string }) {
    this.incrementMetric('auth_login_success_total')
    this.pushEvent('info', {
      event: 'auth.login.success',
      flow: 'login',
      userId: args.userId,
      tenantId: args.tenantId,
      traceId: args.traceId,
    })
  }

  recordLoginFailure(args: { reason: string; traceId?: string }) {
    const reason = normalizeReason(args.reason)
    this.incrementMetric('auth_login_failure_total')
    this.incrementMetric('auth_login_failure_by_reason_total', 1, { reason })
    this.pushEvent('warn', {
      event: 'auth.login.failure',
      flow: 'login',
      reason,
      traceId: args.traceId,
    })
  }

  recordRefreshSuccess(args: { userId: number; tenantId: number; traceId?: string }) {
    this.incrementMetric('auth_refresh_success_total')
    this.pushEvent('info', {
      event: 'auth.refresh.success',
      flow: 'refresh',
      userId: args.userId,
      tenantId: args.tenantId,
      traceId: args.traceId,
    })
  }

  recordRefreshFailure(args: { reason: string; userId?: number; tenantId?: number; traceId?: string }) {
    const reason = normalizeReason(args.reason)
    this.incrementMetric('auth_refresh_failure_total')
    this.incrementMetric('auth_refresh_failure_by_reason_total', 1, { reason })
    this.pushEvent(reason === 'refresh_reuse_detected' ? 'error' : 'warn', {
      event: reason === 'refresh_reuse_detected' ? 'auth.refresh.reuse_detected' : 'auth.refresh.failure',
      flow: 'refresh',
      userId: args.userId,
      tenantId: args.tenantId,
      reason,
      traceId: args.traceId,
    })

    if (reason === 'refresh_reuse_detected') {
      this.incrementMetric('auth_refresh_reuse_detected_total')
    }
  }

  recordLogout(args: { userId?: number; tenantId?: number; traceId?: string }) {
    this.incrementMetric('auth_logout_total')
    this.pushEvent('info', {
      event: 'auth.logout',
      flow: 'logout',
      userId: args.userId,
      tenantId: args.tenantId,
      traceId: args.traceId,
    })
  }

  recordLogoutAll(args: { userId: number; tenantId: number; traceId?: string }) {
    this.incrementMetric('auth_logout_all_total')
    this.pushEvent('warn', {
      event: 'auth.logout_all',
      flow: 'logout_all',
      userId: args.userId,
      tenantId: args.tenantId,
      traceId: args.traceId,
    })
  }

  recordTokenIssued(args: {
    kid: string
    jti: string
    userId: number
    tenantId: number
    flow: 'login' | 'refresh'
    traceId?: string
  }) {
    this.incrementMetric('auth_token_issued_total')
    this.incrementMetric('auth_token_issued_by_kid_total', 1, { kid: args.kid })
    this.pushEvent('info', {
      event: 'auth.token.issued',
      flow: args.flow,
      userId: args.userId,
      tenantId: args.tenantId,
      jti: args.jti,
      kid: args.kid,
      traceId: args.traceId,
    })
  }

  recordTokenValidationFailure(args: { reason: string; kid?: string; jti?: string; traceId?: string }) {
    const reason = normalizeReason(args.reason)
    this.incrementMetric('auth_token_validation_failed_total')
    this.incrementMetric('auth_token_validation_failed_by_reason_total', 1, { reason })
    this.pushEvent('warn', {
      event: 'auth.token.validation_failed',
      flow: 'validation',
      kid: args.kid,
      jti: args.jti,
      reason,
      traceId: args.traceId,
    })
  }

  recordJwksRequest(args?: { kid?: string; traceId?: string }) {
    this.incrementMetric('auth_jwks_requests_total')
    this.pushEvent('info', {
      event: 'auth.jwks.request',
      flow: 'jwks',
      kid: args?.kid,
      traceId: args?.traceId,
    })
  }

  recordJwksServed(args?: { kid?: string; traceId?: string }) {
    this.pushEvent('info', {
      event: 'auth.jwks.served',
      flow: 'jwks',
      kid: args?.kid,
      traceId: args?.traceId,
    })
  }

  recordJwksFailure(args: { reason: string; traceId?: string }) {
    const reason = normalizeReason(args.reason)
    this.incrementMetric('auth_jwks_failures_total')
    this.pushEvent('error', {
      event: 'auth.jwks.failure',
      flow: 'jwks',
      reason,
      traceId: args.traceId,
    })
  }

  recordKeyRotation(args: { kid: string; previousKid?: string; reason?: string; traceId?: string }) {
    this.incrementMetric('auth_signing_key_rotation_total')
    this.pushEvent('warn', {
      event: 'auth.key.rotation',
      flow: 'key_rotation',
      kid: args.kid,
      reason: normalizeReason(args.reason ?? (args.previousKid ? 'active_kid_changed' : 'configured_active_key')),
      traceId: args.traceId,
    })
  }

  recordTiming(name: string, durationMs: number, labels?: Record<string, string>) {
    if (typeof this.observability.recordTiming === 'function') {
      this.observability.recordTiming(name, durationMs, labels)
    }
  }

  async syncSessionGauges() {
    const counts = typeof this.refreshSessionRepository.countByStatus === 'function'
      ? await this.refreshSessionRepository.countByStatus()
      : {}

    const active = counts.active ?? 0
    const revoked = counts.revoked ?? 0
    const reuseDetected = counts.reuse_detected ?? 0

    this.setGauge('auth_refresh_sessions_active_total', active)
    this.setGauge('auth_refresh_sessions_revoked_total', revoked)
    this.setGauge('auth_refresh_sessions_reuse_detected_total', reuseDetected)

    return {
      active,
      revoked,
      reuseDetected,
      byStatus: counts,
    }
  }

  async syncKeyGauges() {
    const now = new Date().toISOString()
    const activeKey = await this.signingKeyRepository.getActiveKey(now)
    const validationKeys = await this.signingKeyRepository.listValidationKeys(now)

    this.setGauge('auth_signing_key_active_info', activeKey ? 1 : 0, {
      kid: activeKey?.kid ?? 'none',
      alg: activeKey?.algorithm ?? 'RS256',
    })

    return {
      activeKid: activeKey?.kid,
      validationKids: validationKeys.map((key) => key.kid),
      activeKey,
      validationKeys,
    }
  }

  async getSnapshot(): Promise<AuthObservabilitySnapshot> {
    const [sessions, keys] = await Promise.all([
      this.syncSessionGauges(),
      this.syncKeyGauges(),
    ])

    const metrics = this.observability.getMetricsSnapshot()

    return {
      counters: [],
      gauges: [],
      timings: [],
      sessions,
      keys: {
        activeKid: keys.activeKid,
        validationKids: keys.validationKids,
        latestRotationAt: keys.activeKey?.updatedAt,
      },
      recentEvents: [...this.recentEvents],
      collectedAt: metrics.collectedAt ?? new Date().toISOString(),
    }
  }

  mapFailureReason(error: unknown) {
    return mapAuthErrorReason(error)
  }
}

export function createAuthObservabilityService(
  observability: ObservabilityService,
  refreshSessionRepository: RefreshSessionRepository,
  signingKeyRepository: SigningKeyRepository,
  logger: FastifyBaseLogger,
) {
  return new AuthObservabilityService(observability, refreshSessionRepository, signingKeyRepository, logger)
}
