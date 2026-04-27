import { buildOptionalBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

export type PublicFlowMindShadowAuthorityView = {
  decisionSource: string
  terminalAuthority: string
  semanticFrozen: boolean
}

export type PublicFlowMindShadowFrontendDecision = {
  evaluatedAt: string
  intent: string
  action: string
  responseText: string
  authority: PublicFlowMindShadowAuthorityView
  latencyMs: number
}

export type PublicFlowMindShadowBackendDecision = {
  requestId: string
  evaluatedAt: string
  intent: string
  action: string
  confidence: number
  responseText: string
  authority: PublicFlowMindShadowAuthorityView
  fallbackUsed: boolean
  fallbackReason?: string
  latencyMs: number
}

export async function evaluatePublicEntityFlowMindShadow(args: {
  entityId: string
  requestId?: string
  userMessage: string
}, baseUrl = getBackendBaseUrl()): Promise<{
  requestId: string
  enabled: boolean
  decision?: PublicFlowMindShadowBackendDecision
} | undefined> {
  try {
    const response = await fetch(`${baseUrl}/public/entity/${args.entityId}/flowmind-shadow/evaluate`, {
      method: 'POST',
      headers: await buildOptionalBackendAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        requestId: args.requestId,
        userMessage: args.userMessage,
      }),
    })

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as {
      requestId?: string
      enabled?: boolean
      decision?: PublicFlowMindShadowBackendDecision
    }

    if (!payload.requestId || typeof payload.enabled !== 'boolean') {
      return undefined
    }

    return {
      requestId: payload.requestId,
      enabled: payload.enabled,
      decision: payload.decision,
    }
  } catch {
    return undefined
  }
}

export async function recordPublicEntityFlowMindShadowTelemetry(args: {
  entityId: string
  requestId?: string
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision: PublicFlowMindShadowBackendDecision
}, baseUrl = getBackendBaseUrl()) {
  try {
    await fetch(`${baseUrl}/public/entity/${args.entityId}/flowmind-shadow/telemetry`, {
      method: 'POST',
      headers: await buildOptionalBackendAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        requestId: args.requestId,
        frontendDecision: args.frontendDecision,
        backendDecision: args.backendDecision,
      }),
    })
  } catch {
    return
  }
}