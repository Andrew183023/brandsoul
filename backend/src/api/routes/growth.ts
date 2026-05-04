import type { FastifyInstance } from 'fastify'

import type { GrowthEngine } from '../../domain/growth/GrowthEngine.js'
import { requireAuth, getRequestAuth } from '../middleware/requireAuth.js'
import { buildLegacyOwnerId, requireEntityOwner } from '../middleware/requireEntityOwner.js'

type BackendContext = {
  backendContext: {
    growthEngine: GrowthEngine
  }
}

function getGrowthEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.growthEngine
}

function sanitizeLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, max)
}

export async function registerGrowthRoutes(app: FastifyInstance) {
  // Authenticated growth surfaces derived from the current owner context.
  app.get<{
    Querystring: {
      limit?: string
    }
  }>('/me/growth', { preHandler: requireAuth }, async (request) => {
    const auth = getRequestAuth(request)!
    const ownerId = buildLegacyOwnerId(auth.userId, auth.tenantId)
    const overview = await getGrowthEngine(app).getOwnerOverview(
      ownerId,
      sanitizeLimit(request.query.limit, 10, 50),
    )

    return {
      status: 'ready',
      ownerId,
      overview,
    }
  })

  app.get<{
    Querystring: {
      limit?: string
    }
  }>('/me/growth/top-entities', { preHandler: requireAuth }, async (request) => {
    const limit = sanitizeLimit(request.query.limit, 20, 50)
    const metrics = await getGrowthEngine(app).listTopEntities(limit)

    return {
      status: 'ready',
      items: metrics,
    }
  })

  app.get<{
    Params: { id: string }
  }>('/entity/:id/growth', { preHandler: [requireAuth, requireEntityOwner] }, async (request) => {
    const metrics = await getGrowthEngine(app).getEntityMetrics(request.params.id)
    return {
      status: 'ready',
      entityId: request.params.id,
      metrics,
    }
  })

  app.post<{
    Params: { id: string }
    Body: {
      invitedUserId?: string
      invitedIdentifier?: string
      metadata?: Record<string, unknown>
    }
  }>('/entity/:id/referrals', { preHandler: [requireAuth, requireEntityOwner] }, async (request) => {
    const referral = await getGrowthEngine(app).createReferral({
      ownerId: request.entityRecord?.ownerId,
      inviterEntityId: request.params.id,
      invitedUserId: request.body.invitedUserId,
      invitedIdentifier: request.body.invitedIdentifier,
      metadata: request.body.metadata,
    })

    return {
      status: 'ready',
      referral,
    }
  })

  app.post<{
    Params: { referralId: string }
    Body: {
      invitedUserId?: string
    }
  }>('/referrals/:referralId/accept', { preHandler: requireAuth }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const referral = await getGrowthEngine(app).acceptReferral(request.params.referralId, String(auth.userId))

    if (!referral) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'REFERRAL_NOT_FOUND',
          message: `Referral "${request.params.referralId}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      referral,
    }
  })
}
