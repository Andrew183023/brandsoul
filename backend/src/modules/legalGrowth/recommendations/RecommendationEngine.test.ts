import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { RECOMMENDATION_BUILD_MS } from '../GrowthMetrics.js'
import type { GrowthContext, GrowthProfessionalContext } from '../index.js'
import type { DemandProjection } from '../demand/DemandProjection.js'
import type { TerritoryProjection } from '../territory/TerritoryProjection.js'
import type { CoverageProjection } from '../coverage/CoverageProjection.js'
import type { CapacityProjection } from '../capacity/CapacityProjection.js'
import type { GrowthScoreProjection } from '../scoring/GrowthScoreProjection.js'
import { buildRecommendations, createRecommendationEngine } from './RecommendationEngine.js'

function createContext(overrides: Partial<GrowthContext> = {}): GrowthContext {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    now: overrides.now ?? '2026-07-31T23:59:59.999Z',
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: overrides.cases,
    professionals: overrides.professionals,
    entityProfile: overrides.entityProfile,
  }
}

function basePeriod() {
  return {
    label: '2026-07',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T23:59:59.999Z',
    granularity: 'month' as const,
  }
}

function createProfessionals(items: GrowthProfessionalContext[]): GrowthProfessionalContext[] {
  return items
}

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

function createDemand(items: DemandProjection['items']): DemandProjection {
  return { items }
}

function baseDemandItem(overrides: Partial<DemandProjection['items'][number]> = {}): DemandProjection['items'][number] {
  return {
    id: overrides.id ?? 'd1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    origin: overrides.origin ?? 'public_triage',
    casesCount: overrides.casesCount ?? 4,
    leadsCount: overrides.leadsCount ?? 4,
    conversionRate: overrides.conversionRate ?? 0.5,
    backlogCount: overrides.backlogCount ?? 2,
    averageResolutionHours: overrides.averageResolutionHours ?? 24,
    slaRiskScore: overrides.slaRiskScore ?? 20,
    score: overrides.score ?? 80,
    trend: overrides.trend ?? 'up',
    evidenceIds: overrides.evidenceIds ?? ['demand-e1'],
  }
}

function baseTerritory(overrides: Partial<TerritoryProjection> = {}): TerritoryProjection {
  return {
    id: overrides.id ?? 't1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    city: overrides.city ?? 'Belo Horizonte',
    demandScore: overrides.demandScore ?? 80,
    coverageScore: overrides.coverageScore ?? 60,
    competitionScore: overrides.competitionScore ?? 0,
    growthScore: overrides.growthScore ?? 70,
    coverageStatus: overrides.coverageStatus ?? 'covered',
    trend: overrides.trend ?? 'up',
    recommendation: overrides.recommendation ?? 'fortalecer_presenca',
    evidenceIds: overrides.evidenceIds ?? ['territory-e1'],
  }
}

function baseCoverage(overrides: Partial<CoverageProjection> = {}): CoverageProjection {
  return {
    id: overrides.id ?? 'c1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    status: overrides.status ?? 'covered',
    professionalsCount: overrides.professionalsCount ?? 2,
    activeProfessionalsCount: overrides.activeProfessionalsCount ?? 2,
    compatibleProfessionalsCount: overrides.compatibleProfessionalsCount ?? 2,
    capacityStatus: overrides.capacityStatus ?? 'balanced',
    capacityScore: overrides.capacityScore ?? 50,
    gapType: overrides.gapType ?? 'none',
    evidenceIds: overrides.evidenceIds ?? ['coverage-e1'],
  }
}

function baseCapacity(overrides: Partial<CapacityProjection> = {}): CapacityProjection {
  return {
    id: overrides.id ?? 'p1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    professionalId: overrides.professionalId ?? 'professional-1',
    workloadCount: overrides.workloadCount ?? 3,
    backlogCount: overrides.backlogCount ?? 3,
    openCasesCount: overrides.openCasesCount ?? 3,
    closedCasesCount: overrides.closedCasesCount ?? 1,
    averageResolutionHours: overrides.averageResolutionHours ?? 12,
    capacityScore: overrides.capacityScore ?? 70,
    capacityStatus: overrides.capacityStatus ?? 'balanced',
    recommendation: overrides.recommendation ?? 'manter',
    evidenceIds: overrides.evidenceIds ?? ['capacity-e1'],
  }
}

function baseScore(overrides: Partial<GrowthScoreProjection> = {}): GrowthScoreProjection {
  return {
    id: overrides.id ?? 's1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    value: overrides.value ?? 85,
    demandScore: overrides.demandScore ?? 80,
    coverageScore: overrides.coverageScore ?? 100,
    capacityScore: overrides.capacityScore ?? 70,
    slaScore: overrides.slaScore ?? 80,
    trendScore: overrides.trendScore ?? 100,
    priority: overrides.priority ?? 'critical',
    confidence: overrides.confidence ?? 'high',
    evidenceIds: overrides.evidenceIds ?? ['score-e1'],
  }
}

