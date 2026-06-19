import { readBackendBridgeBaseUrl } from '../../lib/api'

export type TrackLandingVisitInput = {
  landingSlug: string
  campaignId?: string
  landingPageId?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
}

export type LeadAttributionPayload = {
  id: string
  leadId?: string
  campaignId?: string
  landingPageId?: string
  landingSlug: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
  firstTouchAt: string
  createdAt: string
  updatedAt: string
}

type TrackLandingVisitResponse = {
  status: 'ready'
  attribution: LeadAttributionPayload
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
    // Keep fallback.
  }

  return fallback
}

export async function trackLandingVisit(
  input: TrackLandingVisitInput,
  baseUrl = getBackendBaseUrl(),
): Promise<TrackLandingVisitResponse> {
  const response = await fetch(`${baseUrl}/growth/lead-attribution`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, `Failed to track landing visit (${response.status}).`))
  }

  return response.json() as Promise<TrackLandingVisitResponse>
}
