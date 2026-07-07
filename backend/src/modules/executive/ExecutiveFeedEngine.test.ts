import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult, ExecutiveDecision } from './DecisionCenterTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'
import { createExecutiveFeedEngine } from './index.js'

function createGrowthIntelligenceResponse(
  overrides: Partial<GrowthIntelligenceResponse['summary']> = {},
): GrowthIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T10:00:00.000Z',
    summary: {
      totalDemand: 10,
      totalTerritories: 2,
      totalCoverageGaps: 1,
      overloadedProfessionals: 0,
      constrainedProfessionals: 1,
      expansionOpportunities: 2,
      landingCandidates: 1,
      eligibleLandingCandidates: 1,
      recommendations: 2,
      criticalRecommendations: 0,
      averageGrowthScore: 82,
      highestPriority: 'high',
      generatedAt: '2026-07-06T10:00:00.000Z',
      ...overrides,
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
      generatedAt: '2026-07-06T10:00:00.000Z',
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
  }
}

function createOperationalIntelligenceResponse(
  overrides: Partial<OperationalIntelligenceResponse['snapshot']> = {},
): OperationalIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T10:00:00.000Z',
    snapshot: {
      tenantId: 11,
      entityId: 'office-1',
      builtAt: '2026-07-06T10:00:00.000Z',
      openCases: 4,
      closedCases: 3,
      backlog: 4,
      activeProfessionals: 2,
      averageResolutionHours: 18,
      averageFirstResponseMinutes: null,
      slaWarningCases: 0,
      slaBreachedCases: 0,
      casesPerProfessional: {
        'prof-1': 2,
      },
      casesPerPracticeArea: {
        civil: 3,
      },
      casesPerCity: {
        'Belo Horizonte': 4,
      },
      ...overrides,
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
  }
}

function createOfficeHealth(overrides: Partial<OfficeHealth> = {}): OfficeHealth {
  return {
    score: 84,
    level: 'good',
    explanation: 'O escritorio apresenta boa saude executiva.',
    positives: [],
    warnings: [],
    opportunities: [],
    drivers: [],
    ...overrides,
  }
}

function createDecision(overrides: Partial<ExecutiveDecision>): ExecutiveDecision {
  return {
    id: overrides.id ?? 'decision-expand-1',
    type: overrides.type ?? 'expand',
    title: overrides.title ?? 'Expandir com controle operacional',
    priority: overrides.priority ?? 'high',
    impact: overrides.impact ?? 'high',
    confidence: overrides.confidence ?? 82,
    explanation: overrides.explanation ?? 'Existem oportunidades e saude suficiente para expandir.',
    evidence: overrides.evidence ?? [
      {
        key: 'default',
        label: 'Evidencia padrao',
        value: 1,
        summary: 'Existe uma evidencia valida para esta decisao.',
      },
    ],
    recommendedActions: overrides.recommendedActions ?? ['Executar a primeira acao recomendada.'],
    blockingFactors: overrides.blockingFactors ?? [],
  }
}

function createDecisionCenterResult(decisions: ExecutiveDecision[] = []): DecisionCenterResult {
  return {
    decisions,
  }
}

test('gera evento para health critico', () => {
  const engine = createExecutiveFeedEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({
      level: 'critical',
      score: 42,
      warnings: [
        {
          key: 'sla_breaches',
          title: 'SLA vencido',
          impact: 'negative',
          weight: 15,
          summary: 'Ha casos com SLA vencido.',
        },
      ],
    }),
    decisionCenter: createDecisionCenterResult(),
  })

  assert.equal(result.items.some((item) => item.id === 'feed:health:critical'), true)
})

test('gera evento para health excelente e nao gera evento generico para good', () => {
  const engine = createExecutiveFeedEngine()

  const excellent = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'excellent', score: 94 }),
    decisionCenter: createDecisionCenterResult(),
  })
  const good = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'good', score: 84 }),
    decisionCenter: createDecisionCenterResult(),
  })

  assert.equal(excellent.items.some((item) => item.id === 'feed:health:excellent'), true)
  assert.equal(good.items.some((item) => item.id === 'feed:health:excellent'), false)
  assert.equal(good.items.some((item) => item.id === 'feed:health:critical'), false)
})

