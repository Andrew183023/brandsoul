import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { GlobalFeedEngine } from '../../services/globalFeedEngine.js'
import type { PublicCacheService } from '../../services/publicCacheService.js'
import { getRequestAuth, requireAuth } from '../middleware/requireAuth.js'
import { buildLegacyOwnerId } from '../middleware/requireEntityOwner.js'
import { createRateLimit } from '../middleware/rateLimit.js'

type BackendContext = {
  backendContext: {
    globalFeedEngine: GlobalFeedEngine
    publicCacheService: PublicCacheService
  }
}

function getGlobalFeedEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.globalFeedEngine
}

function getPublicCacheService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.publicCacheService
}

const publicFeedRateLimit = createRateLimit({
  namespace: 'feed-public',
  max: 120,
  windowMs: 60_000,
  key: 'ip',
})

const privateFeedRateLimit = createRateLimit({
  namespace: 'feed-private',
  max: 120,
  windowMs: 60_000,
  key: 'user',
})

export async function registerFeedRoutes(app: FastifyInstance) {
  // Public feed surface.
  app.get<{ Querystring: { limit?: string } }>('/feed', { preHandler: publicFeedRateLimit }, async (
    request: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const limit = Math.min(Math.max(Number(request.query.limit ?? 30), 1), 60)
    const cache = getPublicCacheService(app)
    const cacheKey = `feed:${limit}`
    const feed = await cache.getOrSet(cacheKey, 15_000, () => getGlobalFeedEngine(app).getFeed(Number.isFinite(limit) ? limit : 30))

    reply.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=45')
    return {
      status: 'ready',
      feed,
    }
  })

  // Private personalized feed derived from the authenticated owner context.
  app.get<{ Querystring: { limit?: string } }>('/feed/personalized', { preHandler: [requireAuth, privateFeedRateLimit] }, async (
    request,
  ) => {
    const auth = getRequestAuth(request)!
    const limit = Number(request.query.limit ?? 30)
    const ownerId = buildLegacyOwnerId(auth.userId, auth.tenantId)
    const feed = await getGlobalFeedEngine(app).getPersonalizedFeed(
      ownerId,
      Number.isFinite(limit) ? limit : 30,
    )

    return {
      status: 'ready',
      ownerId,
      authOwnerContext: {
        userId: auth.userId,
        tenantId: auth.tenantId,
      },
      feed,
    }
  })
}
