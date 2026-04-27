import axios from 'axios'

import { buildAuthApiUrl } from './api'
import { clearSession, isSessionAccessTokenFresh, loadSession, saveSession, type AuthSession, type AuthTenant, type AuthUser } from './session'

type ContextMode = 'customer' | 'admin'

interface AuthorityAuthResponse {
  accessToken: string
  refreshToken: string
  tokenType?: string
  expiresIn?: number
  user: AuthUser
  tenant: AuthTenant
}

interface MessageResponse {
  message: string
}

export class AuthClientError extends Error {
  code: 'unauthenticated' | 'refresh_failed' | 'unauthorized'

  constructor(code: 'unauthenticated' | 'refresh_failed' | 'unauthorized', message: string) {
    super(message)
    this.name = 'AuthClientError'
    this.code = code
  }
}

export const deprecatedPythonAccountFlows = [] as const

let refreshPromise: Promise<AuthSession | null> | null = null

function resolveExpiryIso(expiresIn?: number) {
  if (typeof expiresIn === 'number' && expiresIn > 0) {
    return new Date(Date.now() + (expiresIn * 1000)).toISOString()
  }

  return null
}

function mapAuthoritySession(response: AuthorityAuthResponse): AuthSession {
  return {
    token: response.accessToken,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    tokenType: response.tokenType === 'Bearer' ? 'Bearer' : 'Bearer',
    accessTokenExpiresAt: resolveExpiryIso(response.expiresIn),
    user: response.user,
    tenant: response.tenant,
  }
}

async function requestSessionRefresh(refreshToken: string) {
  try {
    const response = await axios.post<AuthorityAuthResponse>(buildAuthApiUrl('/auth/refresh'), {
      refreshToken,
    })

    const nextSession = mapAuthoritySession(response.data)
    saveSession(nextSession)
    return nextSession
  } catch {
    clearSession()
    throw new AuthClientError('refresh_failed', 'Unable to refresh the current session.')
  }
}

async function retryWithRefreshedAccessToken<T>(request: (token: string) => Promise<T>) {
  const refreshedSession = await refreshAuthSession()
  if (!refreshedSession) {
    throw new AuthClientError('unauthenticated', 'Authentication required.')
  }

  return request(refreshedSession.accessToken)
}

export async function registerAccount(payload: {
  name: string
  email: string
  password: string
  tenant_name: string
  business_model?: 'product' | 'service' | 'hybrid' | 'professional'
}): Promise<AuthSession> {
  const response = await axios.post<AuthorityAuthResponse>(buildAuthApiUrl('/auth/register'), payload)
  return mapAuthoritySession(response.data)
}

export async function loginAccount(payload: { email: string; password: string }): Promise<AuthSession> {
  const response = await axios.post<AuthorityAuthResponse>(buildAuthApiUrl('/auth/login'), payload)
  return mapAuthoritySession(response.data)
}

export async function requestPasswordReset(payload: { email: string }): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(buildAuthApiUrl('/auth/forgot-password'), payload)
  return response.data
}

export async function resetPassword(payload: { token: string; new_password: string }): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(buildAuthApiUrl('/auth/reset-password'), payload)
  return response.data
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await axios.get<AuthUser>(buildAuthApiUrl('/auth/me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return response.data
}

export async function fetchCurrentTenant(token: string): Promise<AuthTenant> {
  const response = await axios.get<AuthTenant>(buildAuthApiUrl('/tenant/me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return response.data
}

export async function refreshAuthSession() {
  const currentSession = loadSession()
  const refreshToken = currentSession?.refreshToken
  if (!refreshToken) {
    clearSession()
    return null
  }

  if (!refreshPromise) {
    refreshPromise = requestSessionRefresh(refreshToken).finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

export async function getValidAccessToken() {
  const currentSession = loadSession()
  if (!currentSession) {
    return null
  }

  if (isSessionAccessTokenFresh(currentSession)) {
    return currentSession.accessToken
  }

  const refreshedSession = await refreshAuthSession()
  return refreshedSession?.accessToken ?? null
}

export async function requireValidAccessToken() {
  const token = await getValidAccessToken()
  if (!token) {
    throw new AuthClientError('unauthenticated', 'Authentication required.')
  }

  return token
}

export async function bootstrapSession() {
  const currentSession = loadSession()
  if (!currentSession) {
    return null
  }

  const loadPrincipalState = async (token: string) => {
    const [user, tenant] = await Promise.all([
      fetchCurrentUser(token),
      fetchCurrentTenant(token),
    ])

    const nextSession: AuthSession = {
      ...(loadSession() ?? currentSession),
      token,
      accessToken: token,
      user,
      tenant,
    }
    saveSession(nextSession)
    return nextSession
  }

  const token = await getValidAccessToken()
  if (!token) {
    return null
  }

  try {
    return await loadPrincipalState(token)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return retryWithRefreshedAccessToken(loadPrincipalState)
    }

    throw error
  }
}

export async function buildAuthenticatedHeaders(baseHeaders?: Record<string, string>, options?: { optional?: boolean }) {
  const token = options?.optional ? await getValidAccessToken() : await requireValidAccessToken()
  const headers: Record<string, string> = {
    ...(baseHeaders ?? {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return Object.keys(headers).length > 0 ? headers : undefined
}

export async function buildApiHeaders(contextMode: ContextMode) {
  const headers = (await buildAuthenticatedHeaders(undefined, { optional: true })) ?? {}

  if (contextMode === 'admin') {
    const adminAccessKey = import.meta.env.VITE_ADMIN_ACCESS_KEY?.trim()
    if (adminAccessKey) {
      headers['x-admin-key'] = adminAccessKey
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined
}

export async function logout() {
  const currentSession = loadSession()

  try {
    if (currentSession?.refreshToken) {
      await axios.post(buildAuthApiUrl('/auth/logout'), {
        refreshToken: currentSession.refreshToken,
      })
    }
  } finally {
    clearSession()
  }
}

export async function logoutAllSessions() {
  const token = await requireValidAccessToken()

  try {
    await axios.post(
      buildAuthApiUrl('/auth/logout-all'),
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )
  } finally {
    clearSession()
  }
}
