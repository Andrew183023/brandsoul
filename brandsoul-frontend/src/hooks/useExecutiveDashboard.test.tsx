// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import path from 'node:path'

import React, { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExecutiveDashboardResponse } from '../backend-bridge/api/executiveDashboardTypes'

const getExecutiveDashboardMock = vi.hoisted(() => vi.fn())

vi.mock('../backend-bridge/api/executiveDashboardApi', () => ({
  getExecutiveDashboard: getExecutiveDashboardMock,
}))

import {
  useExecutiveDashboard,
  type UseExecutiveDashboardResult,
} from './useExecutiveDashboard'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function createPayload(args?: Partial<ExecutiveDashboardResponse>): ExecutiveDashboardResponse {
  return {
    generatedAt: '2026-07-06T21:00:00.000Z',
    officeState: {
      officeId: 'office-1',
      tenantId: 11,
      growthStatus: 'ready',
      operationalStatus: 'ready',
    },
    morningBrief: {
      title: 'Seu escritorio esta saudavel hoje.',
      tone: 'positive',
      summary: 'Resumo executivo.',
      topPriority: 'Expandir com controle operacional',
      items: [],
      generatedAt: '2026-07-06T21:00:00.000Z',
    },
    officeHealth: {
      score: 84,
      level: 'good',
      explanation: 'Saude equilibrada.',
      positives: [],
      warnings: [],
      opportunities: [],
      drivers: [],
    },
    decisionCenter: {
      decisions: [],
    },
    executiveFeed: {
      items: [],
      totalDetected: 0,
      totalPublished: 0,
      generatedAt: '2026-07-06T21:00:00.000Z',
    },
    executiveTimeline: {
      items: [
        {
          id: 'executive_timeline:health:good',
          category: 'health',
          importance: 'medium',
          temporalKind: 'observed',
          title: 'O escritorio permanece saudavel',
          summary: 'A leitura executiva indica equilibrio operacional.',
          evidence: [
            {
              key: 'officeHealthScore',
              value: 84,
              description: 'O score executivo atual e 84.',
            },
          ],
          source: 'office_health',
          sourceKey: 'office_health_status',
        },
      ],
      totalDetected: 1,
      totalPublished: 1,
      generatedAt: '2026-07-06T21:00:00.000Z',
    },
    growth: {
      status: 'ready',
      officeId: 'office-1',
      tenantId: 11,
      generatedAt: '2026-07-06T21:00:00.000Z',
      summary: {
        totalDemand: 1,
        totalTerritories: 1,
        totalCoverageGaps: 0,
        overloadedProfessionals: 0,
        constrainedProfessionals: 0,
        expansionOpportunities: 1,
        landingCandidates: 1,
        eligibleLandingCandidates: 1,
        recommendations: 1,
        criticalRecommendations: 0,
        averageGrowthScore: 82,
        highestPriority: 'high',
        generatedAt: '2026-07-06T21:00:00.000Z',
      },
      snapshot: {
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: 'all_time',
          startsAt: '1970-01-01T00:00:00.000Z',
          endsAt: '9999-12-31T23:59:59.999Z',
          granularity: 'custom',
        },
        generatedAt: '2026-07-06T21:00:00.000Z',
        demand: { items: [] },
        territories: [],
        coverage: [],
        capacity: [],
        scores: [],
        recommendations: [],
        opportunities: [],
        landingCandidates: [],
        metadata: {
          deterministic: true,
          foundationVersion: 'g7.0',
          evidence: [],
        },
      },
      compatibility: {
        professionalsIncluded: true,
        entityProfileIncluded: false,
        landingCandidatesPreparedOnly: true,
      },
    },
    operational: {
      status: 'ready',
      officeId: 'office-1',
      tenantId: 11,
      generatedAt: '2026-07-06T21:00:00.000Z',
      snapshot: {
        tenantId: 11,
        entityId: 'office-1',
        builtAt: '2026-07-06T21:00:00.000Z',
        openCases: 3,
        closedCases: 1,
        backlog: 3,
        activeProfessionals: 2,
        averageResolutionHours: 18,
        averageFirstResponseMinutes: null,
        slaWarningCases: 0,
        slaBreachedCases: 0,
        casesPerProfessional: {},
        casesPerPracticeArea: {},
        casesPerCity: {},
      },
      signals: [],
      timeline: [],
      regional: [],
      specialties: [],
      workload: [],
      opportunities: [],
      compatibility: {
        firstResponseMinutesDerived: false,
        slaStatusDerived: false,
        waitingForDerived: false,
        archivedCasesExcluded: true,
      },
    },
    ...args,
  }
}

