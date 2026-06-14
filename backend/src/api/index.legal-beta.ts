import type { FastifyInstance } from 'fastify'

import { registerAuthRoutes } from '../auth/authRoutes.js'
import { registerLegalBetaCaseRoutes } from './routes/legalBetaCaseRoutes.js'
import { registerLegalBetaClientPortalRoutes } from './routes/legalBetaClientPortalRoutes.js'
import { registerLegalBetaDiscoveryRoutes } from './routes/legalBetaDiscoveryRoutes.js'
import { registerLegalBetaHealthRoute } from './routes/legalBetaHealthRoute.js'
import { registerLegalBetaInternalReplayAdminRoutes } from './routes/legalBetaInternalReplayAdminRoutes.js'
import { registerInternalOwnershipCollisionInventoryRoutes } from './routes/internalOwnershipCollisionInventory.js'
import { registerLegalBetaPublicOfficeRoutes } from './routes/legalBetaPublicOfficeRoutes.js'

export async function registerLegalBetaApi(app: FastifyInstance) {
  await registerAuthRoutes(app)
  await registerLegalBetaHealthRoute(app)
  await registerInternalOwnershipCollisionInventoryRoutes(app)
  await registerLegalBetaInternalReplayAdminRoutes(app)
  await registerLegalBetaDiscoveryRoutes(app)
  await registerLegalBetaPublicOfficeRoutes(app)
  await registerLegalBetaClientPortalRoutes(app)
  await registerLegalBetaCaseRoutes(app)
}
