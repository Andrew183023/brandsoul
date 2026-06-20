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

export type PopulationDensity = 'small' | 'medium' | 'large'

export type RegionalCampaignTarget = {
  id: string
  campaignId: string
  channel: 'google_search' | 'google_local' | 'facebook' | 'instagram'
  audienceName: string
  audienceDescription?: string
  intentStage: 'awareness' | 'consideration' | 'decision'
  searchIntent?: 'problem_aware' | 'solution_aware' | 'provider_aware' | 'ready_to_hire'
  recommendedRadiusKm: number
  createdAt: string
  updatedAt: string
}

export type RadiusRecommendation = {
  specialty: string
  populationDensity: PopulationDensity
  recommendedRadiusKm: number
  usedFallback: boolean
}

export type RegionalSignal = {
  id: string
  tenantId: string
  entityId: string
  city: string
  specialty: string
  visits: number
  leads: number
  cases: number
  urgentLeads: number
  urgencyScore: number
  signalScore: number
  bestChannel?: string
  bestAudienceName?: string
  bestIntentStage?: string
  bestSearchIntent?: string
  bestCampaignTargetId?: string
  bestRecommendedRadiusKm?: number
  createdAt: string
  updatedAt: string
}

export type GrowthInsightRankItem = {
  label: string
  score: number
}

export type GrowthInsights = {
  totalSignals: number
  totalVisits: number
  totalLeads: number
  totalCases: number
  totalUrgentLeads: number
  averageSignalScore: number
  leadToCaseRate: number
  topCities: GrowthInsightRankItem[]
  topSpecialties: GrowthInsightRankItem[]
  topChannels: GrowthInsightRankItem[]
  topAudiences: GrowthInsightRankItem[]
  topIntentStages: GrowthInsightRankItem[]
  topSearchIntents: GrowthInsightRankItem[]
  expansionScore: number
}

export type GrowthRecommendationPriority = 'critical' | 'high' | 'medium' | 'low'

export type GrowthRecommendation = {
  id: string
  city: string
  specialty: string
  priority: GrowthRecommendationPriority
  signalScore: number
  recommendedChannel?: string
  recommendedAudience?: string
  recommendedIntentStage?: string
  recommendedSearchIntent?: string
  recommendedRadiusKm?: number
  recommendedBudgetDaily: number
  reason: string
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

export async function createRegionalCampaign(input: {
  entityId: string
  campaignName: string
  states?: string[]
  cities?: string[]
  specialties?: string[]
  objective?: 'visibility' | 'lead_capture' | 'emergency_24h' | 'institutional'
}) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/campaigns`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao criar campanha regional (${response.status}).`))
  }

  return response.json()
}

export async function listCampaignTargets(campaignId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/campaigns/${encodeURIComponent(campaignId)}/targets`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao carregar públicos da campanha (${response.status}).`))
  }

  const payload = await response.json() as { targets?: RegionalCampaignTarget[] }
  return payload.targets ?? []
}

export async function createCampaignTarget(
  campaignId: string,
  input: {
    channel: RegionalCampaignTarget['channel']
    audienceName: string
    audienceDescription?: string
    intentStage: RegionalCampaignTarget['intentStage']
    searchIntent?: RegionalCampaignTarget['searchIntent']
    recommendedRadiusKm: number
  },
) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/campaigns/${encodeURIComponent(campaignId)}/targets`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao criar público da campanha (${response.status}).`))
  }

  const payload = await response.json() as { target: RegionalCampaignTarget }
  return payload.target
}

export async function deleteCampaignTarget(targetId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/campaign-targets/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao remover público da campanha (${response.status}).`))
  }
}

export async function getRadiusRecommendation(specialty: string, populationDensity: PopulationDensity) {
  const baseUrl = readBackendBridgeBaseUrl()
  const query = new URLSearchParams({
    specialty,
    populationDensity,
  })
  const response = await fetch(`${baseUrl}/growth/radius-recommendation?${query.toString()}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao sugerir raio (${response.status}).`))
  }

  const payload = await response.json() as { recommendation: RadiusRecommendation }
  return payload.recommendation
}

export async function listRegionalSignals(entityId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/signals?entityId=${encodeURIComponent(entityId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao carregar oportunidades detectadas (${response.status}).`))
  }

  const payload = await response.json() as { signals?: RegionalSignal[] }
  return payload.signals ?? []
}

export async function recalculateRegionalSignals(entityId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/signals/recalculate`, {
    method: 'POST',
    headers: await buildRequiredBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ entityId }),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao recalcular sinais (${response.status}).`))
  }

  const payload = await response.json() as { signals?: RegionalSignal[] }
  return payload.signals ?? []
}

export async function getGrowthInsights(entityId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/insights?entityId=${encodeURIComponent(entityId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao carregar inteligência de growth (${response.status}).`))
  }

  const payload = await response.json() as { insights?: GrowthInsights }
  return payload.insights ?? null
}

export async function listGrowthRecommendations(entityId: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/growth/recommendations?entityId=${encodeURIComponent(entityId)}`, {
    headers: await buildRequiredBackendAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Falha ao carregar recomendações de growth (${response.status}).`))
  }

  const payload = await response.json() as { recommendations?: GrowthRecommendation[] }
  return payload.recommendations ?? []
}
