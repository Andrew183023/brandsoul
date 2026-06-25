import type { OfficeBusinessConfig } from './adminApi'
import type { EntityPublicProfile } from '../../domain/entity/contracts/EntityPublicProfile'
import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'
import { readBackendBridgeBaseUrl } from '../../lib/api'
import type {
  OfficeTrustEvidenceItem,
  PublicOfficeProfessional,
} from './publicEntityApi'

export type PublicOfficeBusinessConfig = OfficeBusinessConfig

export type UnifiedPublicOfficeAvailability = {
  message?: string
  responseWindowLabel?: string
  operatingHours?: string
}

export type UnifiedPublicOfficeProfile = {
  status: 'ready'
  officeId: string
  publicProfile: EntityPublicProfile
  businessConfig?: PublicOfficeBusinessConfig | null
  presence?: PublicPresenceResponse
  responsible?: PublicOfficeProfessional
  professionals: PublicOfficeProfessional[]
  socialProof: OfficeTrustEvidenceItem[]
  availability?: UnifiedPublicOfficeAvailability | null
}

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPublicOfficeProfessionalCandidate(value: unknown): value is PublicOfficeProfessional {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === 'string'
    && typeof value.fullName === 'string'
    && (value.photoUrl === undefined || typeof value.photoUrl === 'string')
    && (value.oabCredential === undefined || typeof value.oabCredential === 'string')
    && isStringArray(value.specialties)
    && (value.bio === undefined || typeof value.bio === 'string')
}

function isOfficeTrustEvidenceItemCandidate(value: unknown): value is OfficeTrustEvidenceItem {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.caseId === 'string'
    && (value.firstName === undefined || typeof value.firstName === 'string')
    && (value.city === undefined || typeof value.city === 'string')
    && (value.serviceType === undefined || typeof value.serviceType === 'string')
    && typeof value.review === 'string'
    && typeof value.rating === 'number'
}

function isPublicProfileCandidate(value: unknown): value is EntityPublicProfile {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.tagline === undefined || typeof value.tagline === 'string')
    && (value.avatarUrl === undefined || typeof value.avatarUrl === 'string')
    && (value.avatarExportRef === undefined || typeof value.avatarExportRef === 'string')
    && (value.species === undefined || typeof value.species === 'string')
}

function isPublicPresenceCandidate(value: unknown): value is PublicPresenceResponse {
  if (!isRecord(value)) {
    return false
  }

  const entity = value.entity
  return isRecord(entity)
    && typeof entity.id === 'string'
    && typeof entity.name === 'string'
}

function isAvailabilityCandidate(value: unknown): value is UnifiedPublicOfficeAvailability | null {
  if (value === null) {
    return true
  }

  if (!isRecord(value)) {
    return false
  }

  return (value.message === undefined || typeof value.message === 'string')
    && (value.responseWindowLabel === undefined || typeof value.responseWindowLabel === 'string')
    && (value.operatingHours === undefined || typeof value.operatingHours === 'string')
}

function isPublicOfficeBusinessConfigCandidate(value: unknown): value is PublicOfficeBusinessConfig | null {
  return value === null || isRecord(value)
}

function warnDiscardedUnifiedPublicOfficeBlock(block: 'presence' | 'responsible' | 'professionals' | 'socialProof' | 'availability') {
  if (!import.meta.env.DEV) {
    return
  }

  console.warn('office-public-unified-profile-block-discarded', {
    event: 'office-public-unified-profile-block-discarded',
    block,
  })
}

function normalizeUnifiedPublicOfficeProfile(payload: unknown): UnifiedPublicOfficeProfile | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  const professionals = payload.professionals
  const socialProof = payload.socialProof

  if (payload.status !== 'ready'
    || typeof payload.officeId !== 'string'
    || !isPublicProfileCandidate(payload.publicProfile)
    || !isPublicOfficeBusinessConfigCandidate(payload.businessConfig)
  ) {
    return undefined
  }

  if (payload.presence !== undefined && !isPublicPresenceCandidate(payload.presence)) {
    warnDiscardedUnifiedPublicOfficeBlock('presence')
  }

  if (payload.responsible !== undefined && !isPublicOfficeProfessionalCandidate(payload.responsible)) {
    warnDiscardedUnifiedPublicOfficeBlock('responsible')
  }

  if (professionals !== undefined && (!Array.isArray(professionals) || !professionals.every(isPublicOfficeProfessionalCandidate))) {
    warnDiscardedUnifiedPublicOfficeBlock('professionals')
  }

  if (socialProof !== undefined && (!Array.isArray(socialProof) || !socialProof.every(isOfficeTrustEvidenceItemCandidate))) {
    warnDiscardedUnifiedPublicOfficeBlock('socialProof')
  }

  if (payload.availability !== undefined && !isAvailabilityCandidate(payload.availability)) {
    warnDiscardedUnifiedPublicOfficeBlock('availability')
  }

  const normalizedPresence = isPublicPresenceCandidate(payload.presence) ? payload.presence : undefined
  const normalizedResponsible = isPublicOfficeProfessionalCandidate(payload.responsible) ? payload.responsible : undefined
  const normalizedProfessionals = Array.isArray(professionals) && professionals.every(isPublicOfficeProfessionalCandidate)
    ? professionals
    : []
  const normalizedSocialProof = Array.isArray(socialProof) && socialProof.every(isOfficeTrustEvidenceItemCandidate)
    ? socialProof
    : []
  const normalizedAvailability = isAvailabilityCandidate(payload.availability)
    ? payload.availability
    : undefined

  return {
    status: 'ready',
    officeId: payload.officeId,
    publicProfile: payload.publicProfile,
    businessConfig: payload.businessConfig,
    presence: normalizedPresence,
    responsible: normalizedResponsible,
    professionals: normalizedProfessionals,
    socialProof: normalizedSocialProof,
    availability: normalizedAvailability,
  }
}

export async function getUnifiedPublicOfficeProfile(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<UnifiedPublicOfficeProfile | undefined> {
  try {
    const response = await fetch(`${baseUrl}/escritorios/${officeId}/publico`)

    if (!response.ok) {
      return undefined
    }

    return normalizeUnifiedPublicOfficeProfile(await response.json() as unknown)
  } catch {
    return undefined
  }
}

export async function getOfficeBusinessConfig(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<PublicOfficeBusinessConfig | undefined> {
  const payload = await getUnifiedPublicOfficeProfile(officeId, baseUrl)
  return payload?.businessConfig ?? undefined
}
