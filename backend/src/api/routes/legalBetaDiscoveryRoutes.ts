import type { FastifyInstance, FastifyRequest } from 'fastify'

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

function isPublishedLegalOfficeEntity(entity: { id: string; entityProfile: EntityProfile }) {
  const businessConfig = readEntityBusinessConfig(entity.entityProfile as EntityProfile)
  return businessConfig?.businessType === 'legal'
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function resolvePublicBaseUrl(request: FastifyRequest) {
  const forwardedProto = request.headers['x-forwarded-proto']
  const forwardedHost = request.headers['x-forwarded-host']
  const protocol = typeof forwardedProto === 'string'
    ? forwardedProto.split(',')[0]?.trim() || request.protocol
    : request.protocol
  const host = typeof forwardedHost === 'string'
    ? forwardedHost.split(',')[0]?.trim()
    : request.headers.host?.trim()

  return `${protocol}://${host || 'localhost'}`
}

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

  app.get('/sitemap.xml', { preHandler: [publicDiscoveryRateLimit] }, async (request, reply) => {
    const entities = await getRepository(app).listEntities<EntityProfile>(2_000)
    const baseUrl = resolvePublicBaseUrl(request)
    const publicOfficePaths = Array.from(new Set(
      entities
        .filter(isPublishedLegalOfficeEntity)
        .map((entity) => `/escritorios/${encodeURIComponent(entity.id)}`),
    ))
    const urls = ['/', ...publicOfficePaths]
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((url) => `  <url><loc>${escapeXml(`${baseUrl}${url}`)}</loc></url>`),
      '</urlset>',
    ].join('')

    return reply
      .header('Content-Type', 'application/xml')
      .send(xml)
  })
}
