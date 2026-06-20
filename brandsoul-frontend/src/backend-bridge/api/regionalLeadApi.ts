import { readBackendBridgeBaseUrl } from '../../lib/api'

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
