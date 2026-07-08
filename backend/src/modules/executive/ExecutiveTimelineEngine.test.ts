import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import {
  createExecutiveTimelineEngine,
  type ExecutiveTimelineEngineInput,
} from './index.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'

function createGrowthIntelligenceResponse(): GrowthIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T10:00:00.000Z',
    summary: {
      totalDemand: 4,
      totalTerritories: 2,
      totalCoverageGaps: 1,
      overloadedProfessionals: 0,
      constrainedProfessionals: 1,
      expansionOpportunities: 2,
      landingCandidates: 1,
      eligibleLandingCandidates: 1,
      recommendations: 2,
      criticalRecommendations: 1,
      averageGrowthScore: 82,
      highestPriority: 'high',
      generatedAt: '2026-07-06T10:00:00.000Z',
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
      demand: {
        items: [
          {
            id: 'demand-1',
            officeId: 'office-1',
            tenantId: 11,
            period: {
              label: 'all_time',
              startsAt: '1970-01-01T00:00:00.000Z',
              endsAt: '9999-12-31T23:59:59.999Z',
              granularity: 'custom',
            },
            city: 'Belo Horizonte',
            specialty: 'civil',
            origin: 'unknown',
            casesCount: 4,
            leadsCount: 5,
            conversionRate: 0.8,
            backlogCount: 2,
            averageResolutionHours: 16,
            slaRiskScore: 20,
            score: 80,
            trend: 'up',
            evidenceIds: ['e-1'],
          },
        ],
      },
      territories: [
        {
          id: 'territory-1',
          officeId: 'office-1',
          tenantId: 11,
          period: {
            label: 'all_time',
            startsAt: '1970-01-01T00:00:00.000Z',
            endsAt: '9999-12-31T23:59:59.999Z',
            granularity: 'custom',
          },
          city: 'Belo Horizonte',
          demandScore: 80,
          coverageScore: 60,
          competitionScore: 0,
          growthScore: 74,
          coverageStatus: 'partial',
          trend: 'up',
          recommendation: 'expandir_cobertura',
          evidenceIds: ['e-2'],
        },
      ],
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
      closedCases: 1,
      backlog: 4,
      activeProfessionals: 2,
      averageResolutionHours: 18,
      averageFirstResponseMinutes: null,
      slaWarningCases: 0,
      slaBreachedCases: 0,
      casesPerProfessional: {},
      casesPerPracticeArea: {},
      casesPerCity: {},
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
    positives: [
      {
        key: 'backlog_healthy',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece compativel com a capacidade atual.',
      },
    ],
    warnings: [],
    opportunities: [
      {
        key: 'expansion_opportunities',
        title: 'Oportunidades de expansao',
        impact: 'positive',
        weight: 5,
        summary: 'Existem oportunidades concretas de expansao.',
      },
    ],
    drivers: [],
    ...overrides,
  }
}

function createDecisionCenter(
  decisions: DecisionCenterResult['decisions'] = [],
): DecisionCenterResult {
  return { decisions }
}

function createInput(
  overrides: Partial<ExecutiveTimelineEngineInput> = {},
): ExecutiveTimelineEngineInput {
  return {
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenter(),
    ...overrides,
  }
}

test('executive timeline returns the expected contract with generatedAt fallback and default limit', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput())

  assert.equal(Array.isArray(timeline.items), true)
  assert.equal(typeof timeline.totalDetected, 'number')
  assert.equal(typeof timeline.totalPublished, 'number')
  assert.equal(timeline.generatedAt, '2026-07-06T10:00:00.000Z')
  assert.equal(timeline.totalPublished <= 10, true)
})

test('executive timeline publishes health critical event with evidence and action', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    officeHealth: createOfficeHealth({
      score: 42,
      level: 'critical',
      explanation: 'A operacao esta em estado critico.',
      warnings: [
        {
          key: 'sla_breached',
          title: 'SLA vencido',
          impact: 'negative',
          weight: 14,
          summary: 'Ha casos com SLA vencido pressionando a operacao.',
        },
      ],
    }),
  }))

  const item = timeline.items.find((entry) => entry.id === 'executive_timeline:health:critical')
  assert.ok(item)
  assert.equal(item.importance, 'critical')
  assert.equal(item.temporalKind, 'observed')
  assert.equal(item.evidence.length > 0, true)
  assert.equal(typeof item.suggestedAction, 'string')
})

