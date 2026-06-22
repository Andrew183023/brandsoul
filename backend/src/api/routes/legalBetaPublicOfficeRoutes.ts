import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityBusinessConfig } from '../../domain/entityBusinessConfig.js'
import type { StoredEntityProfile } from '../../domain/entityProfile.js'
import type { AssetStorageService } from '../../services/assetStorageService.js'
import type { BackendDatabase } from '../../db/index.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { ensureCanonicalEntityIdentity } from '../../entities/identity/entityIdentityBuilder.js'
import { buildSemanticFingerprint, getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'
import { getRequestAuth, optionalAuth, requireAuth } from '../middleware/requireAuth.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'
import { createLegalBetaCaseService } from '../../modules/legalCases/legalBetaCaseService.js'
import {
  buildOfficeBusinessConfigProjection,
  buildPublicOfficeProfile,
  buildPublicPresencePayload,
  mergeBusinessConfig,
  parseDataUrlPayload,
  readEntityBusinessConfig,
  safeJsonObject,
  validateBusinessConfig,
  validateOfficeProfessionalPayload,
  writeEntityBusinessConfig,
} from './legalBetaSupport.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    assetStorageService: AssetStorageService
    auth: {
      backendNativeAuthStoreRepository: {
        findUserById(userId: number): Promise<{ id: number; isActive: boolean } | null>
        findTenantById(tenantId: number): Promise<{ id: number; isActive: boolean } | null>
        findMembershipForUserAndTenant(userId: number, tenantId: number): Promise<{ id: number } | null>
      }
    }
  }
}

type BusinessConfigBody = {
  businessConfig?: Partial<EntityBusinessConfig>
}

type OfficeProfessionalBody = {
  professional?: {
    displayName?: string
    email?: string
    phone?: string
    photoUrl?: string
    oabCredential?: string
    specialties?: string[]
    bio?: string
    isResponsible?: boolean
    isPublic?: boolean
    status?: 'active' | 'inactive' | 'suspended'
  }
}

type PublicInteractionRequest = {
  requestId?: string
  userMessage: string
  triage?: {
    context: string
    urgency: 'critical' | 'priority' | 'planned'
    objective: string
    contactPreference: string
    contactValue: string
    practiceArea?: string
    city?: string
  }
  businessContext?: {
    officeName?: string
  }
}

type OfficeMediaUploadBody = {
  fileName?: string
  dataUrl?: string
}

type CreateOfficeBody = {
  name?: string
  category?: string
  primaryColor?: string
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}


function getNativeAuthRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.auth.backendNativeAuthStoreRepository
}

async function isActiveNativeOwner(app: FastifyInstance, entity: { ownerUserId?: number | null; ownerTenantId?: number | null }) {
  if (typeof entity.ownerUserId !== 'number' || typeof entity.ownerTenantId !== 'number') {
    return false
  }

  const authRepository = getNativeAuthRepository(app)
  const [user, tenant, membership] = await Promise.all([
    authRepository.findUserById(entity.ownerUserId),
    authRepository.findTenantById(entity.ownerTenantId),
    authRepository.findMembershipForUserAndTenant(entity.ownerUserId, entity.ownerTenantId),
  ])

  return Boolean(user?.isActive && tenant?.isActive && membership)
}

function getRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

function getAssetStorageService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.assetStorageService
}

function getCaseRepository(app: FastifyInstance) {
  return createCaseRepository(getConnection(app))
}

function getCaseService(app: FastifyInstance) {
  return createLegalBetaCaseService(getConnection(app))
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

  const ownerUserTenantMatch = entity.ownerUserId === auth.userId && entity.ownerTenantId === auth.tenantId
  const legacyOwnerIdMatch = entity.ownerId === buildLegacyOwnerId(auth.userId, auth.tenantId)
  const route = `${request.method.toUpperCase()} ${request.routeOptions.url}`

  if (!ownerUserTenantMatch && !legacyOwnerIdMatch) {
    request.log.warn({
      event: 'legal.office.ownership-check',
      officeId,
      authUserId: auth.userId,
      authTenantId: auth.tenantId,
      entityOwnerUserId: entity.ownerUserId ?? null,
      entityOwnerTenantId: entity.ownerTenantId ?? null,
      entityOwnerId: entity.ownerId ?? null,
      ownerUserTenantMatch,
      legacyOwnerIdMatch,
      decision: 'denied',
      route,
    }, 'Legal office ownership denied')
    await reply.status(403).send({
      status: 'failed',
      error: {
        code: 'ENTITY_ACCESS_DENIED',
        message: 'You do not own this office.',
      },
    })
    return null
  }

  request.log.info({
    event: 'legal.office.ownership-check',
    officeId,
    authUserId: auth.userId,
    authTenantId: auth.tenantId,
    entityOwnerUserId: entity.ownerUserId ?? null,
    entityOwnerTenantId: entity.ownerTenantId ?? null,
    entityOwnerId: entity.ownerId ?? null,
    ownerUserTenantMatch,
    legacyOwnerIdMatch,
    decision: 'allowed',
    route,
  }, 'Legal office ownership allowed')

  return { auth, entity }
}

