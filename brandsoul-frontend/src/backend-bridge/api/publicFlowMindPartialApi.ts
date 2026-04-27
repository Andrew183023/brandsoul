import { buildOptionalBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'
import type { PublicFlowMindPartialConfig } from '../../domain/entity/contracts/PublicPresenceResponse'
import type {
  PublicFlowMindShadowBackendDecision,
  PublicFlowMindShadowFrontendDecision,
} from './publicFlowMindShadowApi'

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

export type PublicFlowMindPartialTelemetryPayload = {
  version: 1
  requestId: string
  decidedAt: string
  rolloutBucket: number
  engineUsed: 'frontend' | 'flowmind'
  fallbackOccurred: boolean
  fallbackReason?: string
  policy: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
  metrics: {
    frontendLatencyMs: number
    backendLatencyMs?: number
    chosenLatencyMs: number
    divergenceScore?: number
  }
}

export async function evaluatePublicEntityFlowMindPartial(args: {
  entityId: string
  requestId?: string
  userMessage: string
}, baseUrl = getBackendBaseUrl()): Promise<{
  requestId: string
  enabled: boolean
  sampled: boolean
  rolloutBucket: number
  partialPolicy: PublicFlowMindPartialConfig
  decision?: PublicFlowMindShadowBackendDecision
} | undefined> {
  try {
    const response = await fetch(`${baseUrl}/public/entity/${args.entityId}/flowmind-partial/evaluate`, {
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
      sampled?: boolean
      rolloutBucket?: number
      partialPolicy?: PublicFlowMindPartialConfig
      decision?: PublicFlowMindShadowBackendDecision
    }

    if (!payload.requestId || typeof payload.enabled !== 'boolean' || typeof payload.sampled !== 'boolean' || typeof payload.rolloutBucket !== 'number' || !payload.partialPolicy) {
      return undefined
    }

    return {
      requestId: payload.requestId,
      enabled: payload.enabled,
      sampled: payload.sampled,
      rolloutBucket: payload.rolloutBucket,
      partialPolicy: payload.partialPolicy,
      decision: payload.decision,
    }
  } catch {
    return undefined
  }
}

export async function recordPublicEntityFlowMindPartialTelemetry(args: {
  entityId: string
  requestId?: string
  rolloutBucket: number
  telemetry: PublicFlowMindPartialTelemetryPayload
}, baseUrl = getBackendBaseUrl()) {
  try {
    await fetch(`${baseUrl}/public/entity/${args.entityId}/flowmind-partial/telemetry`, {
      method: 'POST',
      headers: await buildOptionalBackendAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        requestId: args.requestId,
        rolloutBucket: args.rolloutBucket,
        telemetry: args.telemetry,
      }),
    })
  } catch {
    return
  }
}