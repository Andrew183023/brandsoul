import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { ObservabilityService } from '../../services/observabilityService.js'

type BackendContext = {
  backendContext: {
    observability: ObservabilityService
  }
}

function getObservability(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.observability
}

function getRouteKey(request: FastifyRequest) {
  const route = request.routeOptions.url || request.url
  return `${request.method} ${route}`
}

export async function registerObservabilityHooks(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    request.observabilityStartedAt = Date.now()
    request.traceId = request.headers['x-request-id']?.toString() || request.id

    getObservability(app).increment('requests_total')

    request.log.info(
      {
        event: 'request.started',
        traceId: request.traceId,
        method: request.method,
        url: request.url,
      },
      'Request started',
    )
  })

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = request.observabilityStartedAt ?? Date.now()
    const durationMs = Date.now() - startedAt
    const routeKey = getRouteKey(request)

    getObservability(app).recordEndpointLatency(routeKey, durationMs, reply.statusCode)

    request.log.info(
      {
        event: 'request.completed',
        traceId: request.traceId,
        routeKey,
        statusCode: reply.statusCode,
        durationMs,
      },
      'Request completed',
    )
  })
}