function flushPromises() {
  return Promise.resolve()
}

function createAbortError() {
  return Object.assign(new Error('The operation was aborted.'), {
    name: 'AbortError',
  })
}

function HookHarness(args: {
  officeId: string | null | undefined
  enabled?: boolean
  onRender: (result: UseExecutiveDashboardResult) => void
}) {
  const result = useExecutiveDashboard(args.officeId, {
    enabled: args.enabled,
  })

  args.onRender(result)
  return null
}

describe('useExecutiveDashboard', () => {
  let container: HTMLDivElement
  let root: Root
  let latestResult: UseExecutiveDashboardResult

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestResult = {
      data: null,
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: async () => {},
    }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    getExecutiveDashboardMock.mockReset()
  })

  async function renderHook(args: {
    officeId: string | null | undefined
    enabled?: boolean
    strictMode?: boolean
  }) {
    const element = (
      <HookHarness
        officeId={args.officeId}
        enabled={args.enabled}
        onRender={(result) => {
          latestResult = result
        }}
      />
    )

    await act(async () => {
      root.render(args.strictMode ? <StrictMode>{element}</StrictMode> : element)
      await flushPromises()
    })
  }

  it('does not request when officeId is missing', async () => {
    await renderHook({ officeId: null })

    expect(getExecutiveDashboardMock).not.toHaveBeenCalled()
    expect(latestResult.data).toBeNull()
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('does not request when enabled is false', async () => {
    await renderHook({ officeId: 'office-1', enabled: false })

    expect(getExecutiveDashboardMock).not.toHaveBeenCalled()
    expect(latestResult.data).toBeNull()
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('starts in loading state during the initial request', async () => {
    const deferred = createDeferred<ExecutiveDashboardResponse>()
    getExecutiveDashboardMock.mockReturnValue(deferred.promise)

    await renderHook({ officeId: 'office-1' })

    expect(getExecutiveDashboardMock).toHaveBeenCalledTimes(1)
    expect(latestResult.data).toBeNull()
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(true)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('loads data successfully', async () => {
    const payload = createPayload()
    getExecutiveDashboardMock.mockResolvedValue(payload)

    await renderHook({ officeId: 'office-1' })

    expect(latestResult.data).toEqual(payload)
    expect(latestResult.data?.executiveTimeline).toEqual(payload.executiveTimeline)
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('preserves the error message on initial failure', async () => {
    getExecutiveDashboardMock.mockRejectedValue(new Error('Only the office owner can access this executive dashboard surface.'))

    await renderHook({ officeId: 'office-1' })

    expect(latestResult.data).toBeNull()
    expect(latestResult.error?.message).toBe('Only the office owner can access this executive dashboard surface.')
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('passes AbortSignal to the API client', async () => {
    const deferred = createDeferred<ExecutiveDashboardResponse>()
    getExecutiveDashboardMock.mockReturnValue(deferred.promise)

    await renderHook({ officeId: 'office-1' })

    expect(getExecutiveDashboardMock).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('cancels the active request on unmount', async () => {
    const deferred = createDeferred<ExecutiveDashboardResponse>()
    getExecutiveDashboardMock.mockImplementation((_officeId, options?: { signal?: AbortSignal }) => {
      return new Promise<ExecutiveDashboardResponse>((resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(createAbortError())
        })
        void deferred.promise.then(resolve, reject)
      })
    })

    await renderHook({ officeId: 'office-1' })

    await act(async () => {
      root.unmount()
      await flushPromises()
    })

    expect((getExecutiveDashboardMock.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined)?.signal?.aborted).toBe(true)
  })

  it('clears previous office data and starts a new request when officeId changes', async () => {
    const firstDeferred = createDeferred<ExecutiveDashboardResponse>()
    const secondDeferred = createDeferred<ExecutiveDashboardResponse>()

    getExecutiveDashboardMock
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise)

    await renderHook({ officeId: 'office-a' })
    firstDeferred.resolve(createPayload({ officeState: { officeId: 'office-a', tenantId: 11, growthStatus: 'ready', operationalStatus: 'ready' } }))

    await act(async () => {
      await flushPromises()
      await firstDeferred.promise
      await flushPromises()
    })

    expect(latestResult.data?.officeState.officeId).toBe('office-a')

    await renderHook({ officeId: 'office-b' })

    expect(latestResult.data).toBeNull()
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(true)
    expect(latestResult.isRefreshing).toBe(false)

    secondDeferred.resolve(createPayload({ officeState: { officeId: 'office-b', tenantId: 11, growthStatus: 'ready', operationalStatus: 'ready' } }))
    await act(async () => {
      await flushPromises()
      await secondDeferred.promise
      await flushPromises()
    })

    expect(latestResult.data?.officeState.officeId).toBe('office-b')
  })

  it('ignores stale responses and keeps the latest office request', async () => {
    const requestMap = new Map<string, Deferred<ExecutiveDashboardResponse>>()
    getExecutiveDashboardMock.mockImplementation((officeId: string) => {
      const deferred = createDeferred<ExecutiveDashboardResponse>()
      requestMap.set(officeId, deferred)
      return deferred.promise
    })

    await renderHook({ officeId: 'office-a' })
    await renderHook({ officeId: 'office-b' })

    requestMap.get('office-b')?.resolve(createPayload({
      officeState: { officeId: 'office-b', tenantId: 11, growthStatus: 'ready', operationalStatus: 'ready' },
    }))
    await act(async () => {
      await flushPromises()
      await requestMap.get('office-b')?.promise
      await flushPromises()
    })

    requestMap.get('office-a')?.resolve(createPayload({
      officeState: { officeId: 'office-a', tenantId: 11, growthStatus: 'ready', operationalStatus: 'ready' },
    }))
    await act(async () => {
      await flushPromises()
      await requestMap.get('office-a')?.promise
      await flushPromises()
    })

    expect(latestResult.data?.officeState.officeId).toBe('office-b')
  })

  it('preserves previous data and uses isRefreshing during refresh', async () => {
    const initialPayload = createPayload()
    const refreshDeferred = createDeferred<ExecutiveDashboardResponse>()

    getExecutiveDashboardMock
      .mockResolvedValueOnce(initialPayload)
      .mockReturnValueOnce(refreshDeferred.promise)

    await renderHook({ officeId: 'office-1' })

    expect(latestResult.data).toEqual(initialPayload)

    await act(async () => {
      const refreshPromise = latestResult.refresh()
      await flushPromises()
      expect(latestResult.data).toEqual(initialPayload)
      expect(latestResult.isLoading).toBe(false)
      expect(latestResult.isRefreshing).toBe(true)

      refreshDeferred.resolve(createPayload({
        generatedAt: '2026-07-07T00:00:00.000Z',
      }))
      await refreshPromise
      await flushPromises()
    })

    expect(latestResult.data?.generatedAt).toBe('2026-07-07T00:00:00.000Z')
    expect(latestResult.data?.executiveTimeline).toEqual(createPayload({
      generatedAt: '2026-07-07T00:00:00.000Z',
    }).executiveTimeline)
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('preserves previous data and exposes refresh error', async () => {
    const initialPayload = createPayload()
    getExecutiveDashboardMock
      .mockResolvedValueOnce(initialPayload)
      .mockRejectedValueOnce(new Error('Refresh failed (500).'))

    await renderHook({ officeId: 'office-1' })

    await act(async () => {
      await latestResult.refresh()
      await flushPromises()
    })

    expect(latestResult.data).toEqual(initialPayload)
    expect(latestResult.error?.message).toBe('Refresh failed (500).')
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('uses loading instead of refreshing when refresh starts without data', async () => {
    const deferred = createDeferred<ExecutiveDashboardResponse>()
    getExecutiveDashboardMock.mockReturnValue(deferred.promise)

    await renderHook({ officeId: 'office-1', enabled: false })

    await act(async () => {
      const refreshPromise = latestResult.refresh()
      await refreshPromise
      await flushPromises()
    })

    expect(getExecutiveDashboardMock).not.toHaveBeenCalled()

    await renderHook({ officeId: 'office-1' })

    expect(latestResult.isLoading).toBe(true)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('does not refresh when disabled or officeId is empty', async () => {
    await renderHook({ officeId: '', enabled: true })

    await act(async () => {
      await latestResult.refresh()
    })

    expect(getExecutiveDashboardMock).not.toHaveBeenCalled()

    await renderHook({ officeId: 'office-1', enabled: false })

    await act(async () => {
      await latestResult.refresh()
    })

    expect(getExecutiveDashboardMock).not.toHaveBeenCalled()
  })

  it('ignores AbortError without exposing it as state error', async () => {
    getExecutiveDashboardMock.mockRejectedValue(createAbortError())

    await renderHook({ officeId: 'office-1' })

    expect(latestResult.error).toBeNull()
    expect(latestResult.data).toBeNull()
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
  })

  it('cancels the active request and clears state when enabled becomes false', async () => {
    const deferred = createDeferred<ExecutiveDashboardResponse>()
    getExecutiveDashboardMock.mockImplementation((_officeId, options?: { signal?: AbortSignal }) => {
      return new Promise<ExecutiveDashboardResponse>((resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(createAbortError())
        })
        void deferred.promise.then(resolve, reject)
      })
    })

    await renderHook({ officeId: 'office-1' })
    expect(latestResult.isLoading).toBe(true)

    await renderHook({ officeId: 'office-1', enabled: false })

    expect(latestResult.data).toBeNull()
    expect(latestResult.error).toBeNull()
    expect(latestResult.isLoading).toBe(false)
    expect(latestResult.isRefreshing).toBe(false)
    expect((getExecutiveDashboardMock.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined)?.signal?.aborted).toBe(true)
  })

  it('starts automatic loading when enabled changes from false to true', async () => {
    getExecutiveDashboardMock.mockResolvedValue(createPayload())

    await renderHook({ officeId: 'office-1', enabled: false })
    expect(getExecutiveDashboardMock).not.toHaveBeenCalled()

    await renderHook({ officeId: 'office-1', enabled: true })

    expect(getExecutiveDashboardMock).toHaveBeenCalledTimes(1)
    expect(latestResult.data?.officeState.officeId).toBe('office-1')
  })

  it('normalizes non-Error failures safely', async () => {
    getExecutiveDashboardMock.mockRejectedValue('unexpected_failure')

    await renderHook({ officeId: 'office-1' })

    expect(latestResult.error).toBeInstanceOf(Error)
    expect(latestResult.error?.message).toBe('Failed to load executive dashboard.')
  })

  it('remains stable under StrictMode request replay', async () => {
    getExecutiveDashboardMock.mockResolvedValue(createPayload())

    await renderHook({ officeId: 'office-1', strictMode: true })

    expect(latestResult.data?.officeState.officeId).toBe('office-1')
    expect(latestResult.error).toBeNull()
  })

  it('keeps the hook structurally isolated from visual dependencies browser storage tenantId and direct network calls', () => {
    const source = readFileSync(
      path.resolve('src/hooks/useExecutiveDashboard.ts'),
      'utf8',
    )
    const disallowedImplicitToken = ['a', 'n', 'y'].join('')

    expect(source).toMatch(/executiveDashboardApi/)
    expect(source).not.toMatch(/components\//)
    expect(source).not.toMatch(/pages\//)
    expect(source).not.toMatch(/fetch\(/)
    expect(source).not.toMatch(/localStorage/)
    expect(source).not.toMatch(/sessionStorage/)
    expect(source).not.toMatch(/tenantId/)
    expect(source).not.toMatch(/Date\.now\(/)
    expect(source).not.toMatch(/Math\.random\(/)
    expect(source).not.toMatch(new RegExp(`\\b${disallowedImplicitToken}\\b`))
  })
})
