import type { FastifyInstance } from 'fastify'

import { registerAuthRoutes } from '../auth/authRoutes.js'
import { registerAssetRoutes } from './routes/assets.js'
import { registerLegalBetaCaseRoutes } from './routes/legalBetaCaseRoutes.js'
import { registerLegalBetaClientPortalRoutes } from './routes/legalBetaClientPortalRoutes.js'
import { registerLegalBetaDiscoveryRoutes } from './routes/legalBetaDiscoveryRoutes.js'
import { registerLegalBetaGrowthIntelligenceRoutes } from './routes/legalBetaGrowthIntelligenceRoutes.js'
import { registerLegalBetaHealthRoute } from './routes/legalBetaHealthRoute.js'
import { registerLegalBetaOperationalIntelligenceRoutes } from './routes/legalBetaOperationalIntelligenceRoutes.js'
import { registerLegalBetaInternalReplayAdminRoutes } from './routes/legalBetaInternalReplayAdminRoutes.js'
import { registerInternalOwnershipCollisionInventoryRoutes } from './routes/internalOwnershipCollisionInventory.js'
import { registerLegalBetaPublicOfficeRoutes } from './routes/legalBetaPublicOfficeRoutes.js'
import { registerRegionalGrowthRoutes } from './routes/regionalGrowthRoutes.js'

export async function registerLegalBetaApi(app: FastifyInstance) {
  await registerAuthRoutes(app)
  await registerAssetRoutes(app)
  await registerLegalBetaHealthRoute(app)
  await registerInternalOwnershipCollisionInventoryRoutes(app)
  await registerLegalBetaInternalReplayAdminRoutes(app)
  await registerLegalBetaDiscoveryRoutes(app)
  await registerLegalBetaPublicOfficeRoutes(app)
  await registerLegalBetaClientPortalRoutes(app)
  await registerLegalBetaCaseRoutes(app)
  await registerLegalBetaOperationalIntelligenceRoutes(app)
  await registerLegalBetaGrowthIntelligenceRoutes(app)
  await registerRegionalGrowthRoutes(app)
}