test('executive timeline publishes health excellent event and avoids generic irrelevant health event', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    officeHealth: createOfficeHealth({
      score: 95,
      level: 'excellent',
      explanation: 'A operacao esta em excelente condicao.',
    }),
  }))

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:health:excellent'),
    true,
  )
  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:health:critical'),
    false,
  )
})

test('executive timeline publishes SLA breached and does not invent historical wording', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 4,
      slaWarningCases: 2,
    }),
  }))

  const item = timeline.items.find((entry) => entry.id === 'executive_timeline:sla:breached')
  assert.ok(item)
  const serialized = `${item.title} ${item.summary}`.toLowerCase()
  assert.equal(serialized.includes('aumentou'), false)
  assert.equal(serialized.includes('diminuiu'), false)
  assert.equal(serialized.includes('melhorou'), false)
  assert.equal(serialized.includes('piorou'), false)
  assert.equal(serialized.includes('esta semana'), false)
})

test('executive timeline publishes SLA warning only when no breach exists', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 0,
      slaWarningCases: 3,
    }),
  }))

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:sla:warning'),
    true,
  )
  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:sla:breached'),
    false,
  )
})

test('executive timeline publishes no active professionals event and suppresses redundant hire decision', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    operational: createOperationalIntelligenceResponse({
      openCases: 5,
      backlog: 5,
      activeProfessionals: 0,
    }),
    decisionCenter: createDecisionCenter([
      {
        id: 'decision-hire',
        type: 'hire',
        title: 'Reforcar capacidade',
        priority: 'critical',
        impact: 'very_high',
        confidence: 92,
        explanation: 'Nao ha capacidade suficiente para absorver a carga atual.',
        evidence: [
          {
            key: 'active_professionals',
            label: 'Profissionais ativos',
            value: 0,
            summary: 'Nao ha profissionais ativos.',
          },
        ],
        recommendedActions: ['Ativar reforco imediato de capacidade.'],
        blockingFactors: [],
      },
    ]),
  }))

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:capacity:no_active_professionals'),
    true,
  )
  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:decision:hire'),
    false,
  )
})

test('executive timeline publishes backlog pressure and suppresses redundant redistribute decision', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    operational: createOperationalIntelligenceResponse({
      openCases: 18,
      backlog: 18,
      activeProfessionals: 2,
    }),
    decisionCenter: createDecisionCenter([
      {
        id: 'decision-redistribute',
        type: 'redistribute',
        title: 'Redistribuir carga operacional',
        priority: 'high',
        impact: 'high',
        confidence: 80,
        explanation: 'O backlog pressiona a distribuicao atual.',
        evidence: [
          {
            key: 'backlog',
            label: 'Backlog',
            value: 18,
            summary: 'O backlog atual esta elevado.',
          },
        ],
        recommendedActions: ['Redistribuir os casos entre os profissionais ativos.'],
        blockingFactors: [],
      },
    ]),
  }))

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:operations:backlog_pressure'),
    true,
  )
  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:decision:redistribute'),
    false,
  )
})

test('executive timeline publishes capacity adequate and backlog healthy when relevant', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    operational: createOperationalIntelligenceResponse({
      openCases: 4,
      backlog: 3,
      activeProfessionals: 2,
    }),
  }))

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:capacity:adequate'),
    true,
  )
  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:operations:backlog_healthy'),
    true,
  )
})

test('executive timeline publishes expansion opportunities and coverage gaps', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput())

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:growth:expansion_opportunities'),
    true,
  )
  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:coverage:gaps'),
    true,
  )
})

test('executive timeline publishes explicit growth trend signals with temporalKind trend', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput())

  const item = timeline.items.find((entry) => entry.id === 'executive_timeline:growth:demand_trend_up')
  assert.ok(item)
  assert.equal(item.temporalKind, 'trend')
  assert.equal(item.summary.includes('período'), false)
  assert.equal(item.summary.includes('periodo'), true)
})

