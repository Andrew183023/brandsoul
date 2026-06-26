import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { createRateLimit } from '../../api/middleware/rateLimit.js'
import { getRequestAuth, requireAuth } from '../../api/middleware/requireAuth.js'
import { createLegalBetaCaseService } from '../../modules/legalCases/legalBetaCaseService.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    sovereignMutationCommandService: SovereignMutationCommandService
  }
}

type CasesQuerystring = {
  entityId?: string
}

type AddMessageBody = {
  role?: 'lawyer' | 'user' | 'system'
  body?: string
}

type StatusBody = {
  status?: 'in_progress' | 'pending' | 'on_hold'
  reason?: string
}

type AssignBody = {
  lawyerId?: string
}

type CloseBody = {
  rating?: number
  feedback?: string
  closedBy?: string
}

type DetailedProfessionalRecord = Awaited<ReturnType<ReturnType<typeof createCaseRepository>['listDetailedProfessionalsForTenant']>>[number]

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
  )
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

async function requireCaseEntityOwner(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply, entityId: string) {
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

  const entity = await getRepository(app).getEntityById<EntityProfile>(entityId)
  if (!entity) {
    await reply.status(404).send({
      status: 'failed',
      error: {
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityId}" was not found.`,
      },
    })
    return null
  }

  if (!isOwnedByAuth(entity, auth.userId, auth.tenantId)) {
    await reply.status(403).send({
      status: 'failed',
      error: {
        code: 'ENTITY_ACCESS_FORBIDDEN',
        message: 'Only the entity owner can access this case surface.',
      },
    })
    return null
  }

  return { auth, entity }
}

const publicReadRateLimit = createRateLimit({
  namespace: 'legal-beta-cases-read',
  max: 120,
  windowMs: 60_000,
  key: 'user',
})

const privateWriteRateLimit = createRateLimit({
  namespace: 'legal-beta-cases-write',
  max: 60,
  windowMs: 60_000,
  key: 'user',
})

function resolveValidatedAssignableProfessional(args: {
  professionals: DetailedProfessionalRecord[]
  professionalId: string
  officeId?: string
}) {
  const professional = args.professionals.find((entry) => entry.id === args.professionalId)
  if (!professional) {
    return {
      status: 'missing' as const,
    }
  }

  if (professional.status !== 'active') {
    return {
      status: 'inactive' as const,
      professional,
    }
  }

  if (args.officeId && professional.officeId && professional.officeId !== args.officeId) {
    return {
      status: 'office_mismatch' as const,
      professional,
    }
  }

  return {
    status: 'ready' as const,
    professional,
  }
}

