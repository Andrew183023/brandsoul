import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import { LegalMetricsRecorder } from '../../modules/legalCases/legalMetricsRecorder.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { createLegalBetaCaseService } from '../../modules/legalCases/legalBetaCaseService.js'
import type { CasePortalAccessTokenRecord } from './legalBetaSupport.js'
import {
  hashCasePortalAccessToken,
  markCasePortalAccessTokenUsed,
  recordLegalPortalAccessMetric,
} from './legalBetaSupport.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    sovereignMutationCommandService: SovereignMutationCommandService
    observability: ObservabilityService
  }
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
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

function getLegalMetricsRecorder(app: FastifyInstance) {
  return new LegalMetricsRecorder(
    (app as FastifyInstance & BackendContext).backendContext.observability,
  )
}

const publicReadRateLimit = createRateLimit({
  namespace: 'legal-beta-client-portal',
  max: 120,
  windowMs: 60_000,
  key: 'ip',
})

const publicWriteRateLimit = createRateLimit({
  namespace: 'legal-beta-client-portal-write',
  max: 40,
  windowMs: 60_000,
  key: 'ip',
})

const MAX_CLIENT_PORTAL_MESSAGE_LENGTH = 4_000

type PublicPortalMessageBody = {
  body?: string
  message?: string
  text?: string
  responseText?: string
}

async function getCasePortalAccessTokenRecord(app: FastifyInstance, caseId: string, token: string) {
  const row = await getConnection(app).get<CasePortalAccessTokenRecord>(
    `
      SELECT
        id,
        tenant_id,
        case_id,
        token_hash,
        status,
        issued_at,
        expires_at,
        revoked_at,
        last_used_at,
        created_at,
        updated_at
      FROM case_portal_access_tokens
      WHERE case_id = ? AND token_hash = ?
      LIMIT 1
    `,
    caseId,
    hashCasePortalAccessToken(token),
  )

  return row ?? null
}

function readPublicPortalMessageBody(body: PublicPortalMessageBody | undefined) {
  const candidate = body?.text ?? body?.body ?? body?.message ?? body?.responseText
  return typeof candidate === 'string' ? candidate.trim() : ''
}

async function resolveValidatedPortalAccess(
  app: FastifyInstance,
  caseId: string,
  token: string,
) {
  const portalAccess = await getCasePortalAccessTokenRecord(app, caseId, token)
  if (!portalAccess) {
    await recordLegalPortalAccessMetric({
      db: getConnection(app),
      recorder: getLegalMetricsRecorder(app),
      metricName: 'legal_portal_access_invalid_total',
      source: 'portal',
      reason: 'invalid_token',
      result: 'blocked',
    })
    return {
      ok: false as const,
      replyStatus: 401,
      payload: {
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_INVALID',
          message: 'Portal access token is invalid.',
        },
      },
    }
  }

  const expiresAt = Date.parse(String(portalAccess.expires_at))
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    await recordLegalPortalAccessMetric({
      db: getConnection(app),
      recorder: getLegalMetricsRecorder(app),
      metricName: 'legal_portal_access_expired_total',
      tenantId: portalAccess.tenant_id,
      caseId,
      source: 'portal',
      reason: 'expired_token',
      result: 'blocked',
    })
    return {
      ok: false as const,
      replyStatus: 410,
      payload: {
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_EXPIRED',
          message: 'Portal access token expired.',
        },
      },
    }
  }

  if (portalAccess.status !== 'active') {
    await recordLegalPortalAccessMetric({
      db: getConnection(app),
      recorder: getLegalMetricsRecorder(app),
      metricName: 'legal_portal_access_invalid_total',
      tenantId: portalAccess.tenant_id,
      caseId,
      source: 'portal',
      reason: 'invalid_token',
      result: 'blocked',
    })
    return {
      ok: false as const,
      replyStatus: 401,
      payload: {
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_INVALID',
          message: 'Portal access token is invalid.',
        },
      },
    }
  }

  return {
    ok: true as const,
    portalAccess,
  }
}

function mapPublicPortalMessage(message: {
  id: string
  direction: 'inbound' | 'outbound' | 'internal'
  authorProfessionalId?: string
  body: string
  createdAt: string
}) {
  return {
    id: message.id,
    role: message.direction === 'inbound' ? 'user' : (message.authorProfessionalId ? 'lawyer' : 'system'),
    text: message.body,
    actorId: message.authorProfessionalId,
    createdAt: message.createdAt,
  }
}

