import { readBackendBridgeBaseUrl } from './api'

function trimLeadingSlashes(value: string) {
  return value.replace(/^\/+/, '')
}

export function resolvePublicAssetUrl(url: string | undefined): string | undefined {
  const normalizedUrl = url?.trim()
  if (!normalizedUrl) {
    return undefined
  }

  if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
    return normalizedUrl
  }

  if (normalizedUrl.startsWith('data:')) {
    return normalizedUrl
  }

  const backendBaseUrl = readBackendBridgeBaseUrl().replace(/\/+$/, '')
  if (normalizedUrl.startsWith('/assets/')) {
    return `${backendBaseUrl}/assets/${trimLeadingSlashes(normalizedUrl.slice('/assets/'.length))}`
  }

  if (normalizedUrl.startsWith('/')) {
    return `${backendBaseUrl}/${trimLeadingSlashes(normalizedUrl)}`
  }

  return normalizedUrl
}
