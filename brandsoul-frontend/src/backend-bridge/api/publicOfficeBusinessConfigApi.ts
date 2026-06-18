import type { OfficeBusinessConfig } from './adminApi'
import { readBackendBridgeBaseUrl } from '../../lib/api'

export type PublicOfficeBusinessConfig = OfficeBusinessConfig

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

export async function getOfficeBusinessConfig(
  officeId: string,
  baseUrl = getBackendBaseUrl(),
): Promise<PublicOfficeBusinessConfig | undefined> {
  try {
    const response = await fetch(`${baseUrl}/escritorios/${officeId}/publico`)

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as { businessConfig?: PublicOfficeBusinessConfig | null }
    return payload.businessConfig ?? undefined
  } catch {
    return undefined
  }
}
