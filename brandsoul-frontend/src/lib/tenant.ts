import { fetchCurrentTenant, getValidAccessToken } from './auth'
import { loadSession, saveSession, type AuthTenant } from './session'

export function loadCurrentTenant(): AuthTenant | null {
  return loadSession()?.tenant ?? null
}

export function buildPublicBrandUrl(slug?: string | null) {
  return slug ? `${window.location.origin}/${slug}` : `${window.location.origin}/`
}

export async function refreshCurrentTenant() {
  const token = await getValidAccessToken()
  if (!token) {
    return null
  }

  const tenant = await fetchCurrentTenant(token)
  const session = loadSession()
  if (session) {
    saveSession({
      ...session,
      tenant,
    })
  }

  return tenant
}
