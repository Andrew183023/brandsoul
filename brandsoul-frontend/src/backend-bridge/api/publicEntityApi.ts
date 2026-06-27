import { buildRequiredBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'
import type {
  AdminLegalCase,
  AdminLegalCaseMessage,
  AdminLegalCaseMessagesResponse,
  AdminLegalCaseResponse,
} from './adminApi'
import type { EntityPublicProfile } from '../../domain/entity/contracts/EntityPublicProfile'
import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'

export type PublicEntityBusinessType = 'restaurant' | 'store' | 'legal' | 'services'

export type PublicEntityBusinessConfig = {
  businessType: PublicEntityBusinessType
  description?: string
  officeName?: string
  institutionalDescription?: string
  legalAreas?: string[]
  servedCities?: string[]
  attendanceModel?: 'sales' | 'support' | 'guidance' | 'mixed'
  operatingHours?: string
  maxCapacity?: number
  avgResponseMinutes?: number
  toneProfile?: {
    voice?: string
    style?: string
    intensity?: 'soft' | 'balanced' | 'strong'
  }
  channels?: {
    whatsapp?: string
    phone?: string
    email?: string
    address?: string
    website?: string
    other?: string
  }
  catalog?: {
    categories?: Array<{
      id: string
      label: string
    }>
    items?: Array<{
      id: string
      title: string
      description?: string
      category?: string
      priceLabel?: string
      active?: boolean
    }>
  }
  services?: Array<{
    id: string
    name: string
    description?: string
    active?: boolean
  }>
  serviceRules?: {
    attendanceMode?: 'sales' | 'support' | 'guidance' | 'mixed'
    responseWindowLabel?: string
    bookingEnabled?: boolean
    catalogEnabled?: boolean
  }
  legalMode?: {
    enabled: boolean
    emergencyMode?: boolean
    consumerMode?: boolean
  }
  publicCtas?: Array<{
    id: string
    label: string
    type: 'primary' | 'secondary' | 'contact' | 'booking' | 'catalog'
    href?: string
    active?: boolean
  }>
  publicMessages?: {
    heroMessage?: string
    intakeMessage?: string
    availabilityMessage?: string
  }
  triagePolicies?: {
    intakeCriteria?: string
    priorityRules?: string
    disqualificationRules?: string
  }
  trustEvidence?: {
    enabled?: boolean
    approvedCaseIds?: string[]
  }
  team?: Array<{
    id: string
    name: string
    oabCredential?: string
    photoUrl?: string
    specialties?: string[]
    shortBio?: string
    email?: string
    phone?: string
    status?: 'active' | 'inactive' | 'suspended'
    isResponsible?: boolean
    isPublic?: boolean
  }>
  responsibleProfessional?: {
    photoUrl?: string
    fullName: string
    oabCredential?: string
    specialties: string[]
    yearsOfExperience?: number
    shortBio?: string
  }
  officeGallery?: Array<{
    id: string
    url: string
    isCover?: boolean
  }>
  institutionalVideo?: {
    mode: 'external' | 'uploaded'
    provider?: 'youtube' | 'vimeo' | 'upload'
    url: string
    title?: string
    intro?: string
  }
}

export type PublicOfficeBusinessConfig = PublicEntityBusinessConfig

export type OfficeTrustEvidenceItem = {
  caseId: string
  firstName?: string
  city?: string
  serviceType?: string
  review: string
  rating: number
}

export type PublicOfficeProfessional = {
  id: string
  fullName: string
  photoUrl?: string
  oabCredential?: string
  specialties: string[]
  bio?: string
}

export type PublicOfficeProfessionalsLoadResult = {
  status: 'ready'
  officeId: string
  responsible?: PublicOfficeProfessional
  professionals: PublicOfficeProfessional[]
}

export class PublicOfficePresenceApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'PublicOfficePresenceApiError'
    this.status = status
  }
}

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: { message?: string } }
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // Keep fallback when response is not JSON.
  }

  return fallback
}

export async function getEntityPublicProfile(entityId: string, baseUrl = getBackendBaseUrl()): Promise<EntityPublicProfile | undefined> {
  try {
    const response = await fetch(`${baseUrl}/entity/${entityId}/public`)

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as { publicProfile?: EntityPublicProfile }
    return payload.publicProfile
  } catch {
    return undefined
  }
}

export type ClientPortalTimelineEvent = {
  type: string
  label: string
  occurredAt: string
}

export type ClientPortalCaseSummary = {
  caseId: string
  status: 'open' | 'pending' | 'dispatched' | 'accepted' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'archived'
  practiceArea?: string
  officeName: string
  createdAt: string
  updatedAt: string
  responsibleProfessional?: {
    id: string
    displayName: string
    photoUrl?: string
    oabCredential?: string
    specialty?: string
  } | null
  timeline: ClientPortalTimelineEvent[]
}

