import { buildRequiredBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'
import type { FrontendTruthContract } from '../../truth/truthContract'

type JsonRecord = Record<string, unknown>

export type AdminEntityListItem = {
  entityId: string
  status: string
  createdAt?: string
  updatedAt?: string
  entity: JsonRecord
}

export type AdminOfficeListItem = {
  officeId: string
  status: string
  createdAt?: string
  updatedAt?: string
  office: JsonRecord
}

export type AdminEntityListResponse = {
  status: 'ready'
  userId: number
  tenantId: number
  entities: AdminEntityListItem[]
}

export type AdminOfficeListResponse = {
  status: 'ready'
  userId: number
  tenantId: number
  offices: AdminOfficeListItem[]
}

export type CreateAdminOfficeInput = {
  name: string
  category: string
  primaryColor: string
}

export type CreateAdminOfficeResponse = {
  status: string
  officeId: string
  office: JsonRecord
  createdAt?: string
  updatedAt?: string
  requestId?: string
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

export type EntityBusinessType = 'legal'
export type OfficeBusinessType = EntityBusinessType

export type EntityLegalProfessional = {
  id: string
  name: string
  role?: string
  oabCredential?: string
  credentials?: string[]
  photoUrl?: string
  specialties?: string[]
  yearsOfExperience?: number
  shortBio?: string
  email?: string
  phone?: string
  status?: 'active' | 'inactive' | 'suspended'
  isResponsible?: boolean
  isPublic?: boolean
}

export type OfficeLegalProfessional = EntityLegalProfessional

export type EntityResponsibleProfessional = {
  photoUrl?: string
  fullName?: string
  oabCredential?: string
  specialties?: string[]
  yearsOfExperience?: number
  shortBio?: string
}

export type OfficeResponsibleProfessional = EntityResponsibleProfessional

export type EntityOfficeMediaItem = {
  id: string
  url: string
  isCover?: boolean
}

export type OfficeMediaItem = EntityOfficeMediaItem

export type EntityInstitutionalVideo = {
  mode: 'external' | 'uploaded'
  provider?: 'youtube' | 'vimeo' | 'upload'
  url: string
  title?: string
  intro?: string
}

export type OfficeInstitutionalVideo = EntityInstitutionalVideo

export type EntityTrustEvidenceConfig = {
  enabled?: boolean
  approvedCaseIds?: string[]
}

export type OfficeTrustEvidenceConfig = EntityTrustEvidenceConfig

export type EntityPublicMessages = {
  heroMessage?: string
  intakeMessage?: string
  availabilityMessage?: string
}

export type OfficePublicMessages = EntityPublicMessages

export type EntityTriagePolicies = {
  intakeCriteria?: string
  priorityRules?: string
  disqualificationRules?: string
}

export type OfficeTriagePolicies = EntityTriagePolicies

export type EntityBusinessConfig = {
  businessType: EntityBusinessType
  officeName?: string
  description?: string
  institutionalDescription?: string
  legalAreas?: string[]
  servedCities?: string[]
  attendanceModel?: 'online' | 'in_person' | 'hybrid'
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
  team?: EntityLegalProfessional[]
  responsibleProfessional?: EntityResponsibleProfessional
  officeGallery?: EntityOfficeMediaItem[]
  institutionalVideo?: EntityInstitutionalVideo | null
  trustEvidence?: EntityTrustEvidenceConfig
  publicMessages?: EntityPublicMessages
  triagePolicies?: EntityTriagePolicies
  serviceRules?: {
    attendanceMode?: 'sales' | 'support' | 'guidance' | 'mixed'
    responseWindowLabel?: string
    bookingEnabled?: boolean
    catalogEnabled?: boolean
  }
}

export type OfficeBusinessConfig = EntityBusinessConfig

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

export type OfficeBusinessConfigResponse = {
  status: 'ready'
  officeId: string
  businessConfig: OfficeBusinessConfig | null
  updatedAt?: string
}

export type OfficeProfessional = {
  id: string
  tenantId: number
  userId?: number
  displayName: string
  email?: string
  phone?: string
  status: 'active' | 'inactive' | 'suspended'
  officeId?: string
  photoUrl?: string
  oabCredential?: string
  specialties: string[]
  bio?: string
  isResponsible: boolean
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export type OfficeProfessionalPayload = {
  displayName: string
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

export type UploadOfficeMediaResponse = {
  status: 'ready'
  officeId: string
  media: OfficeMediaItem
}

export type UploadOfficeVideoResponse = {
  status: 'ready'
  officeId: string
  video: {
    url: string
    provider: 'upload'
  }
}

export type AdminLegalCaseStatus = 'open' | 'pending' | 'dispatched' | 'accepted' | 'in_progress' | 'closed'
export type AdminLegalCaseTransitionTargetStatus = 'in_progress' | 'pending' | 'on_hold'
export type AdminLegalCaseAssignmentState = 'unassigned' | 'dispatched' | 'accepted' | 'active' | 'none'
export type AdminLegalCaseResponseState = 'waiting_office' | 'waiting_client' | 'active' | 'closed'

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
  truthContract?: FrontendTruthContract
}

export type AdminLegalCaseOutcome = {
  rating: number
  feedback?: string
  closedBy: string
  closedAt: string
  verifiedClientFeedback?: boolean
  firstName?: string
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
  assignedProfessionalId?: string
  assignedLawyerId?: string
  leadProfessionalId?: string
  assignmentState: AdminLegalCaseAssignmentState
  responseState: AdminLegalCaseResponseState
  isAssigned: boolean
  description: string
  practiceArea?: string
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
  case?: AdminLegalCase
  message?: AdminLegalCaseMessage
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

async function logCaseActionConflictInDev(args: {
  response: Response
  endpoint: string
  caseId: string
}) {
  if (!import.meta.env.DEV || args.response.status !== 409) {
    return
  }

  try {
    const payload = await args.response.clone().json() as {
      error?: { code?: string; message?: string }
      status?: string
    }
    console.warn('[adminApi] case action conflict', {
      endpoint: args.endpoint,
      caseId: args.caseId,
      status: args.response.status,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
      responseStatus: payload.status,
    })
  } catch {
    console.warn('[adminApi] case action conflict', {
      endpoint: args.endpoint,
      caseId: args.caseId,
      status: args.response.status,
    })
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

export async function listAdminOffices(baseUrl = getBackendBaseUrl()): Promise<AdminOfficeListResponse> {
  const response = await fetch(`${baseUrl}/me/escritorios`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to load offices (${response.status}).`)
  }

  return response.json() as Promise<AdminOfficeListResponse>
}

export async function createAdminEntity(
  input: CreateAdminEntityInput,
  baseUrl = getBackendBaseUrl(),
): Promise<CreateAdminEntityResponse> {
  const officeResponse = await createAdminOffice(input, baseUrl)
  return {
    ...officeResponse,
    entityId: officeResponse.officeId,
    entity: officeResponse.office,
  }
}

export async function createAdminOffice(
  input: CreateAdminOfficeInput,
  baseUrl = getBackendBaseUrl(),
): Promise<CreateAdminOfficeResponse> {
  const response = await fetch(`${baseUrl}/escritorios/criar`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      name: input.name,
      category: input.category,
      primaryColor: input.primaryColor,
    }),
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

  const payload = await response.json() as {
    status: string
    officeId: string
    officeName?: string
    office?: JsonRecord
    createdAt?: string
    updatedAt?: string
    requestId?: string
  }

  return {
    status: payload.status,
    officeId: payload.officeId,
    office: payload.office ?? { officeName: payload.officeName ?? input.name },
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    requestId: payload.requestId,
  }
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

export async function getOfficeBusinessConfig(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<OfficeBusinessConfigResponse> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/configuracao`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Failed to load office configuration (${response.status}).`)
  }

  return response.json() as Promise<OfficeBusinessConfigResponse>
}

export async function listOfficeProfessionals(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<{ status: 'ready'; officeId: string; professionals: OfficeProfessional[] }> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/profissionais`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to load office professionals (${response.status}).`))
  }

  return response.json() as Promise<{ status: 'ready'; officeId: string; professionals: OfficeProfessional[] }>
}

export async function createOfficeProfessional(
  officeId: string,
  professional: OfficeProfessionalPayload,
  baseUrl = getBackendBaseUrl(),
): Promise<{ status: 'ready'; officeId: string; professional: OfficeProfessional | null }> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/profissionais`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ professional }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to create professional (${response.status}).`))
  }

  return response.json() as Promise<{ status: 'ready'; officeId: string; professional: OfficeProfessional | null }>
}

export async function updateOfficeProfessional(
  officeId: string,
  professionalId: string,
  professional: OfficeProfessionalPayload,
  baseUrl = getBackendBaseUrl(),
): Promise<{ status: 'ready'; officeId: string; professional: OfficeProfessional | null }> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/profissionais/${encodeURIComponent(professionalId)}`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ professional }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to update professional (${response.status}).`))
  }

  return response.json() as Promise<{ status: 'ready'; officeId: string; professional: OfficeProfessional | null }>
}

export async function deactivateOfficeProfessional(
  officeId: string,
  professionalId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<{ status: 'ready'; officeId: string; professionalId: string }> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/profissionais/${encodeURIComponent(professionalId)}/desativar`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to deactivate professional (${response.status}).`))
  }

  return response.json() as Promise<{ status: 'ready'; officeId: string; professionalId: string }>
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

export async function saveOfficeBusinessConfig(
  officeId: string,
  businessConfig: OfficeBusinessConfig,
  baseUrl = getBackendBaseUrl(),
): Promise<OfficeBusinessConfigResponse> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/configuracao`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      businessConfig,
    }),
  })

  if (!response.ok) {
    let message = `Failed to save office configuration (${response.status}).`

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

  return response.json() as Promise<OfficeBusinessConfigResponse>
}

export async function uploadOfficeMedia(
  officeId: string,
  input: { fileName: string; dataUrl: string },
  baseUrl = getBackendBaseUrl(),
): Promise<UploadOfficeMediaResponse> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/midia`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to upload office media (${response.status}).`))
  }

  return response.json() as Promise<UploadOfficeMediaResponse>
}

