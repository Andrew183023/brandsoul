const LOCAL_DEV_TYPESCRIPT_API_URL = 'http://127.0.0.1:3001'

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

function readConfiguredBaseUrl(envValue: string | undefined, localDevFallback: string, missingMessage: string) {
  const configuredBaseUrl = envValue?.trim()
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (import.meta.env.DEV) {
    return localDevFallback
  }

  const message = missingMessage
  console.error(message)
  throw new Error(message)
}

export function readPythonApiBaseUrl() {
  return readConfiguredBaseUrl(
    import.meta.env.VITE_API_URL || import.meta.env.VITE_AUTH_API_URL,
    LOCAL_DEV_TYPESCRIPT_API_URL,
    'VITE_API_URL or VITE_AUTH_API_URL is required in production.',
  )
}

export function readTypeScriptApiBaseUrl() {
  return readConfiguredBaseUrl(import.meta.env.VITE_AUTH_API_URL, LOCAL_DEV_TYPESCRIPT_API_URL, 'VITE_AUTH_API_URL is required in production.')
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${readPythonApiBaseUrl()}${normalizedPath}`
}

export function buildAuthApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${readTypeScriptApiBaseUrl()}${normalizedPath}`
}

export function readBackendBridgeBaseUrl() {
  const override = (globalThis as { __BRANDSOUL_BACKEND_URL__?: string }).__BRANDSOUL_BACKEND_URL__?.trim()
  if (override) {
    return normalizeBaseUrl(override)
  }

  return readTypeScriptApiBaseUrl()
}
