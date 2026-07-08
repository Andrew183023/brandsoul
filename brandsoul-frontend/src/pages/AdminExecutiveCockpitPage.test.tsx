// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useExecutiveDashboardMock = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useExecutiveDashboard', () => ({
  useExecutiveDashboard: useExecutiveDashboardMock,
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

vi.mock('../components/StatusChip', () => ({
  default: ({
    children,
    tone,
  }: {
    children: React.ReactNode
    tone?: string
  }) => (
    <span data-testid="status-chip" data-tone={tone ?? 'neutral'}>
      {children}
    </span>
  ),
}))

import AdminExecutiveCockpitPage from './AdminExecutiveCockpitPage'

function createPayload() {
  return {
    generatedAt: '2026-07-06T21:00:00.000Z',
    officeState: {
      officeId: 'office-1',
      tenantId: 11,
      growthStatus: 'ready' as const,
      operationalStatus: 'ready' as const,
    },
    morningBrief: {
      title: 'Seu escritório está saudável hoje.',
      tone: 'positive' as const,
      summary: 'O escritório está saudável e a principal prioridade é expandir com controle.',
      topPriority: 'Expandir com controle operacional',
      items: [],
      generatedAt: '2026-07-06T21:00:00.000Z',
    },
    officeHealth: {
      score: 84,
      level: 'good' as const,
      explanation: 'A operação está equilibrada.',
      positives: [],
      warnings: [],
      opportunities: [],
      drivers: [],
    },
    decisionCenter: {
      decisions: [
        {
          id: 'decision-1',
          type: 'expand' as const,
          title: 'Expandir com controle operacional',
          priority: 'high' as const,
          impact: 'high' as const,
          confidence: 82,
          explanation: 'Existe oportunidade de crescimento com saúde operacional suficiente.',
          evidence: [],
          recommendedActions: ['Priorizar a oportunidade mais aderente.'],
          blockingFactors: [],
        },
      ],
    },
    executiveFeed: {
      items: [
        {
          id: 'feed-1',
          category: 'growth' as const,
          severity: 'opportunity' as const,
          title: 'Existem oportunidades de expansão em aberto',
          summary: 'A inteligência identificou oportunidades executivas relevantes.',
          evidence: [],
          suggestedAction: 'Revisar a oportunidade com melhor aderência.',
          source: 'growth' as const,
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
          category: 'growth' as const,
          importance: 'high' as const,
          temporalKind: 'observed' as const,
          title: 'Oportunidades de expansão foram identificadas',
          summary: 'A inteligência de crescimento identificou oportunidades executivas relevantes.',
          evidence: [
            {
              key: 'expansionOpportunities',
              value: 2,
              description: 'Existem duas oportunidades de expansão identificadas.',
            },
          ],
          suggestedAction: 'Revisar a oportunidade com melhor aderência.',
          occurredAt: '2026-07-06T21:00:00.000Z',
          source: 'growth' as const,
          sourceKey: 'expansion_opportunities',
        },
        {
          id: 'executive_timeline:capacity:pressure',
          category: 'capacity' as const,
          importance: 'medium' as const,
          temporalKind: 'trend' as const,
          title: 'A capacidade exige monitoramento',
          summary: 'A distribuição atual de trabalho pede acompanhamento próximo da operação.',
          evidence: [
            {
              key: 'capacityWatch',
              description: 'A carga ativa atual sugere monitoramento operacional.',
            },
            {
              key: 'activeProfessionals',
              value: null,
              description: 'A leitura não publicou valor adicional para este sinal.',
            },
          ],
          source: 'operational' as const,
          sourceKey: 'capacity_pressure',
        },
      ],
      totalDetected: 2,
      totalPublished: 2,
      generatedAt: '2026-07-06T21:00:00.000Z',
    },
    growth: {
      status: 'ready' as const,
      officeId: 'office-1',
      tenantId: 11,
      generatedAt: '2026-07-06T21:00:00.000Z',
      summary: {
        totalDemand: 5,
        totalTerritories: 2,
        totalCoverageGaps: 1,
        overloadedProfessionals: 0,
        constrainedProfessionals: 1,
        expansionOpportunities: 2,
        landingCandidates: 1,
        eligibleLandingCandidates: 1,
        recommendations: 2,
        criticalRecommendations: 1,
        averageGrowthScore: 72,
        highestPriority: 'high' as const,
        generatedAt: '2026-07-06T21:00:00.000Z',
      },
      snapshot: {
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: 'all_time',
          startsAt: '1970-01-01T00:00:00.000Z',
          endsAt: '9999-12-31T23:59:59.999Z',
          granularity: 'custom' as const,
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
          deterministic: true as const,
          foundationVersion: 'g7.0',
          evidence: [],
        },
      },
      compatibility: {
        professionalsIncluded: true,
        entityProfileIncluded: false,
        landingCandidatesPreparedOnly: true as const,
      },
    },
    operational: {
      status: 'ready' as const,
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
        slaWarningCases: 1,
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
        firstResponseMinutesDerived: false as const,
        slaStatusDerived: false as const,
        waitingForDerived: false as const,
        archivedCasesExcluded: true as const,
      },
    },
  }
}

describe('AdminExecutiveCockpitPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useExecutiveDashboardMock.mockReset()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders safe state when officeId is missing', async () => {
    useExecutiveDashboardMock.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId={null} />)
    })

    expect(container.textContent).toContain('Escritório não encontrado para carregar o cockpit executivo.')
  })

  it('renders loading state', async () => {
    useExecutiveDashboardMock.mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    expect(container.textContent).toContain('Carregando cockpit executivo...')
    expect(useExecutiveDashboardMock).toHaveBeenCalledWith('office-1', undefined)
  })

  it('renders error state and retries on button click', async () => {
    const refresh = vi.fn(async () => {})
    useExecutiveDashboardMock.mockReturnValue({
      data: null,
      error: new Error('Only the office owner can access this executive dashboard surface.'),
      isLoading: false,
      isRefreshing: false,
      refresh,
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    expect(container.textContent).toContain('Não foi possível carregar o cockpit executivo.')
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Tentar novamente')

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders Morning Brief Office Health Decisions Executive Feed Timeline and Snapshot blocks', async () => {
    useExecutiveDashboardMock.mockReturnValue({
      data: createPayload(),
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    expect(container.textContent).toContain('Como está o escritório hoje?')
    expect(container.textContent).toContain('Seu escritório está saudável hoje.')
    expect(container.textContent).toContain('Health score')
    expect(container.textContent).toContain('84')
    expect(container.textContent).toContain('A operação está equilibrada.')
    expect(container.textContent).toContain('Expandir com controle operacional')
    expect(container.textContent).toContain('Existem oportunidades de expansão em aberto')
    expect(container.textContent).toContain('Linha do tempo executiva')
    expect(container.textContent).toContain('Acontecimentos e tendências relevantes identificados pela inteligência do escritório.')
    expect(container.textContent).toContain('casos ativos')
    expect(container.textContent).toContain('backlog')
    expect(container.textContent).toContain('SLA em risco')
    expect(container.textContent).toContain('oportunidades')
    expect(container.textContent).toContain('Prioridade do dia:')
    expect(container.textContent).toContain('Última atualização:')
    expect(container.textContent).toContain('06/07/2026')
    expect(container.textContent).toContain('Atualizar')
    expect(container.querySelectorAll('[data-testid="status-chip"]').length).toBeGreaterThan(0)
  })

  it('renders timeline items in the received order with visible presentation labels', async () => {
    useExecutiveDashboardMock.mockReturnValue({
      data: createPayload(),
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    const text = container.textContent ?? ''
    const firstIndex = text.indexOf('Oportunidades de expansão foram identificadas')
    const secondIndex = text.indexOf('A capacidade exige monitoramento')

    expect(firstIndex).toBeGreaterThan(-1)
    expect(secondIndex).toBeGreaterThan(-1)
    expect(firstIndex).toBeLessThan(secondIndex)
    expect(text).toContain('Alta')
    expect(text).toContain('Média')
    expect(text).toContain('Crescimento')
    expect(text).toContain('Capacidade')
    expect(text).toContain('Observado')
    expect(text).toContain('Tendência')
  })

  it('renders timeline evidence compactly and only shows suggested action or occurredAt when present', async () => {
    useExecutiveDashboardMock.mockReturnValue({
      data: createPayload(),
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    const text = container.textContent ?? ''

    expect(text).toContain('Existem duas oportunidades de expansão identificadas.')
    expect(text).toContain('Valor: 2')
    expect(text).toContain('A carga ativa atual sugere monitoramento operacional.')
    expect(text).toContain('Ação sugerida: Revisar a oportunidade com melhor aderência.')
    expect(text).toContain('Quando: 06/07/2026')
    expect(text).not.toContain('Ação sugerida: undefined')
    expect(text).not.toContain('Quando: undefined')
    expect(text).not.toContain('Valor: null')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('sourceKey')
    expect(text).not.toContain('expansion_opportunities')
    expect(text).not.toContain('capacity_pressure')
    expect(text).not.toContain('executive_timeline:')
  })

  it('renders timeline evidence values when they are 0 or false and keeps null hidden', async () => {
    const payload = createPayload()
    payload.executiveTimeline.items = [
      {
        ...payload.executiveTimeline.items[0],
        id: 'executive_timeline:operations:evidence_values',
        title: 'Valores operacionais publicados',
        evidence: [
          {
            key: 'delayedCases',
            value: 0,
            description: 'Nenhum caso atrasado foi identificado na leitura atual.',
          },
          {
            key: 'needsEscalation',
            value: false,
            description: 'A leitura atual não exige escalonamento automático.',
          },
          {
            key: 'missingValue',
            value: null,
            description: 'Este sinal foi publicado sem valor adicional.',
          },
        ],
      },
    ]
    payload.executiveTimeline.totalDetected = 1
    payload.executiveTimeline.totalPublished = 1

    useExecutiveDashboardMock.mockReturnValue({
      data: payload,
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    const text = container.textContent ?? ''

    expect(text).toContain('Nenhum caso atrasado foi identificado na leitura atual.')
    expect(text).toContain('Valor: 0')
    expect(text).toContain('A leitura atual não exige escalonamento automático.')
    expect(text).toContain('Valor: false')
    expect(text).toContain('Este sinal foi publicado sem valor adicional.')
    expect(text).not.toContain('Valor: null')
    expect(text).not.toContain('Valor: undefined')
  })

  it('renders empty state when the executive timeline has no items', async () => {
    const payload = createPayload()
    payload.decisionCenter.decisions = []
    payload.executiveFeed.items = []
    payload.executiveTimeline.items = []
    payload.executiveTimeline.totalDetected = 0
    payload.executiveTimeline.totalPublished = 0

    useExecutiveDashboardMock.mockReturnValue({
      data: payload,
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh: vi.fn(),
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    expect(container.textContent).toContain('Nenhuma decisão imediata foi priorizada. O escritório pode seguir em monitoramento controlado.')
    expect(container.textContent).toContain('Nenhum acontecimento executivo relevante foi publicado. A operação segue sem novos alertas prioritários.')
    expect(container.textContent).toContain('Nenhum acontecimento executivo relevante foi identificado neste momento.')
  })

  it('calls refresh from the visible update button in success state', async () => {
    const refresh = vi.fn(async () => {})
    useExecutiveDashboardMock.mockReturnValue({
      data: createPayload(),
      error: null,
      isLoading: false,
      isRefreshing: false,
      refresh,
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Atualizar',
    )

    expect(button).toBeTruthy()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('shows refreshing state and calls refresh from the visible update button', async () => {
    const refresh = vi.fn(async () => {})
    useExecutiveDashboardMock.mockReturnValue({
      data: createPayload(),
      error: null,
      isLoading: false,
      isRefreshing: true,
      refresh,
    })

    await act(async () => {
      root.render(<AdminExecutiveCockpitPage officeId="office-1" />)
    })

    expect(container.textContent).toContain('Atualizando cockpit executivo...')
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Atualizando...',
    )
    expect(button).toBeTruthy()
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('depends on useExecutiveDashboard instead of backend imports', async () => {
    const pageSource = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(new URL('./AdminExecutiveCockpitPage.tsx', import.meta.url), 'utf8'),
    )

    expect(pageSource).toContain('useExecutiveDashboard')
    expect(pageSource).not.toContain('getExecutiveDashboard(')
    expect(pageSource).not.toContain('fetch(')
    expect(pageSource).not.toContain('../backend-bridge/api/adminApi')
    expect(pageSource).not.toContain('../backend-bridge/api/executiveDashboardApi')
    expect(pageSource).not.toContain('.sort(')
    expect(pageSource).not.toContain('.toSorted(')
    expect(pageSource).not.toContain('.reverse(')
  })
})
