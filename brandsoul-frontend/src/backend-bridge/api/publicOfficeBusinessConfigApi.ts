import type { OfficeBusinessConfig } from './adminApi'

export type PublicOfficeBusinessConfig = OfficeBusinessConfig

function getBackendBaseUrl() {
  return (globalThis as { __BRANDSOUL_BACKEND_URL__?: string }).__BRANDSOUL_BACKEND_URL__ ?? 'http://127.0.0.1:3001'
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
