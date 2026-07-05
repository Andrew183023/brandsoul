// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getOfficeGrowthIntelligenceMock = vi.hoisted(() => vi.fn())

vi.mock('../backend-bridge/api/adminApi', () => ({
  getOfficeGrowthIntelligence: getOfficeGrowthIntelligenceMock,
}))

vi.mock('../components/AdminOfficeLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/FeedbackBanner', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/SurfaceCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

import AdminOfficeGrowthIntelligencePage from './AdminOfficeGrowthIntelligencePage'

function createPayload() {
  return {
    status: 'ready' as const,
    officeId: 'office-growth-1',
    tenantId: 12,
    generatedAt: '2026-07-05T12:00:00.000Z',
    summary: {
      totalDemand: 7,
      totalTerritories: 2,
      totalCoverageGaps: 1,
      overloadedProfessionals: 1,
      constrainedProfessionals: 1,
      expansionOpportunities: 2,
      landingCandidates: 2,
      eligibleLandingCandidates: 1,
      recommendations: 2,
      criticalRecommendations: 1,
      averageGrowthScore: 74,
      highestPriority: 'critical' as const,
      generatedAt: '2026-07-05T12:00:00.000Z',
    },
    snapshot: {
      officeId: 'office-growth-1',
      tenantId: 12,
      period: {
        label: 'all_time',
        startsAt: '1970-01-01T00:00:00.000Z',
        endsAt: '9999-12-31T23:59:59.999Z',
        granularity: 'custom' as const,
      },
      generatedAt: '2026-07-05T12:00:00.000Z',
      demand: {
        items: [
          {
            id: 'demand-1',
            officeId: 'office-growth-1',
            tenantId: 12,
            period: {
              label: 'all_time',
              startsAt: '1970-01-01T00:00:00.000Z',
              endsAt: '9999-12-31T23:59:59.999Z',
              granularity: 'custom' as const,
            },
            city: 'Belo Horizonte',
            specialty: 'Direito Civil',
            origin: 'unknown',
            casesCount: 7,
            leadsCount: 3,
            conversionRate: 0.5,
            backlogCount: 4,
            averageResolutionHours: 24,
            slaRiskScore: 20,
            score: 80,
            trend: 'up' as const,
            evidenceIds: ['evidence-1'],
          },
        ],
      },
      territories: [
        {
          id: 'territory-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          city: 'Belo Horizonte',
          demandScore: 90,
          coverageScore: 60,
          competitionScore: 0,
          growthScore: 78,
          coverageStatus: 'partial' as const,
          trend: 'up' as const,
          recommendation: 'expandir_cobertura' as const,
          evidenceIds: ['evidence-2'],
        },
      ],
      coverage: [
        {
          id: 'coverage-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          status: 'partial' as const,
          professionalsCount: 2,
          activeProfessionalsCount: 2,
          compatibleProfessionalsCount: 1,
          capacityStatus: 'constrained' as const,
          capacityScore: 40,
          gapType: 'specialty_uncovered' as const,
          evidenceIds: ['evidence-3'],
        },
      ],
      capacity: [
        {
          id: 'capacity-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          professionalId: 'prof-1',
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          workloadCount: 9,
          backlogCount: 4,
          openCasesCount: 9,
          closedCasesCount: 2,
          averageResolutionHours: 12,
          capacityScore: 10,
          capacityStatus: 'overloaded' as const,
          recommendation: 'contratar' as const,
          evidenceIds: ['evidence-4'],
        },
      ],
      scores: [
        {
          id: 'score-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          value: 82,
          demandScore: 90,
          coverageScore: 60,
          capacityScore: 40,
          slaScore: 80,
          trendScore: 100,
          priority: 'critical' as const,
          confidence: 'high' as const,
          evidenceIds: ['evidence-5'],
        },
      ],
      recommendations: [
        {
          id: 'recommendation-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          type: 'improve_coverage' as const,
          priority: 'critical' as const,
          confidence: 'high' as const,
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          title: 'Expandir cobertura civil',
          description: 'Existe demanda consistente sem cobertura plena.',
          expectedImpact: 'Reduz backlog operacional.',
          evidenceIds: ['evidence-6'],
        },
      ],
      opportunities: [
        {
          id: 'opportunity-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          type: 'contratar_associado' as const,
          score: 80,
          priority: 'high' as const,
          confidence: 'high' as const,
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          expectedImpact: 'Aumenta cobertura compatível.',
          justification: 'Capacidade atual restrita.',
          requiredActions: ['Mapear associado civil'],
          evidenceIds: ['evidence-7'],
        },
      ],
      landingCandidates: [
        {
          id: 'landing-1',
          officeId: 'office-growth-1',
          tenantId: 12,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom' as const,
          },
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          growthScore: 82,
          seoScore: 80,
          priority: 'high' as const,
          confidence: 'high' as const,
          eligible: true,
          reason: 'Alta demanda com oportunidade validada.',
          evidenceIds: ['evidence-8'],
        },
      ],
      metadata: {
        deterministic: true as const,
        foundationVersion: 'g7.0',
        evidence: [
          {
            id: 'evidence-1',
            type: 'derived_metric',
            source: 'legal_cases',
            description: 'Demanda agregada para Belo Horizonte.',
            weight: 0.8,
            createdAt: '2026-07-05T12:00:00.000Z',
          },
        ],
      },
    },
    compatibility: {
      professionalsIncluded: true,
      entityProfileIncluded: true,
      landingCandidatesPreparedOnly: true as const,
    },
  }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AdminOfficeGrowthIntelligencePage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    getOfficeGrowthIntelligenceMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders the FT-07 growth summary and snapshot in read-only mode', async () => {
    getOfficeGrowthIntelligenceMock.mockResolvedValue(createPayload())

    await act(async () => {
      root.render(<AdminOfficeGrowthIntelligencePage officeId="office-growth-1" />)
    })

    await flushPromises()

    expect(getOfficeGrowthIntelligenceMock).toHaveBeenCalledTimes(1)
    expect(getOfficeGrowthIntelligenceMock).toHaveBeenCalledWith('office-growth-1')
    expect(container.textContent).toContain('Leitura canônica FT-07')
    expect(container.textContent).toContain('demanda total')
    expect(container.textContent).toContain('Belo Horizonte')
    expect(container.textContent).toContain('Direito Civil')
    expect(container.textContent).toContain('Expandir cobertura civil')
    expect(container.textContent).toContain('contratar associado')
    expect(container.textContent).toContain('Landing Candidates')
    expect(container.textContent?.includes('Criar campanha')).toBe(false)
    expect(container.textContent?.includes('Executar oportunidade')).toBe(false)
    expect(container.textContent?.includes('Cliente Sigiloso')).toBe(false)
  })

  it('renders an error banner when the FT-07 endpoint fails', async () => {
    getOfficeGrowthIntelligenceMock.mockRejectedValue(new Error('Failed to load growth intelligence (500).'))

    await act(async () => {
      root.render(<AdminOfficeGrowthIntelligencePage officeId="office-growth-1" />)
    })

    await flushPromises()

    expect(container.textContent).toContain('Failed to load growth intelligence (500).')
  })
})
