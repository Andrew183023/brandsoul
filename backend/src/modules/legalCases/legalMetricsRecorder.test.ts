import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { LegalMetricsRecorder } from './legalMetricsRecorder.js'

test('LegalMetricsRecorder increment updates customCounters', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  recorder.increment('public_triage_request_replays_total', {
    entity_id: 'office-1',
    source: 'public_triage',
    reason: 'request_id_replay',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.public_triage_request_replays_total, 1)
  assert.equal(
    snapshot.customCounterSeries['public_triage_request_replays_total{entity_id=office-1,reason=request_id_replay,source=public_triage}'],
    1,
  )
})

test('LegalMetricsRecorder setGauge updates customGauges', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  recorder.setGauge('legal_matching_queue_depth', 4, {
    tenant_id: '7',
    entity_id: 'office-1',
    pipeline: 'matching',
    stage: 'queue',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(
    snapshot.customGauges['legal_matching_queue_depth{entity_id=office-1,pipeline=matching,stage=queue,tenant_id=7}'],
    4,
  )
})

test('LegalMetricsRecorder recordTiming updates customTimings', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  recorder.recordTiming('legal_canonical_read_duration_ms', 120, {
    tenant_id: '7',
    entity_id: 'office-1',
    pipeline: 'canonical_read',
    result: 'ready',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.deepEqual(
    snapshot.customTimings['legal_canonical_read_duration_ms{entity_id=office-1,pipeline=canonical_read,result=ready,tenant_id=7}'],
    {
      count: 1,
      totalMs: 120,
      avgMs: 120,
      maxMs: 120,
    },
  )
})

test('LegalMetricsRecorder rejects counter used as gauge', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  assert.throws(
    () => recorder.setGauge('public_triage_request_replays_total', 1),
    /is not a gauge/,
  )
})

test('LegalMetricsRecorder rejects gauge used as counter', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  assert.throws(
    () => recorder.increment('legal_matching_queue_depth'),
    /is not a counter/,
  )
})

test('LegalMetricsRecorder rejects timing used as counter', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  assert.throws(
    () => recorder.increment('legal_canonical_read_duration_ms'),
    /is not a counter/,
  )
})

test('LegalMetricsRecorder rejects unknown metrics', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  assert.throws(
    () => recorder.increment('legal_unknown_metric_total'),
    /Unknown legal operational metric/,
  )
})

test('LegalMetricsRecorder forwards labels without mutating input', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)
  const labels = {
    entity_id: 'Office-Alpha',
    source: 'Public_Triage',
    reason: 'Request_ID_Replay',
  }

  recorder.incrementCounter('public_triage_request_replays_total', labels)

  assert.deepEqual(labels, {
    entity_id: 'Office-Alpha',
    source: 'Public_Triage',
    reason: 'Request_ID_Replay',
  })
  const snapshot = observability.getMetricsSnapshot()
  assert.equal(
    snapshot.customCounterSeries['public_triage_request_replays_total{entity_id=office-alpha,reason=request_id_replay,source=public_triage}'],
    1,
  )
})

test('LegalMetricsRecorder snapshot contains counter gauge and timing together', () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)

  recorder.increment('public_triage_case_reused_total', {
    entity_id: 'office-1',
    source: 'public_triage',
    reason: 'pre_lookup_hit',
  })
  recorder.setGaugeMetric('legal_matching_queue_depth', 2, {
    tenant_id: '7',
    entity_id: 'office-1',
    pipeline: 'matching',
    stage: 'queue',
  })
  recorder.recordMetricTiming('legal_canonical_read_duration_ms', 45, {
    tenant_id: '7',
    entity_id: 'office-1',
    pipeline: 'canonical_read',
    result: 'ready',
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.public_triage_case_reused_total, 1)
  assert.equal(
    snapshot.customGauges['legal_matching_queue_depth{entity_id=office-1,pipeline=matching,stage=queue,tenant_id=7}'],
    2,
  )
  assert.deepEqual(
    snapshot.customTimings['legal_canonical_read_duration_ms{entity_id=office-1,pipeline=canonical_read,result=ready,tenant_id=7}'],
    {
      count: 1,
      totalMs: 45,
      avgMs: 45,
      maxMs: 45,
    },
  )
})
