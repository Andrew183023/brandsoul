import { describe, expect, it } from 'vitest'

import {
  buildPublicFlowMindPartialTelemetry,
  computePublicFlowMindPartialRolloutBucket,
  resolvePublicFlowMindPartialResponse,
  shouldAttemptPublicFlowMindPartial,
} from './publicFlowMindPartial'

const partialConfig = {
  readinessState: 'ready' as const,
  readinessScore: 98,
  rolloutPercentage: 25,
  latencyBudgetMs: 700,
  criticalDivergenceThreshold: 0.31,
  killSwitchEnabled: false,
  enabled: true,
  activationReason: 'eligible-for-public-partial',
}

describe('publicFlowMindPartial', () => {
  it('uses deterministic rollout buckets', () => {
    expect(computePublicFlowMindPartialRolloutBucket('partial-1')).toBe(computePublicFlowMindPartialRolloutBucket('partial-1'))
  })

  it('attempts partial only when config is enabled and bucket fits rollout percentage', () => {
    const requestId = 'partial-ready-request'
    const bucket = computePublicFlowMindPartialRolloutBucket(requestId)
    const expected = bucket < partialConfig.rolloutPercentage

    expect(shouldAttemptPublicFlowMindPartial(partialConfig, requestId)).toBe(expected)
    expect(shouldAttemptPublicFlowMindPartial({ ...partialConfig, enabled: false }, requestId)).toBe(false)
  })

  it('falls back to frontend when backend latency breaks the configured budget', () => {
    const resolution = resolvePublicFlowMindPartialResponse({
      config: partialConfig,
      frontendDecision: {
        evaluatedAt: '2026-04-20T12:00:01.000Z',
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 18,
      },
      backendDecision: {
        requestId: 'partial-1',
        evaluatedAt: '2026-04-20T12:00:00.000Z',
        intent: 'assist',
        action: 'support',
        confidence: 0.74,
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 820,
      },
    })

    expect(resolution.engineUsed).toBe('frontend')
    expect(resolution.fallbackOccurred).toBe(true)
    expect(resolution.fallbackReason).toBe('backend-latency-too-high')
  })

  it('records telemetry with the chosen engine and divergence score', () => {
    const telemetry = buildPublicFlowMindPartialTelemetry({
      requestId: 'partial-1',
      rolloutBucket: 12,
      config: partialConfig,
      frontendDecision: {
        evaluatedAt: '2026-04-20T12:00:01.000Z',
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 18,
      },
      backendDecision: {
        requestId: 'partial-1',
        evaluatedAt: '2026-04-20T12:00:00.000Z',
        intent: 'assist',
        action: 'support',
        confidence: 0.78,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 42,
      },
      resolution: {
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        engineUsed: 'flowmind',
        fallbackOccurred: false,
        comparison: {
          divergenceScore: 0.12,
          responseTextSimilarity: 0.86,
          intentChanged: false,
          actionChanged: false,
          authorityChanged: false,
        },
      },
    })

    expect(telemetry.engineUsed).toBe('flowmind')
    expect(telemetry.metrics.chosenLatencyMs).toBe(42)
    expect(telemetry.metrics.divergenceScore).toBe(0.12)
  })
})