async function buildPublicOfficeProfessionalsPayload(app: FastifyInstance, officeId: string, ownerTenantId: number) {
  const professionals = await getCaseRepository(app).listDetailedProfessionalsForTenant(ownerTenantId)
  const officeProfessionals = professionals
    .filter((professional) => professional.officeId === officeId && professional.status === 'active')

  const publicProfessionals = officeProfessionals
    .filter((professional) => professional.isPublic === true || professional.isResponsible === true)
    .map((professional) => ({
      id: professional.id,
      fullName: professional.displayName,
      photoUrl: professional.photoUrl,
      oabCredential: professional.oabCredential,
      specialties: professional.specialties,
      bio: professional.bio,
      isResponsible: professional.isResponsible,
    }))

  const responsible = publicProfessionals.find((professional) => professional.isResponsible === true)
  const others = publicProfessionals
    .filter((professional) => !professional.isResponsible)
    .map(({ isResponsible: _isResponsible, ...professional }) => professional)

  return {
    status: 'ready' as const,
    officeId,
    responsible: responsible ? {
      id: responsible.id,
      fullName: responsible.fullName,
      photoUrl: responsible.photoUrl,
      oabCredential: responsible.oabCredential,
      specialties: responsible.specialties,
      bio: responsible.bio,
    } : undefined,
    professionals: others,
  }
}

function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function slugifyOfficeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function createOfficeEntityProfile(officeId: string, officeName: string, primaryColor?: string): EntityProfile {
  const createdAt = new Date().toISOString()
  return ensureCanonicalEntityIdentity({
    id: officeId,
    social: {
      publicName: officeName,
    },
    metadata: {
      createdAt,
      notes: [],
      businessConfig: {
        businessType: 'legal',
        officeName,
      },
    },
    palette: {
      primary: primaryColor?.trim() || '#1f6feb',
      contrast: '#ffffff',
    },
  } as unknown as EntityProfile, {
    tenantId: undefined,
    entityType: 'legal',
    createdAt,
    preserveEntityId: officeId,
  })
}

function isGovernedOfficeEntityResult(value: unknown): value is StoredEntityProfile<EntityProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.entityProfile === 'object'
    && record.entityProfile !== null
    && !Array.isArray(record.entityProfile)
}

