import { useEffect, useState } from 'react'

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
  accessToken: string
  refreshToken: string | null
  tokenType: 'Bearer'
  accessTokenExpiresAt: string | null
  user: AuthUser
  tenant: AuthTenant
}

export type AuthPersistenceMode = 'memory-and-session-storage'

const AUTH_SESSION_KEY = 'brandsoul.auth.session'
const AUTH_SESSION_VERSION = 3

type PersistedAuthSession = {
  version: number
  session: AuthSession
}

let sessionCache: AuthSession | null | undefined

const listeners = new Set<(session: AuthSession | null) => void>()

function isBrowser() {
  return typeof window !== 'undefined'
}

function decodeBase64UrlSegment(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)

  try {
    return globalThis.atob(`${normalized}${padding}`)
  } catch {
    return null
  }
}

function hasValidTokenExpiry(token: string) {
  const segments = token.split('.')
  if (segments.length !== 3) {
    return false
  }

  const decodedPayload = decodeBase64UrlSegment(segments[1] ?? '')
  if (!decodedPayload) {
    return false
  }

  try {
    const payload = JSON.parse(decodedPayload) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function resolveTokenExpiryIso(token: string) {
  const segments = token.split('.')
  if (segments.length !== 3) {
    return null
  }

  const decodedPayload = decodeBase64UrlSegment(segments[1] ?? '')
  if (!decodedPayload) {
    return null
  }

  try {
    const payload = JSON.parse(decodedPayload) as { exp?: number }
    if (typeof payload.exp !== 'number') {
      return null
    }

    return new Date(payload.exp * 1000).toISOString()
  } catch {
    return null
  }
}

function normalizeSession(session: AuthSession | null): AuthSession | null {
  if (!session) {
    return null
  }

  const accessToken = session.accessToken || session.token
  const token = session.token || session.accessToken

  if (!accessToken || !token || !session.user || !session.tenant) {
    return null
  }

  return {
    ...session,
    token,
    accessToken,
    refreshToken: typeof session.refreshToken === 'string' && session.refreshToken.length > 0 ? session.refreshToken : null,
    tokenType: 'Bearer' as const,
    accessTokenExpiresAt: session.accessTokenExpiresAt ?? resolveTokenExpiryIso(accessToken),
  }
}

export function isSessionAccessTokenFresh(session: AuthSession) {
  return hasValidTokenExpiry(session.accessToken)
}

function sanitizeSession(session: AuthSession | null) {
  const normalizedSession = normalizeSession(session)
  if (!normalizedSession) {
    return null
  }

  if (normalizedSession.refreshToken) {
    return normalizedSession
  }

  return isSessionAccessTokenFresh(normalizedSession) ? normalizedSession : null
}

function isPersistedAuthSession(value: unknown): value is PersistedAuthSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const persisted = value as Partial<PersistedAuthSession>
  return typeof persisted.version === 'number' && isValidSession(persisted.session)
}

function isValidSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const session = value as Partial<AuthSession>
  return Boolean((session.token || session.accessToken) && session.user && session.tenant)
}

function parseSession(rawSession: string | null) {
  if (!rawSession) {
    return null
  }

  try {
    const parsedSession = JSON.parse(rawSession) as unknown
    if (!isPersistedAuthSession(parsedSession)) {
      return null
    }

    return sanitizeSession(parsedSession.session)
  } catch {
    return null
  }
}

function readLegacyLocalStorageSession() {
  if (!isBrowser()) {
    return null
  }

  const legacySession = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY))
  if (!legacySession) {
    window.localStorage.removeItem(AUTH_SESSION_KEY)
    return null
  }

  writePersistedSession(legacySession)
  window.localStorage.removeItem(AUTH_SESSION_KEY)
  return legacySession
}

function readPersistedSession() {
  if (!isBrowser()) {
    return null
  }

  const sessionStorageSession = parseSession(window.sessionStorage.getItem(AUTH_SESSION_KEY))
  if (sessionStorageSession) {
    return sessionStorageSession
  }

  window.sessionStorage.removeItem(AUTH_SESSION_KEY)

  const legacySession = readLegacyLocalStorageSession()
  if (!legacySession) {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY)
    window.localStorage.removeItem(AUTH_SESSION_KEY)
  }

  return legacySession
}

function writePersistedSession(session: AuthSession | null) {
  if (!isBrowser()) {
    return
  }

  if (!session) {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY)
    window.localStorage.removeItem(AUTH_SESSION_KEY)
    return
  }

  const persistedSession: PersistedAuthSession = {
    version: AUTH_SESSION_VERSION,
    session,
  }

  window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(persistedSession))
  window.localStorage.removeItem(AUTH_SESSION_KEY)
}

function setSessionCache(nextSession: AuthSession | null) {
  sessionCache = nextSession
  writePersistedSession(nextSession)

  for (const listener of listeners) {
    listener(nextSession)
  }
}

function ensureSessionLoaded(): AuthSession | null {
  if (typeof sessionCache !== 'undefined') {
    return sessionCache ?? null
  }

  sessionCache = readPersistedSession()
  return sessionCache ?? null
}

export function getSessionPersistenceMode(): AuthPersistenceMode {
  return 'memory-and-session-storage'
}

export function saveSession(session: AuthSession) {
  setSessionCache(session)
}

export function loadSession(): AuthSession | null {
  return ensureSessionLoaded()
}

export function getAuthToken() {
  return loadSession()?.accessToken ?? null
}

export function clearSession() {
  setSessionCache(null)
}

export function isAuthenticated() {
  return Boolean(getAuthToken())
}

export function logout() {
  clearSession()
}

export function subscribeToSession(listener: (session: AuthSession | null) => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())

  useEffect(() => {
    return subscribeToSession(setSession)
  }, [])

  return session
}