test('executive timeline publishes high priority invest decision when it is not redundant', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    growth: {
      ...createGrowthIntelligenceResponse(),
      summary: {
        ...createGrowthIntelligenceResponse().summary,
        expansionOpportunities: 0,
      },
    },
    decisionCenter: createDecisionCenter([
      {
        id: 'decision-invest',
        type: 'invest',
        title: 'Investir na frente mais aderente',
        priority: 'high',
        impact: 'high',
        confidence: 78,
        explanation: 'O crescimento atual sustenta investimento seletivo.',
        evidence: [
          {
            key: 'average_growth_score',
            label: 'Growth score medio',
            value: 82,
            summary: 'O growth score medio atual e elevado.',
          },
        ],
        recommendedActions: ['Priorizar investimento seletivo na frente mais aderente.'],
        blockingFactors: [],
      },
    ]),
  }))

  assert.equal(
    timeline.items.some((entry) => entry.id === 'executive_timeline:decision:invest'),
    true,
  )
})

test('executive timeline keeps all published items explainable', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput())

  for (const item of timeline.items) {
    assert.equal(item.summary.length > 0, true, item.id)
    assert.equal(item.evidence.length > 0, true, item.id)
    if (item.importance === 'critical' || item.importance === 'high' || item.category === 'growth') {
      assert.equal(typeof item.suggestedAction === 'string' || item.suggestedAction === undefined, true, item.id)
    }
  }
})

test('executive timeline ordering is deterministic and does not depend on source insertion order', () => {
  const engine = createExecutiveTimelineEngine()
  const left = engine.build(createInput())
  const right = engine.build(createInput({
    decisionCenter: createDecisionCenter([...createInput().decisionCenter.decisions].reverse()),
  }))

  assert.deepEqual(left, right)
})

test('executive timeline limit uses default minimum maximum and invalid fallback', () => {
  const engine = createExecutiveTimelineEngine()
  const baseInput = createInput({
    decisionCenter: createDecisionCenter([
      {
        id: 'decision-invest',
        type: 'invest',
        title: 'Investir',
        priority: 'high',
        impact: 'high',
        confidence: 80,
        explanation: 'Investimento seletivo.',
        evidence: [{ key: 'score', label: 'Score', value: 82, summary: 'Score elevado.' }],
        recommendedActions: ['Investir.'],
        blockingFactors: [],
      },
    ]),
  })

  const withDefault = engine.build(baseInput)
  const withMinimum = engine.build({ ...baseInput, limit: 1 })
  const withMaximum = engine.build({ ...baseInput, limit: 30 })
  const withInvalid = engine.build({ ...baseInput, limit: 999 })

  assert.equal(withDefault.totalPublished <= 10, true)
  assert.equal(withMinimum.totalPublished, 1)
  assert.equal(withMaximum.totalPublished, withMaximum.items.length)
  assert.equal(withInvalid.totalPublished, withDefault.totalPublished)
})

test('executive timeline generatedAt respects override and does not fabricate occurredAt', () => {
  const timeline = createExecutiveTimelineEngine().build(createInput({
    generatedAt: '2026-07-06T11:00:00.000Z',
  }))

  assert.equal(timeline.generatedAt, '2026-07-06T11:00:00.000Z')
  assert.equal(
    timeline.items.every((item) => typeof item.occurredAt === 'undefined'),
    true,
  )
})

test('executive timeline is deterministic and does not mutate inputs', () => {
  const input = createInput()
  const before = structuredClone(input)
  const engine = createExecutiveTimelineEngine()

  const left = engine.build(input)
  const right = engine.build(input)

  assert.deepEqual(left, right)
  assert.deepEqual(input, before)
})

test('executive timeline implementation stays isolated from forbidden runtime dependencies', () => {
  const engineSource = readFileSync(
    path.resolve('backend/src/modules/executive/ExecutiveTimelineEngine.ts'),
    'utf8',
  )
  const typesSource = readFileSync(
    path.resolve('backend/src/modules/executive/ExecutiveTimelineTypes.ts'),
    'utf8',
  )
  const combined = `${engineSource}\n${typesSource}`

  for (const forbidden of [
    'prisma',
    'fastify',
    'react',
    'window',
    'document',
    'Date.now',
    'new Date',
    'performance.now',
    'Math.random',
    'crypto.randomUUID',
    'fetch',
    'axios',
    'observability',
  ]) {
    assert.equal(combined.includes(forbidden), false, forbidden)
  }
})
