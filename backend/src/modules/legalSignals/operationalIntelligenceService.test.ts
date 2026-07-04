import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import type { CaseRecord } from '../legalCases/caseTypes.js'
import { createOperationalIntelligenceService } from './operationalIntelligenceService.js'

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

function hasCounterSeries(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customCounterSeries)
    .some(([key, value]) => (key === metric || key.startsWith(`${metric}{`)) && value === 1)
}

function createCaseRecord(overrides: Partial<CaseRecord>): CaseRecord {
  return {
    id: overrides.id ?? 'case-1',
    tenantId: overrides.tenantId ?? 11,
    entityId: overrides.entityId ?? 'office-1',
    title: overrides.title ?? 'Case',
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 'normal',
    practiceArea: overrides.practiceArea,
    source: overrides.source,
    openedAt: overrides.openedAt ?? '2026-07-01T08:00:00.000Z',
    closedAt: overrides.closedAt,
    archivedAt: overrides.archivedAt,
    resolutionReason: overrides.resolutionReason,
    leadProfessionalId: overrides.leadProfessionalId,
    clientDisplayName: overrides.clientDisplayName,
    clientCanonicalName: overrides.clientCanonicalName,
    clientDisplayPhone: overrides.clientDisplayPhone,
    clientCanonicalPhone: overrides.clientCanonicalPhone,
    clientDisplayWhatsapp: overrides.clientDisplayWhatsapp,
    clientCanonicalWhatsapp: overrides.clientCanonicalWhatsapp,
    clientDisplayEmail: overrides.clientDisplayEmail,
    clientCanonicalEmail: overrides.clientCanonicalEmail,
    clientDisplayCity: overrides.clientDisplayCity,
    clientCanonicalCity: overrides.clientCanonicalCity,
    clientSearchKey: overrides.clientSearchKey,
    centelhaContext: overrides.centelhaContext ?? {},
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? '2026-07-01T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-01T09:00:00.000Z',
  }
}

test('operational intelligence service records success metrics for every dashboard stage', () => {
  const observability = createObservabilityService()
  const service = createOperationalIntelligenceService({
    observability,
  })

  const response = service.build({
    tenantId: 11,
    officeId: 'office-1',
    generatedAt: '2026-07-04T12:00:00.000Z',
    cases: [
      createCaseRecord({
        id: 'case-open',
        leadProfessionalId: 'prof-1',
        practiceArea: 'Direito Trabalhista',
        clientCanonicalCity: 'Belo Horizonte',
      }),
      createCaseRecord({
        id: 'case-closed',
        status: 'closed',
        priority: 'high',
        leadProfessionalId: 'prof-2',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Contagem',
        closedAt: '2026-07-02T08:00:00.000Z',
      }),
    ],
  })

  assert.equal(response.status, 'ready')
  const snapshot = observability.getMetricsSnapshot()

  assert.equal(snapshot.customCounters.operational_intelligence_dashboard_build_total, 1)
  assert.equal(snapshot.customCounters.snapshot_build_total, 1)
  assert.equal(snapshot.customCounters.regional_projection_total, 2)
  assert.equal(snapshot.customCounters.specialty_projection_total, 2)
  assert.equal(snapshot.customCounters.workload_projection_total, 2)
  assert.equal(snapshot.customCounters.signals_build_total, 0)
  assert.equal(snapshot.customCounters.operational_timeline_entries_total, 0)

  assert.equal(timingCount(snapshot, 'operational_intelligence_dashboard_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'snapshot_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'regional_projection_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'specialty_projection_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'workload_projection_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'opportunity_projection_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'signals_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'operational_timeline_build_ms'), 1)

  const seriesKeys = [
    ...Object.keys(snapshot.customCounterSeries),
    ...Object.keys(snapshot.customTimings),
  ]
  for (const key of seriesKeys) {
    assert.equal(key.includes('caseid='), false)
    assert.equal(key.includes('requestid='), false)
    assert.equal(key.includes('token='), false)
    assert.equal(key.includes('email='), false)
    assert.equal(key.includes('phone='), false)
    assert.equal(key.includes('telefone='), false)
    assert.equal(key.includes('clientname='), false)
    assert.equal(key.includes('document='), false)
    assert.equal(key.includes('address='), false)
    assert.equal(key.includes('endereco='), false)
  }
})

test('operational intelligence service records failure metrics when orchestration fails', () => {
  const observability = createObservabilityService()
  const service = createOperationalIntelligenceService({
    observability,
    buildSignals() {
      throw new Error('synthetic_failure')
    },
  })

  assert.throws(() => service.build({
    tenantId: 11,
    officeId: 'office-1',
    generatedAt: '2026-07-04T12:00:00.000Z',
    cases: [createCaseRecord({ id: 'case-open' })],
  }))

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.operational_intelligence_dashboard_build_failed_total, 1)
  assert.equal(hasCounterSeries(snapshot, 'signals_build_failed_total'), true)
  assert.equal(snapshot.customCounters.snapshot_build_failed_total ?? 0, 0)
  assert.equal(snapshot.customCounters.regional_projection_failed_total ?? 0, 0)
  assert.equal(snapshot.customCounters.specialty_projection_failed_total ?? 0, 0)
  assert.equal(snapshot.customCounters.workload_projection_failed_total ?? 0, 0)
  assert.equal(snapshot.customCounters.opportunity_projection_failed_total ?? 0, 0)
  assert.equal(snapshot.customCounters.operational_timeline_failed_total ?? 0, 0)
  assert.equal(timingCount(snapshot, 'signals_build_ms'), 1)
  assert.equal(timingCount(snapshot, 'operational_intelligence_dashboard_build_ms'), 1)
})
