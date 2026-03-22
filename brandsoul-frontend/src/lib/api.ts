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
  if (contextMode !== 'admin') {
    return undefined
  }

  const adminAccessKey = import.meta.env.VITE_ADMIN_ACCESS_KEY?.trim()
  if (!adminAccessKey) {
    console.error('VITE_ADMIN_ACCESS_KEY is required for admin requests.')
    return undefined
  }

  return {
    'x-admin-key': adminAccessKey,
  }
}