function buildInput(overrides: Partial<Parameters<typeof buildRecommendations>[0]> = {}) {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    scores: overrides.scores ?? [baseScore()],
    demand: overrides.demand ?? createDemand([baseDemandItem()]),
    territories: overrides.territories ?? [baseTerritory()],
    coverage: overrides.coverage ?? [baseCoverage()],
    capacity: overrides.capacity ?? [baseCapacity()],
    entityProfile: overrides.entityProfile,
  }
}

test('recommendation engine emits expand_specialty for high score with healthy coverage and capacity', () => {
  const result = buildRecommendations(buildInput())
  const recommendation = result.projections[0]

  assert.ok(recommendation)
  assert.equal(recommendation.type, 'expand_specialty')
  assert.equal(recommendation.priority, 'critical')
  assert.equal(recommendation.specialty, 'Direito Civil')
})

test('recommendation engine emits improve_coverage when coverage is partial or uncovered with high score', () => {
  const result = buildRecommendations(buildInput({
    scores: [baseScore({ value: 70, priority: 'high' })],
    coverage: [baseCoverage({ status: 'partial' })],
    capacity: [baseCapacity({ capacityStatus: 'unknown', capacityScore: 25, recommendation: 'sem_dados_suficientes' })],
  }))

  assert.equal(result.projections[0]?.type, 'improve_coverage')
})

test('recommendation engine emits rebalance_capacity when capacity is constrained or overloaded', () => {
  const result = buildRecommendations(buildInput({
    scores: [baseScore({ value: 55, priority: 'medium' })],
    coverage: [baseCoverage({ status: 'covered' })],
    capacity: [baseCapacity({ capacityStatus: 'overloaded', capacityScore: 10, recommendation: 'contratar' })],
  }))

  assert.equal(result.projections[0]?.type, 'rebalance_capacity')
})

test('recommendation engine emits improve_conversion when conversion is below threshold', () => {
  const result = buildRecommendations(buildInput({
    scores: [baseScore({ value: 55, priority: 'medium' })],
    demand: createDemand([baseDemandItem({ conversionRate: 0.3, leadsCount: 4 })]),
    coverage: [baseCoverage({ status: 'covered' })],
    capacity: [baseCapacity({ capacityStatus: 'balanced', capacityScore: 70 })],
  }))

  assert.equal(result.projections[0]?.type, 'improve_conversion')
})

test('recommendation engine emits monitor for medium or low signals without stronger rule', () => {
  const result = buildRecommendations(buildInput({
    scores: [baseScore({ value: 35, priority: 'low' })],
    demand: createDemand([baseDemandItem({ conversionRate: 0.6, leadsCount: 2 })]),
    coverage: [baseCoverage({ status: 'covered' })],
    capacity: [baseCapacity({ capacityStatus: 'unknown', capacityScore: 25, recommendation: 'sem_dados_suficientes' })],
  }))

  assert.equal(result.projections[0]?.type, 'monitor')
})

test('recommendation engine generates auditable evidence', () => {
  const result = buildRecommendations(buildInput())
  const recommendation = result.projections[0]

  assert.ok(recommendation)
  assert.equal(recommendation.evidenceIds.includes('score-e1'), true)
  assert.equal(result.evidence.length, 1)
  assert.equal(result.evidence[0]?.source, 'legal_growth')
})

test('growth pipeline includes recommendations after scores', () => {
  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext({
    cases: [
      {
        id: 'case-1',
        tenantId: 11,
        entityId: 'office-1',
        title: 'Case',
        status: 'open',
        priority: 'normal',
        practiceArea: 'Direito Civil',
        source: 'public_triage',
        openedAt: '2026-07-05T08:00:00.000Z',
        clientCanonicalCity: 'Belo Horizonte',
        leadProfessionalId: 'professional-1',
        centelhaContext: {},
        metadata: {},
        createdAt: '2026-07-05T08:00:00.000Z',
        updatedAt: '2026-07-05T09:00:00.000Z',
      },
    ],
    professionals: createProfessionals([
      { id: 'professional-1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  assert.equal(snapshot.scores.length, 1)
  assert.equal(snapshot.recommendations.length, 1)
  assert.equal(snapshot.metadata.evidence.length >= 11, true)
})

test('without scores recommendations remain empty', () => {
  const result = buildRecommendations(buildInput({
    scores: [],
  }))

  assert.deepEqual(result.projections, [])
  assert.deepEqual(result.evidence, [])
})

test('recommendation engine does not import modules growth or market-signals', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/recommendations/RecommendationEngine.ts')
  const contents = await readFile(filePath, 'utf-8')

  assert.equal(contents.includes('modules/growth'), false)
  assert.equal(contents.includes('market-signals'), false)
})

test('recommendation engine records timing metrics when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createRecommendationEngine(observability)

  engine.build(buildInput())

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, RECOMMENDATION_BUILD_MS), 1)
})
