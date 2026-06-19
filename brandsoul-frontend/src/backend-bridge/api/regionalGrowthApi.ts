import { buildRequiredBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

export type RegionalCampaign = {
  id: string
  tenantId: string
  entityId: string
  campaignName: string
  states: string[]
  cities: string[]
  radiusKm: number
  specialties: string[]
  objective: 'visibility' | 'lead_capture' | 'emergency_24h' | 'institutional'
  budgetDaily?: number
  budgetMonthly?: number
  status: 'draft' | 'active' | 'paused' | 'archived'
  clicks: number
  impressions: number
  leadsReceived: number
  conversions: number
  seoPagesGenerated: boolean
  createdAt: string
  updatedAt: string
}

export async function listRegionalCampaigns() {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/campaigns`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Falha ao carregar campanhas regionais (${response.status}).`)
  }

  const payload = await response.json() as { campaigns?: RegionalCampaign[] }
  return payload.campaigns ?? []
}

export async function activateRegionalCampaign(id: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/campaigns/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Falha ao ativar campanha regional (${response.status}).`)
  }

  return response.json()
}
