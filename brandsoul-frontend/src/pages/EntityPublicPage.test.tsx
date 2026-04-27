// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicEntityInteractionApiError } from '../backend-bridge/api/publicEntityInteractionApi'

const requestPublicEntityInteractionMock = vi.hoisted(() => vi.fn())
const getEntityPublicPresenceMock = vi.hoisted(() => vi.fn())
const getEntitySocialStateMock = vi.hoisted(() => vi.fn())
const registerEntitySignalMock = vi.hoisted(() => vi.fn())
const useAuthSessionMock = vi.hoisted(() => vi.fn(() => undefined))
const latestPublicPresencePageProps = vi.hoisted(() => ({ current: undefined as any }))

vi.mock('../backend-bridge/api/publicEntityInteractionApi', async () => {
  const actual = await vi.importActual<typeof import('../backend-bridge/api/publicEntityInteractionApi')>('../backend-bridge/api/publicEntityInteractionApi')

  return {
    ...actual,
    requestPublicEntityInteraction: requestPublicEntityInteractionMock,
  }
})

vi.mock('../backend-bridge/api/publicEntityApi', () => ({
  getEntityPublicPresence: getEntityPublicPresenceMock,
  getEntityBusinessConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../backend-bridge/api/publicSocialApi', () => ({
  getEntitySocialState: getEntitySocialStateMock,
  registerEntitySignal: registerEntitySignalMock,
}))

vi.mock('./public-presence/brandSoulPresenceRuntime', () => ({
  resolveDegradedResponse: vi.fn(({ fallbackReason }: { fallbackReason?: string }) => ({
    responseText: 'Estou com uma instabilidade no momento. Pode tentar novamente?',
    source: 'frontend-operational-fallback',
    fallbackReason: fallbackReason ?? 'operational-fallback',
  })),
}))

vi.mock('../lib/session', () => ({
  useAuthSession: useAuthSessionMock,
}))

vi.mock('./public-presence/PublicPresencePage', () => ({
  default: function MockPublicPresencePage(props: any) {
    latestPublicPresencePageProps.current = props

    return (
      <div>
        <div data-testid="relationship-label">{props.presence.relational.relationshipLabel}</div>
        <div data-testid="presence-intensity">{String(props.presence.visual.intensity)}</div>
        <div data-testid="response-text">{props.response ?? ''}</div>
        <div data-testid="official-terminal-reason">{props.officialDecisionDebugSummary?.terminalReason ?? ''}</div>
        <div data-testid="visual-patch-intent">{props.visualRuntimePatch?.metadata?.decisionIntent ?? ''}</div>
        <div data-testid="fallback-terminal-reason">{props.operationalFallbackReason ?? ''}</div>
        <textarea
          aria-label="Mensagem publica"
          value={props.message}
          onChange={(event) => props.onMessageChange((event.target as HTMLTextAreaElement).value)}
        />
        <button type="button" onClick={props.onSendMessage}>Enviar</button>
      </div>
    )
  },
}))

import EntityPublicPage from './EntityPublicPage'

function createPresenceFixture() {
  return {
    entity: {
      id: 'entity-public',
      name: 'Aurora',
      tagline: 'Presenca oficial viva.',
      species: 'entidade publica',
    },
    visual: {
      intensity: 0.44,
      presenceHealth: {
        trend: 'stable',
        intensity: 'steady',
        summary: 'Presenca estavel.',
        recentSignals: [],
      },
    },
    relational: {
      relationshipLabel: 'observacao inicial',
      tier: 'public',
    },
    cta: {
      label: 'Explorar',
      action: 'follow',
    },
    trajectory: [],
    exports: [],
    publicFlowMindPartial: {
      latencyBudgetMs: 40,
    },
  } as any
}

function createBackendResponseFixture() {
  return {
    status: 'ready',
    entityId: 'entity-public',
    requestId: 'request-1',
    decision: {
      responseText: 'Resposta oficial do backend.',
      decision: {
        intent: 'assist',
        action: 'support',
        confidence: 0.82,
      },
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      visualPatch: {
        runtimePatch: {
          metadata: {
            source: 'brandsoul-cognition',
            decisionIntent: 'assist',
            actionType: 'support',
            confidence: 0.82,
          },
        },
      },
      updatedPresenceIndicators: {
        cognitiveIndicator: {
          tone: 'steady',
          summary: 'presenca oficial aplicada',
          confidence: 0.82,
        },
        relationshipLabel: 'vinculo oficial ajustado',
        presenceIntensity: 0.71,
      },
      debugSummary: {
        terminalReason: 'backend-authoritative',
        dominantReason: 'coerencia oficial',
        fallbackUsed: false,
      },
    },
    fallback: {
      occurred: false,
      source: 'backend-authoritative',
    },
    telemetry: {
      evaluatedAt: '2026-04-21T12:00:00.000Z',
      latencyMs: 28,
    },
  } as const
}

function createSocialStateFixture() {
  return {
    entityId: 'entity-public',
    aggregate: {
      counts: {
        viewed: 1,
        interacted: 0,
        exported: 0,
        shared: 0,
        followed: 0,
      },
      totalSignals: 1,
      engagementScore: 0.1,
      entityScore: 0.2,
    },
    viewerState: {
      followed: false,
    },
  }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function getByTestId(container: HTMLElement, value: string) {
  const element = container.querySelector(`[data-testid="${value}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element: ${value}`)
  }

  return element
}

