import { readBackendBridgeBaseUrl } from '../../lib/api'

export type SeoLandingPage = {
  id: string
  campaignId: string
  tenantId: string
  entityId: string
  slug: string
  city: string
  specialty: string
  title: string
  metaDesc?: string
  contentHtml?: string
  published: boolean
  leadsReceived: number
  createdAt: string
  updatedAt: string
}

export async function getSeoLandingPage(city: string, specialty: string) {
  const baseUrl = readBackendBridgeBaseUrl()
  const response = await fetch(`${baseUrl}/p/${encodeURIComponent(city)}/${encodeURIComponent(specialty)}`)

  if (!response.ok) {
    return undefined
  }

  const payload = await response.json() as { page?: SeoLandingPage }
  return payload.page
}
