import type { FastifyReply, FastifyRequest } from 'fastify'

import { getRequestAuth } from './requireAuth.js'

type RateLimitKey =
  | 'ip'
  | 'user'
  | ((request: FastifyRequest) => string)

type RateLimitOptions = {
  namespace: string
  max: number
  windowMs: number
  key: RateLimitKey
}

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function resolveKey(request: FastifyRequest, key: RateLimitKey): string {
  if (typeof key === 'function') {
    return key(request)
  }

  if (key === 'user') {
    const auth = getRequestAuth(request)
    if (auth) {
      return `user:${auth.userId}:tenant:${auth.tenantId}`
    }
  }

  return request.ip || 'unknown'
}

function cleanupExpired(now: number) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function createRateLimit(options: RateLimitOptions) {
  return async function rateLimit(request: FastifyRequest, reply: FastifyReply) {
    const now = Date.now()
    cleanupExpired(now)

    const key = `${options.namespace}:${resolveKey(request, options.key)}`
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      })

      reply.header('X-RateLimit-Limit', options.max)
      reply.header('X-RateLimit-Remaining', Math.max(0, options.max - 1))
      return
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      reply.header('Retry-After', retryAfterSeconds)
      reply.header('X-RateLimit-Limit', options.max)
      reply.header('X-RateLimit-Remaining', 0)
      request.log.warn(
        {
          event: 'rate_limit.blocked',
          traceId: (request as FastifyRequest & { traceId?: string }).traceId ?? request.id,
          namespace: options.namespace,
          key,
        },
        'Request blocked by rate limit',
      )

      return reply.status(429).send({
        status: 'failed',
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again later.',
        },
      })
    }

    current.count += 1
    buckets.set(key, current)
    reply.header('X-RateLimit-Limit', options.max)
    reply.header('X-RateLimit-Remaining', Math.max(0, options.max - current.count))
  }
}
