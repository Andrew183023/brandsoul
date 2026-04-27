import { buildBackendAuthHeaders } from './authHeaders'
import type { EntitlementResult, PricingSnapshot } from '../../../../backend/src/domain/monetization/contracts'
import { clearSession, getAuthToken } from '../../lib/session'
import { readBackendBridgeBaseUrl } from '../../lib/api'

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

export type MonetizationPayload = {
  entityId?: string
  snapshot: PricingSnapshot
  entitlements: EntitlementResult[]
}

export async function getMonetizationSnapshot(entityId?: string, baseUrl = getBackendBaseUrl()): Promise<MonetizationPayload | undefined> {
  const query = entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''

  if (!getAuthToken()) {
    return undefined
  }

  try {
    const response = await fetch(`${baseUrl}/me/monetization${query}`, {
      headers: await buildBackendAuthHeaders(),
    })

    if (response.status === 401) {
      clearSession()
      return undefined
    }

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as MonetizationPayload
    return payload
  } catch {
    return undefined
  }
}
