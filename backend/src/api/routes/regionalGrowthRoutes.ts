import type { FastifyInstance } from 'fastify'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { getRequestAuth, requireAuth } from '../middleware/requireAuth.js'
import { createRegionalGrowthRepository } from '../../modules/growth/regionalGrowthRepository.js'
import { recommendRadiusForSpecialty, type RadiusRecommendation } from '../../modules/growth/radiusRecommendationService.js'
import { createSeoGeneratorService } from '../../modules/growth/seoGeneratorService.js'
import { createLeadAttributionRepository } from '../../modules/growth/leadAttributionRepository.js'
import { createRegionalLeadRepository, type RegionalLeadUrgency } from '../../modules/growth/regionalLeadRepository.js'
import { createRegionalSignalsRepository } from '../../modules/growth/regionalSignalsRepository.js'
import { buildGrowthInsights } from '../../modules/growth/regionalGrowthInsightsService.js'
import { buildGrowthRecommendations } from '../../modules/growth/regionalGrowthRecommendationService.js'
import { executeGrowthRecommendation, GrowthRecommendationExecutionError } from '../../modules/growth/regionalGrowthExecutionService.js'
import { buildGrowthEconomicSummary } from '../../modules/growth/regionalGrowthEconomicService.js'
import { createEntityRepository } from '../../repositories/entityRepository.js'
import { createCaseService } from '../../modules/legalCases/caseService.js'
import type { CasePriority } from '../../modules/legalCases/caseTypes.js'
import type {
  PopulationDensity,
  RegionalCampaignTargetChannel,
  RegionalCampaignTargetIntentStage,
  RegionalCampaignTargetSearchIntent,
} from '../../modules/growth/regionalGrowthRepository.js'

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

