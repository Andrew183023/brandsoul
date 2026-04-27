import { buildAuthenticatedHeaders } from '../../lib/auth'

export function buildBackendAuthHeaders(baseHeaders?: Record<string, string>) {
  return buildAuthenticatedHeaders(baseHeaders, { optional: true })
}

export function buildOptionalBackendAuthHeaders(baseHeaders?: Record<string, string>) {
  return buildBackendAuthHeaders(baseHeaders)
}

export function buildRequiredBackendAuthHeaders(baseHeaders?: Record<string, string>) {
  return buildAuthenticatedHeaders(baseHeaders, { optional: false })
}
