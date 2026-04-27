import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildOptionalBackendAuthHeadersMock = vi.hoisted(() => vi.fn())
const readBackendBridgeBaseUrlMock = vi.hoisted(() => vi.fn(() => 'http://127.0.0.1:3001'))

vi.mock('./authHeaders', () => ({
  buildOptionalBackendAuthHeaders: buildOptionalBackendAuthHeadersMock,
}))

vi.mock('../../lib/api', () => ({
  readBackendBridgeBaseUrl: readBackendBridgeBaseUrlMock,
}))

import {
  evaluatePublicEntityFlowMindPartial,
  recordPublicEntityFlowMindPartialTelemetry,
} from './publicFlowMindPartialApi'

describe('publicFlowMindPartialApi', () => {
  beforeEach(() => {
    buildOptionalBackendAuthHeadersMock.mockReset()
    readBackendBridgeBaseUrlMock.mockClear()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('evaluates public partial FlowMind with rollout metadata', async () => {
    buildOptionalBackendAuthHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'partial-1',
        enabled: true,
        sampled: true,
        rolloutBucket: 12,
        partialPolicy: {
          readinessState: 'ready',
          readinessScore: 98,
          rolloutPercentage: 25,
          latencyBudgetMs: 700,
          criticalDivergenceThreshold: 0.31,
          killSwitchEnabled: false,
          enabled: true,
          activationReason: 'eligible-for-public-partial',
        },
        decision: {
          requestId: 'partial-1',
          evaluatedAt: '2026-04-20T12:00:00.000Z',
          intent: 'assist',
          action: 'support',
          responseText: 'Aurora responde com contencao e clareza.',
          authority: {
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
          },
          fallbackUsed: false,
          latencyMs: 42,
        },
      }),
    } as Response)

    const result = await evaluatePublicEntityFlowMindPartial({
      entityId: 'entity-public',
      requestId: 'partial-1',
      userMessage: 'Quero entender melhor essa entidade',
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/public/entity/entity-public/flowmind-partial/evaluate',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(result?.sampled).toBe(true)
    expect(result?.rolloutBucket).toBe(12)
    expect(result?.partialPolicy.readinessState).toBe('ready')
  })

  it('records public partial telemetry without surfacing transport errors', async () => {
    buildOptionalBackendAuthHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-token',
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    await recordPublicEntityFlowMindPartialTelemetry({
      entityId: 'entity-public',
      requestId: 'partial-1',
      rolloutBucket: 12,
      telemetry: {
        version: 1,
        requestId: 'partial-1',
        decidedAt: '2026-04-20T12:00:01.000Z',
        rolloutBucket: 12,
        engineUsed: 'frontend',
        fallbackOccurred: true,
        fallbackReason: 'backend-latency-too-high',
        policy: {
          readinessState: 'ready',
          readinessScore: 98,
          rolloutPercentage: 25,
          latencyBudgetMs: 700,
          criticalDivergenceThreshold: 0.31,
          killSwitchEnabled: false,
          enabled: true,
          activationReason: 'eligible-for-public-partial',
        },
        frontendDecision: {
          evaluatedAt: '2026-04-20T12:00:00.000Z',
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
        metrics: {
          frontendLatencyMs: 18,
          chosenLatencyMs: 18,
        },
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/public/entity/entity-public/flowmind-partial/telemetry',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })
})