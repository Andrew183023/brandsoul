import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { createLegalBetaCaseService } from '../../modules/legalCases/legalBetaCaseService.js'
import type { CasePortalAccessTokenRecord } from './legalBetaSupport.js'
import { hashCasePortalAccessToken } from './legalBetaSupport.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    sovereignMutationCommandService: SovereignMutationCommandService
  }
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function getCaseService(app: FastifyInstance) {
  return createLegalBetaCaseService(
    getConnection(app),
    (app as FastifyInstance & BackendContext).backendContext.sovereignMutationCommandService,
  )
}

const publicReadRateLimit = createRateLimit({
  namespace: 'legal-beta-client-portal',
  max: 120,
  windowMs: 60_000,
  key: 'ip',
})

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

async function markCasePortalAccessTokenUsed(app: FastifyInstance, tokenId: string) {
  const now = new Date().toISOString()
  await getConnection(app).run(
    `
      UPDATE case_portal_access_tokens
      SET last_used_at = ?, updated_at = ?
      WHERE id = ?
    `,
    now,
    now,
    tokenId,
  )
}

export async function registerLegalBetaClientPortalRoutes(app: FastifyInstance) {
  app.get<{ Params: { caseId: string; token: string } }>('/client/portal/:caseId/:token', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const portalAccess = await getCasePortalAccessTokenRecord(app, request.params.caseId, request.params.token)
    if (!portalAccess) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'PORTAL_ACCESS_NOT_FOUND',
          message: 'Portal access token not found.',
        },
      })
    }

    if (portalAccess.status !== 'active') {
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

    await markCasePortalAccessTokenUsed(app, portalAccess.id)

    return {
      status: 'ready',
      case: {
        caseId: caseSummary.caseId,
        status: caseSummary.status,
        practiceArea: caseSummary.practiceArea,
        officeName: caseSummary.officeName,
        createdAt: caseSummary.createdAt,
        updatedAt: caseSummary.updatedAt,
        responsibleProfessional: caseSummary.responsibleProfessional,
        timeline: caseSummary.timeline,
      },
    }
  })
}
