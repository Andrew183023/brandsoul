import { buildRequiredBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

type JsonRecord = Record<string, unknown>

export type AdminEntityListItem = {
  entityId: string
  status: string
  createdAt?: string
  updatedAt?: string
  entity: JsonRecord
}

export type AdminEntityListResponse = {
  status: 'ready'
  userId: number
  tenantId: number
  entities: AdminEntityListItem[]
}

export type CreateAdminEntityInput = {
  name: string
  category: string
  primaryColor: string
}

export type CreateAdminEntityResponse = {
  status: string
  entityId: string
  entity: JsonRecord
  createdAt?: string
  updatedAt?: string
  requestId?: string
}

export type DiagnosisArtifactStatus = 'draft' | 'approved' | 'rejected'

export type EntityBusinessType = 'restaurant' | 'store' | 'legal' | 'services'

export type EntityBusinessConfig = {
  businessType: EntityBusinessType
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
  serviceRules?: {
    attendanceMode?: 'sales' | 'support' | 'guidance' | 'mixed'
    responseWindowLabel?: string
    bookingEnabled?: boolean
    catalogEnabled?: boolean
  }
}

export type DiagnosisArtifact = {
  id: string
  entityId: string
  entityName: string
  context: string[]
  problem: string
  proposal: string
  impact: string[]
  confidence?: number
  createdAt: string
  status: DiagnosisArtifactStatus
}

type DiagnosisActionResponse = {
  status: DiagnosisArtifactStatus
  diagnosis: DiagnosisArtifact
}

export type EntityBusinessConfigResponse = {
  status: 'ready'
  entityId: string
  businessConfig: EntityBusinessConfig | null
  updatedAt?: string
}

export type AdminLegalCaseStatus = 'open' | 'assigned' | 'pending' | 'closed'

export type AdminLegalCaseMessageRole = 'user' | 'lawyer' | 'system'

export type AdminLegalCaseMessage = {
  id: string
  role: AdminLegalCaseMessageRole
  text: string
  actorId?: string
  createdAt: string
}

export type AdminLegalCaseTimelineEntry = {
  id: string
  type: 'case_opened' | 'message_added' | 'status_changed' | 'case_closed'
  createdAt: string
  summary: string
}

export type AdminLegalCaseOutcome = {
  rating: number
  feedback?: string
  closedBy: string
  closedAt: string
}

export type AdminLegalCaseMonetization = {
  amountCents: number
  currency: 'BRL'
  status: 'pending' | 'paid'
  paymentMode: 'mock-fixed-fee'
  initiatedAt: string
  paidAt?: string
}

export type AdminLegalCase = {
  id: string
  entityId: string
  status: AdminLegalCaseStatus
  createdAt: string
  updatedAt: string
  assignedLawyerId?: string
  description: string
  city?: string
  contact?: string
  source: 'public-interaction'
  messages: AdminLegalCaseMessage[]
  timeline: AdminLegalCaseTimelineEntry[]
  outcome?: AdminLegalCaseOutcome
  monetization?: AdminLegalCaseMonetization
}

export type AdminLegalCaseListResponse = {
  status: 'ready'
  entityId: string
  cases: AdminLegalCase[]
}

export type AdminLegalCaseResponse = {
  status: 'ready'
  case: AdminLegalCase
}

export type AdminLegalCaseMessagesResponse = {
  status: 'ready'
  caseId: string
  messages: AdminLegalCaseMessage[]
}

export type AdminLawyerReputation = {
  assignedCases: number
  closedCases: number
  averageRating: number | null
  ratingCount: number
  averageFirstResponseMinutes: number | null
  mockRevenueCents: number
  closureRate: number
}

export type AdminLawyerReputationResponse = {
  status: 'ready'
  entityId: string
  lawyerId: string
  reputation: AdminLawyerReputation
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

function buildCreateEntityPayload(input: CreateAdminEntityInput) {
  const trimmedName = input.name.trim()
  const trimmedCategory = input.category.trim() || 'general'
  const primaryColor = input.primaryColor.trim() || '#1f6feb'

  return {
    entityInput: {
      brand: {
        name: trimmedName,
      },
      context: {
        brandCategory: trimmedCategory,
        styleAnswers: {
          brandStyle: 'clean',
          languageStyle: 'balanced',
          actionStyle: 'helpful',
          tagline: `${trimmedName} pronto para operar.`,
        },
      },
      palette: {
        primary: primaryColor,
        secondary: primaryColor,
        contrast: 'medium',
      },
      manifestation: {
        mode: 'brand-avatar',
      },
    },
    manifestation: {
      intensity: 'balanced',
    },
    runtimeControl: {},
  }
}

export async function listAdminEntities(baseUrl = getBackendBaseUrl()): Promise<AdminEntityListResponse> {
  const response = await fetch(`${baseUrl}/me/entities`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to load entities (${response.status}).`)
  }

  return response.json() as Promise<AdminEntityListResponse>
}

export async function createAdminEntity(
  input: CreateAdminEntityInput,
  baseUrl = getBackendBaseUrl(),
): Promise<CreateAdminEntityResponse> {
  const response = await fetch(`${baseUrl}/entity/create`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(buildCreateEntityPayload(input)),
  })

  if (!response.ok) {
    let message = `Failed to create entity (${response.status}).`

    try {
      const payload = await response.json() as { error?: { message?: string } }
      if (payload.error?.message) {
        message = payload.error.message
      }
    } catch {
      // Keep the default message if the response body is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<CreateAdminEntityResponse>
}

export async function getDiagnosis(
  entityId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<DiagnosisArtifact> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(entityId)}/rebrand/diagnose`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to generate diagnosis (${response.status}).`)
  }

  const payload = await response.json() as { diagnosis: DiagnosisArtifact }
  return payload.diagnosis
}

export async function approveDiagnosis(
  entityId: string,
  diagnosisId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<DiagnosisActionResponse> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(entityId)}/rebrand/approve`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      diagnosisId,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to approve diagnosis (${response.status}).`)
  }

  return response.json() as Promise<DiagnosisActionResponse>
}

export async function rejectDiagnosis(
  entityId: string,
  diagnosisId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<DiagnosisActionResponse> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(entityId)}/rebrand/reject`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      diagnosisId,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to reject diagnosis (${response.status}).`)
  }

  return response.json() as Promise<DiagnosisActionResponse>
}

export async function getEntityBusinessConfig(
  entityId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<EntityBusinessConfigResponse> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(entityId)}/business-config`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to load business configuration (${response.status}).`)
  }

  return response.json() as Promise<EntityBusinessConfigResponse>
}

export async function saveEntityBusinessConfig(
  entityId: string,
  businessConfig: EntityBusinessConfig,
  baseUrl = getBackendBaseUrl(),
): Promise<EntityBusinessConfigResponse> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(entityId)}/business-config`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      businessConfig,
    }),
  })

  if (!response.ok) {
    let message = `Failed to save business configuration (${response.status}).`

    try {
      const payload = await response.json() as { error?: { message?: string } }
      if (payload.error?.message) {
        message = payload.error.message
      }
    } catch {
      // Keep fallback message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<EntityBusinessConfigResponse>
}

export async function listEntityCases(
  entityId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseListResponse> {
  const response = await fetch(`${baseUrl}/cases?entityId=${encodeURIComponent(entityId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load cases (${response.status}).`))
  }

  return response.json() as Promise<AdminLegalCaseListResponse>
}