export async function registerLegalBetaClientPortalRoutes(app: FastifyInstance) {
  app.get<{ Params: { caseId: string; token: string } }>('/client/portal/:caseId/:token', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const portalAccess = await getCasePortalAccessTokenRecord(app, request.params.caseId, request.params.token)
    if (!portalAccess) {
      await recordLegalPortalAccessMetric({
        db: getConnection(app),
        recorder: getLegalMetricsRecorder(app),
        metricName: 'legal_portal_access_invalid_total',
        source: 'portal',
        reason: 'invalid_token',
        result: 'blocked',
      })
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_NOT_FOUND',
          message: 'Portal access token not found.',
        },
      })
    }

    if (portalAccess.status !== 'active') {
      await recordLegalPortalAccessMetric({
        db: getConnection(app),
        recorder: getLegalMetricsRecorder(app),
        metricName: 'legal_portal_access_invalid_total',
        tenantId: portalAccess.tenant_id,
        caseId: request.params.caseId,
        source: 'portal',
        reason: 'invalid_token',
        result: 'blocked',
      })
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_REVOKED',
          message: 'Portal access token is no longer active.',
        },
      })
    }

    const expiresAt = Date.parse(String(portalAccess.expires_at))
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      await recordLegalPortalAccessMetric({
        db: getConnection(app),
        recorder: getLegalMetricsRecorder(app),
        metricName: 'legal_portal_access_expired_total',
        tenantId: portalAccess.tenant_id,
        caseId: request.params.caseId,
        source: 'portal',
        reason: 'expired_token',
        result: 'blocked',
      })
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_EXPIRED',
          message: 'Portal access token expired.',
        },
      })
    }

    const caseSummary = await getCaseService(app).getClientPortalCase({
      tenantId: portalAccess.tenant_id,
      caseId: request.params.caseId,
    })

    if (!caseSummary) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.caseId}" was not found.`,
        },
      })
    }

    await markCasePortalAccessTokenUsed({
      db: getConnection(app),
      tenantId: portalAccess.tenant_id,
      caseId: request.params.caseId,
      tokenId: portalAccess.id,
      source: 'legal_beta_client_portal',
      recorder: getLegalMetricsRecorder(app),
    })
    const canonicalCase = caseSummary.canonical?.case

    return {
      status: 'ready',
      case: {
        caseId: canonicalCase?.caseId ?? caseSummary.caseId,
        status: canonicalCase?.status === 'archived'
          ? 'closed'
          : (canonicalCase?.status ?? caseSummary.status),
        practiceArea: canonicalCase?.practiceArea ?? caseSummary.practiceArea,
        officeName: caseSummary.officeName,
        createdAt: canonicalCase?.openedAt ?? caseSummary.createdAt,
        updatedAt: caseSummary.updatedAt,
        responsibleProfessional: canonicalCase?.responsibleProfessional
          ? {
              id: canonicalCase.responsibleProfessional.id,
              displayName: canonicalCase.responsibleProfessional.displayName,
              photoUrl: canonicalCase.responsibleProfessional.photoUrl,
              oabCredential: canonicalCase.responsibleProfessional.oabCredential,
              specialty: canonicalCase.responsibleProfessional.specialty,
            }
          : caseSummary.responsibleProfessional,
        timeline: Array.isArray(canonicalCase?.timeline) ? canonicalCase.timeline : caseSummary.timeline,
      },
    }
  })

  app.get<{ Params: { caseId: string; token: string } }>('/client/portal/:caseId/:token/messages', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const portalAccessResult = await resolveValidatedPortalAccess(app, request.params.caseId, request.params.token)
    if (!portalAccessResult.ok) {
      return reply.status(portalAccessResult.replyStatus).send(portalAccessResult.payload)
    }

    const messages = await getCaseService(app).getCaseMessages(portalAccessResult.portalAccess.tenant_id, request.params.caseId)
    await markCasePortalAccessTokenUsed({
      db: getConnection(app),
      tenantId: portalAccessResult.portalAccess.tenant_id,
      caseId: request.params.caseId,
      tokenId: portalAccessResult.portalAccess.id,
      source: 'legal_beta_client_portal',
      recorder: getLegalMetricsRecorder(app),
    })

    return {
      status: 'ready',
      caseId: request.params.caseId,
      messages: messages.map(mapPublicPortalMessage),
    }
  })

  app.post<{ Params: { caseId: string; token: string }; Body: PublicPortalMessageBody }>('/client/portal/:caseId/:token/messages', { preHandler: [publicWriteRateLimit] }, async (request, reply) => {
    const portalAccessResult = await resolveValidatedPortalAccess(app, request.params.caseId, request.params.token)
    if (!portalAccessResult.ok) {
      return reply.status(portalAccessResult.replyStatus).send(portalAccessResult.payload)
    }

    const body = readPublicPortalMessageBody(request.body)
    if (!body) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_MESSAGE',
          message: 'Message body is required.',
        },
      })
    }

    if (body.length > MAX_CLIENT_PORTAL_MESSAGE_LENGTH) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_MESSAGE',
          message: `Message exceeds ${MAX_CLIENT_PORTAL_MESSAGE_LENGTH} characters.`,
        },
      })
    }

    const messageResult = await getCaseService(app).addMessage({
      tenantId: portalAccessResult.portalAccess.tenant_id,
      caseId: request.params.caseId,
      body,
      direction: 'inbound',
    })

    if (messageResult.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.caseId}" was not found.`,
        },
      })
    }

    if (messageResult.status === 'closed') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'CASE_CLOSED_FOR_MESSAGES',
          message: 'Case is closed for new messages.',
        },
      })
    }

    if (messageResult.status === 'responsible_required') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'CASE_RESPONSIBLE_REQUIRED',
          message: 'Case requires a responsible professional before sending replies.',
        },
      })
    }

    const messages = await getCaseService(app).getCaseMessages(portalAccessResult.portalAccess.tenant_id, request.params.caseId)
    await markCasePortalAccessTokenUsed({
      db: getConnection(app),
      tenantId: portalAccessResult.portalAccess.tenant_id,
      caseId: request.params.caseId,
      tokenId: portalAccessResult.portalAccess.id,
      source: 'legal_beta_client_portal',
      recorder: getLegalMetricsRecorder(app),
    })
    const latestMessage = messageResult.message ?? messages.at(-1)

    return {
      status: 'ready',
      caseId: request.params.caseId,
      message: latestMessage ? mapPublicPortalMessage(latestMessage) : undefined,
      messages: messages.map(mapPublicPortalMessage),
    }
  })
}
