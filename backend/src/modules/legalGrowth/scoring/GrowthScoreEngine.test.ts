import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { GROWTH_SCORE_BUILD_MS } from '../GrowthMetrics.js'
import type { GrowthContext, GrowthProfessionalContext } from '../index.js'
import type { DemandProjection } from '../demand/DemandProjection.js'
import type { TerritoryProjection } from '../territory/TerritoryProjection.js'
import type { CoverageProjection } from '../coverage/CoverageProjection.js'
import type { CapacityProjection } from '../capacity/CapacityProjection.js'
import { buildGrowthScoreProjections, createGrowthScoreEngine } from './GrowthScoreEngine.js'

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

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

function createDemand(items: DemandProjection['items']): DemandProjection {
  return { items }
}

function createProfessionals(items: GrowthProfessionalContext[]): GrowthProfessionalContext[] {
  return items
}

function basePeriod() {
  return {
    label: '2026-07',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T23:59:59.999Z',
    granularity: 'month' as const,
  }
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
    casesCount: overrides.casesCount ?? 2,
    leadsCount: overrides.leadsCount ?? 2,
    conversionRate: overrides.conversionRate ?? 1,
    backlogCount: overrides.backlogCount ?? 1,
    averageResolutionHours: overrides.averageResolutionHours ?? 24,
    slaRiskScore: overrides.slaRiskScore ?? 20,
    score: overrides.score ?? 40,
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
    coverageStatus: overrides.coverageStatus ?? 'partial',
    trend: overrides.trend ?? 'up',
    recommendation: overrides.recommendation ?? 'expandir_cobertura',
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

function buildInput(overrides: Partial<Parameters<typeof buildGrowthScoreProjections>[0]> = {}) {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    demand: overrides.demand ?? createDemand([baseDemandItem()]),
    territories: overrides.territories ?? [baseTerritory()],
    coverage: overrides.coverage ?? [baseCoverage()],
    capacity: overrides.capacity ?? [baseCapacity()],
    entityProfile: overrides.entityProfile,
  }
}

test('growth score engine calculates deterministic score by city and specialty', () => {
  const result = buildGrowthScoreProjections(buildInput())
  const projection = result.projections[0]

  assert.ok(projection)
  assert.equal(projection.city, 'Belo Horizonte')
  assert.equal(projection.specialty, 'Direito Civil')
  assert.equal(projection.demandScore, 80)
  assert.equal(projection.coverageScore, 100)
  assert.equal(projection.capacityScore, 70)
  assert.equal(projection.slaScore, 80)
  assert.equal(projection.trendScore, 100)
  assert.equal(projection.value, 85)
})

test('growth score engine uses demand territory coverage and capacity together', () => {
  const result = buildGrowthScoreProjections(buildInput({
    demand: createDemand([baseDemandItem({ casesCount: 1, slaRiskScore: 40, trend: 'stable' })]),
    territories: [baseTerritory({ demandScore: 20 })],
    coverage: [baseCoverage({ status: 'partial' })],
    capacity: [baseCapacity({ capacityScore: 40 })],
  }))

  const projection = result.projections[0]
  assert.ok(projection)
  assert.equal(projection.demandScore, 20)
  assert.equal(projection.coverageScore, 60)
  assert.equal(projection.capacityScore, 40)
  assert.equal(projection.slaScore, 60)
  assert.equal(projection.trendScore, 60)
  assert.equal(projection.value, 45)
})

test('growth score engine applies priority thresholds correctly', () => {
  const critical = buildGrowthScoreProjections(buildInput()).projections[0]
  const high = buildGrowthScoreProjections(buildInput({
    demand: createDemand([baseDemandItem({ casesCount: 2, slaRiskScore: 40, trend: 'stable' })]),
    territories: [baseTerritory({ demandScore: 70 })],
    coverage: [baseCoverage({ status: 'covered' })],
    capacity: [baseCapacity({ capacityScore: 40 })],
  })).projections[0]
  const medium = buildGrowthScoreProjections(buildInput({
    demand: createDemand([baseDemandItem({ casesCount: 1, slaRiskScore: 40, trend: 'stable' })]),
    territories: [baseTerritory({ demandScore: 20 })],
    coverage: [baseCoverage({ status: 'partial' })],
    capacity: [baseCapacity({ capacityScore: 40 })],
  })).projections[0]
  const low = buildGrowthScoreProjections(buildInput({
    demand: createDemand([baseDemandItem({ casesCount: 1, slaRiskScore: 90, trend: 'down' })]),
    territories: [baseTerritory({ demandScore: 20 })],
    coverage: [baseCoverage({ status: 'uncovered' })],
    capacity: [baseCapacity({ capacityScore: 10 })],
  })).projections[0]

  assert.equal(critical?.priority, 'critical')
  assert.equal(high?.priority, 'high')
  assert.equal(medium?.priority, 'medium')
  assert.equal(low?.priority, 'low')
})

test('growth score engine applies fallback when coverage and capacity are absent', () => {
  const result = buildGrowthScoreProjections(buildInput({
    coverage: [],
    capacity: [],
  }))

  const projection = result.projections[0]
  assert.ok(projection)
  assert.equal(projection.coverageScore, 40)
  assert.equal(projection.capacityScore, 40)
  assert.equal(projection.confidence, 'medium')
})

test('growth score engine generates auditable evidence', () => {
  const result = buildGrowthScoreProjections(buildInput())
  const projection = result.projections[0]

  assert.ok(projection)
  assert.equal(projection.evidenceIds.includes('demand-e1'), true)
  assert.equal(result.evidence.length, 2)
  assert.equal(result.evidence[0]?.type, 'derived_metric')
  assert.equal(result.evidence[0]?.source, 'legal_growth')
})

test('growth pipeline includes scores after capacity', () => {
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
  assert.equal(snapshot.capacity.length, 1)
  assert.equal(snapshot.metadata.evidence.length >= 10, true)
})

test('without demand scores remain empty', () => {
  const result = buildGrowthScoreProjections(buildInput({
    demand: createDemand([]),
  }))

  assert.deepEqual(result.projections, [])
  assert.deepEqual(result.evidence, [])
})

test('growth score engine does not import modules growth or market-signals', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/scoring/GrowthScoreEngine.ts')
  const contents = await readFile(filePath, 'utf-8')

  assert.equal(contents.includes('modules/growth'), false)
  assert.equal(contents.includes('market-signals'), false)
})

test('growth score engine records timing metrics when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createGrowthScoreEngine(observability)

  engine.build(buildInput())

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, GROWTH_SCORE_BUILD_MS), 1)
})
