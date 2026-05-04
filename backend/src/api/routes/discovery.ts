import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { DiscoveryEngine } from '../../services/discoveryEngine.js'
import type { PublicCacheService } from '../../services/publicCacheService.js'
import type { GrowthEngine } from '../../domain/growth/GrowthEngine.js'
import { getRequestAuth, optionalAuth } from '../middleware/requireAuth.js'
import { buildLegacyOwnerId } from '../middleware/requireEntityOwner.js'
import { createRateLimit } from '../middleware/rateLimit.js'

type BackendContext = {
  backendContext: {
    discoveryEngine: DiscoveryEngine
    publicCacheService: PublicCacheService
    growthEngine: GrowthEngine
  }
}

function getDiscoveryEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.discoveryEngine
}

function getPublicCacheService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.publicCacheService
}

function getGrowthEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.growthEngine
}

const publicDiscoveryRateLimit = createRateLimit({
  namespace: 'discover-public',
  max: 100,
  windowMs: 60_000,
  key: 'ip',
})

export async function registerDiscoveryRoutes(app: FastifyInstance) {
  // Public discovery surface. Auth is optional and only enriches ranking context.
  app.get<{
      Querystring: {
        referenceEntityId?: string
        species?: string
        category?: string
        limit?: string
      }
    }>('/discover', { preHandler: [optionalAuth, publicDiscoveryRateLimit] }, async (
    request,
    reply: FastifyReply,
  ) => {
    const auth = getRequestAuth(request)
    const ownerId = auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : undefined
    const limit = Number.isFinite(Number(request.query.limit)) ? Math.min(Number(request.query.limit), 50) : undefined
    const cacheKey = `discover:${ownerId ?? 'anon'}:${request.query.referenceEntityId ?? ''}:${request.query.species ?? ''}:${request.query.category ?? ''}:${limit ?? ''}`
    const result = await getPublicCacheService(app).getOrSet(cacheKey, 20_000, () => getDiscoveryEngine(app).recommendEntities({
      ownerId: auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : undefined,
      referenceEntityId: request.query.referenceEntityId,
      species: request.query.species,
      category: request.query.category,
      limit,
    }))
    await getGrowthEngine(app).trackDiscoveryExposure({
      ownerId,
      actorId: auth ? `user:${auth.userId}:tenant:${auth.tenantId}` : request.ip,
      items: result.items.map((item) => ({
        entityId: item.entityId,
        score: item.score,
      })),
      query: {
        species: request.query.species ?? '',
        category: request.query.category ?? '',
      },
    })
    reply.header('Cache-Control', 'public, max-age=20, stale-while-revalidate=40')
    return {
      status: 'ready',
      discovery: result,
    }
  })

  app.get<{
      Querystring: {
        species?: string
        category?: string
        limit?: string
      }
    }>('/entities/trending', { preHandler: [optionalAuth, publicDiscoveryRateLimit] }, async (
    request,
    reply: FastifyReply,
  ) => {
    const auth = getRequestAuth(request)
    const ownerId = auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : undefined
    const limit = Number.isFinite(Number(request.query.limit)) ? Math.min(Number(request.query.limit), 50) : undefined
    const cacheKey = `trending:${ownerId ?? 'anon'}:${request.query.species ?? ''}:${request.query.category ?? ''}:${limit ?? ''}`
    const result = await getPublicCacheService(app).getOrSet(cacheKey, 20_000, () => getDiscoveryEngine(app).trendingEntities({
      ownerId: auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : undefined,
      species: request.query.species,
      category: request.query.category,
      limit,
    }))
    reply.header('Cache-Control', 'public, max-age=20, stale-while-revalidate=40')
    return {
      status: 'ready',
      trending: result,
    }
  })
}
