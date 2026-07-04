import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { buildOperationalSnapshot } from './OperationalSnapshotBuilder.js'
import { buildSpecialtyProjections, createSpecialtyIntelligenceBuilder } from './SpecialtyIntelligenceBuilder.js'
import {
  createSpecialtyIntelligenceMetrics,
  SPECIALTY_PROJECTION_BUILD_MS,
  SPECIALTY_PROJECTION_FAILED_TOTAL,
  SPECIALTY_PROJECTION_TOTAL,
} from './SpecialtyIntelligenceMetrics.js'
import { createSpecialtyIntelligenceRepository } from './SpecialtyIntelligenceRepository.js'

function createSnapshot(cases: Parameters<typeof buildOperationalSnapshot>[0]['cases']) {
  return buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-04T16:00:00.000Z',
    cases,
  })
}

test('specialty intelligence returns empty output for empty input', () => {
  const projections = buildSpecialtyProjections({
    snapshot: createSnapshot([]),
    cases: [],
  })

  assert.deepEqual(projections, [])
})

test('specialty intelligence builds one specialty projection', () => {
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      assignedProfessionalId: 'prof-1',
      practiceArea: 'family_law',
      city: 'Belo Horizonte',
      firstResponseMinutes: 30,
      slaStatus: 'warning' as const,
    },
    {
      caseId: 'case-2',
      status: 'closed' as const,
      assignedProfessionalId: 'prof-2',
      practiceArea: 'family_law',
      city: 'Contagem',
      resolutionHours: 48,
      firstResponseMinutes: 15,
    },
  ]

  const [projection] = buildSpecialtyProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.equal(projection?.practiceArea, 'family_law')
  assert.equal(projection?.totalCases, 2)
  assert.equal(projection?.openCases, 1)
  assert.equal(projection?.closedCases, 1)
  assert.equal(projection?.backlog, 1)
  assert.equal(projection?.activeProfessionals, 1)
})

test('specialty intelligence builds multiple specialties deterministically', () => {
  const builder = createSpecialtyIntelligenceBuilder()
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      assignedProfessionalId: 'prof-1',
      practiceArea: 'labor_law',
      city: 'Contagem',
    },
    {
      caseId: 'case-2',
      status: 'open' as const,
      assignedProfessionalId: 'prof-2',
      practiceArea: 'family_law',
      city: 'Belo Horizonte',
    },
    {
      caseId: 'case-3',
      status: 'resolved' as const,
      practiceArea: 'family_law',
      city: 'Belo Horizonte',
      resolutionHours: 36,
    },
    {
      caseId: 'case-4',
      status: 'open' as const,
      city: 'Betim',
    },
  ]
  const input = {
    snapshot: createSnapshot(cases),
    cases,
  }

  const first = builder.build(input)
  const second = builder.build(input)

  assert.deepEqual(first, second)
  assert.deepEqual(first.map((projection) => projection.practiceArea), ['family_law', 'labor_law'])
})

test('specialty intelligence aggregates active cities only', () => {
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      practiceArea: 'family_law',
      city: 'Belo Horizonte',
    },
    {
      caseId: 'case-2',
      status: 'assigned' as const,
      practiceArea: 'family_law',
      city: 'Contagem',
    },
    {
      caseId: 'case-3',
      status: 'closed' as const,
      practiceArea: 'family_law',
      city: 'Betim',
    },
  ]

  const [projection] = buildSpecialtyProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.deepEqual(projection?.cities, {
    'Belo Horizonte': 1,
    Contagem: 1,
  })
})

test('specialty intelligence aggregates SLA averages and active professionals', () => {
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      practiceArea: 'labor_law',
      city: 'Belo Horizonte',
      assignedProfessionalId: 'prof-1',
      firstResponseMinutes: 30,
      slaStatus: 'warning' as const,
    },
    {
      caseId: 'case-2',
      status: 'in_progress' as const,
      practiceArea: 'labor_law',
      city: 'Contagem',
      assignedProfessionalId: 'prof-2',
      firstResponseMinutes: 15,
      slaStatus: 'breach' as const,
    },
    {
      caseId: 'case-3',
      status: 'resolved' as const,
      practiceArea: 'labor_law',
      city: 'Belo Horizonte',
      resolutionHours: 48,
      firstResponseMinutes: 45,
    },
    {
      caseId: 'case-4',
      status: 'closed' as const,
      practiceArea: 'labor_law',
      city: 'Contagem',
      resolutionHours: 24,
      firstResponseMinutes: 10,
    },
  ]

  const [projection] = buildSpecialtyProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.equal(projection?.slaWarningCases, 1)
  assert.equal(projection?.slaBreachedCases, 1)
  assert.equal(projection?.averageResolutionHours, 36)
  assert.equal(projection?.averageFirstResponseMinutes, 25)
  assert.equal(projection?.activeProfessionals, 2)
})

test('specialty intelligence keeps revenuePotentialPrepared as null', () => {
  const [projection] = buildSpecialtyProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ],
  })

  assert.equal(projection?.revenuePotentialPrepared, null)
})

test('specialty intelligence repository upserts by tenant entity and practice area', () => {
  const repository = createSpecialtyIntelligenceRepository()
  const projections = buildSpecialtyProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ],
  })

  repository.upsertMany(projections)
  repository.upsert({
    ...projections[0]!,
    totalCases: 2,
  })

  assert.equal(repository.list().length, 1)
  assert.equal(repository.get(11, 'office-1', 'family_law')?.totalCases, 2)
  repository.clear()
  assert.equal(repository.list().length, 0)
})

test('specialty intelligence metrics record counters timings and failures', () => {
  const observability = createObservabilityService()
  const metrics = createSpecialtyIntelligenceMetrics(observability)

  metrics.recordProjectionBuilt({
    tenantId: 11,
    entityId: 'office-1',
    count: 3,
  })
  metrics.recordProjectionBuildTiming({
    tenantId: 11,
    entityId: 'office-1',
    durationMs: 28,
  })
  metrics.recordProjectionBuildFailed({
    tenantId: 11,
    entityId: 'office-1',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[SPECIALTY_PROJECTION_TOTAL], 3)
  assert.equal(snapshot.customCounters[SPECIALTY_PROJECTION_FAILED_TOTAL], 1)
  assert.equal(
    snapshot.customTimings[`${SPECIALTY_PROJECTION_BUILD_MS}{entity_id=office-1,result=success,source=specialty_intelligence,tenant_id=11}`]?.count,
    1,
  )
})

test('specialty intelligence builder has no browser dependency', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const projections = buildSpecialtyProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ],
  })

  assert.equal(projections.length, 1)
})
