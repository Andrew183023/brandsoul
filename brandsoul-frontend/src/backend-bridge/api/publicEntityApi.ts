import { buildRequiredBackendAuthHeaders } from './authHeaders'
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
}

function getBackendBaseUrl() {
  return (globalThis as { __BRANDSOUL_BACKEND_URL__?: string }).__BRANDSOUL_BACKEND_URL__ ?? 'http://127.0.0.1:3001'
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

export async function sendPublicCaseMessage(
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
