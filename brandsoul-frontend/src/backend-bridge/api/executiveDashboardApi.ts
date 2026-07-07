import { readBackendBridgeBaseUrl } from '../../lib/api'
import { buildRequiredBackendAuthHeaders } from './authHeaders'
import type { ExecutiveDashboardResponse } from './executiveDashboardTypes'

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

export async function getExecutiveDashboard(
  officeId: string,
  options?: {
    signal?: AbortSignal
  },
): Promise<ExecutiveDashboardResponse> {
  const baseUrl = getBackendBaseUrl()
  const response = await fetch(
    `${baseUrl}/admin/escritorios/${encodeURIComponent(officeId)}/executive-dashboard`,
    {
      method: 'GET',
      headers: await buildRequiredBackendAuthHeaders(),
      signal: options?.signal,
    },
  )

  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(
        response,
        `Failed to load executive dashboard (${response.status}).`,
      ),
    )
  }

  return response.json() as Promise<ExecutiveDashboardResponse>
}
