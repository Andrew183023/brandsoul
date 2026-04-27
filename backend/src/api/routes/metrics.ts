import type { FastifyInstance } from 'fastify'

import type { ObservabilityService } from '../../services/observabilityService.js'
import { requireAuth } from '../middleware/requireAuth.js'

type BackendContext = {
  backendContext: {
    observability: ObservabilityService
  }
}

function getObservability(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.observability
}

export async function registerMetricsRoute(app: FastifyInstance) {
  // Operational metrics are authenticated-only.
  app.get('/metrics', { preHandler: requireAuth }, async () => {
    return {
      status: 'ready',
      metrics: getObservability(app).getMetricsSnapshot(),
    }
  })
}