async function createOfficeThroughAuthorityBoundary(args: {
  repository: EntityRepository
  officeId: string
  officeName: string
  ownerId: string
  ownerUserId: number
  ownerTenantId: number
  entityProfile: EntityProfile
}) {
  const now = new Date().toISOString()

  const { result } = await getSemanticMutationExecutor().executeSemanticMutation({
    authoritySource: 'backend/src/api/routes/legalBetaPublicOfficeRoutes.ts#createOfficeThroughAuthorityBoundary',
    intent: {
      intentId: `legal-office-create:${args.ownerTenantId}:${args.ownerUserId}:${args.officeId}`,
      intentType: 'legal.office.create',
      domain: 'entity',
      actor: 'admin',
      targetRef: {
        entityId: args.officeId,
        userId: String(args.ownerUserId),
        tenantId: String(args.ownerTenantId),
      },
      semanticPurpose: 'create a governed legal office entity for the authenticated office owner',
      expectedInstitutionalEffect: ['legal_office_created', 'entity_owner_context_attached'],
      riskLevel: 'high',
      replayRelevant: true,
      continuityRelevant: true,
      authRelevant: false,
      createdAt: now,
    },
    captureBeforeState: async () => ({
      existingEntity: await args.repository.getEntityById<EntityProfile>(args.officeId),
    }),
    executePersistence: async () => args.repository.createEntity({
      id: args.officeId,
      ownerId: args.ownerId,
      ownerUserId: args.ownerUserId,
      ownerTenantId: args.ownerTenantId,
      entityProfile: args.entityProfile,
      createdAt: now,
      updatedAt: now,
    }),
    captureAfterState: (persisted) => ({
      entityId: persisted.id,
      ownerId: persisted.ownerId,
      ownerUserId: persisted.ownerUserId,
      ownerTenantId: persisted.ownerTenantId,
      businessConfig: readEntityBusinessConfig(persisted.entityProfile as EntityProfile),
    }),
    deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
      effectId: `${intent.intentId}:effect`,
      intentId: intent.intentId,
      effectType: 'legal.office.create.completed',
      domain: intent.domain,
      beforeFingerprint: buildSemanticFingerprint(beforeState),
      afterFingerprint: buildSemanticFingerprint(afterState),
      changedFields: ['entity_profile', 'entity_owner_context', 'entity_business_config'],
      institutionalMeaning: 'the legal office was created through the governed sovereign mutation boundary',
      replayFingerprint: buildSemanticFingerprint({
        intentType: intent.intentType,
        officeId: args.officeId,
        ownerUserId: args.ownerUserId,
        ownerTenantId: args.ownerTenantId,
      }),
      continuityLineageHash: sovereignAttestation.lineageHash,
      mutationLineageHash: '',
      verified: false,
    }),
  })

  return result
}

async function updateOfficeConfigurationThroughAuthorityBoundary(args: {
  repository: EntityRepository
  office: StoredEntityProfile<EntityProfile> | null
  auth: { userId: number; tenantId: number }
  businessConfig: EntityBusinessConfig
}) {
  if (!args.office) {
    return null
  }

  const office = args.office
  const now = new Date().toISOString()
  const nextProfile = writeEntityBusinessConfig(office.entityProfile as EntityProfile, args.businessConfig)
  const previousBusinessConfig = readEntityBusinessConfig(office.entityProfile as EntityProfile)
  const previousBusinessConfigFingerprint = buildSemanticFingerprint(previousBusinessConfig ?? null)
  const changedFields = Object.keys(args.businessConfig).length > 0
    ? ['entity_business_config', 'entity_profile', ...Object.keys(args.businessConfig).map((field) => `business_config.${field}`)]
    : ['entity_business_config', 'entity_profile']

  const { result } = await getSemanticMutationExecutor().executeSemanticMutation({
    authoritySource: 'backend/src/api/routes/legalBetaPublicOfficeRoutes.ts#updateOfficeConfiguration',
    intent: {
      intentId: `legal-office-configure:${office.id}:${args.auth.userId}:${args.auth.tenantId}:${previousBusinessConfigFingerprint}`,
      intentType: 'legal.office.configure',
      domain: 'entity',
      actor: 'admin',
      targetRef: {
        entityId: office.id,
        userId: String(args.auth.userId),
        tenantId: String(args.auth.tenantId),
      },
      semanticPurpose: 'update the governed legal office business configuration for the authenticated owner',
      expectedInstitutionalEffect: ['legal_office_configuration_updated'],
      riskLevel: 'high',
      replayRelevant: true,
      continuityRelevant: true,
      authRelevant: false,
      createdAt: now,
    },
    captureBeforeState: async () => ({
      officeId: office.id,
      ownerUserId: office.ownerUserId,
      ownerTenantId: office.ownerTenantId,
      businessConfig: previousBusinessConfig,
    }),
    executePersistence: async () => {
      const updated = await args.repository.updateEntity<EntityProfile>({
        id: office.id,
        entityProfile: nextProfile,
      })
      if (!updated) {
        throw new Error(`Legal office ${office.id} disappeared during governed configuration update.`)
      }
      return updated
    },
    captureAfterState: async (persisted) => ({
      officeId: persisted.id,
      ownerUserId: persisted.ownerUserId,
      ownerTenantId: persisted.ownerTenantId,
      businessConfig: readEntityBusinessConfig(persisted.entityProfile as EntityProfile),
    }),
    deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
      effectId: `${intent.intentId}:effect`,
      intentId: intent.intentId,
      effectType: 'legal.office.configuration.updated',
      domain: intent.domain,
      beforeFingerprint: buildSemanticFingerprint(beforeState),
      afterFingerprint: buildSemanticFingerprint(afterState),
      changedFields,
      institutionalMeaning: 'the governed legal office configuration was updated through the sovereign mutation boundary',
      replayFingerprint: buildSemanticFingerprint({
        intentType: intent.intentType,
        officeId: office.id,
        ownerUserId: args.auth.userId,
        ownerTenantId: args.auth.tenantId,
        changedFields,
      }),
      continuityLineageHash: sovereignAttestation.lineageHash,
      mutationLineageHash: '',
      verified: false,
    }),
    canonicalReplayShape: {
      requiredFields: ['id', 'entityProfile'],
    },
    canonicalShapeVerifier: (payload) => {
      if (!isGovernedOfficeEntityResult(payload)) {
        return {
          canonicalShapeVerified: false,
          semanticIntegrity: 'invalid' as const,
          issues: ['governed_office_entity_result_invalid'],
        }
      }

      return {
        canonicalShapeVerified: true,
        semanticIntegrity: 'verified' as const,
        issues: [],
        normalizedPayload: payload,
      }
    },
    replayHydrateResult: async (payload) => (isGovernedOfficeEntityResult(payload) ? payload : null),
  })

  return result
}

