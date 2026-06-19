import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { getRequestAuth, requireAuth } from '../middleware/requireAuth.js'
import { createRegionalGrowthRepository } from '../../modules/growth/regionalGrowthRepository.js'
import { createSeoGeneratorService } from '../../modules/growth/seoGeneratorService.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
  }
}

type CreateCampaignBody = {
  entityId?: string
  campaignName?: string
  states?: string[]
  cities?: string[]
  radiusKm?: number
  specialties?: string[]
  objective?: 'visibility' | 'lead_capture' | 'emergency_24h' | 'institutional'
  budgetDaily?: number
  budgetMonthly?: number
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function getRegionalGrowthRepository(app: FastifyInstance) {
  return createRegionalGrowthRepository(getConnection(app))
}

const privateReadRateLimit = createRateLimit({
  namespace: 'growth-read',
  max: 120,
  windowMs: 60_000,
  key: 'user',
})

const privateWriteRateLimit = createRateLimit({
  namespace: 'growth-write',
  max: 40,
  windowMs: 60_000,
  key: 'user',
})

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export async function registerRegionalGrowthRoutes(app: FastifyInstance) {
  app.get<{ Params: { city: string; specialty: string } }>('/p/:city/:specialty', { preHandler: [privateReadRateLimit] }, async (request, reply) => {
    const slug = `/p/${request.params.city}/${request.params.specialty}`
    const page = await getRegionalGrowthRepository(app).getSeoLandingPageBySlug(slug)

    if (!page) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'SEO_LANDING_PAGE_NOT_FOUND',
          message: `Landing page "${slug}" was not found.`,
        },
      })
    }

    return {
      status: 'ready' as const,
      page,
    }
  })

  app.get('/growth/campaigns', { preHandler: [requireAuth, privateReadRateLimit] }, async (request) => {
    const auth = getRequestAuth(request)!
    const campaigns = await getRegionalGrowthRepository(app).listCampaignsByTenant(String(auth.tenantId))

    return {
      status: 'ready' as const,
      tenantId: auth.tenantId,
      campaigns,
    }
  })

  app.post<{ Body: CreateCampaignBody }>('/growth/campaigns', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const body = request.body ?? {}

    const entityId = body.entityId?.trim()
    const campaignName = body.campaignName?.trim()

    if (!entityId || !campaignName || campaignName.length < 3) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_GROWTH_CAMPAIGN_INPUT',
          message: 'entityId and campaignName are required.',
        },
      })
    }

    if (body.states !== undefined && !isStringArray(body.states)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_GROWTH_CAMPAIGN_STATES',
          message: 'states must be a string array.',
        },
      })
    }

    if (body.cities !== undefined && !isStringArray(body.cities)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_GROWTH_CAMPAIGN_CITIES',
          message: 'cities must be a string array.',
        },
      })
    }

    if (body.specialties !== undefined && !isStringArray(body.specialties)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_GROWTH_CAMPAIGN_SPECIALTIES',
          message: 'specialties must be a string array.',
        },
      })
    }

    const campaign = await getRegionalGrowthRepository(app).createCampaign({
      tenantId: String(auth.tenantId),
      entityId,
      campaignName,
      states: body.states,
      cities: body.cities,
      radiusKm: body.radiusKm,
      specialties: body.specialties,
      objective: body.objective,
      budgetDaily: body.budgetDaily,
      budgetMonthly: body.budgetMonthly,
    })

    return reply.status(201).send({
      status: 'ready' as const,
      campaign,
    })
  })

  app.post<{ Params: { id: string } }>('/growth/campaigns/:id/activate', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const campaign = await getRegionalGrowthRepository(app).activateCampaign(String(auth.tenantId), request.params.id)

    if (!campaign) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'GROWTH_CAMPAIGN_NOT_FOUND',
          message: `Campaign "${request.params.id}" was not found.`,
        },
      })
    }

    const pages = await createSeoGeneratorService(getConnection(app)).generatePagesForCampaign(campaign)

    const refreshedCampaign = await getRegionalGrowthRepository(app).getCampaignById(String(auth.tenantId), request.params.id)

    return {
      status: 'ready' as const,
      campaign: refreshedCampaign ?? campaign,
      seoPages: pages,
    }
  })
}