describe('EntityPublicPage', () => {
  let container: HTMLDivElement
  let root: Root
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useRealTimers()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    getEntityPublicPresenceMock.mockReset()
    getEntitySocialStateMock.mockReset()
    registerEntitySignalMock.mockReset()
    requestPublicEntityInteractionMock.mockReset()
    useAuthSessionMock.mockReset()

    useAuthSessionMock.mockReturnValue(undefined)
    getEntityPublicPresenceMock.mockResolvedValue(createPresenceFixture())
    getEntitySocialStateMock.mockResolvedValue(createSocialStateFixture())
    registerEntitySignalMock.mockResolvedValue(undefined)
    latestPublicPresencePageProps.current = undefined
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
    consoleInfoSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('uses the backend decision as the primary public interaction path when healthy', async () => {
    requestPublicEntityInteractionMock.mockResolvedValue(createBackendResponseFixture())

    await act(async () => {
      root.render(<EntityPublicPage entityId="entity-public" />)
    })
    await flushPromises()

    await act(async () => {
      latestPublicPresencePageProps.current.onMessageChange('Explique melhor sua presenca oficial')
    })
    await act(async () => {
      await latestPublicPresencePageProps.current.onSendMessage()
    })
    await flushPromises()

    expect(requestPublicEntityInteractionMock).toHaveBeenCalledTimes(1)
    expect(getByTestId(container, 'response-text').textContent).toBe('Resposta oficial do backend.')
    expect(getByTestId(container, 'relationship-label').textContent).toBe('vinculo oficial ajustado')
    expect(getByTestId(container, 'presence-intensity').textContent).toBe('0.71')
    expect(getByTestId(container, 'official-terminal-reason').textContent).toBe('backend-authoritative')
    expect(getByTestId(container, 'visual-patch-intent').textContent).toBe('assist')
    expect(getByTestId(container, 'fallback-terminal-reason').textContent).toBe('')
    expect(consoleInfoSpy).toHaveBeenCalledWith('[EntityPublicPage] backend decision used', expect.objectContaining({
      entityId: 'entity-public',
      semanticFrozen: true,
      intent: 'assist',
      action: 'support',
    }))
  })

  it('falls back to the local runtime when the backend interaction fails', async () => {
    requestPublicEntityInteractionMock.mockRejectedValue(new PublicEntityInteractionApiError('Backend unavailable', {
      status: 503,
      code: 'PUBLIC_INTERACTION_UNAVAILABLE',
      reason: 'backend-unavailable',
    }))

    await act(async () => {
      root.render(<EntityPublicPage entityId="entity-public" />)
    })
    await flushPromises()

    await act(async () => {
      latestPublicPresencePageProps.current.onMessageChange('Quero testar o fallback explicito')
    })
    await act(async () => {
      await latestPublicPresencePageProps.current.onSendMessage()
    })
    await flushPromises()

    expect(requestPublicEntityInteractionMock).toHaveBeenCalledTimes(1)
    expect(getByTestId(container, 'response-text').textContent).toBe('Estou com uma instabilidade no momento. Pode tentar novamente?')
    expect(getByTestId(container, 'official-terminal-reason').textContent).toBe('')
    expect(getByTestId(container, 'visual-patch-intent').textContent).toBe('')
    expect(getByTestId(container, 'fallback-terminal-reason').textContent).toBe('frontend-operational-fallback:backend-unavailable')
    expect(consoleWarnSpy).toHaveBeenCalledWith('[EntityPublicPage] local fallback used', expect.objectContaining({
      entityId: 'entity-public',
      fallbackReason: 'backend-unavailable',
      backendStatus: 'rejected',
    }))
  })

  it('falls back to the local runtime when the backend interaction times out', async () => {
    vi.useFakeTimers()
    requestPublicEntityInteractionMock.mockImplementation(() => new Promise(() => undefined))

    await act(async () => {
      root.render(<EntityPublicPage entityId="entity-public" />)
    })
    await flushPromises()

    await act(async () => {
      latestPublicPresencePageProps.current.onMessageChange('Quero testar timeout explicito')
    })
    const sendPromise = latestPublicPresencePageProps.current.onSendMessage()

    await act(async () => {
      vi.advanceTimersByTime(45)
      await Promise.resolve()
    })
    await sendPromise
    await flushPromises()

    expect(requestPublicEntityInteractionMock).toHaveBeenCalledTimes(1)
    expect(getByTestId(container, 'response-text').textContent).toBe('Estou com uma instabilidade no momento. Pode tentar novamente?')
    expect(getByTestId(container, 'fallback-terminal-reason').textContent).toBe('frontend-operational-fallback:backend-timeout')
    expect(consoleWarnSpy).toHaveBeenCalledWith('[EntityPublicPage] local fallback used', expect.objectContaining({
      entityId: 'entity-public',
      fallbackReason: 'backend-timeout',
      backendStatus: 'timeout',
    }))
  })
})
