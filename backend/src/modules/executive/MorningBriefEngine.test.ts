import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'
import { createMorningBriefEngine } from './index.js'

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

function createDecisionCenterResult(decisions: DecisionCenterResult['decisions'] = []): DecisionCenterResult {
  return {
    decisions: decisions.length > 0
      ? decisions
      : [
        {
          id: 'decision-expand',
          type: 'expand',
          title: 'Expandir com controle operacional',
          priority: 'high',
          impact: 'high',
          confidence: 82,
          explanation: 'Existem oportunidades e saude suficiente para expandir.',
          evidence: [],
          recommendedActions: [],
          blockingFactors: [],
        },
      ],
  }
}

test('morning brief generates the correct title by office health level', () => {
  const engine = createMorningBriefEngine()

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'excellent' }),
    decisionCenter: createDecisionCenterResult(),
  }).title, 'Seu escritorio esta em excelente condicao hoje.')

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'good' }),
    decisionCenter: createDecisionCenterResult(),
  }).title, 'Seu escritorio esta saudavel hoje.')

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'attention' }),
    decisionCenter: createDecisionCenterResult(),
  }).title, 'Seu escritorio precisa de atencao hoje.')

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'critical' }),
    decisionCenter: createDecisionCenterResult(),
  }).title, 'Seu escritorio exige acao imediata hoje.')
})

test('morning brief maps tone correctly by office health level', () => {
  const engine = createMorningBriefEngine()

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'excellent' }),
    decisionCenter: createDecisionCenterResult(),
  }).tone, 'positive')

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'attention' }),
    decisionCenter: createDecisionCenterResult(),
  }).tone, 'attention')

  assert.equal(engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'critical' }),
    decisionCenter: createDecisionCenterResult(),
  }).tone, 'critical')
})

test('morning brief summary contains the main decision', () => {
  const engine = createMorningBriefEngine()
  const brief = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ level: 'good' }),
    decisionCenter: createDecisionCenterResult([
      {
        id: 'decision-invest',
        type: 'invest',
        title: 'Investir em aceleradores de crescimento',
        priority: 'high',
        impact: 'high',
        confidence: 88,
        explanation: 'Investir agora melhora a captura de demanda.',
        evidence: [],
        recommendedActions: [],
        blockingFactors: [],
      },
    ]),
  })

  assert.equal(brief.summary.includes('Investir em aceleradores de crescimento'), true)
  assert.equal(brief.topPriority, 'Investir em aceleradores de crescimento')
})

test('morning brief uses safe fallback when there are no decisions', () => {
  const engine = createMorningBriefEngine()
  const brief = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult([]),
  })

  assert.equal(brief.topPriority, 'Monitorar a operacao e aguardar novos sinais.')
  assert.equal(brief.summary.includes('Monitorar a operacao e aguardar novos sinais.'), true)
})

test('morning brief includes all required items', () => {
  const engine = createMorningBriefEngine()
  const brief = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 3 }),
    operational: createOperationalIntelligenceResponse({ openCases: 5, backlog: 4 }),
    officeHealth: createOfficeHealth({ score: 81 }),
    decisionCenter: createDecisionCenterResult(),
  })

  assert.deepEqual(brief.items.map((item) => item.key), [
    'health_score',
    'active_cases',
    'backlog',
    'sla',
    'growth_opportunities',
    'decisions_count',
  ])
})

test('morning brief generatedAt respects override and falls back to growth generatedAt', () => {
  const engine = createMorningBriefEngine()
  const input = {
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth(),
    decisionCenter: createDecisionCenterResult(),
  }

  const withOverride = engine.build({
    ...input,
    generatedAt: '2026-07-06T11:00:00.000Z',
  })
  const withFallback = engine.build(input)

  assert.equal(withOverride.generatedAt, '2026-07-06T11:00:00.000Z')
  assert.equal(withFallback.generatedAt, '2026-07-06T10:00:00.000Z')
})

test('morning brief is deterministic and does not mutate inputs', () => {
  const engine = createMorningBriefEngine()
  const input = {
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse({ slaWarningCases: 1 }),
    officeHealth: createOfficeHealth({ level: 'attention', score: 74 }),
    decisionCenter: createDecisionCenterResult(),
  }
  const before = structuredClone(input)

  const first = engine.build(input)
  const second = engine.build(input)

  assert.deepEqual(first, second)
  assert.deepEqual(input, before)
})

test('morning brief remains independent from database HTTP Fastify React and browser APIs', async () => {
  const source = await readFile(
    path.resolve('src/modules/executive/MorningBriefEngine.ts'),
    'utf8',
  )

  assert.equal(source.includes('from \'react\''), false)
  assert.equal(source.includes('Fastify'), false)
  assert.equal(source.includes('fetch('), false)
  assert.equal(source.includes('axios'), false)
  assert.equal(source.includes('window.'), false)
  assert.equal(source.includes('document.'), false)
  assert.equal(source.includes('SELECT '), false)
  assert.equal(source.includes('INSERT '), false)
  assert.equal(source.includes('UPDATE '), false)
  assert.equal(source.includes('DELETE '), false)
})
