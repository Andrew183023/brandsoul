import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import { requireCanonicalEntityIdentity } from './entityIdentityBuilder.js'
import {
  applyLegacySparkPayloadToEntityProfile,
  mapEntityProfileToLegacySparkPayload,
  type LegacySparkCompatibilityPayload,
} from './entitySparkCompatibilityAdapter.js'

export type LegacySemanticGatewayMetadata = {
  compatibilityMode: true
  semanticAuthority: 'backend.canonicalIdentity'
  deprecatedPythonAuthority: true
  legacyCompatibility: true
  deprecatedLegacyAuthority: true
}

export type LegacySparkGatewayResponse = {
  payload: LegacySparkCompatibilityPayload
  metadata: LegacySemanticGatewayMetadata
}

function defaultMetadata(): LegacySemanticGatewayMetadata {
  return {
    compatibilityMode: true,
    semanticAuthority: 'backend.canonicalIdentity',
    deprecatedPythonAuthority: true,
    legacyCompatibility: true,
    deprecatedLegacyAuthority: true,
  }
}

export function readLegacySparkCompatibility(entityProfile: EntityProfile): LegacySparkGatewayResponse {
  requireCanonicalEntityIdentity(entityProfile, 'entityLegacySemanticGateway.readLegacySparkCompatibility')
  return {
    payload: mapEntityProfileToLegacySparkPayload(entityProfile),
    metadata: defaultMetadata(),
  }
}

export function applyLegacySparkCompatibilityWrite(args: {
  entityProfile: EntityProfile
  payload: LegacySparkCompatibilityPayload
  tenantId?: number
  createdAt: string
}): { entityProfile: EntityProfile; changed: boolean; metadata: LegacySemanticGatewayMetadata } {
  const beforeCanonical = requireCanonicalEntityIdentity(args.entityProfile, 'entityLegacySemanticGateway.applyLegacySparkCompatibilityWrite.before')
  const beforePayload = JSON.stringify(mapEntityProfileToLegacySparkPayload(args.entityProfile))
  const next = applyLegacySparkPayloadToEntityProfile({
    entityProfile: args.entityProfile,
    payload: args.payload,
    tenantId: args.tenantId,
    createdAt: args.createdAt,
  })
  const afterPayload = JSON.stringify(mapEntityProfileToLegacySparkPayload(next))
  const changed = beforePayload !== afterPayload

  const entityProfile = changed
    ? {
        ...next,
        canonicalIdentity: next.canonicalIdentity && {
          ...next.canonicalIdentity,
          identity: {
            ...next.canonicalIdentity.identity,
            identityVersion: beforeCanonical.identity.identityVersion + 1,
          },
          runtime: {
            ...next.canonicalIdentity.runtime,
            runtimeIdentityVersion: beforeCanonical.runtime.runtimeIdentityVersion + 1,
          },
        },
      }
    : args.entityProfile

  return {
    entityProfile,
    changed,
    metadata: defaultMetadata(),
  }
}
