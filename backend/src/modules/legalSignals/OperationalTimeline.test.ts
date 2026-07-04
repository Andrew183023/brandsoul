import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { buildOperationalTimeline, createOperationalTimelineBuilder } from './OperationalTimelineBuilder.js'
import { createOperationalTimelineInterpreter } from './OperationalTimelineInterpreter.js'
import {
  createOperationalTimelineMetrics,
  OPERATIONAL_TIMELINE_BUILD_MS,
  OPERATIONAL_TIMELINE_ENTRIES_TOTAL,
  OPERATIONAL_TIMELINE_FAILED_TOTAL,
} from './OperationalTimelineMetrics.js'
import type { LegalOperationalSignal } from './signalTypes.js'

function createSignal(overrides: Partial<LegalOperationalSignal> & Pick<LegalOperationalSignal, 'signalType'>): LegalOperationalSignal {
  return {
    tenantId: 11,
    entityId: 'office-1',
    caseId: 'case-1',
    source: 'CASE_CREATED',
    occurredAt: '2026-07-03T10:00:00.000Z',
    severity: 'info',
    payload: {},
    ...overrides,
  }
}

test('operational timeline interpreter translates supported operational signals into human-readable entries', () => {
  const interpreter = createOperationalTimelineInterpreter()
  const cases: Array<{
    signal: LegalOperationalSignal
    title: string
    descriptionIncludes: string
  }> = [
    {
      signal: createSignal({
        signalType: 'NEW_DEMAND',
        payload: { practiceArea: 'family_law' },
      }),
      title: 'Nova demanda operacional registrada',
      descriptionIncludes: 'family_law',
    },
    {
      signal: createSignal({
        signalType: 'CASE_ASSIGNED',
        source: 'CASE_ASSIGNED',
        payload: { assignmentMode: 'auto' },
      }),
      title: 'Caso atribuído',
      descriptionIncludes: 'auto',
    },
    {
      signal: createSignal({
        signalType: 'CASE_REASSIGNED',
        source: 'CASE_REASSIGNED',
        severity: 'warning',
        payload: { reassignmentReason: 'capacity' },
      }),
      title: 'Caso reatribuído',
      descriptionIncludes: 'capacity',
    },
    {
      signal: createSignal({
        signalType: 'CASE_CLOSED',
        source: 'CASE_CLOSED',
        payload: { closureReason: 'resolved' },
      }),
      title: 'Caso encerrado',
      descriptionIncludes: 'resolved',
    },
    {
      signal: createSignal({
        signalType: 'FIRST_RESPONSE',
        source: 'FIRST_PROFESSIONAL_RESPONSE',
        payload: { responseTimeMinutes: 18, channel: 'portal' },
      }),
      title: 'Primeira resposta profissional registrada',
      descriptionIncludes: '18',
    },
    {
      signal: createSignal({
        signalType: 'WORKLOAD_CHANGED',
        source: 'CASE_ASSIGNED',
        payload: { workloadSize: 7 },
      }),
      title: 'Carga operacional alterada',
      descriptionIncludes: '7',
    },
    {
      signal: createSignal({
        signalType: 'BACKLOG_CHANGED',
        source: 'CASE_CLOSED',
        payload: { backlogSize: 12 },
      }),
      title: 'Backlog operacional alterado',
      descriptionIncludes: '12',
    },
    {
      signal: createSignal({
        signalType: 'SLA_WARNING',
        severity: 'warning',
      }),
      title: 'Alerta de SLA',
      descriptionIncludes: 'atenção operacional',
    },
    {
      signal: createSignal({
        signalType: 'SLA_BREACH',
        severity: 'critical',
      }),
      title: 'Ruptura de SLA',
      descriptionIncludes: 'ultrapassou',
    },
  ]

  for (const current of cases) {
    const entry = interpreter.interpret(current.signal)
    assert.equal(entry.title, current.title, current.signal.signalType)
    assert.equal(entry.signalType, current.signal.signalType, current.signal.signalType)
    assert.equal(entry.eventType, current.signal.source, current.signal.signalType)
    assert.equal(entry.severity, current.signal.severity, current.signal.signalType)
    assert.equal(entry.description.includes(current.descriptionIncludes), true, current.signal.signalType)
  }
})

test('operational timeline builder filters by tenant and entity and sorts entries deterministically', () => {
  const builder = createOperationalTimelineBuilder()
  const input = {
    tenantId: 11,
    entityId: 'office-1',
    signals: [
      createSignal({
        signalType: 'WORKLOAD_CHANGED',
        source: 'CASE_ASSIGNED',
        occurredAt: '2026-07-03T10:02:00.000Z',
      }),
      createSignal({
        signalType: 'CASE_ASSIGNED',
        source: 'CASE_ASSIGNED',
        occurredAt: '2026-07-03T10:02:00.000Z',
      }),
      createSignal({
        signalType: 'NEW_DEMAND',
        occurredAt: '2026-07-03T10:01:00.000Z',
      }),
      createSignal({
        signalType: 'CASE_CLOSED',
        source: 'CASE_CLOSED',
        tenantId: 99,
      }),
      createSignal({
        signalType: 'CASE_CLOSED',
        source: 'CASE_CLOSED',
        entityId: 'office-2',
      }),
    ],
  }

  const first = builder.build(input)
  const second = builder.build(input)

  assert.deepEqual(first, second)
  assert.deepEqual(
    first.map((entry) => entry.signalType),
    ['NEW_DEMAND', 'CASE_ASSIGNED', 'WORKLOAD_CHANGED'],
  )
})

test('operational timeline preserves safe metadata from the underlying signal', () => {
  const [entry] = buildOperationalTimeline({
    tenantId: 11,
    entityId: 'office-1',
    signals: [
      createSignal({
        signalType: 'FIRST_RESPONSE',
        source: 'FIRST_PROFESSIONAL_RESPONSE',
        caseId: 'case-77',
        payload: {
          responseTimeMinutes: 9,
          channel: 'admin',
          workloadSize: 3,
        },
      }),
    ],
  })

  assert.deepEqual(entry?.metadata, {
    tenantId: 11,
    entityId: 'office-1',
    caseId: 'case-77',
    source: 'FIRST_PROFESSIONAL_RESPONSE',
    payload: {
      responseTimeMinutes: 9,
      channel: 'admin',
      workloadSize: 3,
    },
  })
})

test('operational timeline metrics record counters and timings without browser dependency', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const observability = createObservabilityService()
  const metrics = createOperationalTimelineMetrics(observability)

  metrics.recordEntriesBuilt({
    tenantId: 11,
    entityId: 'office-1',
    count: 4,
  })
  metrics.recordBuildTiming({
    tenantId: 11,
    entityId: 'office-1',
    durationMs: 24,
  })
  metrics.recordBuildFailed({
    tenantId: 11,
    entityId: 'office-1',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[OPERATIONAL_TIMELINE_ENTRIES_TOTAL], 4)
  assert.equal(snapshot.customCounters[OPERATIONAL_TIMELINE_FAILED_TOTAL], 1)
  assert.deepEqual(snapshot.customCounterSeries[`${OPERATIONAL_TIMELINE_ENTRIES_TOTAL}{entity_id=office-1,result=success,source=operational_timeline,tenant_id=11}`], 4)
  assert.equal(snapshot.customTimings[`${OPERATIONAL_TIMELINE_BUILD_MS}{entity_id=office-1,result=success,source=operational_timeline,tenant_id=11}`]?.count, 1)
})
