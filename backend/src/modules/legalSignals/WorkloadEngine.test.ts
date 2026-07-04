import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { buildOperationalSnapshot } from './OperationalSnapshotBuilder.js'
import {
  buildProfessionalWorkloadProjections,
  createWorkloadEngineBuilder,
} from './WorkloadEngineBuilder.js'
import {
  createWorkloadEngineMetrics,
  WORKLOAD_PROJECTION_BUILD_MS,
  WORKLOAD_PROJECTION_FAILED_TOTAL,
  WORKLOAD_PROJECTION_TOTAL,
} from './WorkloadEngineMetrics.js'
import { createWorkloadEngineRepository } from './WorkloadEngineRepository.js'

function createSnapshot(cases: Parameters<typeof buildOperationalSnapshot>[0]['cases']) {
  return buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-04T16:30:00.000Z',
    cases,
  })
}

test('workload engine returns empty output for empty input', () => {
  const projections = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([]),
    cases: [],
  })

  assert.deepEqual(projections, [])
})

test('workload engine ignores cases without professional', () => {
  const projections = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', practiceArea: 'family_law' },
    ],
  })

  assert.deepEqual(projections, [])
})

test('workload engine builds one professional projection', () => {
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
      assignedProfessionalId: 'prof-1',
      practiceArea: 'family_law',
      city: 'Contagem',
      resolutionHours: 48,
      firstResponseMinutes: 15,
    },
  ]

  const [projection] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot(cases),
    cases,
  })

  assert.equal(projection?.professionalId, 'prof-1')
  assert.equal(projection?.activeCases, 1)
  assert.equal(projection?.totalCases, 2)
  assert.equal(projection?.closedCases, 1)
})

test('workload engine builds multiple professionals deterministically', () => {
  const builder = createWorkloadEngineBuilder()
  const cases = [
    {
      caseId: 'case-1',
      status: 'open' as const,
      assignedProfessionalId: 'prof-2',
      practiceArea: 'labor_law',
      city: 'Contagem',
    },
    {
      caseId: 'case-2',
      status: 'open' as const,
      assignedProfessionalId: 'prof-1',
      practiceArea: 'family_law',
      city: 'Belo Horizonte',
    },
    {
      caseId: 'case-3',
      status: 'resolved' as const,
      assignedProfessionalId: 'prof-1',
      practiceArea: 'family_law',
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
  assert.deepEqual(first.map((projection) => projection.professionalId), ['prof-1', 'prof-2'])
})

test('workload engine calculates active and closed cases', () => {
  const [projection] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1' },
      { caseId: 'case-2', status: 'waiting', assignedProfessionalId: 'prof-1' },
      { caseId: 'case-3', status: 'resolved', assignedProfessionalId: 'prof-1' },
      { caseId: 'case-4', status: 'closed', assignedProfessionalId: 'prof-1' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1' },
      { caseId: 'case-2', status: 'waiting', assignedProfessionalId: 'prof-1' },
      { caseId: 'case-3', status: 'resolved', assignedProfessionalId: 'prof-1' },
      { caseId: 'case-4', status: 'closed', assignedProfessionalId: 'prof-1' },
    ],
  })

  assert.equal(projection?.activeCases, 2)
  assert.equal(projection?.closedCases, 2)
  assert.equal(projection?.totalCases, 4)
})

test('workload engine aggregates SLA data and average SLA risk score', () => {
  const [projection] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1', slaStatus: 'ok' },
      { caseId: 'case-2', status: 'in_progress', assignedProfessionalId: 'prof-1', slaStatus: 'warning' },
      { caseId: 'case-3', status: 'waiting', assignedProfessionalId: 'prof-1', slaStatus: 'breach' },
      { caseId: 'case-4', status: 'closed', assignedProfessionalId: 'prof-1', slaStatus: 'breach' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1', slaStatus: 'ok' },
      { caseId: 'case-2', status: 'in_progress', assignedProfessionalId: 'prof-1', slaStatus: 'warning' },
      { caseId: 'case-3', status: 'waiting', assignedProfessionalId: 'prof-1', slaStatus: 'breach' },
      { caseId: 'case-4', status: 'closed', assignedProfessionalId: 'prof-1', slaStatus: 'breach' },
    ],
  })

  assert.equal(projection?.slaWarningCases, 1)
  assert.equal(projection?.slaBreachedCases, 1)
  assert.equal(projection?.delayedCases, 1)
  assert.equal(projection?.averageSlaRiskScore, 50)
})

