import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ExecutiveDashboardResponse } from './executiveDashboardTypes'

const buildRequiredBackendAuthHeadersMock = vi.hoisted(() => vi.fn(async () => ({
  authorization: 'Bearer test-token',
})))

vi.mock('./authHeaders', () => ({
  buildRequiredBackendAuthHeaders: buildRequiredBackendAuthHeadersMock,
}))

vi.mock('../../lib/api', () => ({
  readBackendBridgeBaseUrl: () => 'http://localhost:3001',
}))

import { getExecutiveDashboard } from './executiveDashboardApi'

function createPayload(): ExecutiveDashboardResponse {
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
      items: [
        {
          key: 'health_score',
          label: 'Score de saude',
          value: 84,
          summary: 'O escritorio inicia o dia com score 84.',
        },
      ],
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
      decisions: [
        {
          id: 'decision:expand',
          type: 'expand',
          title: 'Expandir com controle operacional',
          priority: 'high',
          impact: 'high',
          confidence: 82,
          explanation: 'Existe oportunidade de crescimento.',
          evidence: [
            {
              key: 'expansion_opportunities',
              label: 'Oportunidades',
              value: 1,
              summary: 'Existe uma oportunidade de expansao.',
            },
          ],
          recommendedActions: ['Priorizar a oportunidade com maior aderencia.'],
          blockingFactors: [],
        },
      ],
    },
    executiveFeed: {
      items: [
        {
          id: 'feed:growth:expansion_opportunities',
          category: 'growth',
          severity: 'opportunity',
          title: 'Existem oportunidades de expansao em aberto',
          summary: 'A inteligencia identificou oportunidades.',
          evidence: [
            {
              key: 'expansion_opportunities',
              label: 'Oportunidades',
              value: 1,
              summary: 'Existe uma oportunidade de expansao.',
            },
          ],
          suggestedAction: 'Revisar a oportunidade de maior aderencia.',
          source: 'growth',
          sourceKey: 'expansion_opportunities',
        },
      ],
      totalDetected: 1,
      totalPublished: 1,
      generatedAt: '2026-07-06T21:00:00.000Z',
    },
    executiveTimeline: {
      items: [
        {
          id: 'executive_timeline:growth:expansion_opportunities',
          category: 'growth',
          importance: 'high',
          temporalKind: 'observed',
          title: 'Oportunidades de expansao foram identificadas',
          summary: 'A inteligencia de crescimento identificou oportunidades executivas relevantes.',
          evidence: [
            {
              key: 'expansionOpportunities',
              value: 1,
              description: 'Existe uma oportunidade de expansao identificada.',
            },
          ],
          suggestedAction: 'Revisar a oportunidade prioritaria no centro de decisoes.',
          occurredAt: '2026-07-06T21:00:00.000Z',
          source: 'growth',
          sourceKey: 'expansion_opportunities',
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
        totalDemand: 5,
        totalTerritories: 2,
        totalCoverageGaps: 1,
        overloadedProfessionals: 0,
        constrainedProfessionals: 1,
        expansionOpportunities: 1,
        landingCandidates: 1,
        eligibleLandingCandidates: 1,
        recommendations: 2,
        criticalRecommendations: 1,
        averageGrowthScore: 72,
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
  }
}

describe('executiveDashboardApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    buildRequiredBackendAuthHeadersMock.mockClear()
  })

  it('uses the canonical executive dashboard GET route with encoded officeId', async () => {
    const payload = createPayload()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }))

    vi.stubGlobal('fetch', fetchMock)

    const result = await getExecutiveDashboard('office/with spaces?x=1')

    expect(result).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/admin/escritorios/office%2Fwith%20spaces%3Fx%3D1/executive-dashboard',
      expect.objectContaining({
        method: 'GET',
        headers: {
          authorization: 'Bearer test-token',
        },
      }),
    )
  })

  it('reuses authenticated headers and does not send tenantId in path query or headers', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createPayload(),
    }))

    vi.stubGlobal('fetch', fetchMock)

    await getExecutiveDashboard('office-1')

    expect(buildRequiredBackendAuthHeadersMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3001/admin/escritorios/office-1/executive-dashboard')
    expect(url.includes('tenantId=')).toBe(false)
    expect(url.includes('tenant_id=')).toBe(false)
    expect(JSON.stringify(init.headers ?? {})).not.toContain('tenantId')
    expect(JSON.stringify(init.headers ?? {})).not.toContain('x-tenant')
  })

  it('propagates AbortSignal when provided', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createPayload(),
    }))
    const controller = new AbortController()

    vi.stubGlobal('fetch', fetchMock)

    await getExecutiveDashboard('office-1', { signal: controller.signal })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/admin/escritorios/office-1/executive-dashboard',
      expect.objectContaining({
        method: 'GET',
        signal: controller.signal,
      }),
    )
  })

  it('preserves backend error messages', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          message: 'Only the office owner can access this executive dashboard surface.',
        },
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(getExecutiveDashboard('office-1')).rejects.toThrow(
      'Only the office owner can access this executive dashboard surface.',
    )
  })

  it('preserves fetch abort errors without wrapping them', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const fetchMock = vi.fn(async () => {
      throw abortError
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(getExecutiveDashboard('office-1')).rejects.toBe(abortError)
  })

  it('defines the full executive dashboard response contract', () => {
    const payload: ExecutiveDashboardResponse = createPayload()

    expect(payload).toHaveProperty('generatedAt')
    expect(payload).toHaveProperty('officeState')
    expect(payload).toHaveProperty('morningBrief')
    expect(payload).toHaveProperty('officeHealth')
    expect(payload).toHaveProperty('decisionCenter')
    expect(payload).toHaveProperty('executiveFeed')
    expect(payload).toHaveProperty('executiveTimeline')
    expect(payload).toHaveProperty('growth')
    expect(payload).toHaveProperty('operational')
  })

  it('preserves executiveTimeline returned by the backend without transformation', async () => {
    const payload = createPayload()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }))

    vi.stubGlobal('fetch', fetchMock)

    const result = await getExecutiveDashboard('office-1')

    expect(result.executiveTimeline).toEqual(payload.executiveTimeline)
    expect(result.executiveTimeline.items[0]).toEqual(payload.executiveTimeline.items[0])
  })

  it('keeps the executive API layer independent from react hooks components and implicit typing escapes', () => {
    const apiSource = readFileSync(
      path.resolve('src/backend-bridge/api/executiveDashboardApi.ts'),
      'utf8',
    )
    const typeSource = readFileSync(
      path.resolve('src/backend-bridge/api/executiveDashboardTypes.ts'),
      'utf8',
    )

    expect(apiSource).not.toMatch(/from ['"]react['"]/)
    expect(apiSource).not.toMatch(/from ['"].*components\//)
    expect(apiSource).not.toMatch(/from ['"].*hooks\//)
    expect(typeSource).not.toMatch(/from ['"]react['"]/)
    const disallowedImplicitToken = ['a', 'n', 'y'].join('')

    expect(typeSource).not.toMatch(new RegExp(`\\b${disallowedImplicitToken}\\b`))
    expect(apiSource).not.toMatch(new RegExp(`\\b${disallowedImplicitToken}\\b`))
  })
})
