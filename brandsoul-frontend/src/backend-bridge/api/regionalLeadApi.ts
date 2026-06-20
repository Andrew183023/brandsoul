import { readBackendBridgeBaseUrl } from '../../lib/api'
import { buildRequiredBackendAuthHeaders } from './authHeaders'

export type RegionalLeadUrgency = 'low' | 'normal' | 'high' | 'critical'

export type CreateRegionalLeadInput = {
  landingSlug: string
  campaignId?: string
  landingPageId?: string
  tenantId: string
  entityId: string
  name: string
  phone: string
  email?: string
  city: string
  specialty: string
  urgency: RegionalLeadUrgency
  caseSummary: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
}

export type RegionalLead = {
  id: string
  campaignId?: string
  landingPageId?: string
  tenantId: string
  entityId: string
  landingSlug: string
  name: string
  phone: string
  email?: string
  city: string
  specialty: string
  urgency: RegionalLeadUrgency
  caseSummary: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
  convertedCaseId?: string
  convertedAt?: string
  status: 'new' | 'triaged' | 'contacted' | 'converted' | 'lost'
  createdAt: string
  updatedAt: string
}

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: { message?: string } }
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // noop
  }

  return fallback
}

export async function createRegionalLead(input: CreateRegionalLeadInput) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/regional-leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao registrar lead regional (${response.status}).`))
  }

  const payload = await response.json() as { lead: RegionalLead }
  return payload.lead
}

export async function listRegionalLeadsByEntity(entityId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/regional-leads?entityId=${encodeURIComponent(entityId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao carregar leads regionais (${response.status}).`))
  }

  const payload = await response.json() as { leads?: RegionalLead[] }
  return payload.leads ?? []
}

export async function convertRegionalLeadToCase(id: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/regional-leads/${encodeURIComponent(id)}/convert-to-case`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao converter lead em caso (${response.status}).`))
  }

  const payload = await response.json() as {
    lead: RegionalLead
    case: { id: string }
  }

  return payload
}
