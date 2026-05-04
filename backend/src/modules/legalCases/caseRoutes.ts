import type { FastifyInstance, FastifyRequest } from 'fastify'

import { getRequestAuth, optionalAuth, requireAuth } from '../../api/middleware/requireAuth.js'
import { createRateLimit } from '../../api/middleware/rateLimit.js'
import { getLegalMarketplaceEntityId } from '../../config/env.js'
import type { BackendDatabase } from '../../db/index.js'
import { createCaseRepository } from './caseRepository.js'
import { createLawyerInboxEventsToken, validateLawyerInboxEventsToken } from './lawyerInboxEventTokens.js'
import { getLawyerInboxChannel, subscribe, unsubscribe, type LawyerInboxEvent } from './lawyerInboxEvents.js'
import { createMatchingService } from './matchingService.js'
import { createCaseService } from './caseService.js'
import type { CasePriority } from './caseTypes.js'

type BackendContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
  }
}

type TenantScopedRequest = FastifyRequest & {
  tenantId: number
}

type CreateCaseBody = {
  entityId?: string
  title?: string
  description?: string
  priority?: CasePriority
  practiceArea?: string
  metadata?: Record<string, unknown>
  initialMessage?: {
    body?: string
  }
}

type AddMessageBody = {
  body?: string
}

type CloseCaseBody = {
  resolutionReason?: string
}

type DispatchCaseBody = {
  professionalId?: string
}

type RespondToAssignmentBody = {
  status?: 'accepted' | 'rejected'
  decision?: 'accept' | 'reject'
}

type CasesQuerystring = {
  entityId?: string
}

type LawyerInboxEventsQuerystring = {
  token?: string
}

type RouteErrorPayload = {
  status: 'failed'
  error: {
    code: string
    message: string
  }
}

function getConnection(app: FastifyInstance) {
  return (app as BackendContext).backendContext.connection
}

async function getMarketplaceDebugInfo(app: FastifyInstance) {
  const marketplaceEntityId = getLegalMarketplaceEntityId()
  const row = await getConnection(app).get<{ owner_tenant_id: number | null }>(
    `
      SELECT owner_tenant_id
      FROM entity_profile
      WHERE id = ?
    `,
    marketplaceEntityId,
  )

  return {
    marketplaceEntityId,
    marketplaceTenantId: typeof row?.owner_tenant_id === 'number' ? row.owner_tenant_id : null,
  }
}

function getTenantId(request: FastifyRequest) {
  return getRequestAuth(request)?.tenantId ?? Number((request as TenantScopedRequest).tenantId)
}

function getUserId(request: FastifyRequest) {
  return getRequestAuth(request)?.userId
}

function getAuthenticatedTenantId(request: FastifyRequest) {
  return getRequestAuth(request)?.tenantId
}

function getAuthenticatedUserId(request: FastifyRequest) {
  return getRequestAuth(request)?.userId
}

function getCaseClaimToken(request: FastifyRequest) {
  const headerValue = request.headers['x-case-claim-token']
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue
  const value = typeof rawValue === 'string' ? rawValue.trim() : ''
  return value.length > 0 ? value : undefined
}

