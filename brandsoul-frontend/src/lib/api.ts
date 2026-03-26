import { getAuthToken } from './session'

type ContextMode = 'customer' | 'admin'

const LOCAL_DEV_API_URL = 'http://localhost:8000'

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

function readConfiguredApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_URL?.trim()
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (import.meta.env.DEV) {
    return LOCAL_DEV_API_URL
  }

  const message = 'VITE_API_URL is required in production.'
  console.error(message)
  throw new Error(message)
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${readConfiguredApiBaseUrl()}${normalizedPath}`
}

export function buildApiHeaders(contextMode: ContextMode) {
  const token = getAuthToken()
  const headers: Record<string, string> = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (contextMode === 'admin') {
    const adminAccessKey = import.meta.env.VITE_ADMIN_ACCESS_KEY?.trim()
    if (adminAccessKey) {
      headers['x-admin-key'] = adminAccessKey
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined
}
