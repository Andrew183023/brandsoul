import type { CanonicalEntityType, EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import { ensureCanonicalEntityIdentity, resolveCanonicalEntityType } from './entityIdentityBuilder.js'

export type LegacySparkCompatibilityPayload = {
  brandName: string
  tone: string
  power: string
  businessModel: string
  brandType: string
  voiceStyle?: string
  actMode?: string
  businessDescription?: string | null
  businessGoal?: string
  brandHighlight?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  whatsapp?: string | null
  email?: string | null
  site?: string | null
}

function mapLegacyBusinessModelToEntityType(payload: LegacySparkCompatibilityPayload): CanonicalEntityType {
  if (payload.businessModel === 'professional' || payload.brandType === 'professional') {
    return 'professional'
  }

  if (payload.businessModel === 'service') {
    return 'services'
  }

  return 'brand'
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function applyLegacySparkPayloadToEntityProfile(args: {
  entityProfile: EntityProfile
  payload: LegacySparkCompatibilityPayload
  tenantId?: number
  createdAt: string
}): EntityProfile {
  const identitySeeded = ensureCanonicalEntityIdentity({
    ...args.entityProfile,
    brand: {
      ...args.entityProfile.brand,
      name: args.payload.brandName,
    },
    social: {
      ...args.entityProfile.social,
      publicName: args.payload.brandName,
    },
    finalForm: {
      ...args.entityProfile.finalForm,
      identity: {
        ...args.entityProfile.finalForm?.identity,
        name: args.payload.brandName,
        socialLine: args.payload.brandHighlight ?? args.entityProfile.finalForm?.identity?.socialLine,
      },
    },
    metadata: {
      ...args.entityProfile.metadata,
      businessConfig: {
        ...args.entityProfile.metadata.businessConfig,
        businessType: args.entityProfile.metadata.businessConfig?.businessType ?? 'services',
        description: args.payload.businessDescription ?? args.entityProfile.metadata.businessConfig?.description,
      },
    },
  }, {
    tenantId: args.tenantId,
    createdAt: args.createdAt,
    entityType: mapLegacyBusinessModelToEntityType(args.payload),
    preserveEntityId: args.entityProfile.id,
  })

  return {
    ...identitySeeded,
    canonicalIdentity: identitySeeded.canonicalIdentity && {
      ...identitySeeded.canonicalIdentity,
      spark: {
        ...identitySeeded.canonicalIdentity.spark,
        sparkTone: args.payload.tone,
        sparkPower: args.payload.power,
      },
      persona: {
        ...identitySeeded.canonicalIdentity.persona,
        businessDescription: args.payload.businessDescription ?? identitySeeded.canonicalIdentity.persona.businessDescription,
        communicationStyle: args.payload.voiceStyle ?? identitySeeded.canonicalIdentity.persona.communicationStyle,
      },
    },
  }
}

export function mapEntityProfileToLegacySparkPayload(entityProfile: EntityProfile): LegacySparkCompatibilityPayload {
  const canonical = entityProfile.canonicalIdentity
  const entityType = resolveCanonicalEntityType(entityProfile)
  const communicationStyle = canonical?.persona.communicationStyle ?? readString(entityProfile.behavior?.tone) ?? 'balanced'

  return {
    brandName: canonical?.identity.canonicalName ?? readString(entityProfile.finalForm?.identity?.name) ?? readString(entityProfile.social?.publicName) ?? entityProfile.id,
    tone: canonical?.spark.sparkTone ?? communicationStyle,
    power: canonical?.spark.sparkPower ?? 'support',
    businessModel: entityType === 'professional' ? 'professional' : entityType === 'services' ? 'service' : 'product',
    brandType: entityType === 'professional' ? 'professional' : 'business',
    voiceStyle: communicationStyle,
    actMode: canonical?.persona.responseBehaviorProfile.primaryObjective ?? 'engage',
    businessGoal: canonical?.persona.responseBehaviorProfile.primaryObjective ?? 'volume',
    businessDescription: canonical?.persona.businessDescription ?? entityProfile.metadata.businessConfig?.description ?? null,
    brandHighlight: entityProfile.finalForm?.identity?.socialLine ?? null,
    address: entityProfile.metadata.businessConfig?.channels?.address ?? null,
    city: null,
    state: null,
    whatsapp: entityProfile.metadata.businessConfig?.channels?.whatsapp ?? null,
    email: entityProfile.metadata.businessConfig?.channels?.email ?? null,
    site: entityProfile.metadata.businessConfig?.channels?.website ?? null,
  }
}