test('gera evento para SLA vencido e para SLA em risco quando nao ha critico', () => {
  const engine = createExecutiveFeedEngine()

  const breached = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse({ slaBreachedCases: 2 }),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult(),
  })
  const warning = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse({ slaWarningCases: 3 }),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult(),
  })

  assert.equal(breached.items.some((item) => item.id === 'feed:sla:breached'), true)
  assert.equal(warning.items.some((item) => item.id === 'feed:sla:warning'), true)
})

test('gera backlog pressionado e casos sem profissionais ativos com precedencia do evento especifico', () => {
  const engine = createExecutiveFeedEngine()

  const backlog = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse({ backlog: 20, activeProfessionals: 2 }),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult(),
  })
  const noProfessionals = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse({
      openCases: 6,
      backlog: 20,
      activeProfessionals: 0,
    }),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult(),
  })

  assert.equal(backlog.items.some((item) => item.id === 'feed:operations:backlog_pressure'), true)
  assert.equal(noProfessionals.items.some((item) => item.id === 'feed:capacity:no_active_professionals'), true)
  assert.equal(noProfessionals.items.some((item) => item.id === 'feed:operations:backlog_pressure'), false)
})

test('gera oportunidades de expansao e coverage gaps', () => {
  const engine = createExecutiveFeedEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({
      expansionOpportunities: 2,
      totalCoverageGaps: 3,
    }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult(),
  })

  assert.equal(result.items.some((item) => item.id === 'feed:growth:expansion_opportunities'), true)
  assert.equal(result.items.some((item) => item.id === 'feed:coverage:gaps'), true)
})

test('publica apenas decisoes critical ou high e consolida multiplas decisoes do mesmo type', () => {
  const engine = createExecutiveFeedEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 0, totalCoverageGaps: 0 }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult([
      createDecision({
        id: 'decision-expand-1',
        type: 'expand',
        priority: 'high',
        confidence: 80,
      }),
      createDecision({
        id: 'decision-expand-2',
        type: 'expand',
        priority: 'critical',
        confidence: 90,
        evidence: [
          {
            key: 'extra',
            label: 'Evidencia extra',
            value: 2,
            summary: 'Existe uma segunda evidencia.',
          },
          {
            key: 'extra-2',
            label: 'Evidencia extra 2',
            value: 3,
            summary: 'Existe uma terceira evidencia.',
          },
        ],
      }),
      createDecision({
        id: 'decision-low',
        type: 'invest',
        priority: 'low',
      }),
    ]),
  })

  const decisionItems = result.items.filter((item) => item.source === 'decision_center')
  assert.equal(decisionItems.length, 1)
  assert.equal(decisionItems[0]?.id, 'feed:decision:expand')
})

test('toda publicacao possui evidencia e eventos acionaveis possuem suggestedAction', () => {
  const engine = createExecutiveFeedEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({ totalCoverageGaps: 2 }),
    operational: createOperationalIntelligenceResponse({ slaBreachedCases: 1 }),
    officeHealth: createOfficeHealth({ level: 'critical', score: 40 }),
    decisionCenter: createDecisionCenterResult([
      createDecision({
        type: 'wait',
        priority: 'critical',
      }),
    ]),
  })

  for (const item of result.items) {
    assert.equal(item.evidence.length >= 1, true)
    if (item.severity === 'critical' || item.severity === 'warning' || item.severity === 'opportunity') {
      assert.notEqual(item.suggestedAction?.length ?? 0, 0)
    }
  }
})