export async function getCase(
  caseId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseResponse> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load case (${response.status}).`))
  }

  return response.json() as Promise<AdminLegalCaseResponse>
}

export async function getCaseMessages(
  caseId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessagesResponse> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/messages`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load case messages (${response.status}).`))
  }

  return response.json() as Promise<AdminLegalCaseMessagesResponse>
}

export async function assignCase(
  caseId: string,
  lawyerId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseResponse> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/assign`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      lawyerId,
    }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to assign case (${response.status}).`))
  }

  return response.json() as Promise<AdminLegalCaseResponse>
}

export async function respondToCase(
  caseId: string,
  text: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessagesResponse> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/respond`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      text,
    }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to respond to case (${response.status}).`))
  }

  return response.json() as Promise<AdminLegalCaseMessagesResponse>
}

export async function closeCase(
  caseId: string,
  input: {
    rating: number
    feedback?: string
    closedBy: string
  },
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseResponse> {
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

  return response.json() as Promise<AdminLegalCaseResponse>
}

export async function getLawyerReputation(
  entityId: string,
  lawyerId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLawyerReputationResponse> {
  const response = await fetch(
    `${baseUrl}/entities/${encodeURIComponent(entityId)}/lawyers/${encodeURIComponent(lawyerId)}/reputation`,
    {
      headers: await buildRequiredBackendAuthHeaders(),
    },
  )

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load lawyer reputation (${response.status}).`))
  }

  return response.json() as Promise<AdminLawyerReputationResponse>
}