test('workload engine computes average resolution and first response', () => {
  const [projection] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'closed', assignedProfessionalId: 'prof-1', resolutionHours: 48, firstResponseMinutes: 30 },
      { caseId: 'case-2', status: 'resolved', assignedProfessionalId: 'prof-1', resolutionHours: 24, firstResponseMinutes: 10 },
      { caseId: 'case-3', status: 'open', assignedProfessionalId: 'prof-1', firstResponseMinutes: 20 },
    ]),
    cases: [
      { caseId: 'case-1', status: 'closed', assignedProfessionalId: 'prof-1', resolutionHours: 48, firstResponseMinutes: 30 },
      { caseId: 'case-2', status: 'resolved', assignedProfessionalId: 'prof-1', resolutionHours: 24, firstResponseMinutes: 10 },
      { caseId: 'case-3', status: 'open', assignedProfessionalId: 'prof-1', firstResponseMinutes: 20 },
    ],
  })

  assert.equal(projection?.averageResolutionHours, 36)
  assert.equal(projection?.averageFirstResponseMinutes, 20)
})

test('workload engine counts critical delayed and waiting response cases', () => {
  const [projection] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      {
        caseId: 'case-1',
        status: 'open',
        assignedProfessionalId: 'prof-1',
        priority: 'critical',
      },
      {
        caseId: 'case-2',
        status: 'waiting',
        assignedProfessionalId: 'prof-1',
        waitingFor: 'professional',
        severity: 'critical',
        slaStatus: 'breach',
      },
    ]),
    cases: [
      {
        caseId: 'case-1',
        status: 'open',
        assignedProfessionalId: 'prof-1',
        priority: 'critical',
      },
      {
        caseId: 'case-2',
        status: 'waiting',
        assignedProfessionalId: 'prof-1',
        waitingFor: 'professional',
        severity: 'critical',
        slaStatus: 'breach',
      },
    ],
  })

  assert.equal(projection?.criticalCases, 2)
  assert.equal(projection?.delayedCases, 1)
  assert.equal(projection?.waitingResponseCases, 1)
})

test('workload engine aggregates practice areas and cities from active cases only', () => {
  const [projection] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1', practiceArea: 'family_law', city: 'Belo Horizonte' },
      { caseId: 'case-2', status: 'assigned', assignedProfessionalId: 'prof-1', practiceArea: 'labor_law', city: 'Contagem' },
      { caseId: 'case-3', status: 'closed', assignedProfessionalId: 'prof-1', practiceArea: 'consumer_law', city: 'Betim' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1', practiceArea: 'family_law', city: 'Belo Horizonte' },
      { caseId: 'case-2', status: 'assigned', assignedProfessionalId: 'prof-1', practiceArea: 'labor_law', city: 'Contagem' },
      { caseId: 'case-3', status: 'closed', assignedProfessionalId: 'prof-1', practiceArea: 'consumer_law', city: 'Betim' },
    ],
  })

  assert.deepEqual(projection?.practiceAreas, {
    family_law: 1,
    labor_law: 1,
  })
  assert.deepEqual(projection?.cities, {
    'Belo Horizonte': 1,
    Contagem: 1,
  })
})

test('workload engine applies workloadLevel thresholds', () => {
  const baseCases = Array.from({ length: 19 }, (_, index) => ({
    caseId: `case-${index + 1}`,
    status: 'open' as const,
    assignedProfessionalId: 'prof-1',
  }))

  const [overloaded] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot(baseCases),
    cases: baseCases,
  })
  assert.equal(overloaded?.workloadLevel, 'overloaded')

  const [high] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot(baseCases.slice(0, 10)),
    cases: baseCases.slice(0, 10),
  })
  assert.equal(high?.workloadLevel, 'high')

  const [normal] = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot(baseCases.slice(0, 1)),
    cases: baseCases.slice(0, 1),
  })
  assert.equal(normal?.workloadLevel, 'normal')

  const idle = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([]),
    cases: [],
  })
  assert.deepEqual(idle, [])
})

test('workload engine repository supports upsert get list and clear', () => {
  const repository = createWorkloadEngineRepository()
  const projections = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1' },
    ],
  })

  repository.upsertMany(projections)
  repository.upsert({
    ...projections[0]!,
    totalCases: 2,
  })

  assert.equal(repository.list().length, 1)
  assert.equal(repository.get(11, 'office-1', 'prof-1')?.totalCases, 2)
  repository.clear()
  assert.equal(repository.list().length, 0)
})

test('workload engine metrics record counters timings and failures', () => {
  const observability = createObservabilityService()
  const metrics = createWorkloadEngineMetrics(observability)

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
  assert.equal(snapshot.customCounters[WORKLOAD_PROJECTION_TOTAL], 3)
  assert.equal(snapshot.customCounters[WORKLOAD_PROJECTION_FAILED_TOTAL], 1)
  assert.equal(
    snapshot.customTimings[`${WORKLOAD_PROJECTION_BUILD_MS}{entity_id=office-1,result=success,source=workload_engine,tenant_id=11}`]?.count,
    1,
  )
})

test('workload engine has no browser dependency', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const projections = buildProfessionalWorkloadProjections({
    snapshot: createSnapshot([
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1' },
    ]),
    cases: [
      { caseId: 'case-1', status: 'open', assignedProfessionalId: 'prof-1' },
    ],
  })

  assert.equal(projections.length, 1)
})