export async function getEntityPublicPresence(entityId: string, baseUrl = getBackendBaseUrl()): Promise<PublicPresenceResponse | undefined> {
  try {
    const response = await fetch(`${baseUrl}/public/entity/${entityId}/presence`)

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as { presence?: PublicPresenceResponse }
    return payload.presence
  } catch {
    return undefined
  }
}

export async function getEntityBusinessConfig(entityId: string, baseUrl = getBackendBaseUrl()): Promise<PublicEntityBusinessConfig | undefined> {
  try {
    const response = await fetch(`${baseUrl}/entity/${entityId}/business-config`)

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as { businessConfig?: PublicEntityBusinessConfig | null }
    return payload.businessConfig ?? undefined
  } catch {
    return undefined
  }
}

export async function getOfficePublicPresenceLoadResult(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<{ status: 'ready'; presence: PublicPresenceResponse }> {
  const response = await fetch(`${baseUrl}/public/escritorios/${encodeURIComponent(officeId)}/presenca`)

  if (!response.ok) {
    throw new PublicOfficePresenceApiError(
      await readApiErrorMessage(response, `Failed to load office presence (${response.status}).`),
      response.status,
    )
  }

  const payload = await response.json() as { presence?: PublicPresenceResponse }
  if (!payload.presence) {
    throw new PublicOfficePresenceApiError('Invalid office presence response.', 502)
  }

  return {
    status: 'ready',
    presence: payload.presence,
  }
}

export async function getOfficePublicProfessionals(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<PublicOfficeProfessionalsLoadResult | undefined> {
  const response = await fetch(`${baseUrl}/public/escritorios/${encodeURIComponent(officeId)}/profissionais`)

  if (!response.ok) {
    throw new PublicOfficePresenceApiError(
      await readApiErrorMessage(response, `Failed to load office professionals (${response.status}).`),
      response.status,
    )
  }

  return response.json() as Promise<PublicOfficeProfessionalsLoadResult>
}

export async function getOfficeTrustEvidence(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<OfficeTrustEvidenceItem[]> {
  const response = await fetch(`${baseUrl}/public/escritorios/${encodeURIComponent(officeId)}/prova-social`)

  if (!response.ok) {
    throw new PublicOfficePresenceApiError(
      await readApiErrorMessage(response, `Failed to load office trust evidence (${response.status}).`),
      response.status,
    )
  }

  const payload = await response.json() as { items?: OfficeTrustEvidenceItem[] }
  return payload.items ?? []
}

export async function getClientPortalCase(
  caseId: string,
  token: string,
  baseUrl = getBackendBaseUrl(),
): Promise<ClientPortalCaseSummary> {
  const response = await fetch(`${baseUrl}/client/portal/${encodeURIComponent(caseId)}/${encodeURIComponent(token)}`)

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load portal case (${response.status}).`))
  }

  const payload = await response.json() as { status: 'ready'; case: ClientPortalCaseSummary }
  return payload.case
}

export async function getPublicCase(
  caseId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCase> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load case (${response.status}).`))
  }

  const payload = await response.json() as AdminLegalCaseResponse
  return payload.case
}

export async function getPublicCaseMessages(
  caseId: string,
  token: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessage[]> {
  const response = await fetch(`${baseUrl}/client/portal/${encodeURIComponent(caseId)}/${encodeURIComponent(token)}/messages`)

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load case messages (${response.status}).`))
  }

  const payload = await response.json() as AdminLegalCaseMessagesResponse
  return payload.messages
}

export async function sendPublicCaseMessage(
  caseId: string,
  token: string,
  text: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessage[]> {
  const response = await fetch(`${baseUrl}/client/portal/${encodeURIComponent(caseId)}/${encodeURIComponent(token)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
    }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to send case message (${response.status}).`))
  }

  const payload = await response.json() as AdminLegalCaseMessagesResponse
  return payload.messages
}

export async function getAuthenticatedPublicCaseMessages(
  caseId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessage[]> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/messages`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load case messages (${response.status}).`))
  }

  const payload = await response.json() as AdminLegalCaseMessagesResponse
  return payload.messages
}

export async function sendAuthenticatedPublicCaseMessage(
  caseId: string,
  text: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessage[]> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/messages`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      role: 'user',
      text,
    }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to send case message (${response.status}).`))
  }

  const payload = await response.json() as AdminLegalCaseMessagesResponse
  return payload.messages
}

export async function closePublicCase(
  caseId: string,
  input: {
    rating: number
    feedback?: string
    closedBy: string
  },
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCase> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/close`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to close case (${response.status}).`))
  }

  const payload = await response.json() as AdminLegalCaseResponse
  return payload.case
}
