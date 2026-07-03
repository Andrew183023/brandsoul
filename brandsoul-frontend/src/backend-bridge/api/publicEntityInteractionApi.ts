import type {
  PublicEntityDecisionResponse,
  PublicEntityInteractionRequest,
} from '../contracts/PublicEntityDecisionResponse'
import { buildOptionalBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

export type PublicOfficeTriageResponse = {
  status: 'ready'
  entityId: string
  requestId: string
  actionResult: {
    actionType: 'create_legal_case'
    status: 'created'
    caseId: string
    case?: {
      id: string
      status: string
    }
    portalUrl?: string
    portalAccess?: {
      issuedAt: string
      expiresAt: string
    }
  }
}

export type PublicOfficeInteractionFieldError = {
  field: string
  code: string
  message: string
}

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

function isPublicOfficeTriageResponseCandidate(value: unknown): value is PublicOfficeTriageResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  const actionResult = record.actionResult as Record<string, unknown> | undefined
  const legalCase = actionResult?.case as Record<string, unknown> | undefined
  const portalAccess = actionResult?.portalAccess as Record<string, unknown> | undefined

  return record.status === 'ready'
    && typeof record.entityId === 'string'
    && typeof record.requestId === 'string'
    && typeof actionResult?.actionType === 'string'
    && actionResult.actionType === 'create_legal_case'
    && typeof actionResult.status === 'string'
    && actionResult.status === 'created'
    && typeof actionResult.caseId === 'string'
    && (legalCase === undefined || (
      typeof legalCase.id === 'string'
      && typeof legalCase.status === 'string'
    ))
    && (actionResult.portalUrl === undefined || typeof actionResult.portalUrl === 'string')
    && (portalAccess === undefined || (
      typeof portalAccess.issuedAt === 'string'
      && typeof portalAccess.expiresAt === 'string'
    ))
}

export class PublicEntityInteractionApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly reason?: string
  readonly requestId?: string
  readonly fields?: PublicOfficeInteractionFieldError[]

  constructor(message: string, args: {
    status: number
    code?: string
    reason?: string
    requestId?: string
    fields?: PublicOfficeInteractionFieldError[]
  }) {
    super(message)
    this.name = 'PublicEntityInteractionApiError'
    this.status = args.status
    this.code = args.code
    this.reason = args.reason
    this.requestId = args.requestId
    this.fields = args.fields
  }
}

export const PublicOfficeInteractionApiError = PublicEntityInteractionApiError

function isFieldErrorCandidate(value: unknown): value is PublicOfficeInteractionFieldError {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.field === 'string'
    && typeof record.code === 'string'
    && typeof record.message === 'string'
}

function parsePublicInteractionErrorPayload(payload: unknown) {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}
  const nestedError = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : undefined
  const fields = Array.isArray(record.fields)
    ? record.fields.filter(isFieldErrorCandidate)
    : undefined

  const stringError = typeof record.error === 'string' ? record.error : undefined
  const nestedCode = typeof nestedError?.code === 'string' ? nestedError.code : undefined
  const nestedReason = typeof nestedError?.reason === 'string' ? nestedError.reason : undefined
  const nestedMessage = typeof nestedError?.message === 'string' ? nestedError.message : undefined
  const topLevelMessage = typeof record.message === 'string' ? record.message : undefined
  const requestId = typeof record.requestId === 'string' ? record.requestId : undefined

  return {
    code: stringError ?? nestedCode,
    reason: nestedReason,
    message: topLevelMessage ?? nestedMessage,
    requestId,
    fields,
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
    let requestId: string | undefined
    let fields: PublicOfficeInteractionFieldError[] | undefined
    let message = `Public interaction failed with status ${response.status}.`

    try {
      const payload = await response.json() as unknown
      const parsed = parsePublicInteractionErrorPayload(payload)
      code = parsed.code
      reason = parsed.reason
      requestId = parsed.requestId
      fields = parsed.fields
      message = parsed.message ?? message
    } catch {
      // noop
    }

    throw new PublicEntityInteractionApiError(message, {
      status: response.status,
      code,
      reason,
      requestId,
      fields,
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

export async function requestPublicOfficeInteraction(args: {
  officeId: string
  request: PublicEntityInteractionRequest
}, baseUrl = getBackendBaseUrl()): Promise<PublicOfficeTriageResponse> {
  const response = await fetch(`${baseUrl}/public/escritorios/${encodeURIComponent(args.officeId)}/triagem`, {
    method: 'POST',
    headers: await buildOptionalBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(args.request),
  })

  if (!response.ok) {
    let code: string | undefined
    let reason: string | undefined
    let requestId: string | undefined
    let fields: PublicOfficeInteractionFieldError[] | undefined
    let message = `Public office triage failed with status ${response.status}.`

    try {
      const payload = await response.json() as unknown
      const parsed = parsePublicInteractionErrorPayload(payload)
      code = parsed.code
      reason = parsed.reason
      requestId = parsed.requestId
      fields = parsed.fields
      message = parsed.message ?? message
    } catch {
      // noop
    }

    throw new PublicEntityInteractionApiError(message, {
      status: response.status,
      code,
      reason,
      requestId,
      fields,
    })
  }

  const payload = await response.json() as unknown
  if (!isPublicOfficeTriageResponseCandidate(payload)) {
    throw new PublicEntityInteractionApiError('Invalid public office triage response.', {
      status: 502,
      code: 'INVALID_PUBLIC_OFFICE_TRIAGE_RESPONSE',
    })
  }

  return payload
}
