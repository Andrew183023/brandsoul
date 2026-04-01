export interface AuthUser {
  id: number
  name: string
  email: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AuthTenant {
  id: number
  name: string
  slug: string
  business_model: 'product' | 'service' | 'hybrid' | 'professional'
  plan: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AuthSession {
  token: string
  user: AuthUser
  tenant: AuthTenant
}

const AUTH_SESSION_KEY = 'brandsoul.auth.session'

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

export function loadSession(): AuthSession | null {
  const rawSession = window.localStorage.getItem(AUTH_SESSION_KEY)
  if (!rawSession) {
    return null
  }

  try {
    const parsedSession = JSON.parse(rawSession) as AuthSession
    if (!parsedSession?.token || !parsedSession?.user || !parsedSession?.tenant) {
      return null
    }

    return parsedSession
  } catch {
    return null
  }
}

export function getAuthToken() {
  return loadSession()?.token ?? null
}

export function clearSession() {
  window.localStorage.removeItem(AUTH_SESSION_KEY)
}

export function isAuthenticated() {
  return Boolean(getAuthToken())
}

export function logout() {
  clearSession()
}
