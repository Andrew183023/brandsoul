import assert from 'node:assert/strict'
import test from 'node:test'

import {
  escapePrometheusLabelValue,
  sanitizePrometheusLabelName,
  sanitizePrometheusMetricName,
} from './prometheusEscape.js'
import { renderPrometheusMetrics } from './prometheusRenderer.js'

test('prometheus renderer renders a simple counter', () => {
  const rendered = renderPrometheusMetrics({
    customCounters: {
      legal_case_created_total: 3,
    },
    customCounterSeries: {},
    customGauges: {},
    customTimings: {},
  })

  assert.equal(
    rendered,
    [
      '# HELP legal_case_created_total Observability metric legal_case_created_total.',
      '# TYPE legal_case_created_total counter',
      'legal_case_created_total 3',
      '',
    ].join('\n'),
  )
})

test('prometheus renderer renders counter series with sorted labels', () => {
  const rendered = renderPrometheusMetrics({
    customCounters: {},
    customCounterSeries: {
      'legal_case_created_total{tenant_id=11,entity_id=office-1}': 1,
    },
    customGauges: {},
    customTimings: {},
  })

  assert.equal(
    rendered,
    [
      '# HELP legal_case_created_total Observability metric legal_case_created_total.',
      '# TYPE legal_case_created_total counter',
      'legal_case_created_total{entity_id="office-1",tenant_id="11"} 1',
      '',
    ].join('\n'),
  )
})

test('prometheus renderer renders gauges with and without labels', () => {
  const rendered = renderPrometheusMetrics({
    customCounters: {},
    customCounterSeries: {},
    customGauges: {
      legal_matching_queue_depth: 4,
      'auth_signing_key_active_info{mode=primary,source=auth}': 1,
    },
    customTimings: {},
  })

  assert.equal(
    rendered,
    [
      '# HELP auth_signing_key_active_info Observability metric auth_signing_key_active_info.',
      '# TYPE auth_signing_key_active_info gauge',
      'auth_signing_key_active_info{mode="primary",source="auth"} 1',
      '# HELP legal_matching_queue_depth Observability metric legal_matching_queue_depth.',
      '# TYPE legal_matching_queue_depth gauge',
      'legal_matching_queue_depth 4',
      '',
    ].join('\n'),
  )
})

test('prometheus renderer expands timings into aggregated gauges', () => {
  const rendered = renderPrometheusMetrics({
    customCounters: {},
    customCounterSeries: {},
    customGauges: {},
    customTimings: {
      'legal_canonical_read_duration_ms{tenant_id=7,result=success}': {
        count: 2,
        totalMs: 50,
        avgMs: 25,
        min: 20,
        maxMs: 30,
      },
    },
  })

  assert.equal(
    rendered,
    [
      '# HELP legal_canonical_read_duration_ms_avg Observability metric legal_canonical_read_duration_ms_avg.',
      '# TYPE legal_canonical_read_duration_ms_avg gauge',
      'legal_canonical_read_duration_ms_avg{result="success",tenant_id="7"} 25',
      '# HELP legal_canonical_read_duration_ms_count Observability metric legal_canonical_read_duration_ms_count.',
      '# TYPE legal_canonical_read_duration_ms_count gauge',
      'legal_canonical_read_duration_ms_count{result="success",tenant_id="7"} 2',
      '# HELP legal_canonical_read_duration_ms_max Observability metric legal_canonical_read_duration_ms_max.',
      '# TYPE legal_canonical_read_duration_ms_max gauge',
      'legal_canonical_read_duration_ms_max{result="success",tenant_id="7"} 30',
      '# HELP legal_canonical_read_duration_ms_min Observability metric legal_canonical_read_duration_ms_min.',
      '# TYPE legal_canonical_read_duration_ms_min gauge',
      'legal_canonical_read_duration_ms_min{result="success",tenant_id="7"} 20',
      '# HELP legal_canonical_read_duration_ms_sum Observability metric legal_canonical_read_duration_ms_sum.',
      '# TYPE legal_canonical_read_duration_ms_sum gauge',
      'legal_canonical_read_duration_ms_sum{result="success",tenant_id="7"} 50',
      '',
    ].join('\n'),
  )
})

test('prometheus escaping and sanitization handle invalid values safely', () => {
  assert.equal(escapePrometheusLabelValue('a"b\\c\nd'), 'a\\"b\\\\c\\nd')
  assert.equal(sanitizePrometheusMetricName('legal.metric-created/total'), 'legal_metric_created_total')
  assert.equal(sanitizePrometheusLabelName('1invalid-label'), '_1invalid_label')
})

test('prometheus renderer output is deterministic', () => {
  const rendered = renderPrometheusMetrics({
    customCounters: {
      b_metric_total: 2,
      a_metric_total: 1,
    },
    customCounterSeries: {
      'b_metric_total{z=2,a=1}': 3,
      'a_metric_total{b=2,a=1}': 4,
    },
    customGauges: {},
    customTimings: {},
  })

  assert.equal(
    rendered,
    [
      '# HELP a_metric_total Observability metric a_metric_total.',
      '# TYPE a_metric_total counter',
      'a_metric_total 1',
      'a_metric_total{a="1",b="2"} 4',
      '# HELP b_metric_total Observability metric b_metric_total.',
      '# TYPE b_metric_total counter',
      'b_metric_total 2',
      'b_metric_total{a="1",z="2"} 3',
      '',
    ].join('\n'),
  )
})

test('prometheus renderer returns a valid trailing newline for empty input', () => {
  assert.equal(
    renderPrometheusMetrics({
      customCounters: {},
      customCounterSeries: {},
      customGauges: {},
      customTimings: {},
    }),
    '\n',
  )
})
