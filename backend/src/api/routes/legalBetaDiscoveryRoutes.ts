import type { FastifyInstance } from 'fastify'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { buildPublicOfficeProfile, readEntityBusinessConfig } from './legalBetaSupport.js'

type BackendContext = {
  backendContext: {
    entityRepository: EntityRepository
  }
}

function getRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

const publicDiscoveryRateLimit = createRateLimit({
  namespace: 'discover-legal-beta',
  max: 100,
  windowMs: 60_000,
  key: 'ip',
})

export async function registerLegalBetaDiscoveryRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      category?: string
      limit?: string
    }
  }>('/discover', { preHandler: [publicDiscoveryRateLimit] }, async (request, reply) => {
    const limit = Number.isFinite(Number(request.query.limit)) ? Math.min(Math.max(Number(request.query.limit), 1), 24) : 12
    const requestedCategory = request.query.category?.trim().toLowerCase()

    const entities = await getRepository(app).listEntities<EntityProfile>(200)
    const items = entities
      .filter((entity) => {
        const businessConfig = readEntityBusinessConfig(entity.entityProfile as EntityProfile)
        if (businessConfig?.businessType !== 'legal') {
          return false
        }

        if (!requestedCategory || requestedCategory === 'legal-services') {
          return true
        }

        return false
      })
      .map((entity, index) => ({
        entityId: entity.id,
        score: Math.max(0.5, 1 - (index * 0.03)),
        publicProfile: {
          name: buildPublicOfficeProfile(entity.id, entity.entityProfile as EntityProfile).name,
        },
      }))
      .slice(0, limit)

    reply.header('Cache-Control', 'public, max-age=20, stale-while-revalidate=40')
    return {
      status: 'ready',
      discovery: {
        items,
      },
    }
  })


}