test('ids deduplicacao ordenacao totalDetected e totalPublished sao deterministicos', () => {
  const engine = createExecutiveFeedEngine()
  const input = {
    growth: createGrowthIntelligenceResponse({
      expansionOpportunities: 2,
      totalCoverageGaps: 2,
    }),
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 1,
      backlog: 20,
      activeProfessionals: 2,
    }),
    officeHealth: createOfficeHealth({
      level: 'critical',
      score: 38,
      warnings: [
        {
          key: 'backlog_pressure',
          title: 'Backlog pressionado',
          impact: 'negative',
          weight: 12,
          summary: 'O backlog esta pressionado.',
        },
      ],
    }),
    decisionCenter: createDecisionCenterResult([
      createDecision({
        id: 'decision-wait',
        type: 'wait',
        priority: 'critical',
      }),
      createDecision({
        id: 'decision-redistribute',
        type: 'redistribute',
        priority: 'high',
      }),
      createDecision({
        id: 'decision-expand',
        type: 'expand',
        priority: 'high',
      }),
    ]),
  }

  const first = engine.build(input)
  const second = engine.build(input)

  assert.deepEqual(first, second)
  assert.equal(first.totalDetected >= first.totalPublished, true)
  assert.deepEqual(first.items.map((item) => item.id), [
    'feed:sla:breached',
    'feed:health:critical',
    'feed:decision:redistribute',
    'feed:growth:expansion_opportunities',
    'feed:coverage:gaps',
  ])
})

test('default limit override invalid limit and generatedAt behavior work correctly', () => {
  const engine = createExecutiveFeedEngine()
  const sharedInput = {
    growth: createGrowthIntelligenceResponse({
      expansionOpportunities: 2,
      totalCoverageGaps: 2,
    }),
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 1,
      backlog: 20,
      activeProfessionals: 2,
    }),
    officeHealth: createOfficeHealth({
      level: 'critical',
      score: 38,
      warnings: [
        {
          key: 'backlog_pressure',
          title: 'Backlog pressionado',
          impact: 'negative',
          weight: 12,
          summary: 'O backlog esta pressionado.',
        },
      ],
    }),
    decisionCenter: createDecisionCenterResult([
      createDecision({ id: 'decision-redistribute', type: 'redistribute', priority: 'high' }),
      createDecision({ id: 'decision-expand', type: 'expand', priority: 'high' }),
      createDecision({ id: 'decision-invest', type: 'invest', priority: 'high' }),
    ]),
  }

  const defaultLimited = engine.build(sharedInput)
  const overridden = engine.build({
    ...sharedInput,
    limit: 3,
    generatedAt: '2026-07-06T11:00:00.000Z',
  })
  const invalid = engine.build({
    ...sharedInput,
    limit: 0,
  })

  assert.equal(defaultLimited.items.length <= 5, true)
  assert.equal(overridden.items.length, 3)
  assert.equal(overridden.totalDetected >= overridden.totalPublished, true)
  assert.equal(invalid.items.length <= 5, true)
  assert.equal(overridden.generatedAt, '2026-07-06T11:00:00.000Z')
  assert.equal(defaultLimited.generatedAt, '2026-07-06T10:00:00.000Z')
})

test('engine nao muta inputs', () => {
  const engine = createExecutiveFeedEngine()
  const input = {
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse({ slaWarningCases: 2 }),
    officeHealth: createOfficeHealth({ level: 'attention', score: 72 }),
    decisionCenter: createDecisionCenterResult([
      createDecision({ type: 'expand', priority: 'high' }),
    ]),
  }
  const before = structuredClone(input)

  void engine.build(input)

  assert.deepEqual(input, before)
})

test('teste estrutural de independencia do engine', async () => {
  const source = await readFile(
    path.resolve('src/modules/executive/ExecutiveFeedEngine.ts'),
    'utf8',
  )

  assert.equal(source.includes('prisma'), false)
  assert.equal(source.includes('fastify'), false)
  assert.equal(source.includes('react'), false)
  assert.equal(source.includes('window'), false)
  assert.equal(source.includes('document'), false)
  assert.equal(source.includes('Date.now'), false)
  assert.equal(source.includes('Math.random'), false)
  assert.equal(source.includes('crypto.randomUUID'), false)
  assert.equal(source.includes('fetch'), false)
  assert.equal(source.includes('axios'), false)
})
