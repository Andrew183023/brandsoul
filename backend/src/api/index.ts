import type { FastifyInstance } from 'fastify'

import { registerAuthRoutes } from '../auth/authRoutes.js'
import { registerAssetRoutes } from './routes/assets.js'
import { registerDiscoveryRoutes } from './routes/discovery.js'
import { registerEntityRoutes } from './routes/entity.js'
import { registerFeedRoutes } from './routes/feed.js'
import { registerGrowthRoutes } from './routes/growth.js'
import { registerHealthRoute } from './routes/health.js'
import { registerJobRoutes } from './routes/jobs.js'
import { registerMetricsRoute } from './routes/metrics.js'
import { registerOrchestratorRoutes } from './routes/orchestrator.js'
import { registerCaseRoutes } from '../modules/legalCases/caseRoutes.js'

export async function registerApi(app: FastifyInstance) {
  await registerAuthRoutes(app)
  await registerAssetRoutes(app)
  await registerHealthRoute(app)
  await registerMetricsRoute(app)
  await registerJobRoutes(app)
  await registerGrowthRoutes(app)
  await registerDiscoveryRoutes(app)
  await registerOrchestratorRoutes(app)
  await registerEntityRoutes(app)
  await registerCaseRoutes(app)
  await registerFeedRoutes(app)
}
