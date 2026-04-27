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
  evaluatePublicEntityFlowMindShadow,
  recordPublicEntityFlowMindShadowTelemetry,
} from './publicFlowMindShadowApi'

describe('publicFlowMindShadowApi', () => {
  beforeEach(() => {
    buildOptionalBackendAuthHeadersMock.mockReset()
    readBackendBridgeBaseUrlMock.mockClear()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('evaluates public FlowMind shadow with optional auth headers', async () => {
    buildOptionalBackendAuthHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'shadow-1',
        enabled: true,
        decision: {
          requestId: 'shadow-1',
          evaluatedAt: '2026-04-20T10:00:00.000Z',
          intent: 'assist',
          action: 'support',
          confidence: 0.77,
          responseText: 'Aurora responde com contencao e clareza.',
          authority: {
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
          },
          fallbackUsed: false,
          latencyMs: 21,
        },
      }),
    } as Response)

    const result = await evaluatePublicEntityFlowMindShadow({
      entityId: 'entity-public',
      requestId: 'shadow-1',
      userMessage: 'Me explica melhor essa entidade',
    })

    expect(buildOptionalBackendAuthHeadersMock).toHaveBeenCalledWith({
      'Content-Type': 'application/json',
    })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/public/entity/entity-public/flowmind-shadow/evaluate',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(result?.enabled).toBe(true)
    expect(result?.decision?.authority.terminalAuthority).toBe('adaptive-core')
  })

  it('records public FlowMind shadow telemetry without surfacing transport errors', async () => {
    buildOptionalBackendAuthHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-token',
    })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    await recordPublicEntityFlowMindShadowTelemetry({
      entityId: 'entity-public',
      requestId: 'shadow-1',
      frontendDecision: {
        evaluatedAt: '2026-04-20T10:00:01.000Z',
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 12,
      },
      backendDecision: {
        requestId: 'shadow-1',
        evaluatedAt: '2026-04-20T10:00:00.000Z',
        intent: 'assist',
        action: 'support',
        confidence: 0.77,
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 21,
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/public/entity/entity-public/flowmind-shadow/telemetry',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })
})