type CreateCampaignTargetBody = {
  channel?: RegionalCampaignTargetChannel
  audienceName?: string
  audienceDescription?: string
  intentStage?: RegionalCampaignTargetIntentStage
  searchIntent?: RegionalCampaignTargetSearchIntent
  recommendedRadiusKm?: number
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function getRegionalGrowthRepository(app: FastifyInstance) {
  return createRegionalGrowthRepository(getConnection(app))
}

function getLeadAttributionRepository(app: FastifyInstance) {
  return createLeadAttributionRepository(getConnection(app))
}

function getRegionalLeadRepository(app: FastifyInstance) {
  return createRegionalLeadRepository(getConnection(app))
}

function getRegionalSignalsRepository(app: FastifyInstance) {
  return createRegionalSignalsRepository(getConnection(app))
}

function getEntityRepository(app: FastifyInstance) {
  return createEntityRepository(getConnection(app))
}

function getCaseService(app: FastifyInstance) {
  return createCaseService(getConnection(app))
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

function readOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readRequiredString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isLeadUrgency(value: unknown): value is RegionalLeadUrgency {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'critical'
}

function isCampaignTargetChannel(value: unknown): value is RegionalCampaignTargetChannel {
  return value === 'google_search' || value === 'google_local' || value === 'facebook' || value === 'instagram'
}

function isCampaignTargetIntentStage(value: unknown): value is RegionalCampaignTargetIntentStage {
  return value === 'awareness' || value === 'consideration' || value === 'decision'
}

function isCampaignTargetSearchIntent(value: unknown): value is RegionalCampaignTargetSearchIntent {
  return value === 'problem_aware'
    || value === 'solution_aware'
    || value === 'provider_aware'
    || value === 'ready_to_hire'
}

function isPopulationDensity(value: unknown): value is PopulationDensity {
  return value === 'small' || value === 'medium' || value === 'large'
}

function buildLegacyOwnerId(userId: number, tenantId: number) {
  return `user:${userId}:tenant:${tenantId}`
}

function isOwnedByAuth(
  entity: {
    ownerUserId?: number
    ownerTenantId?: number
    ownerId?: string
  } | null,
  userId: number,
  tenantId: number,
) {
  if (!entity) {
    return false
  }

  if (entity.ownerUserId === userId && entity.ownerTenantId === tenantId) {
    return true
  }

  return entity.ownerId === buildLegacyOwnerId(userId, tenantId)
}

function mapLeadUrgencyToCasePriority(urgency: RegionalLeadUrgency): CasePriority {
  if (urgency === 'high' || urgency === 'critical') {
    return 'high'
  }

  if (urgency === 'low') {
    return 'low'
  }

  return 'normal'
}


export async function registerRegionalGrowthRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      landingSlug?: string
      campaignId?: string
      campaignTargetId?: string
      landingPageId?: string
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
      utmTerm?: string
      referrer?: string
    }
  }>('/growth/lead-attribution', async (request, reply) => {
    const landingSlug = request.body?.landingSlug?.trim()

    if (!landingSlug) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_LEAD_ATTRIBUTION',
          message: 'landingSlug is required.',
        },
      })
    }

    const attribution = await getLeadAttributionRepository(app).createAttribution({
      landingSlug,
      campaignId: request.body?.campaignId,
      landingPageId: request.body?.landingPageId,
      utmSource: request.body?.utmSource,
      utmMedium: request.body?.utmMedium,
      utmCampaign: request.body?.utmCampaign,
      utmTerm: request.body?.utmTerm,
      referrer: request.body?.referrer,
    })

    return {
      status: 'ready' as const,
      attribution,
    }
  })

  app.post<{
    Body: {
      landingSlug?: string
      campaignId?: string
      campaignTargetId?: string
      landingPageId?: string
      tenantId?: string
      entityId?: string
      name?: string
      phone?: string
      email?: string
      city?: string
      specialty?: string
      urgency?: RegionalLeadUrgency
      caseSummary?: string
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
      utmTerm?: string
      referrer?: string
    }
  }>('/growth/regional-leads', async (request, reply) => {
    const body = request.body ?? {}
    const landingSlug = readRequiredString(body.landingSlug)
    const entityId = readRequiredString(body.entityId)
    const tenantId = readRequiredString(body.tenantId)
    const name = readRequiredString(body.name)
    const phone = readRequiredString(body.phone)
    const city = readRequiredString(body.city)
    const specialty = readRequiredString(body.specialty)
    const caseSummary = readRequiredString(body.caseSummary)

    if (!landingSlug || !entityId || !tenantId || !name || !phone || !city || !specialty || !caseSummary) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_REGIONAL_LEAD_INPUT',
          message: 'landingSlug, entityId, tenantId, name, phone, city, specialty and caseSummary are required.',
        },
      })
    }

    if (body.urgency !== undefined && !isLeadUrgency(body.urgency)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_REGIONAL_LEAD_URGENCY',
          message: 'urgency must be low, normal, high or critical.',
        },
      })
    }

    const lead = await getRegionalLeadRepository(app).createLead({
      campaignId: readOptionalString(body.campaignId),
      campaignTargetId: readOptionalString(body.campaignTargetId),
      landingPageId: readOptionalString(body.landingPageId),
      tenantId,
      entityId,
      landingSlug,
      name,
      phone,
      email: readOptionalString(body.email),
      city,
      specialty,
      urgency: body.urgency,
      caseSummary,
      utmSource: readOptionalString(body.utmSource),
      utmMedium: readOptionalString(body.utmMedium),
      utmCampaign: readOptionalString(body.utmCampaign),
      utmTerm: readOptionalString(body.utmTerm),
      referrer: readOptionalString(body.referrer),
    })

    return reply.status(201).send({
      status: 'ready' as const,
      lead,
    })
  })

  app.get<{
    Querystring: {
      specialty?: string
      populationDensity?: PopulationDensity
    }
  }>('/growth/radius-recommendation', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const specialty = readRequiredString(request.query?.specialty)
    const populationDensity = request.query?.populationDensity

    if (!specialty || !isPopulationDensity(populationDensity)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_RADIUS_RECOMMENDATION_INPUT',
          message: 'specialty and populationDensity are required.',
        },
      })
    }

    const recommendation: RadiusRecommendation = await recommendRadiusForSpecialty(getRegionalGrowthRepository(app), {
      specialty,
      populationDensity,
    })

    return {
      status: 'ready' as const,
      recommendation,
    }
  })

  app.get<{
    Params: {
      id: string
    }
  }>('/growth/campaigns/:id/targets', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const campaign = await getRegionalGrowthRepository(app).getCampaignById(String(auth.tenantId), request.params.id)

    if (!campaign) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'REGIONAL_CAMPAIGN_NOT_FOUND',
          message: `Campaign "${request.params.id}" was not found.`,
        },
      })
    }

    const targets = await getRegionalGrowthRepository(app).listCampaignTargetsByCampaign(String(auth.tenantId), request.params.id)

    return {
      status: 'ready' as const,
      campaignId: request.params.id,
      targets,
    }
  })

  app.post<{
    Params: {
      id: string
    }
    Body: CreateCampaignTargetBody
  }>('/growth/campaigns/:id/targets', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const body = request.body ?? {}
    const audienceName = readRequiredString(body.audienceName)

    if (!isCampaignTargetChannel(body.channel) || !audienceName || !isCampaignTargetIntentStage(body.intentStage)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CAMPAIGN_TARGET_INPUT',
          message: 'channel, audienceName and intentStage are required.',
        },
      })
    }

    if (body.searchIntent !== undefined && !isCampaignTargetSearchIntent(body.searchIntent)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CAMPAIGN_TARGET_SEARCH_INTENT',
          message: 'searchIntent is invalid.',
        },
      })
    }

    if (!Number.isFinite(body.recommendedRadiusKm) || Number(body.recommendedRadiusKm) <= 0) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CAMPAIGN_TARGET_RADIUS',
          message: 'recommendedRadiusKm must be greater than 0.',
        },
      })
    }

    const target = await getRegionalGrowthRepository(app).createCampaignTarget(String(auth.tenantId), {
      campaignId: request.params.id,
      channel: body.channel,
      audienceName,
      audienceDescription: readOptionalString(body.audienceDescription),
      intentStage: body.intentStage,
      searchIntent: body.searchIntent,
      recommendedRadiusKm: Number(body.recommendedRadiusKm),
    })

    if (!target) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'REGIONAL_CAMPAIGN_NOT_FOUND',
          message: `Campaign "${request.params.id}" was not found.`,
        },
      })
    }

    return reply.status(201).send({
      status: 'ready' as const,
      target,
    })
  })

  app.delete<{
    Params: {
      id: string
    }
  }>('/growth/campaign-targets/:id', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const deleted = await getRegionalGrowthRepository(app).deleteCampaignTarget(String(auth.tenantId), request.params.id)

    if (!deleted) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'REGIONAL_CAMPAIGN_TARGET_NOT_FOUND',
          message: `Campaign target "${request.params.id}" was not found.`,
        },
      })
    }

    return reply.status(204).send()
  })

  app.get<{
    Querystring: {
      entityId?: string
    }
  }>('/growth/regional-leads', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.query?.entityId)

    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ID_REQUIRED',
          message: 'entityId is required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const leads = await getRegionalLeadRepository(app).listLeadsByEntity(entityId)

    return {
      status: 'ready' as const,
      entityId,
      leads,
    }
  })

  app.get<{
    Querystring: {
      entityId?: string
    }
  }>('/growth/signals', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.query?.entityId)

    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ID_REQUIRED',
          message: 'entityId is required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const signals = await getRegionalSignalsRepository(app).listSignalsByEntity(String(auth.tenantId), entityId)

    return {
      status: 'ready' as const,
      entityId,
      signals,
    }
  })

  app.post<{
    Body: {
      entityId?: string
    }
  }>('/growth/signals/recalculate', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.body?.entityId)

    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ID_REQUIRED',
          message: 'entityId is required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const signals = await getRegionalSignalsRepository(app).recalculateSignalsForEntity(String(auth.tenantId), entityId)

    return {
      status: 'ready' as const,
      entityId,
      signals,
    }
  })

  app.get<{
    Querystring: {
      entityId?: string
    }
  }>('/growth/insights', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.query?.entityId)

    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ID_REQUIRED',
          message: 'entityId is required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const signals = await getRegionalSignalsRepository(app).listSignalsByEntity(String(auth.tenantId), entityId)
    const insights = buildGrowthInsights(signals)

    return {
      status: 'ready' as const,
      entityId,
      insights,
    }
  })

  app.get<{
    Querystring: {
      entityId?: string
    }
  }>('/growth/economic-summary', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.query?.entityId)

    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ID_REQUIRED',
          message: 'entityId is required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const economicSummary = await buildGrowthEconomicSummary({
      db: getConnection(app),
      entityId,
    })

    return {
      status: 'ready' as const,
      entityId,
      economicSummary,
    }
  })

  app.get<{
    Querystring: {
      entityId?: string
    }
  }>('/growth/recommendations', { preHandler: [requireAuth, privateReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.query?.entityId)

    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ID_REQUIRED',
          message: 'entityId is required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const signals = await getRegionalSignalsRepository(app).listSignalsByEntity(String(auth.tenantId), entityId)
    const recommendations = buildGrowthRecommendations(signals)

    return {
      status: 'ready' as const,
      entityId,
      recommendations,
    }
  })

  app.post<{
    Body: {
      entityId?: string
      signalId?: string
    }
  }>('/growth/recommendations/execute', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const entityId = readRequiredString(request.body?.entityId)
    const signalId = readRequiredString(request.body?.signalId)

    if (!entityId || !signalId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_GROWTH_RECOMMENDATION_EXECUTION_INPUT',
          message: 'entityId and signalId are required.',
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    try {
      const result = await executeGrowthRecommendation(
        getRegionalGrowthRepository(app),
        getRegionalSignalsRepository(app),
        {
          tenantId: String(auth.tenantId),
          entityId,
          signalId,
        },
      )

      return reply.status(201).send({
        status: 'ready' as const,
        entityId,
        campaign: result.campaign,
        target: result.target,
      })
    } catch (error) {
      if (error instanceof GrowthRecommendationExecutionError) {
        const statusCode = error.code === 'GROWTH_SIGNAL_NOT_FOUND' ? 404 : 500
        return reply.status(statusCode).send({
          status: 'failed',
          error: {
            code: error.code,
            message: error.message,
          },
        })
      }

      throw error
    }
  })

  app.post<{
    Params: {
      id: string
    }
  }>('/growth/regional-leads/:id/convert-to-case', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const lead = await getRegionalLeadRepository(app).getLeadById(request.params.id)

    if (!lead) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'REGIONAL_LEAD_NOT_FOUND',
          message: `Regional lead "${request.params.id}" was not found.`,
        },
      })
    }

    const entity = await getEntityRepository(app).getEntityById<EntityProfile>(lead.entityId)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${lead.entityId}" was not found.`,
        },
      })
    }

    if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    if (lead.tenantId !== String(auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Lead tenant does not match authenticated tenant.',
        },
      })
    }

    if (lead.convertedCaseId) {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'REGIONAL_LEAD_ALREADY_CONVERTED',
          message: `Regional lead "${lead.id}" has already been converted.`,
        },
      })
    }

    const campaignTarget = lead.campaignTargetId
      ? await getRegionalGrowthRepository(app).getCampaignTargetById(lead.campaignTargetId)
      : null

    const legalCase = await getCaseService(app).createCase({
      tenantId: Number(lead.tenantId),
      entityId: lead.entityId,
      createdByUserId: auth.userId,
      title: `${lead.specialty} em ${lead.city}`,
      description: lead.caseSummary,
      priority: mapLeadUrgencyToCasePriority(lead.urgency),
      practiceArea: lead.specialty,
      source: 'regional_growth',
      metadata: {
        growth: {
          regionalLeadId: lead.id,
          campaignId: lead.campaignId ?? null,
          campaignTargetId: lead.campaignTargetId ?? null,
          landingPageId: lead.landingPageId ?? null,
          landingSlug: lead.landingSlug,
          channel: campaignTarget?.channel ?? null,
          audienceName: campaignTarget?.audienceName ?? null,
          intentStage: campaignTarget?.intentStage ?? null,
          searchIntent: campaignTarget?.searchIntent ?? null,
          recommendedRadiusKm: campaignTarget?.recommendedRadiusKm ?? null,
        },
        utm: {
          source: lead.utmSource ?? null,
          medium: lead.utmMedium ?? null,
          campaign: lead.utmCampaign ?? null,
          term: lead.utmTerm ?? null,
          referrer: lead.referrer ?? null,
        },
      },
    })

    const convertedLead = await getRegionalLeadRepository(app).markLeadConverted(lead.id, legalCase.id)

    return {
      status: 'ready' as const,
      lead: convertedLead,
      case: legalCase,
    }
  })

  app.get('/sitemap.xml', async (_, reply) => {
    const pages = await getRegionalGrowthRepository(app).listPublishedSeoLandingPages()
    const baseUrl = (process.env.PUBLIC_SITE_URL ?? 'https://brandsoul-legal-platform.onrender.com').replace(/\/+$/, '')

    const urls = pages.map((page) => {
      const updatedAt = page.updatedAt.slice(0, 10)
      return `  <url>
    <loc>${baseUrl}${page.slug}</loc>
    <lastmod>${updatedAt}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    }).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

    return reply
      .header('Content-Type', 'application/xml; charset=utf-8')
      .send(xml)
  })

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
