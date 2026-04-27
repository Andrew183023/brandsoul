import type {
  PublicEntityDecisionResponse,
  PublicEntityInteractionRequest,
} from '../contracts/PublicEntityDecisionResponse'
import { buildOptionalBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

function isDecisionResponseCandidate(value: unknown): value is PublicEntityDecisionResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const decision = record.decision as Record<string, unknown> | undefined
  const fallback = record.fallback as Record<string, unknown> | undefined
  const telemetry = record.telemetry as Record<string, unknown> | undefined
  const nestedDecision = decision?.decision as Record<string, unknown> | undefined

  return record.status === 'ready'
    && typeof record.entityId === 'string'
    && typeof record.requestId === 'string'
    && typeof decision?.responseText === 'string'
    && typeof nestedDecision?.intent === 'string'
    && typeof nestedDecision?.action === 'string'
    && typeof nestedDecision?.confidence === 'number'
    && typeof decision?.decisionSource === 'string'
    && typeof decision?.terminalAuthority === 'string'
    && typeof decision?.semanticFrozen === 'boolean'
    && typeof fallback?.occurred === 'boolean'
    && typeof fallback?.source === 'string'
    && typeof telemetry?.evaluatedAt === 'string'
    && typeof telemetry?.latencyMs === 'number'
}

export class PublicEntityInteractionApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly reason?: string

  constructor(message: string, args: { status: number; code?: string; reason?: string }) {
    super(message)
    this.name = 'PublicEntityInteractionApiError'
    this.status = args.status
    this.code = args.code
    this.reason = args.reason
  }
}

export async function requestPublicEntityInteraction(args: {
  entityId: string
  request: PublicEntityInteractionRequest
}, baseUrl = getBackendBaseUrl()): Promise<PublicEntityDecisionResponse> {
  const response = await fetch(`${baseUrl}/public/entity/${args.entityId}/interactions`, {
    method: 'POST',
    headers: await buildOptionalBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(args.request),
  })

  if (!response.ok) {
    let code: string | undefined
    let reason: string | undefined
    let message = `Public interaction failed with status ${response.status}.`

    try {
      const payload = await response.json() as {
        error?: {
          code?: string
          reason?: string
          message?: string
        }
      }
      code = payload.error?.code
      reason = payload.error?.reason
      message = payload.error?.message ?? message
    } catch {
      // noop
    }

    throw new PublicEntityInteractionApiError(message, {
      status: response.status,
      code,
      reason,
    })
  }

  const payload = await response.json() as unknown
  if (!isDecisionResponseCandidate(payload)) {
    throw new PublicEntityInteractionApiError('Invalid public interaction response.', {
      status: 502,
      code: 'INVALID_PUBLIC_INTERACTION_RESPONSE',
    })
  }

  return payload
}