const publicReadRateLimit = createRateLimit({
  namespace: 'legal-beta-public-read',
  max: 120,
  windowMs: 60_000,
  key: 'ip',
})

const publicActionRateLimit = createRateLimit({
  namespace: 'legal-beta-public-action',
  max: 20,
  windowMs: 60_000,
  key: 'ip',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArchivedEntityProfile(entityProfile: unknown) {
  if (!isRecord(entityProfile)) return false

  const metadata = isRecord(entityProfile.metadata) ? entityProfile.metadata : {}
  const lifecycle = isRecord(metadata.lifecycle) ? metadata.lifecycle : {}

  return lifecycle.status === 'archived'
}

const privateWriteRateLimit = createRateLimit({
  namespace: 'legal-beta-private-write',
  max: 60,
  windowMs: 60_000,
  key: 'user',
})

export async function registerLegalBetaPublicOfficeRoutes(app: FastifyInstance) {
  app.get('/me/escritorios', { preHandler: [requireAuth] }, async (request) => {
    const auth = getRequestAuth(request)!
    const entities = await getRepository(app).getEntitiesByOwnerUserId<EntityProfile>(auth.userId, auth.tenantId)
    const activeOwnerEntities = []
    for (const entity of entities) {
      if (isArchivedEntityProfile(entity.entityProfile)) {
        request.log.warn({
          event: 'legal.office.archived-filtered',
          authUserId: auth.userId,
          authTenantId: auth.tenantId,
          officeId: entity.id,
          ownerUserId: entity.ownerUserId ?? null,
          ownerTenantId: entity.ownerTenantId ?? null,
        }, 'Archived legal office filtered')
        continue
      }

      if (await isActiveNativeOwner(app, entity)) {
        activeOwnerEntities.push(entity)
        continue
      }

      request.log.warn({
        event: 'legal.office.ownership-orphan-filtered',
        authUserId: auth.userId,
        authTenantId: auth.tenantId,
        officeId: entity.id,
        ownerUserId: entity.ownerUserId ?? null,
        ownerTenantId: entity.ownerTenantId ?? null,
      }, 'Orphan legal office ownership filtered')
    }

    const offices = activeOwnerEntities
      .filter((entity) => readEntityBusinessConfig(entity.entityProfile)?.businessType === 'legal')
      .map((entity) => {
        const businessConfig = readEntityBusinessConfig(entity.entityProfile)
        return {
          officeId: entity.id,
          officeName: businessConfig?.officeName ?? buildPublicOfficeProfile(entity.id, entity.entityProfile).name,
          status: businessConfig?.officeName ? 'ready' as const : 'draft' as const,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
        }
      })

    request.log.info({
      event: 'legal.office.list-owned',
      authUserId: auth.userId,
      authTenantId: auth.tenantId,
      returnedOfficeIds: offices.map((office) => office.officeId),
      returnedOwnerPairs: entities
        .filter((entity) => readEntityBusinessConfig(entity.entityProfile)?.businessType === 'legal')
        .map((entity) => ({
          officeId: entity.id,
          ownerUserId: entity.ownerUserId ?? null,
          ownerTenantId: entity.ownerTenantId ?? null,
        })),
    }, 'Listed owned legal offices')

    return {
      status: 'ready' as const,
      userId: auth.userId,
      tenantId: auth.tenantId,
      offices,
    }
  })

  app.post<{ Body: CreateOfficeBody }>('/escritorios/criar', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const officeName = request.body?.name?.trim() ?? ''

    if (officeName.length < 2) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_INPUT',
          message: 'name is required.',
        },
      })
    }

    const officeId = `office-${slugifyOfficeName(officeName) || createRequestId()}-${createRequestId()}`
    const ownerId = buildLegacyOwnerId(auth.userId, auth.tenantId)
    const entityProfile = createOfficeEntityProfile(officeId, officeName, request.body?.primaryColor)

    await createOfficeThroughAuthorityBoundary({
      repository: getRepository(app),
      officeId,
      officeName,
      ownerId,
      ownerUserId: auth.userId,
      ownerTenantId: auth.tenantId,
      entityProfile,
    })

    return reply.status(201).send({
      status: 'ready',
      officeId,
      officeName,
    })
  })

  app.get<{ Params: { id: string } }>('/escritorios/:id/publico', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const entity = await getRepository(app).getEntityById<EntityProfile>(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'OFFICE_NOT_FOUND',
          message: `Office "${request.params.id}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      officeId: request.params.id,
      publicProfile: buildPublicOfficeProfile(request.params.id, entity.entityProfile as EntityProfile),
      businessConfig: readEntityBusinessConfig(entity.entityProfile as EntityProfile) ?? null,
    }
  })

  app.get<{ Params: { id: string } }>('/escritorios/:id/configuracao', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    if (!(await isActiveNativeOwner(app, owned.entity))) {
      request.log.warn({
        event: 'legal.office.ownership-orphan-denied',
        authUserId: owned.auth.userId,
        authTenantId: owned.auth.tenantId,
        officeId: owned.entity.id,
        ownerUserId: owned.entity.ownerUserId ?? null,
        ownerTenantId: owned.entity.ownerTenantId ?? null,
      }, 'Orphan legal office ownership denied')
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this office.',
        },
      })
    }

    const businessConfig = await getCaseService(app).buildOfficeBusinessConfig(
      owned.entity.ownerTenantId ?? owned.auth.tenantId,
      owned.entity.id,
      owned.entity.entityProfile as EntityProfile,
    )

    return {
      status: 'ready',
      officeId: owned.entity.id,
      businessConfig,
    }
  })

  app.post<{ Params: { id: string }; Body: BusinessConfigBody }>('/escritorios/:id/configuracao', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    const patch = request.body?.businessConfig
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_CONFIGURATION',
          message: 'businessConfig is required.',
        },
      })
    }

    const currentBusinessConfig = readEntityBusinessConfig(owned.entity.entityProfile as EntityProfile)
    const mergedBusinessConfig = mergeBusinessConfig(currentBusinessConfig, patch)
    const validationError = validateBusinessConfig(mergedBusinessConfig)
    if (validationError) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_CONFIGURATION',
          message: validationError,
        },
      })
    }

    const updated = await updateOfficeConfigurationThroughAuthorityBoundary({
      repository: getRepository(app),
      office: owned.entity,
      auth: owned.auth,
      businessConfig: mergedBusinessConfig,
    })

    if (!updated) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'OFFICE_NOT_FOUND',
          message: `Office "${owned.entity.id}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      officeId: owned.entity.id,
      businessConfig: await getCaseService(app).buildOfficeBusinessConfig(
        owned.entity.ownerTenantId ?? owned.auth.tenantId,
        owned.entity.id,
        updated.entityProfile as EntityProfile,
      ),
      updatedAt: updated.updatedAt,
    }
  })

  app.get<{ Params: { id: string } }>('/escritorios/:id/profissionais', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    return {
      status: 'ready',
      officeId: request.params.id,
      professionals: await getCaseService(app).listOfficeProfessionals(owned.entity.ownerTenantId ?? owned.auth.tenantId, request.params.id),
    }
  })

  app.post<{ Params: { id: string }; Body: OfficeProfessionalBody }>('/escritorios/:id/profissionais', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    const validationError = validateOfficeProfessionalPayload(request.body?.professional as Record<string, unknown> | undefined)
    if (validationError) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PROFESSIONAL',
          message: validationError,
        },
      })
    }

    const professional = request.body?.professional!
    const caseRepository = getCaseRepository(app)
    if (professional.isResponsible === true) {
      await caseRepository.clearResponsibleFlagForOffice(owned.entity.ownerTenantId ?? owned.auth.tenantId, request.params.id)
    }

    const created = await caseRepository.createManagedProfessional({
      tenantId: owned.entity.ownerTenantId ?? owned.auth.tenantId,
      officeId: request.params.id,
      displayName: professional.displayName!.trim(),
      email: professional.email?.trim() || undefined,
      phone: professional.phone?.trim() || undefined,
      photoUrl: professional.photoUrl?.trim() || undefined,
      oabCredential: professional.oabCredential?.trim() || undefined,
      specialties: professional.specialties?.map((item) => item.trim()).filter(Boolean),
      bio: professional.bio?.trim() || undefined,
      isResponsible: professional.isResponsible === true,
      isPublic: professional.isPublic === true,
      status: professional.status ?? 'active',
    })

    const professionals = await getCaseService(app).listOfficeProfessionals(owned.entity.ownerTenantId ?? owned.auth.tenantId, request.params.id)
    return reply.status(201).send({
      status: 'ready',
      officeId: request.params.id,
      professional: professionals.find((item) => item.id === created.id) ?? null,
    })
  })

  app.post<{ Params: { id: string; professionalId: string }; Body: OfficeProfessionalBody }>('/escritorios/:id/profissionais/:professionalId', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    const validationError = validateOfficeProfessionalPayload(request.body?.professional as Record<string, unknown> | undefined)
    if (validationError) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PROFESSIONAL',
          message: validationError,
        },
      })
    }

    const existing = (await getCaseService(app).listOfficeProfessionals(owned.entity.ownerTenantId ?? owned.auth.tenantId, request.params.id))
      .find((professional) => professional.id === request.params.professionalId)

    if (!existing) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'PROFESSIONAL_NOT_FOUND',
          message: 'Professional not found for this office.',
        },
      })
    }

    const professional = request.body?.professional!
    const caseRepository = getCaseRepository(app)
    if (professional.isResponsible === true) {
      await caseRepository.clearResponsibleFlagForOffice(
        owned.entity.ownerTenantId ?? owned.auth.tenantId,
        request.params.id,
        request.params.professionalId,
      )
    }

    await caseRepository.updateManagedProfessional({
      tenantId: owned.entity.ownerTenantId ?? owned.auth.tenantId,
      officeId: request.params.id,
      professionalId: request.params.professionalId,
      displayName: professional.displayName!.trim(),
      email: professional.email?.trim() || undefined,
      phone: professional.phone?.trim() || undefined,
      photoUrl: professional.photoUrl?.trim() || undefined,
      oabCredential: professional.oabCredential?.trim() || undefined,
      specialties: professional.specialties?.map((item) => item.trim()).filter(Boolean),
      bio: professional.bio?.trim() || undefined,
      isResponsible: professional.isResponsible === true,
      isPublic: professional.isPublic === true,
      status: professional.status ?? existing.status,
    })

    const professionals = await getCaseService(app).listOfficeProfessionals(owned.entity.ownerTenantId ?? owned.auth.tenantId, request.params.id)
    return {
      status: 'ready',
      officeId: request.params.id,
      professional: professionals.find((item) => item.id === request.params.professionalId) ?? null,
    }
  })

  app.post<{ Params: { id: string; professionalId: string } }>('/escritorios/:id/profissionais/:professionalId/desativar', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    await getCaseRepository(app).deactivateManagedProfessional(
      owned.entity.ownerTenantId ?? owned.auth.tenantId,
      request.params.professionalId,
    )

    return {
      status: 'ready',
      officeId: request.params.id,
      professionalId: request.params.professionalId,
    }
  })

  app.post<{ Params: { id: string }; Body: OfficeMediaUploadBody }>('/escritorios/:id/midia', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    const fileName = request.body?.fileName?.trim()
    const dataUrl = request.body?.dataUrl?.trim()
    if (!fileName || !dataUrl) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_MEDIA_UPLOAD',
          message: 'fileName and dataUrl are required.',
        },
      })
    }

    const parsed = parseDataUrlPayload(dataUrl, 'image')
    if (!parsed) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_MEDIA_UPLOAD',
          message: 'Only valid image data URLs are accepted.',
        },
      })
    }

    const mediaId = `office-media-${createRequestId()}`
    const uploaded = await getAssetStorageService(app).uploadExportAsset({
      entityId: request.params.id,
      exportId: mediaId,
      content: parsed.content,
      contentType: parsed.contentType,
      fileName,
      kind: 'original',
    })

    return {
      status: 'ready',
      officeId: request.params.id,
      media: {
        id: mediaId,
        url: uploaded.url,
      },
    }
  })

  app.post<{ Params: { id: string }; Body: OfficeMediaUploadBody }>('/escritorios/:id/video-institucional', { preHandler: [requireAuth, privateWriteRateLimit] }, async (request, reply) => {
    const owned = await requireOwnedOffice(app, request, reply)
    if (!owned) {
      return
    }

    const fileName = request.body?.fileName?.trim()
    const dataUrl = request.body?.dataUrl?.trim()
    if (!fileName || !dataUrl) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_VIDEO_UPLOAD',
          message: 'fileName and dataUrl are required.',
        },
      })
    }

    const parsed = parseDataUrlPayload(dataUrl, 'video')
    if (!parsed) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OFFICE_VIDEO_UPLOAD',
          message: 'Only valid video data URLs are accepted.',
        },
      })
    }

    const videoId = `office-video-${createRequestId()}`
    const uploaded = await getAssetStorageService(app).uploadExportAsset({
      entityId: request.params.id,
      exportId: videoId,
      content: parsed.content,
      contentType: parsed.contentType,
      fileName,
      kind: 'original',
    })

    return {
      status: 'ready',
      officeId: request.params.id,
      video: {
        url: uploaded.url,
        provider: 'upload' as const,
      },
    }
  })

  app.get<{ Params: { id: string } }>('/public/escritorios/:id/profissionais', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const entity = await getRepository(app).getEntityById<EntityProfile>(request.params.id)
    if (!entity || typeof entity.ownerTenantId !== 'number') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'OFFICE_NOT_FOUND',
          message: `Office "${request.params.id}" was not found.`,
        },
      })
    }

    return buildPublicOfficeProfessionalsPayload(app, request.params.id, entity.ownerTenantId)
  })

  app.get<{ Params: { id: string } }>('/public/escritorios/:id/presenca', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const entity = await getRepository(app).getEntityById<EntityProfile>(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'OFFICE_NOT_FOUND',
          message: `Office "${request.params.id}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      officeId: request.params.id,
      presence: buildPublicPresencePayload(request.params.id, entity.entityProfile as EntityProfile),
    }
  })

  app.get<{ Params: { id: string } }>('/public/escritorios/:id/prova-social', { preHandler: [publicReadRateLimit] }, async (request, reply) => {
    const entity = await getRepository(app).getEntityById<EntityProfile>(request.params.id)
    if (!entity || typeof entity.ownerTenantId !== 'number') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'OFFICE_NOT_FOUND',
          message: `Office "${request.params.id}" was not found.`,
        },
      })
    }

    const businessConfig = readEntityBusinessConfig(entity.entityProfile as EntityProfile)
    const approvedCaseIds = new Set((businessConfig?.trustEvidence?.approvedCaseIds ?? []).filter(Boolean))
    if (businessConfig?.trustEvidence?.enabled !== true || approvedCaseIds.size === 0) {
      return {
        status: 'ready',
        officeId: request.params.id,
        items: [],
      }
    }

    const cases = await getCaseService(app).listCasesByEntity(entity.ownerTenantId, request.params.id)
    const items = cases
      .filter((caseRecord) => approvedCaseIds.has(caseRecord.id))
      .filter((caseRecord) => caseRecord.outcome?.verifiedClientFeedback === true && typeof caseRecord.outcome?.feedback === 'string')
      .map((caseRecord) => ({
        caseId: caseRecord.id,
        firstName: caseRecord.outcome?.firstName,
        city: caseRecord.city,
        serviceType: caseRecord.practiceArea,
        review: caseRecord.outcome?.feedback,
        rating: caseRecord.outcome?.rating,
      }))

    return {
      status: 'ready',
      officeId: request.params.id,
      items,
    }
  })

  app.get<{ Params: { id: string } }>('/escritorios/:id/sinais', { preHandler: [optionalAuth, publicReadRateLimit] }, async (request) => {
    const auth = getRequestAuth(request)
    const actorId = auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : undefined
    const rows = await getConnection(app).all<Array<{
      type: string
      weight: number | null
      actor_id: string | null
      timestamp: string
    }>>(
      `
        SELECT type, weight, actor_id, timestamp
        FROM entity_social_signals
        WHERE entity_id = ?
        ORDER BY timestamp DESC
      `,
      request.params.id,
    )

    const counts = {
      viewed: 0,
      interacted: 0,
      exported: 0,
      shared: 0,
      followed: 0,
    }

    let totalWeight = 0
    let lastSignalAt: string | undefined
    let followed = false

    for (const row of rows) {
      if (row.type in counts) {
        counts[row.type as keyof typeof counts] += 1
      }
      totalWeight += Number(row.weight ?? 0)
      lastSignalAt = lastSignalAt ?? row.timestamp
      if (actorId && row.actor_id === actorId && row.type === 'followed') {
        followed = true
      }
    }

    return {
      officeId: request.params.id,
      aggregate: {
        counts,
        totalSignals: rows.length,
        engagementScore: Number(totalWeight.toFixed(2)),
        entityScore: Number((totalWeight + rows.length * 0.15).toFixed(2)),
        lastSignalAt,
      },
      viewerState: {
        followed,
      },
    }
  })

  app.post<{
    Params: { id: string }
    Body: {
      type?: 'viewed' | 'interacted' | 'exported' | 'shared' | 'followed'
      source?: string
      weight?: number
      metadata?: Record<string, unknown>
    }
  }>('/escritorios/:id/sinais', { preHandler: [optionalAuth, publicActionRateLimit] }, async (request, reply) => {
    const auth = getRequestAuth(request)
    const type = request.body?.type
    if (!type || !['viewed', 'interacted', 'exported', 'shared', 'followed'].includes(type)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SIGNAL',
          message: 'A valid social signal type is required.',
        },
      })
    }

    const actorId = auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : `anon:${request.ip}`
    const metadata = safeJsonObject(request.body?.metadata)
    await getConnection(app).run(
      `
        INSERT INTO entity_social_signals (id, entity_id, owner_id, type, timestamp, weight, source, actor_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      `signal-${createRequestId()}`,
      request.params.id,
      actorId,
      type,
      new Date().toISOString(),
      typeof request.body?.weight === 'number' ? request.body.weight : 0.3,
      request.body?.source ?? 'legal-beta',
      actorId,
      JSON.stringify(metadata),
    )

    return reply.status(202).send({ status: 'ready' })
  })

  app.post<{ Params: { id: string }; Body: PublicInteractionRequest }>('/public/escritorios/:id/triagem', { preHandler: [publicActionRateLimit] }, async (request, reply) => {
    const requestId = request.body?.requestId?.trim() || createRequestId()
    const userMessage = request.body?.userMessage?.trim() || ''
    if (!userMessage) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_TRIAGE_REQUEST',
          message: 'userMessage is required.',
        },
      })
    }

    const created = await getCaseService(app).createPublicTriageCase({
      entityId: request.params.id,
      requestId,
      userMessage,
      triage: request.body?.triage,
      businessContext: request.body?.businessContext,
    })

    if (!created) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'OFFICE_NOT_FOUND',
          message: `Office "${request.params.id}" was not found.`,
        },
      })
    }

    return reply.status(201).send({
      status: 'ready',
      entityId: request.params.id,
      requestId,
      decision: {
        responseText: 'Recebemos sua triagem inicial. O escritório pode continuar o atendimento pelo portal do caso.',
        decision: {
          intent: 'triage',
          action: 'create_case',
          confidence: 0.92,
        },
        decisionSource: 'legal-beta',
        terminalAuthority: 'legal-beta-runtime',
        semanticFrozen: true,
      },
      fallback: {
        occurred: false,
        source: 'backend-authoritative',
      },
      actionResult: {
        actionType: 'create_legal_case',
        status: 'created',
        caseId: created.caseRecord.id,
        portalUrl: created.portalAccess.portalUrl,
        portalAccess: {
          issuedAt: created.portalAccess.issuedAt,
          expiresAt: created.portalAccess.expiresAt,
        },
      },
      telemetry: {
        evaluatedAt: new Date().toISOString(),
        latencyMs: 0,
      },
    })
  })
}
