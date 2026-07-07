import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import {
  createExecutiveDashboardApplicationService,
  createExecutiveDashboardService,
  type ExecutiveDashboardApplicationService,
} from '../../modules/executive/index.js'
import { createGrowthIntelligenceService } from '../../modules/legalGrowth/growthIntelligenceService.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'
import { createLegalBetaCaseService } from '../../modules/legalCases/legalBetaCaseService.js'
import { createOperationalIntelligenceService } from '../../modules/legalSignals/operationalIntelligenceService.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { getRequestAuth, requireAuth } from '../middleware/requireAuth.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    observability: ObservabilityService
    sovereignMutationCommandService: SovereignMutationCommandService
    executiveDashboardApplicationService?: Pick<ExecutiveDashboardApplicationService, 'build'>
  }
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function getRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

function getCaseRepository(app: FastifyInstance) {
  return createCaseRepository(getConnection(app))
}

function getCaseService(app: FastifyInstance) {
  return createLegalBetaCaseService(
    getConnection(app),
    (app as FastifyInstance & BackendContext).backendContext.sovereignMutationCommandService,
    {
      observability: (app as FastifyInstance & BackendContext).backendContext.observability,
      logger: app.log,
    },
  )
}

function getExecutiveDashboardApplicationService(app: FastifyInstance) {
  const context = (app as FastifyInstance & BackendContext).backendContext
  if (context.executiveDashboardApplicationService) {
    return context.executiveDashboardApplicationService
  }

  return createExecutiveDashboardApplicationService({
    caseRepository: getCaseRepository(app),
    officeProfessionalService: {
      listOfficeProfessionals(tenantId: number, officeId: string) {
        return getCaseService(app).listOfficeProfessionals(tenantId, officeId)
      },
    },
    growthIntelligenceService: createGrowthIntelligenceService({
      observability: context.observability,
    }),
    operationalIntelligenceService: createOperationalIntelligenceService({
      observability: context.observability,
    }),
    executiveDashboardService: createExecutiveDashboardService({
      observability: context.observability,
    }),
    observability: context.observability,
  })
}

function buildLegacyOwnerId(userId: number, tenantId: number) {
  return `user:${userId}:tenant:${tenantId}`
}

function isOwnedByAuth(entity: Awaited<ReturnType<EntityRepository['getEntityById']>>, userId: number, tenantId: number) {
  if (!entity) {
    return false
  }

  if (entity.ownerUserId === userId && entity.ownerTenantId === tenantId) {
    return true
  }

  return entity.ownerId === buildLegacyOwnerId(userId, tenantId)
}

async function requireOwnedOffice(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const auth = getRequestAuth(request)
  if (!auth) {
    await reply.status(401).send({
      status: 'failed',
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      },
    })
    return null
  }

  const officeId = String((request.params as { id?: string } | undefined)?.id ?? '')
  const entity = await getRepository(app).getEntityById<EntityProfile>(officeId)
  if (!entity) {
    await reply.status(404).send({
      status: 'failed',
      error: {
        code: 'OFFICE_NOT_FOUND',
        message: `Office "${officeId}" was not found.`,
      },
    })
    return null
  }

  if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
    await reply.status(403).send({
      status: 'failed',
      error: {
        code: 'OFFICE_ACCESS_FORBIDDEN',
        message: 'Only the office owner can access this executive dashboard surface.',
      },
    })
    return null
  }

  return {
    auth,
    entity,
    officeId,
    tenantId: entity.ownerTenantId ?? auth.tenantId,
  }
}

const privateReadRateLimit = createRateLimit({
  namespace: 'legal-beta-office-executive-dashboard-read',
  max: 120,
  windowMs: 60_000,
  key: 'user',
})

export async function registerExecutiveDashboardRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/admin/escritorios/:id/executive-dashboard',
    { preHandler: [requireAuth, privateReadRateLimit] },
    async (request, reply) => {
      const owned = await requireOwnedOffice(app, request, reply)
      if (!owned) {
        return
      }

      return getExecutiveDashboardApplicationService(app).build({
        officeId: owned.officeId,
        tenantId: owned.tenantId,
        entityProfile: owned.entity.entityProfile as EntityProfile,
      })
    },
  )
}
