import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from './observabilityService.js'

test('observability records a simple custom counter', () => {
  const observability = createObservabilityService()

  observability.incrementMetric('legal_case_created_total')
  observability.incrementMetric('legal_case_created_total', 2)

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_case_created_total, 3)
})

test('observability records counter series with permitted labels', () => {
  const observability = createObservabilityService()

  observability.incrementMetric('public_triage_duplicate_prevented_total', 1, {
    entity_id: 'Office-1',
    reason: 'request_id_replay',
    source: 'public_triage',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(
    snapshot.customCounterSeries['public_triage_duplicate_prevented_total{entity_id=office-1,reason=request_id_replay,source=public_triage}'],
    1,
  )
})

test('observability stores real gauges', () => {
  const observability = createObservabilityService()

  observability.setGauge('auth_refresh_sessions_active_total', 7)
  observability.setGauge('auth_signing_key_active_info', 1, {
    mode: 'primary',
    source: 'auth',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customGauges.auth_refresh_sessions_active_total, 7)
  assert.equal(snapshot.customGauges['auth_signing_key_active_info{mode=primary,source=auth}'], 1)
})

test('observability stores timings', () => {
  const observability = createObservabilityService()

  observability.recordTiming('public_entity_interaction_latency_ms', 120, {
    source: 'public_triage',
    result: 'ready',
  })
  observability.recordTiming('public_entity_interaction_latency_ms', 80, {
    source: 'public_triage',
    result: 'ready',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.deepEqual(snapshot.customTimings['public_entity_interaction_latency_ms{result=ready,source=public_triage}'], {
    count: 2,
    totalMs: 200,
    avgMs: 100,
    maxMs: 120,
  })
})

test('observability rejects prohibited labels from series', () => {
  const observability = createObservabilityService()

  observability.incrementMetric('public_triage_attempt_total', 1, {
    requestId: 'triage-a',
    source: 'public_triage',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.public_triage_attempt_total, 1)
  assert.equal(
    Object.keys(snapshot.customCounterSeries).some((key) => key.startsWith('public_triage_attempt_total{')),
    false,
  )
})

test('observability rejects unknown labels from series', () => {
  const observability = createObservabilityService()

  observability.incrementMetric('runtime_governance_startup_failure_total', 1, {
    subsystem: 'database',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.runtime_governance_startup_failure_total, 1)
  assert.equal(
    Object.keys(snapshot.customCounterSeries).some((key) => key.startsWith('runtime_governance_startup_failure_total{')),
    false,
  )
})

test('observability limits labeled series cardinality', () => {
  const observability = createObservabilityService({ maxSeries: 2 })

  observability.incrementMetric('metric_a_total', 1, { source: 'one' })
  observability.incrementMetric('metric_a_total', 1, { source: 'two' })
  observability.incrementMetric('metric_a_total', 1, { source: 'three' })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(Object.keys(snapshot.customCounterSeries).length, 2)
  assert.equal(snapshot.customCounters.metric_a_total, 3)
})

test('observability series do not leak PII in sanitized labels', () => {
  const observability = createObservabilityService()

  observability.incrementMetric('public_triage_spam_allowed_total', 1, {
    entity_id: 'office-safe-1',
    decision: 'allow',
    source: 'public_triage',
  })
  observability.incrementMetric('public_triage_spam_allowed_total', 1, {
    entity_id: 'office-safe-1',
    email: 'ana@example.com',
  } as Record<string, string>)

  const snapshot = observability.getMetricsSnapshot()
  const serializedSeries = JSON.stringify(snapshot.customCounterSeries)
  assert.equal(serializedSeries.includes('ana@example.com'), false)
  assert.equal(serializedSeries.includes('email='), false)
})
