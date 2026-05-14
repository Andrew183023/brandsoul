import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { StoredEntityProfile } from '../../domain/entityProfile.js'
import { getInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { getRequestAuth } from './requireAuth.js'

type BackendContext = {
  backendContext: {
    entityRepository: EntityRepository
  }
}

function getRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

export function buildLegacyOwnerId(userId: number, tenantId: number) {
  return `user:${userId}:tenant:${tenantId}`
}

export type EntityOwnershipValidation = {
  source: 'canonical' | 'legacy-backfilled'
  ownerUserId: number
  ownerTenantId: number
  ownerId?: string
}

function readPositiveInteger(value: unknown) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

function resolveCanonicalOwnership(entity: StoredEntityProfile) {
  const ownerUserId = readPositiveInteger(entity.ownerUserId)
  const ownerTenantId = readPositiveInteger(entity.ownerTenantId)

  if (!ownerUserId || !ownerTenantId) {
    return null
  }

  return {
    ownerUserId,
    ownerTenantId,
  }
}

export function validateEntityOwnership(entity: StoredEntityProfile, userId: number, tenantId: number): EntityOwnershipValidation | null {
  const canonicalOwnership = resolveCanonicalOwnership(entity)
  if (canonicalOwnership) {
    if (canonicalOwnership.ownerUserId === userId && canonicalOwnership.ownerTenantId === tenantId) {
      return {
        source: 'canonical',
        ownerId: entity.ownerId,
        ownerUserId: canonicalOwnership.ownerUserId,
        ownerTenantId: canonicalOwnership.ownerTenantId,
      }
    }

    return null
  }

  const expectedLegacyOwnerId = buildLegacyOwnerId(userId, tenantId)
  if (entity.ownerId === expectedLegacyOwnerId) {
    return {
      source: 'legacy-backfilled',
      ownerId: entity.ownerId,
      ownerUserId: userId,
      ownerTenantId: tenantId,
    }
  }

  return null
}

export async function requireEntityOwner(request: FastifyRequest, reply: FastifyReply) {
  const auth = getRequestAuth(request)
  if (!auth) {
    return reply.status(401).send({
      status: 'failed',
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      },
    })
  }

  const entityId = String((request.params as { id?: string } | undefined)?.id ?? '')
  const entity = await getRepository(request.server).getEntityById(entityId)
  if (!entity) {
    request.log.warn({
      event: 'entity.owner_check_failed',
      traceId: request.traceId ?? request.id,
      entityId,
      reason: 'entity_not_found',
    }, 'Entity not found during ownership check')
    return reply.status(404).send({
      status: 'failed',
      error: {
        code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
  }

  const validatedOwnership = validateEntityOwnership(entity, auth.userId, auth.tenantId)
  if (validatedOwnership) {
    if (validatedOwnership.source === 'legacy-backfilled') {
      const updatedEntity = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
        authoritySource: 'backend/src/api/middleware/requireEntityOwner.ts#legacyBackfill',
        context: {
          mutationType: 'entity.ownership.backfill',
          mutationScope: 'entity',
          requestedCapability: 'orchestrator.command.execute',
          runtimeMode: 'normal',
          continuityMode: 'institutional_safe',
          replayVerificationState: 'verified',
          attestationIntegrity: 'verified',
          recoveryRequired: false,
          actor: 'admin',
          traceId: request.traceId ?? request.id,
        },
        work: () => getRepository(request.server).setEntityOwnership({
          id: entity.id,
          ownerId: validatedOwnership.ownerId,
          ownerUserId: validatedOwnership.ownerUserId,
          ownerTenantId: validatedOwnership.ownerTenantId,
        }),
      })

      request.log.warn({
        event: 'entity.owner_backfilled',
        traceId: request.traceId ?? request.id,
        entityId,
        ownerUserId: validatedOwnership.ownerUserId,
        ownerTenantId: validatedOwnership.ownerTenantId,
      }, 'Entity ownership backfilled from legacy ownerId')

      request.entityRecord = updatedEntity ?? {
        ...entity,
        ownerUserId: validatedOwnership.ownerUserId,
        ownerTenantId: validatedOwnership.ownerTenantId,
      }
      request.entityOwnership = validatedOwnership
      return
    }

    request.entityRecord = entity
    request.entityOwnership = validatedOwnership
    return
  }

  const canonicalOwnership = resolveCanonicalOwnership(entity)
  request.log.warn({
    event: 'entity.owner_check_failed',
    traceId: request.traceId ?? request.id,
    entityId,
    authUserId: auth.userId,
    authTenantId: auth.tenantId,
    ownerUserId: canonicalOwnership?.ownerUserId,
    ownerTenantId: canonicalOwnership?.ownerTenantId,
    legacyOwnerId: entity.ownerId,
  }, 'Entity access denied')
  return reply.status(403).send({
    status: 'failed',
    error: {
      code: 'ENTITY_ACCESS_DENIED',
      message: 'You do not own this entity.',
    },
  })
}