export async function uploadOfficeInstitutionalVideo(
  officeId: string,
  input: { fileName: string; dataUrl: string },
  baseUrl = getBackendBaseUrl(),
): Promise<UploadOfficeVideoResponse> {
  const response = await fetch(`${baseUrl}/escritorios/${encodeURIComponent(officeId)}/video-institucional`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to upload institutional video (${response.status}).`))
  }

  return response.json() as Promise<UploadOfficeVideoResponse>
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

export async function listOfficeCases(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseListResponse> {
  return listEntityCases(officeId, baseUrl)
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
  lawyerId?: string,
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
    await logCaseActionConflictInDev({
      response,
      endpoint: '/cases/:caseId/assign',
      caseId,
    })
    throw new Error(await readApiErrorMessage(response, `Failed to assign case (${response.status}).`))
  }

  return response.json() as Promise<AdminLegalCaseResponse>
}

export async function respondToCase(
  caseId: string,
  text: string,
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseMessagesResponse> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/messages`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      role: 'lawyer',
      body: text,
    }),
  })

  if (!response.ok) {
    await logCaseActionConflictInDev({
      response,
      endpoint: '/cases/:caseId/messages',
      caseId,
    })
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

export async function updateCaseStatus(
  caseId: string,
  input: {
    status: AdminLegalCaseTransitionTargetStatus
    reason?: string
  },
  baseUrl = getBackendBaseUrl(),
): Promise<AdminLegalCaseResponse> {
  const response = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseId)}/status`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to update case status (${response.status}).`))
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