export async function registerLegalBetaCaseRoutes(app: FastifyInstance) {
  app.get<{ Querystring: CasesQuerystring }>('/cases', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    const entityId = request.query.entityId?.trim()
    if (!entityId) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_QUERY',
          message: 'entityId is required.',
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, entityId)
    if (!owned) {
      return
    }

    return {
      status: 'ready',
      entityId,
      cases: await getCaseService(app).listCasesByEntity(owned.auth.tenantId, entityId),
    }
  })

  app.get<{ Params: { id: string } }>('/cases/:id', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const caseRecord = await getCaseRepository(app).getCaseByIdAnyTenant(request.params.id)
    if (!caseRecord?.entityId) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, caseRecord.entityId)
    if (!owned) {
      return
    }

    const payload = await getCaseService(app).getCaseById(auth.tenantId, request.params.id)
    if (!payload) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      case: payload,
    }
  })

  app.get<{ Params: { id: string } }>('/cases/:id/messages', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const caseRecord = await getCaseRepository(app).getCaseByIdAnyTenant(request.params.id)
    if (!caseRecord?.entityId) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, caseRecord.entityId)
    if (!owned) {
      return
    }

    const [casePayload, messages] = await Promise.all([
      getCaseService(app).getCaseById(auth.tenantId, request.params.id),
      getCaseService(app).getCaseMessages(auth.tenantId, request.params.id),
    ])

    return {
      status: 'ready',
      caseId: request.params.id,
      case: casePayload ?? undefined,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.direction === 'inbound' ? 'user' : (message.authorProfessionalId ? 'lawyer' : 'system'),
        text: message.body,
        actorId: message.authorProfessionalId,
        createdAt: message.createdAt,
      })),
    }
  })

  app.post<{ Params: { id: string }; Body: AddMessageBody }>('/cases/:id/messages', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const caseRecord = await getCaseRepository(app).getCaseByIdAnyTenant(request.params.id)
    if (!caseRecord?.entityId) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, caseRecord.entityId)
    if (!owned) {
      return
    }

    const body = request.body?.body?.trim() ?? ''
    if (!body) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_MESSAGE',
          message: 'body is required.',
        },
      })
    }

    const professional = await getCaseRepository(app).getProfessionalRecordByUserId(auth.tenantId, auth.userId)
    const message = await getCaseService(app).addMessage({
      tenantId: auth.tenantId,
      caseId: request.params.id,
      authorProfessionalId: professional?.id,
      body,
      direction: request.body?.role === 'user' ? 'inbound' : 'outbound',
    })

    const messages = await getCaseService(app).getCaseMessages(auth.tenantId, request.params.id)
    const casePayload = await getCaseService(app).getCaseById(auth.tenantId, request.params.id)

    return {
      status: 'ready',
      caseId: request.params.id,
      case: casePayload ?? undefined,
      message: {
        id: message.id,
        role: message.direction === 'inbound' ? 'user' : (message.authorProfessionalId ? 'lawyer' : 'system'),
        text: message.body,
        actorId: message.authorProfessionalId,
        createdAt: message.createdAt,
      },
      messages: messages.map((entry) => ({
        id: entry.id,
        role: entry.direction === 'inbound' ? 'user' : (entry.authorProfessionalId ? 'lawyer' : 'system'),
        text: entry.body,
        actorId: entry.authorProfessionalId,
        createdAt: entry.createdAt,
      })),
    }
  })

  app.post<{ Params: { id: string }; Body: StatusBody }>('/cases/:id/status', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const caseRecord = await getCaseRepository(app).getCaseByIdAnyTenant(request.params.id)
    if (!caseRecord?.entityId) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, caseRecord.entityId)
    if (!owned) {
      return
    }

    const nextStatus = request.body?.status
    if (!nextStatus || !['in_progress', 'pending', 'on_hold'].includes(nextStatus)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_STATUS',
          message: 'This endpoint only supports transitions to in_progress, pending or on_hold.',
        },
      })
    }

    const updated = await getCaseService(app).updateStatus({
      tenantId: auth.tenantId,
      caseId: request.params.id,
      status: nextStatus,
      reason: request.body?.reason,
    })

    if (!updated) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const payload = await getCaseService(app).getCaseById(auth.tenantId, request.params.id)
    return {
      status: 'ready',
      case: payload,
    }
  })

  app.get('/debug/professionals', { preHandler: [requireAuth] }, async (request) => {
    const auth = getRequestAuth(request)!
    const caseRepository = getCaseRepository(app)
    const professionals = await caseRepository.listDetailedProfessionalsForTenant(auth.tenantId)
    const actingProfessional = await caseRepository.getProfessionalRecordByUserId(auth.tenantId, auth.userId)

    return {
      status: 'ready',
      tenantId: auth.tenantId,
      userId: auth.userId,
      actingProfessional,
      professionals,
    }
  })

  app.post<{ Params: { id: string }; Body: AssignBody }>('/cases/:id/assign', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const caseRepository = getCaseRepository(app)
    const caseRecord = await caseRepository.getCaseByIdAnyTenant(request.params.id)
    if (!caseRecord?.entityId) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, caseRecord.entityId)
    if (!owned) {
      return
    }

    const requestedProfessionalId = request.body?.lawyerId?.trim()
    const actingProfessional = await caseRepository.getProfessionalRecordByUserId(auth.tenantId, auth.userId)

    console.info('case_assign_started', {
      tenantId: auth.tenantId,
      caseId: request.params.id,
      entityId: caseRecord.entityId,
      actorUserId: auth.userId,
      actorProfessionalId: actingProfessional?.id ?? null,
      requestedProfessionalId: requestedProfessionalId ?? null,
    })

    let professionalId = requestedProfessionalId
    if (!professionalId || professionalId === 'self') {
      if (!actingProfessional) {
        console.warn('assignment_validation_failed', {
          tenantId: auth.tenantId,
          caseId: request.params.id,
          entityId: caseRecord.entityId,
          actorUserId: auth.userId,
          reason: 'professional_binding_required',
        })
        return reply.status(409).send({
          status: 'failed',
          error: {
            code: 'PROFESSIONAL_BINDING_REQUIRED',
            message: 'Vincule um profissional ao seu acesso antes de assumir casos.',
          },
        })
      }
      professionalId = actingProfessional.id
    }

    const professionals = await caseRepository.listDetailedProfessionalsForTenant(auth.tenantId)
    const validatedProfessional = resolveValidatedAssignableProfessional({
      professionals,
      professionalId,
      officeId: caseRecord.entityId,
    })

    if (validatedProfessional.status !== 'ready') {
      const errorCode = validatedProfessional.status === 'missing'
        ? 'INVALID_PROFESSIONAL'
        : validatedProfessional.status === 'inactive'
          ? 'INACTIVE_PROFESSIONAL'
          : 'PROFESSIONAL_OFFICE_MISMATCH'
      const errorMessage = validatedProfessional.status === 'missing'
        ? 'Profissional não encontrado para assumir este caso.'
        : validatedProfessional.status === 'inactive'
          ? 'O profissional informado não está ativo para assumir este caso.'
          : 'O profissional informado não pertence a este escritório.'

      console.warn(validatedProfessional.status === 'missing' ? 'invalid_professional' : 'assignment_validation_failed', {
        tenantId: auth.tenantId,
        caseId: request.params.id,
        entityId: caseRecord.entityId,
        actorUserId: auth.userId,
        actorProfessionalId: actingProfessional?.id ?? null,
        requestedProfessionalId: requestedProfessionalId ?? null,
        targetProfessionalId: professionalId,
        reason: validatedProfessional.status,
      })

      return reply.status(422).send({
        status: 'failed',
        error: {
          code: errorCode,
          message: errorMessage,
        },
      })
    }

    const assigned = await getCaseService(app).assign({
      tenantId: auth.tenantId,
      caseId: request.params.id,
      professionalId,
      assignedByProfessionalId: actingProfessional?.id,
    })

    if (assigned.status === 'not_found') {
      console.warn('case_assign_failed', {
        tenantId: auth.tenantId,
        caseId: request.params.id,
        entityId: caseRecord.entityId,
        actorUserId: auth.userId,
        actorProfessionalId: actingProfessional?.id ?? null,
        targetProfessionalId: professionalId,
        reason: 'case_not_found_after_validation',
      })
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const payload = await getCaseService(app).getCaseById(auth.tenantId, request.params.id)

    console.info('case_assign_succeeded', {
      tenantId: auth.tenantId,
      caseId: request.params.id,
      entityId: caseRecord.entityId,
      actorUserId: auth.userId,
      actorProfessionalId: actingProfessional?.id ?? null,
      targetProfessionalId: professionalId,
      status: payload?.status ?? null,
      assignedProfessionalId: payload?.assignedProfessionalId ?? null,
      assignedLawyerId: payload?.assignedLawyerId ?? null,
    })

    return {
      status: 'ready',
      case: payload,
    }
  })

  app.post<{ Params: { id: string }; Body: CloseBody }>('/cases/:id/close', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const caseRecord = await getCaseRepository(app).getCaseByIdAnyTenant(request.params.id)
    if (!caseRecord?.entityId) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const owned = await requireCaseEntityOwner(app, request, reply, caseRecord.entityId)
    if (!owned) {
      return
    }

    const rating = Number(request.body?.rating)
    const closedBy = request.body?.closedBy?.trim()
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !closedBy) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_CLOSE',
          message: 'rating and closedBy are required.',
        },
      })
    }

    const result = await getCaseService(app).close({
      tenantId: auth.tenantId,
      caseId: request.params.id,
      rating,
      feedback: request.body?.feedback?.trim(),
      closedBy,
    })

    if (result.status === 'already_closed') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'CASE_ALREADY_CLOSED',
          message: 'Case is already closed.',
        },
      })
    }

    if (result.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const payload = await getCaseService(app).getCaseById(auth.tenantId, request.params.id)
    return {
      status: 'ready',
      case: payload,
    }
  })

  app.get<{ Params: { entityId: string; lawyerId: string } }>('/entities/:entityId/lawyers/:lawyerId/reputation', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const owned = await requireCaseEntityOwner(app, request, reply, request.params.entityId)
    if (!owned) {
      return
    }

    return {
      status: 'ready',
      entityId: request.params.entityId,
      lawyerId: request.params.lawyerId,
      reputation: await getCaseService(app).getLawyerReputation(auth.tenantId, request.params.entityId, request.params.lawyerId),
    }
  })
}
