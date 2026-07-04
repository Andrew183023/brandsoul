import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import type { OperationalSnapshot } from './OperationalSnapshot.js'
import type { RegionalProjection } from './RegionalIntelligence.js'
import type { SpecialtyProjection } from './SpecialtyIntelligence.js'
import type { ProfessionalWorkloadProjection } from './WorkloadEngine.js'
import { buildOperationalOpportunities, createOpportunityEngineBuilder } from './OpportunityEngineBuilder.js'
import {
  createOpportunityEngineMetrics,
  OPPORTUNITY_PROJECTION_BUILD_MS,
  OPPORTUNITY_PROJECTION_FAILED_TOTAL,
  OPPORTUNITY_PROJECTION_TOTAL,
} from './OpportunityEngineMetrics.js'
import { createOpportunityEngineRepository } from './OpportunityEngineRepository.js'

function createSnapshot(overrides: Partial<OperationalSnapshot> = {}): OperationalSnapshot {
  return {
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-04T17:00:00.000Z',
    openCases: 0,
    closedCases: 0,
    backlog: 0,
    activeProfessionals: 0,
    averageResolutionHours: null,
    averageFirstResponseMinutes: null,
    slaWarningCases: 0,
    slaBreachedCases: 0,
    casesPerProfessional: {},
    casesPerPracticeArea: {},
    casesPerCity: {},
    ...overrides,
  }
}

function createRegional(overrides: Partial<RegionalProjection>): RegionalProjection {
  return {
    tenantId: 11,
    entityId: 'office-1',
    city: 'Belo Horizonte',
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
    backlog: 0,
    activeProfessionals: 0,
    averageResolutionHours: null,
    averageFirstResponseMinutes: null,
    slaWarningCases: 0,
    slaBreachedCases: 0,
    practiceAreas: {},
    generatedAt: '2026-07-04T17:00:00.000Z',
    ...overrides,
  }
}

function createSpecialty(overrides: Partial<SpecialtyProjection>): SpecialtyProjection {
  return {
    tenantId: 11,
    entityId: 'office-1',
    practiceArea: 'family_law',
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
    backlog: 0,
    activeProfessionals: 0,
    averageResolutionHours: null,
    averageFirstResponseMinutes: null,
    slaWarningCases: 0,
    slaBreachedCases: 0,
    cities: {},
    generatedAt: '2026-07-04T17:00:00.000Z',
    revenuePotentialPrepared: null,
    ...overrides,
  }
}

function createWorkload(overrides: Partial<ProfessionalWorkloadProjection>): ProfessionalWorkloadProjection {
  return {
    tenantId: 11,
    entityId: 'office-1',
    professionalId: 'prof-1',
    activeCases: 0,
    totalCases: 0,
    closedCases: 0,
    averageResolutionHours: null,
    averageFirstResponseMinutes: null,
    averageSlaRiskScore: null,
    criticalCases: 0,
    delayedCases: 0,
    waitingResponseCases: 0,
    slaWarningCases: 0,
    slaBreachedCases: 0,
    practiceAreas: {},
    cities: {},
    workloadLevel: 'idle',
    generatedAt: '2026-07-04T17:00:00.000Z',
    ...overrides,
  }
}

test('opportunity engine generates every opportunity type deterministically', () => {
  const builder = createOpportunityEngineBuilder()
  const input = {
    snapshot: createSnapshot({ backlog: 30 }),
    regional: [
      createRegional({ city: 'Belo Horizonte', backlog: 12, totalCases: 25, openCases: 12, activeProfessionals: 2 }),
      createRegional({ city: 'Betim', backlog: 5, totalCases: 5, openCases: 5, activeProfessionals: 0 }),
    ],
    specialties: [
      createSpecialty({ practiceArea: 'labor_law', backlog: 9, openCases: 9 }),
    ],
    workloads: [
      createWorkload({ professionalId: 'prof-1', activeCases: 20, workloadLevel: 'overloaded', averageSlaRiskScore: 80, delayedCases: 3, slaBreachedCases: 2 }),
      createWorkload({ professionalId: 'prof-2', activeCases: 1, workloadLevel: 'normal' }),
    ],
  }

  const first = builder.build(input)
  const second = builder.build(input)

  assert.deepEqual(first, second)
  assert.deepEqual(
    first.map((opportunity) => opportunity.type),
    [
      'CAPACITY_IMBALANCE',
      'CITY_GROWTH',
      'HIGH_BACKLOG',
      'HIGH_DEMAND',
      'HIGH_SLA_RISK',
      'LOW_COVERAGE',
      'PROFESSIONAL_OVERLOAD',
      'SPECIALTY_GROWTH',
    ],
  )
})

test('opportunity engine validates thresholds', () => {
  assert.throws(
    () => buildOperationalOpportunities({
      snapshot: createSnapshot(),
      regional: [],
      specialties: [],
      workloads: [],
      thresholds: { cityGrowthBacklog: -1 },
    }),
    /Invalid threshold "cityGrowthBacklog"/,
  )
})

test('CITY_GROWTH uses configurable threshold', () => {
  const opportunities = buildOperationalOpportunities({
    snapshot: createSnapshot(),
    regional: [createRegional({ city: 'Contagem', backlog: 6, openCases: 6, activeProfessionals: 1 })],
    specialties: [],
    workloads: [],
    thresholds: { cityGrowthBacklog: 5 },
  })

  assert.equal(opportunities[0]?.type, 'CITY_GROWTH')
  assert.equal(opportunities[0]?.affectedEntity.id, 'Contagem')
})

test('repository prevents duplicate opportunities by id', () => {
  const repository = createOpportunityEngineRepository()
  const [opportunity] = buildOperationalOpportunities({
    snapshot: createSnapshot({ backlog: 30 }),
    regional: [],
    specialties: [],
    workloads: [],
  })

  const first = repository.upsert(opportunity!)
  const second = repository.upsert(opportunity!)

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(repository.list().length, 1)
  assert.deepEqual(repository.get(opportunity!.id), opportunity)
  repository.clear()
  assert.equal(repository.list().length, 0)
})

test('opportunity engine metrics record counters timings and failures', () => {
  const observability = createObservabilityService()
  const metrics = createOpportunityEngineMetrics(observability)

  metrics.recordProjectionBuilt({
    tenantId: 11,
    entityId: 'office-1',
    count: 4,
  })
  metrics.recordProjectionBuildTiming({
    tenantId: 11,
    entityId: 'office-1',
    durationMs: 21,
  })
  metrics.recordProjectionBuildFailed({
    tenantId: 11,
    entityId: 'office-1',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[OPPORTUNITY_PROJECTION_TOTAL], 4)
  assert.equal(snapshot.customCounters[OPPORTUNITY_PROJECTION_FAILED_TOTAL], 1)
  assert.equal(
    snapshot.customTimings[`${OPPORTUNITY_PROJECTION_BUILD_MS}{entity_id=office-1,result=success,source=opportunity_engine,tenant_id=11}`]?.count,
    1,
  )
})

test('opportunity engine has no browser dependency', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const opportunities = buildOperationalOpportunities({
    snapshot: createSnapshot({ backlog: 30 }),
    regional: [],
    specialties: [],
    workloads: [],
  })

  assert.equal(opportunities.length, 1)
})