function getIdempotencyKey(request: FastifyRequest) {
  const headerValue = request.headers['idempotency-key']
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue
  const value = typeof rawValue === 'string' ? rawValue.trim() : ''
  return value.length > 0 ? value : undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function writeSseEvent(stream: NodeJS.WritableStream, eventName: string, payload: Record<string, unknown>) {
  stream.write(`event: ${eventName}\n`)
  stream.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function caseHasRequiredMatchData(legalCase: {
  practiceArea?: string
  description?: string
  metadata?: Record<string, unknown>
  centelhaContext?: Record<string, unknown>
}) {
  const metadata = toJsonRecord(legalCase.metadata)
  const centelhaContext = toJsonRecord(legalCase.centelhaContext)
  const metadataLocation = toJsonRecord(metadata.location)
  const contextLocation = toJsonRecord(centelhaContext.location)

  const area = readString(legalCase.practiceArea)
    || readString(metadata.practiceArea)
    || readString(metadata.category)
    || readString(centelhaContext.practiceArea)
    || readString(centelhaContext.category)
  const description = readString(legalCase.description)
  const city = readString(metadata.city) || readString(metadataLocation.city) || readString(centelhaContext.city) || readString(contextLocation.city)
  const state = readString(metadata.state) || readString(metadataLocation.state) || readString(centelhaContext.state) || readString(contextLocation.state)

  return (area.length > 0 || description.length > 0) && city.length > 0 && state.length > 0
}

function getCaseRepository(app: FastifyInstance) {
  return createCaseRepository(getConnection(app))
}

function getCaseService(app: FastifyInstance) {
  return createCaseService(getConnection(app))
}

function getMatchingService(app: FastifyInstance) {
  return createMatchingService(getConnection(app))
}

async function caseExistsOutsideTenant(app: FastifyInstance, tenantId: number, caseId: string) {
  const row = await getConnection(app).get<{ case_exists: boolean | number }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM cases
        WHERE id = ?
          AND tenant_id <> ?
      ) AS case_exists
    `,
    caseId,
    tenantId,
  )

  return Boolean(row?.case_exists)
}

async function resolveEntityOwner(app: FastifyInstance, entityId: string) {
  return getConnection(app).get<{
    owner_user_id: number | null
    owner_tenant_id: number | null
  }>(
    `
      SELECT owner_user_id, owner_tenant_id
      FROM entity_profile
      WHERE id = ?
    `,
    entityId,
  )
}

async function isEntityOwner(app: FastifyInstance, entityId: string, userId: number, tenantId: number) {
  const owner = await resolveEntityOwner(app, entityId)
  if (!owner) {
    return false
  }

  return owner.owner_user_id === userId && owner.owner_tenant_id === tenantId
}

function hasRoute(app: FastifyInstance, method: 'GET' | 'POST', url: string) {
  return app.hasRoute({
    method,
    url,
  })
}

function buildRouteError(code: string, message: string): RouteErrorPayload {
  return {
    status: 'failed',
    error: {
      code,
      message,
    },
  }
}

const publicCaseCreateRateLimit = createRateLimit({
  namespace: 'public_case_create',
  key: 'ip',
  max: 20,
  windowMs: 60_000,
})

export async function registerCaseRoutes(app: FastifyInstance) {
  if (!hasRoute(app, 'POST', '/cases')) {
    app.post<{ Body: CreateCaseBody }>('/cases', { preHandler: [optionalAuth, publicCaseCreateRateLimit] }, async (request, reply) => {
      const authUserId = getUserId(request)
      const claimToken = getCaseClaimToken(request)

      if (!isNonEmptyString(request.body?.entityId) || !isNonEmptyString(request.body?.title)) {
        return reply.status(400).send(buildRouteError('INVALID_CASE_CREATE_PAYLOAD', 'entityId and title are required.'))
      }

      const entityOwner = await resolveEntityOwner(app, request.body.entityId)
      const tenantId = Number(entityOwner?.owner_tenant_id)

      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        return reply.status(404).send(buildRouteError('ENTITY_NOT_FOUND', 'Entity not found or unavailable for intake.'))
      }

      if (
        typeof request.body.priority !== 'undefined'
        && !['low', 'normal', 'high', 'urgent'].includes(request.body.priority)
      ) {
        return reply.status(400).send(buildRouteError('INVALID_CASE_PRIORITY', 'Invalid priority.'))
      }

      if (
        typeof request.body.initialMessage !== 'undefined'
        && typeof request.body.initialMessage !== 'object'
      ) {
        return reply.status(400).send(buildRouteError('INVALID_INITIAL_MESSAGE', 'Invalid initialMessage.'))
      }

      if (
        request.body.initialMessage
        && typeof request.body.initialMessage.body !== 'undefined'
        && !isNonEmptyString(request.body.initialMessage.body)
      ) {
        return reply.status(400).send(buildRouteError('INVALID_INITIAL_MESSAGE_BODY', 'initialMessage.body must be a non-empty string.'))
      }

      const legalCase = await getCaseService(app).createCase({
        tenantId,
        entityId: request.body.entityId,
        createdByUserId: Number.isInteger(authUserId) ? Number(authUserId) : undefined,
        title: request.body.title.trim(),
        description: isNonEmptyString(request.body.description) ? request.body.description.trim() : undefined,
        priority: request.body.priority,
        practiceArea: isNonEmptyString(request.body.practiceArea) ? request.body.practiceArea.trim() : undefined,
        metadata: {
          ...(request.body.metadata && typeof request.body.metadata === 'object' && !Array.isArray(request.body.metadata)
            ? request.body.metadata
            : {}),
          ...(claimToken ? { caseClaimToken: claimToken } : {}),
        },
        initialMessage: isNonEmptyString(request.body.initialMessage?.body)
          ? {
              body: request.body.initialMessage.body.trim(),
            }
          : undefined,
      })

      request.log.info({
        event: 'cases.public_intake_created',
        traceId: (request as FastifyRequest & { traceId?: string }).traceId ?? request.id,
        tenantId,
        entityId: request.body.entityId,
        sourceIp: request.ip,
        caseId: legalCase.id,
      }, 'Public legal intake case created')

      return reply.status(201).send({
        case: legalCase,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/cases/:id/messages')) {
    app.post<{ Params: { id: string }; Body: AddMessageBody }>('/cases/:id/messages', async (request, reply) => {
      const tenantId = getTenantId(request)

      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        return reply.status(400).send(buildRouteError('INVALID_TENANT', 'Invalid tenant.'))
      }

      if (!isNonEmptyString(request.params.id) || !isNonEmptyString(request.body?.body)) {
        return reply.status(400).send(buildRouteError('INVALID_CASE_MESSAGE_PAYLOAD', 'id and body are required.'))
      }

      const legalCase = await getCaseRepository(app).getCaseById(tenantId, request.params.id)
      if (!legalCase) {
        return reply.status(404).send(buildRouteError('CASE_NOT_FOUND', 'Case not found.'))
      }

      const message = await getCaseService(app).addMessage({
        tenantId,
        caseId: request.params.id,
        body: request.body.body.trim(),
      })

      return reply.status(201).send({
        message,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/cases/:id/match')) {
    app.post<{ Params: { id: string } }>('/cases/:id/match', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)
      const caseId = request.params.id
      const caseRepository = getCaseRepository(app)
      const matchingService = getMatchingService(app)

      try {
        if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(caseId)) {
          return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
        }

        const legalCase = await caseRepository.getCaseById(safeTenantId, caseId)
        if (!legalCase) {
          const existsInAnotherTenant = await caseExistsOutsideTenant(app, safeTenantId, caseId)
          if (existsInAnotherTenant) {
            return reply.status(403).send(buildRouteError('CASE_ACCESS_FORBIDDEN', 'Case access forbidden.'))
          }

          return reply.status(404).send(buildRouteError('CASE_NOT_FOUND', 'Case not found.'))
        }

        if (!legalCase.entityId || !(await isEntityOwner(app, legalCase.entityId, safeUserId, safeTenantId))) {
          return reply.status(403).send(buildRouteError('CASE_MATCH_FORBIDDEN', 'Only the entity owner can match this case.'))
        }

        if (!caseHasRequiredMatchData(legalCase)) {
          return reply.status(400).send(buildRouteError('INVALID_CASE_FOR_MATCH', 'Case missing required data for matching.'))
        }

        const candidates = await matchingService.matchCaseToProfessionals(safeTenantId, caseId)

        return reply.send({
          caseId,
          candidates: Array.isArray(candidates) ? candidates : [],
        })
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        console.error('cases.match_failed', {
          caseId,
          tenantId: safeTenantId,
          error: normalizedError.message,
          stack: normalizedError.stack,
        })

        return reply.status(500).send(buildRouteError('CASE_MATCH_FAILED', 'Failed to match case.'))
      }
    })
  }

  if (!hasRoute(app, 'GET', '/cases/:id')) {
    app.get<{ Params: { id: string } }>('/cases/:id', async (request, reply) => {
      const tenantId = getTenantId(request)

      if (!Number.isInteger(tenantId) || tenantId <= 0 || !isNonEmptyString(request.params.id)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const legalCase = await getCaseRepository(app).getCaseById(tenantId, request.params.id)
      if (!legalCase) {
        return reply.status(404).send(buildRouteError('CASE_NOT_FOUND', 'Case not found.'))
      }

      return reply.send({
        case: legalCase,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/cases')) {
    app.get<{ Querystring: CasesQuerystring }>('/cases', async (request, reply) => {
      const tenantId = getTenantId(request)

      if (!Number.isInteger(tenantId) || tenantId <= 0 || !isNonEmptyString(request.query?.entityId)) {
        return reply.status(400).send(buildRouteError('INVALID_CASES_QUERY', 'entityId is required.'))
      }

      const cases = await getCaseRepository(app).listCasesByEntity(tenantId, request.query.entityId)

      return reply.send({
        cases,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/cases/:id/accept')) {
    app.post<{ Params: { id: string } }>('/cases/:id/accept', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)
      const caseId = request.params.id
      const idempotencyKey = getIdempotencyKey(request)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(caseId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.status(403).send(buildRouteError('CASE_ACCEPT_FORBIDDEN', 'Only a professional can accept this case.'))
      }

      await getCaseService(app).expireAssignmentsForProfessionalInbox(safeTenantId, professional.id)

      const assignment = await getCaseRepository(app).getLatestAssignmentForCaseProfessional(safeTenantId, caseId, professional.id)
      if (!assignment) {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      const result = await getCaseService(app).acceptCase(safeTenantId, caseId, professional.id, idempotencyKey)

      if (result.status === 'replayed') {
        return reply.status(result.responseStatusCode).send(result.responseBody)
      }

      if (result.status === 'not_found') {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      if (result.status === 'accept_conflict') {
        return reply.status(409).send(buildRouteError('CASE_ACCEPT_CONFLICT', 'Case accept is already being processed. Please refresh.'))
      }

      if (result.status === 'case_already_accepted') {
        return reply.status(409).send({
          ...buildRouteError('CASE_ALREADY_ACCEPTED', 'Case already accepted by another lawyer.'),
          assignment: result.assignment,
          case: result.caseRecord,
        })
      }

      if (result.status === 'invalid_state') {
        return reply.status(409).send({
          ...buildRouteError('ASSIGNMENT_INVALID_STATE', 'Assignment is not pending or has expired.'),
          assignment: result.assignment,
        })
      }

      return reply.send({
        assignment: result.assignment,
        case: result.caseRecord,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/cases/:id/reject')) {
    app.post<{ Params: { id: string } }>('/cases/:id/reject', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)
      const caseId = request.params.id

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(caseId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.status(404).send(buildRouteError('PROFESSIONAL_NOT_FOUND', 'Professional not found.'))
      }

      await getCaseService(app).expireAssignmentsForProfessionalInbox(safeTenantId, professional.id)

      const assignment = await getCaseRepository(app).getLatestAssignmentForCaseProfessional(safeTenantId, caseId, professional.id)
      if (!assignment) {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      const result = await getCaseService(app).rejectCase(safeTenantId, caseId, professional.id)

      if (result.status === 'not_found') {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      if (result.status === 'invalid_state') {
        return reply.status(409).send({
          ...buildRouteError('ASSIGNMENT_INVALID_STATE', 'Assignment is not pending or has expired.'),
          assignment: result.assignment,
        })
      }

      return reply.send({
        assignment: result.assignment,
        case: result.caseRecord,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/notifications')) {
    app.get('/notifications', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.send({
          notifications: [],
          unreadCount: 0,
          readCount: 0,
        })
      }

      await getCaseService(app).expireAssignmentsForProfessionalInbox(safeTenantId, professional.id)

      const notifications = await getCaseRepository(app).listAssignmentNotifications(safeTenantId, professional.id)
      const unreadCount = notifications.filter((notification) => !notification.isRead).length
      const readCount = notifications.length - unreadCount

      return reply.send({
        notifications,
        unreadCount,
        readCount,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/lawyer/assignments')) {
    app.get('/lawyer/assignments', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.send({
          assignments: [],
        })
      }

      await getCaseService(app).expireAssignmentsForProfessionalInbox(safeTenantId, professional.id)

      const assignments = await getCaseRepository(app).listAssignmentsForProfessionalInbox(safeTenantId, professional.id)

      return reply.send({
        assignments,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/lawyer/inbox')) {
    app.get('/lawyer/inbox', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.send([])
      }

      await getCaseService(app).expireAssignmentsForProfessionalInbox(safeTenantId, professional.id)

      const assignments = await getCaseRepository(app).listAssignmentsForProfessionalInbox(safeTenantId, professional.id)
      const inbox = assignments
        .filter((assignment) => assignment.status === 'active' && assignment.dispatchExpiresAt)
        .map((assignment) => ({
          caseId: assignment.caseId,
          title: assignment.title,
          city: assignment.city,
          urgency: assignment.priority,
          expiresAt: assignment.dispatchExpiresAt,
          status: 'pending' as const,
        }))

      return reply.send(inbox)
    })
  }

  if (!hasRoute(app, 'POST', '/lawyer/inbox/events-token')) {
    app.post('/lawyer/inbox/events-token', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.status(404).send(buildRouteError('PROFESSIONAL_NOT_FOUND', 'Professional not found.'))
      }

      const tokenRecord = createLawyerInboxEventsToken({
        userId: safeUserId,
        tenantId: safeTenantId,
        professionalId: professional.id,
      })

      return reply.send({
        token: tokenRecord.token,
        expiresAt: tokenRecord.expiresAt,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/lawyer/inbox/events')) {
    app.get<{ Querystring: LawyerInboxEventsQuerystring }>('/lawyer/inbox/events', async (request, reply) => {
      const token = readString(request.query?.token)
      const tokenRecord = validateLawyerInboxEventsToken(token)

      if (!tokenRecord) {
        return reply.status(401).send(buildRouteError('INVALID_EVENTS_TOKEN', 'Invalid or expired events token.'))
      }

      const channel = getLawyerInboxChannel(tokenRecord.tenantId, tokenRecord.professionalId)
      const stream = reply.raw

      reply.hijack()
      stream.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      writeSseEvent(stream, 'inbox.connected', {
        userId: tokenRecord.userId,
        tenantId: tokenRecord.tenantId,
        professionalId: tokenRecord.professionalId,
        occurredAt: new Date().toISOString(),
      })

      const heartbeat = setInterval(() => {
        writeSseEvent(stream, 'heartbeat', {})
      }, 25_000)

      const listener = (event: LawyerInboxEvent) => {
        writeSseEvent(stream, event.type, event)
      }

      subscribe(channel, listener)

      let cleanedUp = false
      const cleanup = () => {
        if (cleanedUp) {
          return
        }

        cleanedUp = true
        clearInterval(heartbeat)
        unsubscribe(channel, listener)
        if (!stream.writableEnded) {
          stream.end()
        }
      }

      request.raw.on('close', cleanup)
      stream.on('close', cleanup)
    })
  }

  if (!hasRoute(app, 'GET', '/lawyer/assignments/debug')) {
    app.get('/lawyer/assignments/debug', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (professional) {
        await getCaseService(app).expireAssignmentsForProfessionalInbox(safeTenantId, professional.id)
      }
      const activeAssignmentsCount = professional
        ? await getCaseRepository(app).countAssignmentsForProfessional(safeTenantId, professional.id)
        : 0
      const marketplace = await getMarketplaceDebugInfo(app)

      return reply.send({
        userId: safeUserId,
        tenantId: safeTenantId,
        professionalFound: Boolean(professional),
        professionalId: professional?.id ?? null,
        activeAssignmentsCount,
        marketplaceEntityId: marketplace.marketplaceEntityId,
        marketplaceTenantId: marketplace.marketplaceTenantId,
        authTenantMatchesMarketplaceTenant: marketplace.marketplaceTenantId === safeTenantId,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/professionals/ranking')) {
    app.get('/professionals/ranking', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const safeTenantId = Number(tenantId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const ranking = await getMatchingService(app).getProfessionalRanking(safeTenantId)

      return reply.send({
        ranking,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/notifications/:id/read')) {
    app.post<{ Params: { id: string } }>('/notifications/:id/read', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(request.params.id)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.status(404).send(buildRouteError('PROFESSIONAL_NOT_FOUND', 'Professional not found.'))
      }

      const notification = await getCaseRepository(app).markAssignmentNotificationRead(
        safeTenantId,
        professional.id,
        request.params.id,
      )

      if (!notification) {
        return reply.status(404).send(buildRouteError('NOTIFICATION_NOT_FOUND', 'Notification not found.'))
      }

      return reply.send({
        notification,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/cases/:id/close')) {
    app.post<{ Params: { id: string }; Body: CloseCaseBody }>('/cases/:id/close', async (request, reply) => {
      const tenantId = getTenantId(request)

      if (!Number.isInteger(tenantId) || tenantId <= 0 || !isNonEmptyString(request.params.id)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      if (
        typeof request.body?.resolutionReason !== 'undefined'
        && request.body.resolutionReason !== null
        && typeof request.body.resolutionReason !== 'string'
      ) {
        return reply.status(400).send(buildRouteError('INVALID_RESOLUTION_REASON', 'resolutionReason must be a string.'))
      }

      const legalCase = await getCaseService(app).closeCase(
        tenantId,
        request.params.id,
        isNonEmptyString(request.body?.resolutionReason) ? request.body.resolutionReason.trim() : undefined,
      )

      if (!legalCase) {
        return reply.status(404).send(buildRouteError('CASE_NOT_FOUND', 'Case not found.'))
      }

      return reply.send({
        case: legalCase,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/cases/:id/dispatch')) {
    app.post<{ Params: { id: string }; Body: DispatchCaseBody }>('/cases/:id/dispatch', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(request.params.id)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      if (!isNonEmptyString(request.body?.professionalId)) {
        return reply.status(400).send(buildRouteError('INVALID_DISPATCH_PAYLOAD', 'professionalId is required.'))
      }

      const legalCase = await getCaseRepository(app).getCaseById(safeTenantId, request.params.id)
      if (!legalCase) {
        const existsInAnotherTenant = await caseExistsOutsideTenant(app, safeTenantId, request.params.id)
        if (existsInAnotherTenant) {
          return reply.status(403).send(buildRouteError('CASE_ACCESS_FORBIDDEN', 'Case access forbidden.'))
        }

        return reply.status(404).send(buildRouteError('CASE_NOT_FOUND', 'Case not found.'))
      }

      if (!legalCase.entityId || !(await isEntityOwner(app, legalCase.entityId, safeUserId, safeTenantId))) {
        return reply.status(403).send(buildRouteError('CASE_DISPATCH_FORBIDDEN', 'Case dispatch forbidden.'))
      }

      const professional = await getCaseRepository(app).getProfessionalById(safeTenantId, request.body.professionalId)
      if (!professional) {
        return reply.status(404).send(buildRouteError('PROFESSIONAL_NOT_FOUND', 'Professional not found.'))
      }

      const dispatched = await getCaseService(app).dispatchCase(
        safeTenantId,
        request.params.id,
        request.body.professionalId,
      )

      if (!dispatched) {
        return reply.status(404).send(buildRouteError('CASE_OR_PROFESSIONAL_NOT_FOUND', 'Case or professional not found.'))
      }

      return reply.status(201).send({
        case: dispatched.caseRecord,
        assignment: dispatched.assignment,
      })
    })
  }

  if (!hasRoute(app, 'GET', '/cases/:id/my-assignment')) {
    app.get<{ Params: { id: string } }>('/cases/:id/my-assignment', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(request.params.id)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.status(404).send(buildRouteError('PROFESSIONAL_NOT_FOUND', 'Professional not found.'))
      }

      const assignment = await getCaseRepository(app).getLatestAssignmentForCaseProfessional(
        safeTenantId,
        request.params.id,
        professional.id,
      )

      if (!assignment) {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      return reply.send({
        assignment,
      })
    })
  }

  if (!hasRoute(app, 'POST', '/assignments/:id/respond')) {
    app.post<{ Params: { id: string }; Body: RespondToAssignmentBody }>('/assignments/:id/respond', { preHandler: [requireAuth] }, async (request, reply) => {
      const tenantId = getAuthenticatedTenantId(request)
      const userId = getAuthenticatedUserId(request)
      const safeTenantId = Number(tenantId)
      const safeUserId = Number(userId)

      if (!Number.isInteger(safeTenantId) || safeTenantId <= 0 || !Number.isInteger(safeUserId) || !isNonEmptyString(request.params.id)) {
        return reply.status(400).send(buildRouteError('INVALID_REQUEST', 'Invalid request.'))
      }

      const normalizedStatus = request.body?.status
        ?? (request.body?.decision === 'accept' ? 'accepted' : request.body?.decision === 'reject' ? 'rejected' : undefined)

      if (normalizedStatus !== 'accepted' && normalizedStatus !== 'rejected') {
        return reply.status(400).send(buildRouteError('INVALID_ASSIGNMENT_STATUS', 'status must be accepted or rejected.'))
      }

      const professional = await getCaseRepository(app).getProfessionalByUserId(safeTenantId, safeUserId)
      if (!professional) {
        return reply.status(404).send(buildRouteError('PROFESSIONAL_NOT_FOUND', 'Professional not found.'))
      }

      const assignment = await getCaseRepository(app).getAssignmentById(safeTenantId, request.params.id)
      if (!assignment) {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      if (assignment.professionalId !== professional.id) {
        return reply.status(403).send(buildRouteError('ASSIGNMENT_ACCESS_FORBIDDEN', 'Assignment does not belong to the current professional.'))
      }

      const result = await getCaseService(app).respondToAssignment(safeTenantId, request.params.id, normalizedStatus)

      if (result.status === 'not_found') {
        return reply.status(404).send(buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'))
      }

      if (result.status === 'invalid_state') {
        return reply.status(409).send({
          ...buildRouteError('ASSIGNMENT_INVALID_STATE', 'Assignment is not active.'),
          assignment: result.assignment,
        })
      }

      return reply.send({
        assignment: result.assignment,
        case: result.caseRecord,
      })
    })
  }
}
