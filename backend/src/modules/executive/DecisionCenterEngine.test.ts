import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'
import { createDecisionCenterEngine } from './index.js'

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
      expansionOpportunities: 1,
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
        'prof-2': 2,
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
    positives: [
      {
        key: 'backlog_healthy',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece compativel com a capacidade operacional.',
      },
    ],
    warnings: [],
    opportunities: [],
    drivers: [
      {
        key: 'backlog_healthy',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece compativel com a capacidade operacional.',
      },
    ],
    ...overrides,
  }
}

test('decision center generates expand when opportunities exist and office health is healthy', () => {
  const engine = createDecisionCenterEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 2 }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ score: 82, level: 'good' }),
  })

  const expand = result.decisions.find((decision) => decision.type === 'expand')
  assert.ok(expand)
  assert.equal(expand.priority, 'high')
  assert.equal(expand.impact, 'high')
  assert.equal(expand.evidence.length > 0, true)
  assert.notEqual(expand.explanation.length, 0)
})

test('decision center generates wait when health is critical or sla is breached', () => {
  const engine = createDecisionCenterEngine()
  const criticalHealth = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ score: 50, level: 'critical' }),
  })
  const waitByHealth = criticalHealth.decisions.find((decision) => decision.type === 'wait')
  assert.ok(waitByHealth)

  const slaBreached = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse({ slaBreachedCases: 1 }),
    officeHealth: createOfficeHealth({ score: 78, level: 'attention' }),
  })
  const waitBySla = slaBreached.decisions.find((decision) => decision.type === 'wait')
  assert.ok(waitBySla)
})

test('decision center generates redistribute when backlog or capacity warnings are pressured', () => {
  const engine = createDecisionCenterEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse({
      backlog: 15,
      activeProfessionals: 2,
    }),
    officeHealth: createOfficeHealth({
      warnings: [
        {
          key: 'capacity_stressed',
          title: 'Capacidade pressionada',
          impact: 'negative',
          weight: 10,
          summary: 'A capacidade esta pressionada.',
        },
      ],
    }),
  })

  const redistribute = result.decisions.find((decision) => decision.type === 'redistribute')
  assert.ok(redistribute)
  assert.equal(redistribute.evidence.length > 0, true)
})

test('decision center generates hire when there are open cases without active professionals', () => {
  const engine = createDecisionCenterEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse({
      openCases: 5,
      activeProfessionals: 0,
      backlog: 5,
    }),
    officeHealth: createOfficeHealth({ score: 65, level: 'attention' }),
  })

  const hire = result.decisions.find((decision) => decision.type === 'hire')
  assert.ok(hire)
  assert.equal(hire.priority, 'critical')
})

test('decision center generates invest when growth score, landing candidates and health are strong', () => {
  const engine = createDecisionCenterEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({
      averageGrowthScore: 88,
      eligibleLandingCandidates: 2,
    }),
    operational: createOperationalIntelligenceResponse(),
    officeHealth: createOfficeHealth({ score: 86, level: 'good' }),
  })

  const invest = result.decisions.find((decision) => decision.type === 'invest')
  assert.ok(invest)
  assert.equal(invest.impact, 'very_high')
})

test('decision center decisions always include evidence, explanation and confidence between 0 and 100', () => {
  const engine = createDecisionCenterEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({
      expansionOpportunities: 2,
      averageGrowthScore: 88,
      eligibleLandingCandidates: 2,
    }),
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 1,
      backlog: 20,
      activeProfessionals: 2,
    }),
    officeHealth: createOfficeHealth({
      score: 82,
      level: 'good',
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
  })

  assert.equal(result.decisions.length > 0, true)
  for (const decision of result.decisions) {
    assert.equal(decision.evidence.length > 0, true)
    assert.notEqual(decision.explanation.length, 0)
    assert.equal(decision.confidence >= 0, true)
    assert.equal(decision.confidence <= 100, true)
  }
})

test('decision center sorts decisions deterministically by priority impact confidence and type', () => {
  const engine = createDecisionCenterEngine()
  const result = engine.build({
    growth: createGrowthIntelligenceResponse({
      expansionOpportunities: 2,
      averageGrowthScore: 88,
      eligibleLandingCandidates: 2,
    }),
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 1,
      backlog: 20,
      activeProfessionals: 2,
    }),
    officeHealth: createOfficeHealth({
      score: 82,
      level: 'good',
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
  })

  assert.deepEqual(result.decisions.map((decision) => decision.type), [
    'wait',
    'invest',
    'redistribute',
    'expand',
  ])
})

test('decision center is deterministic and does not mutate inputs', () => {
  const engine = createDecisionCenterEngine()
  const input = {
    growth: createGrowthIntelligenceResponse({ expansionOpportunities: 2 }),
    operational: createOperationalIntelligenceResponse({ backlog: 18, activeProfessionals: 2 }),
    officeHealth: createOfficeHealth({
      warnings: [
        {
          key: 'capacity_stressed',
          title: 'Capacidade pressionada',
          impact: 'negative',
          weight: 10,
          summary: 'A capacidade esta pressionada.',
        },
      ],
    }),
  }
  const before = structuredClone(input)

  const first = engine.build(input)
  const second = engine.build(input)

  assert.deepEqual(first, second)
  assert.deepEqual(input, before)
})

test('decision center remains independent from database, HTTP, Fastify, React and browser APIs', async () => {
  const source = await readFile(
    path.resolve('src/modules/executive/DecisionCenterEngine.ts'),
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
