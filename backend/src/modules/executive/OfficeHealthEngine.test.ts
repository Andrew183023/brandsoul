import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import { createOfficeHealthEngine } from './index.js'

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

test('office health engine keeps score between 0 and 100 and fills explanation and drivers', () => {
  const engine = createOfficeHealthEngine()

  const health = engine.build({
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
  })

  assert.equal(health.score >= 0, true)
  assert.equal(health.score <= 100, true)
  assert.equal(typeof health.explanation, 'string')
  assert.notEqual(health.explanation.length, 0)
  assert.equal(health.drivers.length > 0, true)
  assert.equal(health.positives.length > 0, true)
})

test('office health engine resolves the correct level ranges', () => {
  const engine = createOfficeHealthEngine()

  const excellent = engine.build({
    growth: createGrowthIntelligenceResponse({
      averageGrowthScore: 90,
      expansionOpportunities: 2,
      totalCoverageGaps: 0,
      criticalRecommendations: 0,
    }),
    operational: createOperationalIntelligenceResponse({
      openCases: 2,
      backlog: 2,
      activeProfessionals: 2,
      slaWarningCases: 0,
      slaBreachedCases: 0,
    }),
  })
  assert.equal(excellent.level, 'excellent')

  const attention = engine.build({
    growth: createGrowthIntelligenceResponse({
      averageGrowthScore: 62,
      totalCoverageGaps: 2,
      criticalRecommendations: 1,
      expansionOpportunities: 0,
    }),
    operational: createOperationalIntelligenceResponse({
      openCases: 10,
      backlog: 10,
      activeProfessionals: 2,
      slaWarningCases: 1,
      slaBreachedCases: 0,
    }),
  })
  assert.equal(attention.level, 'attention')

  const critical = engine.build({
    growth: createGrowthIntelligenceResponse({
      averageGrowthScore: 45,
      totalCoverageGaps: 3,
      criticalRecommendations: 2,
      expansionOpportunities: 0,
    }),
    operational: createOperationalIntelligenceResponse({
      openCases: 16,
      backlog: 16,
      activeProfessionals: 1,
      slaWarningCases: 2,
      slaBreachedCases: 2,
    }),
  })
  assert.equal(critical.level, 'critical')
})

test('office health engine generates positive and negative drivers from available evidence', () => {
  const engine = createOfficeHealthEngine()

  const health = engine.build({
    growth: createGrowthIntelligenceResponse({
      averageGrowthScore: 84,
      expansionOpportunities: 1,
      totalCoverageGaps: 1,
    }),
    operational: createOperationalIntelligenceResponse({
      slaBreachedCases: 1,
      activeProfessionals: 2,
      backlog: 3,
      openCases: 3,
    }),
  })

  assert.equal(health.drivers.some((driver) => driver.key === 'growth_score_strong'), true)
  assert.equal(health.drivers.some((driver) => driver.key === 'expansion_opportunities'), true)
  assert.equal(health.drivers.some((driver) => driver.key === 'sla_breaches'), true)
  assert.equal(health.warnings.some((driver) => driver.key === 'sla_breaches'), true)
})

test('office health engine is deterministic for identical inputs', () => {
  const engine = createOfficeHealthEngine()
  const input = {
    growth: createGrowthIntelligenceResponse(),
    operational: createOperationalIntelligenceResponse(),
  }

  const first = engine.build(input)
  const second = engine.build(input)

  assert.deepEqual(first, second)
})

test('office health engine does not mutate received payloads', () => {
  const engine = createOfficeHealthEngine()
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const growthBefore = structuredClone(growth)
  const operationalBefore = structuredClone(operational)

  void engine.build({ growth, operational })

  assert.deepEqual(growth, growthBefore)
  assert.deepEqual(operational, operationalBefore)
})

test('office health engine remains independent from database, HTTP, React and browser APIs', async () => {
  const source = await readFile(
    path.resolve('src/modules/executive/OfficeHealthEngine.ts'),
    'utf8',
  )

  assert.equal(source.includes('from \'react\''), false)
  assert.equal(source.includes('fetch('), false)
  assert.equal(source.includes('axios'), false)
  assert.equal(source.includes('window.'), false)
  assert.equal(source.includes('document.'), false)
  assert.equal(source.includes('Fastify'), false)
  assert.equal(source.includes('SELECT '), false)
  assert.equal(source.includes('INSERT '), false)
  assert.equal(source.includes('UPDATE '), false)
  assert.equal(source.includes('DELETE '), false)
})
