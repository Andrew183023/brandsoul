import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { buildOperationalSnapshot } from './OperationalSnapshotBuilder.js'
import { buildRegionalProjections, createRegionalIntelligenceBuilder } from './RegionalIntelligenceBuilder.js'
import { createRegionalIntelligenceMetrics, REGIONAL_PROJECTION_BUILD_MS, REGIONAL_PROJECTION_FAILED_TOTAL, REGIONAL_PROJECTION_TOTAL } from './RegionalIntelligenceMetrics.js'
import { createRegionalIntelligenceRepository } from './RegionalIntelligenceRepository.js'

function createSnapshot(cases: Parameters<typeof buildOperationalSnapshot>[0]['cases']) {
  return buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-04T10:00:00.000Z',
    cases,
  })
}

test('regional intelligence returns empty output for empty input', () => {
  const projections = buildRegionalProjections({
    snapshot: createSnapshot([]),
    cases: [],
  })

  assert.deepEqual(projections, [])
})

test('regional intelligence builds one city projection', () => {
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
      city: 'Belo Horizonte',
      resolutionHours: 48,
      firstResponseMinutes: 15,
    },
  ]

  const [projection] = buildRegionalProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.equal(projection?.city, 'Belo Horizonte')
  assert.equal(projection?.totalCases, 2)
  assert.equal(projection?.openCases, 1)
  assert.equal(projection?.closedCases, 1)
  assert.equal(projection?.backlog, 1)
  assert.equal(projection?.activeProfessionals, 1)
})

test('regional intelligence builds multiple cities deterministically', () => {
  const builder = createRegionalIntelligenceBuilder()
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      assignedProfessionalId: 'prof-1',
      practiceArea: 'family_law',
      city: 'Contagem',
    },
    {
      caseId: 'case-2',
      status: 'open' as const,
      assignedProfessionalId: 'prof-2',
      practiceArea: 'labor_law',
      city: 'Belo Horizonte',
    },
    {
      caseId: 'case-3',
      status: 'resolved' as const,
      city: 'Belo Horizonte',
      resolutionHours: 36,
    },
  ]
  const input = {
    snapshot: createSnapshot(cases),
    cases,
  }

  const first = builder.build(input)
  const second = builder.build(input)

  assert.deepEqual(first, second)
  assert.deepEqual(first.map((projection) => projection.city), ['Belo Horizonte', 'Contagem'])
})

test('regional intelligence aggregates practice areas only for active backlog', () => {
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
      city: 'Belo Horizonte',
    },
    {
      caseId: 'case-3',
      status: 'closed' as const,
      practiceArea: 'labor_law',
      city: 'Belo Horizonte',
    },
  ]

  const [projection] = buildRegionalProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.deepEqual(projection?.practiceAreas, {
    family_law: 2,
  })
})

test('regional intelligence aggregates SLA and averages per city', () => {
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      city: 'Belo Horizonte',
      assignedProfessionalId: 'prof-1',
      resolutionHours: null,
      firstResponseMinutes: 30,
      slaStatus: 'warning' as const,
    },
    {
      caseId: 'case-2',
      status: 'in_progress' as const,
      city: 'Belo Horizonte',
      assignedProfessionalId: 'prof-2',
      firstResponseMinutes: 15,
      slaStatus: 'breach' as const,
    },
    {
      caseId: 'case-3',
      status: 'resolved' as const,
      city: 'Belo Horizonte',
      resolutionHours: 48,
      firstResponseMinutes: 45,
    },
    {
      caseId: 'case-4',
      status: 'closed' as const,
      city: 'Belo Horizonte',
      resolutionHours: 24,
      firstResponseMinutes: 10,
    },
  ]

  const [projection] = buildRegionalProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.equal(projection?.slaWarningCases, 1)
  assert.equal(projection?.slaBreachedCases, 1)
  assert.equal(projection?.averageResolutionHours, 36)
  assert.equal(projection?.averageFirstResponseMinutes, 25)
})

test('regional intelligence repository upserts by tenant entity and city', () => {
  const repository = createRegionalIntelligenceRepository()
  const projections = buildRegionalProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', city: 'Belo Horizonte' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', city: 'Belo Horizonte' },
    ],
  })

  repository.upsertMany(projections)
  repository.upsert({
    ...projections[0]!,
    totalCases: 2,
  })

  assert.equal(repository.list().length, 1)
  assert.equal(repository.get(11, 'office-1', 'Belo Horizonte')?.totalCases, 2)
})

test('regional intelligence metrics record counters timings and failures', () => {
  const observability = createObservabilityService()
  const metrics = createRegionalIntelligenceMetrics(observability)

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
  assert.equal(snapshot.customCounters[REGIONAL_PROJECTION_TOTAL], 3)
  assert.equal(snapshot.customCounters[REGIONAL_PROJECTION_FAILED_TOTAL], 1)
  assert.equal(
    snapshot.customTimings[`${REGIONAL_PROJECTION_BUILD_MS}{entity_id=office-1,result=success,source=regional_intelligence,tenant_id=11}`]?.count,
    1,
  )
})

test('regional intelligence builder has no browser dependency', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const projections = buildRegionalProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', city: 'Belo Horizonte' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', city: 'Belo Horizonte' },
    ],
  })

  assert.equal(projections.length, 1)
})
