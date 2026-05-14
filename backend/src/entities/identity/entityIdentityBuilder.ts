import type {
  CanonicalEntityIdentity,
  CanonicalEntityType,
  EntityProfile,
} from '../../brain/domain/entity/contracts/EntityProfile.js'
import {
  buildDeterministicCanonicalSlug,
  buildDeterministicEntityId,
  buildGenesisFingerprint,
} from './deterministicEntityIdentity.js'
import {
  deriveCanonicalPersona,
  deriveCanonicalSpark,
  deriveCanonicalTransformation,
} from './entityPersonaMapper.js'

export type CanonicalEntityIdentityInput = {
  tenantId?: number
  createdAt: string
  entityType?: CanonicalEntityType
  stableSeedMaterial?: unknown
  preserveEntityId?: string
}

type JsonRecord = Record<string, unknown>

function normalizeText(value: string) {
  return value.trim()
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? value as JsonRecord : {}
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function resolveCanonicalEntityName(entityProfile: EntityProfile) {
  return readString(entityProfile.finalForm?.identity?.name)
    ?? readString(entityProfile.social?.publicName)
    ?? readString(entityProfile.brand?.name)
    ?? readString(entityProfile.canonicalIdentity?.identity.canonicalName)
    ?? 'Untitled Entity'
}

export function resolveCanonicalEntityType(entityProfile: EntityProfile, explicitType?: CanonicalEntityType): CanonicalEntityType {
  if (explicitType) {
    return explicitType
  }

  if (entityProfile.canonicalIdentity?.identity.entityType) {
    return entityProfile.canonicalIdentity.identity.entityType
  }

  const configuredBusinessType = entityProfile.metadata.businessConfig?.businessType
  if (configuredBusinessType === 'legal') {
    return 'legal'
  }
  if (configuredBusinessType === 'store') {
    return 'store'
  }
  if (configuredBusinessType === 'services') {
    return 'services'
  }
  if (configuredBusinessType === 'restaurant') {
    return 'brand'
  }

  const businessModel = readString(asRecord(entityProfile.brand).businessModel)
  if (businessModel === 'professional') {
    return 'professional'
  }

  return 'brand'
}

function buildStableSeedMaterial(entityProfile: EntityProfile, input: CanonicalEntityIdentityInput) {
  return {
    brand: entityProfile.brand,
    context: entityProfile.context,
    manifestation: entityProfile.manifestation,
    palette: entityProfile.palette,
    businessConfig: entityProfile.metadata.businessConfig,
    stableSeedMaterial: input.stableSeedMaterial ?? null,
  }
}

function resolveIdentityVersion(existing: CanonicalEntityIdentity | undefined, next: Omit<CanonicalEntityIdentity['identity'], 'identityVersion'>) {
  if (!existing) {
    return 1
  }

  const current = existing.identity
  const unchanged = current.entityId === next.entityId
    && current.entityType === next.entityType
    && current.canonicalName === next.canonicalName
    && current.canonicalSlug === next.canonicalSlug
    && current.genesisFingerprint === next.genesisFingerprint

  return unchanged ? current.identityVersion : current.identityVersion + 1
}

export function resolveCanonicalEntityIdentity(entityProfile: EntityProfile) {
  return entityProfile.canonicalIdentity
}

export function requireCanonicalEntityIdentity(entityProfile: EntityProfile, source: string) {
  const canonicalIdentity = entityProfile.canonicalIdentity
  if (!canonicalIdentity) {
    const error = new Error(`ENTITY_CANONICAL_IDENTITY_REQUIRED: ${source} requires canonicalIdentity. Backfill is required.`) as Error & { code?: string }
    error.code = 'ENTITY_CANONICAL_IDENTITY_REQUIRED'
    throw error
  }

  return canonicalIdentity
}

export function ensureCanonicalEntityIdentity(entityProfile: EntityProfile, input: CanonicalEntityIdentityInput): EntityProfile {
  const canonicalName = normalizeText(resolveCanonicalEntityName(entityProfile))
  const entityType = resolveCanonicalEntityType(entityProfile, input.entityType)
  const stableSeedMaterial = buildStableSeedMaterial(entityProfile, input)
  const identityBase = {
    entityId: input.preserveEntityId ?? buildDeterministicEntityId({
      tenantId: input.tenantId,
      canonicalName,
      entityType,
      createdAt: input.createdAt,
      stableSeedMaterial,
    }),
    entityType,
    canonicalName,
    canonicalSlug: buildDeterministicCanonicalSlug({
      tenantId: input.tenantId,
      canonicalName,
      entityType,
      createdAt: input.createdAt,
      stableSeedMaterial,
    }),
    genesisFingerprint: buildGenesisFingerprint({
      tenantId: input.tenantId,
      canonicalName,
      entityType,
      createdAt: input.createdAt,
      stableSeedMaterial,
    }),
  }
  const existing = entityProfile.canonicalIdentity
  const identityVersion = resolveIdentityVersion(existing, identityBase)
  const persona = deriveCanonicalPersona(entityProfile, entityType)
  const spark = deriveCanonicalSpark(entityProfile, entityType)
  const transformation = deriveCanonicalTransformation(entityProfile)

  return {
    ...entityProfile,
    id: identityBase.entityId,
    social: {
      ...entityProfile.social,
      publicName: canonicalName,
    },
    finalForm: {
      ...entityProfile.finalForm,
      identity: {
        ...entityProfile.finalForm?.identity,
        name: canonicalName,
      },
    },
    canonicalIdentity: {
      identity: {
        ...identityBase,
        identityVersion,
      },
      spark,
      persona,
      transformation,
      runtime: {
        runtimeIdentityVersion: identityVersion,
        runtimeBindingVersion: existing?.runtime.runtimeBindingVersion ?? 1,
        governanceProfile: {
          replaySafe: true,
          mutationAuthority: 'sovereign-backend',
          evidenceMode: 'append-only',
        },
        memoryProfile: {
          scope: 'entity',
          persistence: 'backend-native',
          isolation: 'tenant-scoped',
        },
      },
    },
  }
}

export function bumpCanonicalIdentityVersion(entityProfile: EntityProfile): EntityProfile {
  const existing = entityProfile.canonicalIdentity
  if (!existing) {
    return entityProfile
  }

  return {
    ...entityProfile,
    canonicalIdentity: {
      ...existing,
      identity: {
        ...existing.identity,
        identityVersion: existing.identity.identityVersion + 1,
      },
      runtime: {
        ...existing.runtime,
        runtimeIdentityVersion: existing.runtime.runtimeIdentityVersion + 1,
      },
    },
  }
}
