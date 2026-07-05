import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { COVERAGE_PROJECTION_MS } from '../GrowthMetrics.js'
import type { GrowthContext, GrowthProfessionalContext } from '../index.js'
import type { DemandProjection } from '../demand/DemandProjection.js'
import type { TerritoryProjection } from '../territory/TerritoryProjection.js'
import { buildCoverageProjections, createCoverageEngine } from './CoverageEngine.js'

function createDemandProjection(items: DemandProjection['items']): DemandProjection {
  return { items }
}

function createTerritories(items: TerritoryProjection[]): TerritoryProjection[] {
  return items
}

function createProfessionals(items: GrowthProfessionalContext[]): GrowthProfessionalContext[] {
  return items
}

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

function baseDemandItem(overrides: Partial<DemandProjection['items'][number]> = {}): DemandProjection['items'][number] {
  return {
    id: overrides.id ?? 'd1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    origin: overrides.origin ?? 'public_triage',
    casesCount: overrides.casesCount ?? 2,
    leadsCount: overrides.leadsCount ?? 2,
    conversionRate: overrides.conversionRate ?? 1,
    backlogCount: overrides.backlogCount ?? 1,
    averageResolutionHours: overrides.averageResolutionHours ?? null,
    slaRiskScore: overrides.slaRiskScore ?? 50,
    score: overrides.score ?? 2,
    trend: overrides.trend ?? 'up',
    evidenceIds: overrides.evidenceIds ?? ['e1'],
  }
}

function baseTerritory(overrides: Partial<TerritoryProjection> = {}): TerritoryProjection {
  return {
    id: overrides.id ?? 't1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    city: overrides.city ?? 'Belo Horizonte',
    demandScore: overrides.demandScore ?? 40,
    coverageScore: overrides.coverageScore ?? 50,
    competitionScore: overrides.competitionScore ?? 0,
    growthScore: overrides.growthScore ?? 45,
    coverageStatus: overrides.coverageStatus ?? 'unknown',
    trend: overrides.trend ?? 'up',
    recommendation: overrides.recommendation ?? 'monitorar_demanda',
    evidenceIds: overrides.evidenceIds ?? ['te1'],
  }
}

test('coverage engine generates coverage by city and specialty from demand', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  })

  assert.equal(result.projections.length, 1)
  assert.equal(result.projections[0]?.city, 'Belo Horizonte')
  assert.equal(result.projections[0]?.specialty, 'Direito Civil')
})

test('coverage engine returns covered when active professional matches city and specialty', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  })

  assert.equal(result.projections[0]?.status, 'covered')
})

test('coverage engine returns partial when city matches but specialty does not', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Trabalhista'], status: 'active' },
    ]),
  })

  assert.equal(result.projections[0]?.status, 'partial')
  assert.equal(result.projections[0]?.gapType, 'specialty_uncovered')
})

test('coverage engine returns partial when specialty matches but city does not', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Contagem', specialties: ['Direito Civil'], status: 'active' },
    ]),
  })

  assert.equal(result.projections[0]?.status, 'partial')
  assert.equal(result.projections[0]?.gapType, 'city_uncovered')
})

test('coverage engine returns uncovered when there are professionals but none are compatible', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Contagem', specialties: ['Direito Trabalhista'], status: 'active' },
    ]),
  })

  assert.equal(result.projections[0]?.status, 'uncovered')
})

test('coverage engine returns unknown when there are no professionals', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: [],
  })

  assert.equal(result.projections[0]?.status, 'unknown')
  assert.equal(result.projections[0]?.capacityStatus, 'unknown')
  assert.equal(result.projections[0]?.gapType, 'unknown')
})

test('coverage engine calculates capacityScore and capacityStatus', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
      { id: 'p2', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  })

  assert.equal(result.projections[0]?.capacityStatus, 'balanced')
  assert.equal(result.projections[0]?.capacityScore, 50)
})

test('coverage engine generates evidence ids and auditable evidence', () => {
  const result = buildCoverageProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  })

  assert.equal(result.projections[0]?.evidenceIds.length, 2)
  assert.equal(result.evidence.length, 2)
})

test('pipeline includes coverage after territories', () => {
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
        openedAt: '2026-07-10T08:00:00.000Z',
        leadProfessionalId: 'p1',
        clientCanonicalCity: 'Belo Horizonte',
        centelhaContext: {},
        metadata: {},
        createdAt: '2026-07-10T08:00:00.000Z',
        updatedAt: '2026-07-10T09:00:00.000Z',
      },
    ],
    professionals: [
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ],
  }))

  assert.equal(snapshot.territories.length > 0, true)
  assert.equal(snapshot.coverage.length > 0, true)
})

test('without demand coverage remains empty', () => {
  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext({
    cases: [],
    professionals: [
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ],
  }))

  assert.deepEqual(snapshot.coverage, [])
})

test('coverage engine does not import modules growth or market-signals', async () => {
  const contents = await readFile(
    path.resolve('src/modules/legalGrowth/coverage/CoverageEngine.ts'),
    'utf-8',
  )

  assert.equal(contents.includes('modules/growth'), false)
  assert.equal(contents.includes('market-signals'), false)
})

test('coverage engine records timing metrics when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createCoverageEngine(observability)

  engine.build({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([baseDemandItem()]),
    territories: createTerritories([baseTerritory()]),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, COVERAGE_PROJECTION_MS), 1)
})
