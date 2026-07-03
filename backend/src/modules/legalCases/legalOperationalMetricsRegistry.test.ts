import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertLegalMetricIsRegistered,
  getLegalOperationalMetric,
  listLegalOperationalMetrics,
} from './legalOperationalMetricsRegistry.js'

const ALLOWED_LABELS = new Set([
  'tenant_id',
  'entity_id',
  'source',
  'reason',
  'status',
  'event',
  'result',
  'pipeline',
  'stage',
  'operation',
  'mode',
  'decision',
])

test('all legal operational metric names are unique', () => {
  const metrics = listLegalOperationalMetrics()
  const names = metrics.map((metric) => metric.name)
  assert.equal(new Set(names).size, names.length)
})

test('all counter metrics end with _total', () => {
  const metrics = listLegalOperationalMetrics()
  for (const metric of metrics) {
    if (metric.type === 'counter') {
      assert.equal(metric.name.endsWith('_total'), true, metric.name)
    }
  }
})

test('gauge metrics do not end with _total', () => {
  const metrics = listLegalOperationalMetrics()
  for (const metric of metrics) {
    if (metric.type === 'gauge') {
      assert.equal(metric.name.endsWith('_total'), false, metric.name)
    }
  }
})

test('all legal metric names start with legal_ or public_triage_', () => {
  const metrics = listLegalOperationalMetrics()
  for (const metric of metrics) {
    assert.equal(
      metric.name.startsWith('legal_') || metric.name.startsWith('public_triage_'),
      true,
      metric.name,
    )
  }
})

test('all labels belong to the observability whitelist', () => {
  const metrics = listLegalOperationalMetrics()
  for (const metric of metrics) {
    for (const label of metric.labels) {
      assert.equal(ALLOWED_LABELS.has(label), true, `${metric.name}:${label}`)
    }
  }
})

test('existing replay, fingerprint and spam metrics are registered and instrumented', () => {
  const expectedInstrumented = [
    'public_triage_requests_total',
    'public_triage_valid_total',
    'public_triage_invalid_total',
    'public_triage_case_created_total',
    'public_triage_request_replays_total',
    'public_triage_fingerprint_hits_total',
    'public_triage_fingerprint_reservations_total',
    'public_triage_duplicate_prevented_total',
    'public_triage_concurrency_pending_total',
    'public_triage_creation_pending_total',
    'public_triage_spam_allowed_total',
    'public_triage_spam_blocked_total',
    'public_triage_spam_cooldown_total',
    'public_triage_spam_rate_limited_total',
    'public_triage_spam_invalid_payload_total',
    'legal_portal_access_created_total',
    'legal_portal_access_used_total',
    'legal_portal_access_invalid_total',
    'legal_portal_access_expired_total',
    'legal_timeline_events_total',
    'legal_timeline_write_failures_total',
    'legal_assignment_created_total',
    'legal_assignment_accepted_total',
    'legal_assignment_rejected_total',
    'legal_assignment_reassigned_total',
    'legal_assignment_expired_total',
    'legal_matching_started_total',
    'legal_matching_completed_total',
    'legal_matching_failed_total',
    'legal_case_created_total',
    'legal_case_reused_total',
    'legal_case_status_changed_total',
    'legal_case_closed_total',
    'legal_message_received_total',
    'legal_message_sent_total',
    'legal_message_failed_total',
    'legal_canonical_read_total',
    'legal_canonical_read_failed_total',
    'legal_canonical_read_duration_ms',
    'legal_transaction_rollbacks_total',
    'legal_transaction_failures_total',
  ]

  for (const name of expectedInstrumented) {
    const metric = assertLegalMetricIsRegistered(name)
    assert.equal(metric.instrumented, true, name)
  }
})

test('public triage funnel metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const expectations = [
    {
      name: 'public_triage_requests_total',
      labels: ['tenant_id', 'source', 'result'],
    },
    {
      name: 'public_triage_valid_total',
      labels: ['tenant_id', 'source', 'result'],
    },
    {
      name: 'public_triage_invalid_total',
      labels: ['tenant_id', 'source', 'reason', 'result'],
    },
    {
      name: 'public_triage_case_created_total',
      labels: ['tenant_id', 'entity_id', 'source', 'result'],
    },
  ]

  for (const expectation of expectations) {
    const matches = metrics.filter((metric) => metric.name === expectation.name)
    assert.equal(matches.length, 1, expectation.name)
    assert.equal(matches[0]?.instrumented, true, expectation.name)
    assert.equal(matches[0]?.status, 'active', expectation.name)
    assert.equal(matches[0]?.category, 'public_triage', expectation.name)
    assert.deepEqual(matches[0]?.labels, expectation.labels, expectation.name)
  }
})

test('there is no exact duplicate metric name definition', () => {
  const metrics = listLegalOperationalMetrics()
  const names = metrics.map((metric) => metric.name)
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index)
  assert.deepEqual(duplicates, [])
})

test('portal metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const portalMetricNames = [
    'legal_portal_access_created_total',
    'legal_portal_access_used_total',
    'legal_portal_access_invalid_total',
    'legal_portal_access_expired_total',
  ]

  for (const name of portalMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'portal', name)
  }
})

test('timeline metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const timelineMetricNames = [
    'legal_timeline_events_total',
    'legal_timeline_write_failures_total',
  ]

  for (const name of timelineMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'timeline', name)
  }
})

test('assignment metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const assignmentMetricNames = [
    'legal_assignment_created_total',
    'legal_assignment_accepted_total',
    'legal_assignment_rejected_total',
    'legal_assignment_reassigned_total',
    'legal_assignment_expired_total',
  ]

  for (const name of assignmentMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'assignment', name)
  }
})

test('matching metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const matchingMetricNames = [
    'legal_matching_started_total',
    'legal_matching_completed_total',
    'legal_matching_failed_total',
  ]

  for (const name of matchingMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'matching', name)
  }
})

test('matching queue depth appears exactly once and remains planned', () => {
  const metrics = listLegalOperationalMetrics()
  const matches = metrics.filter((metric) => metric.name === 'legal_matching_queue_depth')

  assert.equal(matches.length, 1, 'legal_matching_queue_depth')
  assert.equal(matches[0]?.type, 'gauge', 'legal_matching_queue_depth')
  assert.equal(matches[0]?.category, 'matching', 'legal_matching_queue_depth')
  assert.equal(matches[0]?.instrumented, false, 'legal_matching_queue_depth')
  assert.equal(matches[0]?.status, 'planned', 'legal_matching_queue_depth')
  assert.deepEqual(
    matches[0]?.labels,
    ['tenant_id', 'entity_id', 'pipeline', 'stage'],
    'legal_matching_queue_depth',
  )
})

test('all P0 legal operational metrics are active', () => {
  const requiredActiveMetricNames = [
    'public_triage_requests_total',
    'public_triage_valid_total',
    'public_triage_invalid_total',
    'public_triage_case_created_total',
    'public_triage_request_replays_total',
    'public_triage_fingerprint_hits_total',
    'public_triage_fingerprint_reservations_total',
    'public_triage_duplicate_prevented_total',
    'public_triage_case_reused_total',
    'public_triage_spam_allowed_total',
    'public_triage_spam_blocked_total',
    'public_triage_spam_cooldown_total',
    'public_triage_spam_rate_limited_total',
    'public_triage_spam_invalid_payload_total',
    'legal_portal_access_created_total',
    'legal_portal_access_used_total',
    'legal_portal_access_invalid_total',
    'legal_portal_access_expired_total',
    'legal_timeline_events_total',
    'legal_timeline_write_failures_total',
    'legal_assignment_created_total',
    'legal_assignment_accepted_total',
    'legal_assignment_rejected_total',
    'legal_assignment_reassigned_total',
    'legal_assignment_expired_total',
    'legal_matching_started_total',
    'legal_matching_completed_total',
    'legal_matching_failed_total',
    'legal_canonical_read_total',
    'legal_canonical_read_failed_total',
    'legal_canonical_read_duration_ms',
    'legal_message_received_total',
    'legal_message_sent_total',
    'legal_message_failed_total',
    'legal_case_created_total',
    'legal_case_reused_total',
    'legal_case_status_changed_total',
    'legal_case_closed_total',
    'legal_transaction_failures_total',
    'legal_transaction_rollbacks_total',
    'legal_structured_identity_used_total',
    'legal_identity_fallback_used_total',
  ]

  for (const name of requiredActiveMetricNames) {
    const metric = assertLegalMetricIsRegistered(name)
    assert.equal(metric.instrumented, true, name)
    assert.equal(metric.status, 'active', name)
  }
})

test('remaining planned legal metrics are explicitly accepted', () => {
  const acceptedPlanned = new Set(['legal_matching_queue_depth'])

  const planned = listLegalOperationalMetrics()
    .filter((metric) => metric.status === 'planned')
    .map((metric) => metric.name)

  assert.deepEqual(planned.sort(), Array.from(acceptedPlanned).sort())
})

test('dashboard-required metrics always have description', () => {
  const metrics = listLegalOperationalMetrics()
  for (const metric of metrics) {
    if (metric.requiredForDashboard) {
      assert.equal(metric.description.trim().length > 0, true, metric.name)
    }
  }
})

test('metric descriptions stay compatible with their category', () => {
  const metrics = listLegalOperationalMetrics()

  for (const metric of metrics) {
    const description = metric.description.toLowerCase()
    if (metric.category === 'portal') {
      assert.equal(description.includes('portal'), true, metric.name)
    }
    if (metric.category === 'timeline') {
      assert.equal(description.includes('timeline'), true, metric.name)
    }
    if (metric.category === 'assignment') {
      assert.equal(description.includes('assignment') || description.includes('atribui'), true, metric.name)
    }
    if (metric.category === 'matching') {
      assert.equal(description.includes('matching'), true, metric.name)
    }
  }
})

test('assignment and matching prefixes stay bound to the correct category', () => {
  const metrics = listLegalOperationalMetrics()

  for (const metric of metrics) {
    if (metric.name.startsWith('legal_assignment_')) {
      assert.equal(metric.category, 'assignment', metric.name)
    }
    if (metric.name.startsWith('legal_matching_')) {
      assert.equal(metric.category, 'matching', metric.name)
    }
    if (metric.name.startsWith('legal_case_')) {
      assert.equal(metric.category, 'case_lifecycle', metric.name)
    }
  }
})

test('matching metric definitions keep the expected labels and description intent', () => {
  const started = assertLegalMetricIsRegistered('legal_matching_started_total')
  const completed = assertLegalMetricIsRegistered('legal_matching_completed_total')
  const failed = assertLegalMetricIsRegistered('legal_matching_failed_total')
  const queueDepth = assertLegalMetricIsRegistered('legal_matching_queue_depth')

  assert.deepEqual(started.labels, ['tenant_id', 'entity_id', 'pipeline', 'result'])
  assert.deepEqual(completed.labels, ['tenant_id', 'entity_id', 'pipeline', 'reason', 'result'])
  assert.deepEqual(failed.labels, ['tenant_id', 'entity_id', 'pipeline', 'reason', 'result'])
  assert.deepEqual(queueDepth.labels, ['tenant_id', 'entity_id', 'pipeline', 'stage'])

  assert.equal(started.description.toLowerCase().includes('iniciados'), true)
  assert.equal(completed.description.toLowerCase().includes('concluídos') || completed.description.toLowerCase().includes('concluidos'), true)
  assert.equal(failed.description.toLowerCase().includes('falhas'), true)
  assert.equal(queueDepth.description.toLowerCase().includes('profundidade') || queueDepth.description.toLowerCase().includes('fila'), true)
})

test('canonical read metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const canonicalReadMetricNames = [
    'legal_canonical_read_total',
    'legal_canonical_read_failed_total',
    'legal_canonical_read_duration_ms',
  ]

  for (const name of canonicalReadMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'canonical_read', name)
  }
})

test('case lifecycle metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const lifecycleMetricNames = [
    'legal_case_created_total',
    'legal_case_reused_total',
    'legal_case_status_changed_total',
    'legal_case_closed_total',
  ]

  for (const name of lifecycleMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'case_lifecycle', name)
  }
})

test('case lifecycle metrics keep expected labels and description intent', () => {
  const created = assertLegalMetricIsRegistered('legal_case_created_total')
  const reused = assertLegalMetricIsRegistered('legal_case_reused_total')
  const statusChanged = assertLegalMetricIsRegistered('legal_case_status_changed_total')
  const closed = assertLegalMetricIsRegistered('legal_case_closed_total')

  assert.deepEqual(created.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'result'])
  assert.deepEqual(reused.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'reason', 'result'])
  assert.deepEqual(statusChanged.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'status', 'reason', 'result'])
  assert.deepEqual(closed.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'status', 'reason', 'result'])

  assert.equal(created.description.toLowerCase().includes('casos'), true)
  assert.equal(reused.description.toLowerCase().includes('reutilizados'), true)
  assert.equal(statusChanged.description.toLowerCase().includes('status'), true)
  assert.equal(closed.description.toLowerCase().includes('encerrados'), true)
})

test('canonical read metrics keep expected types and labels', () => {
  const total = assertLegalMetricIsRegistered('legal_canonical_read_total')
  const failed = assertLegalMetricIsRegistered('legal_canonical_read_failed_total')
  const duration = assertLegalMetricIsRegistered('legal_canonical_read_duration_ms')

  assert.equal(total.type, 'counter')
  assert.equal(failed.type, 'counter')
  assert.equal(duration.type, 'timing')

  assert.deepEqual(total.labels, ['tenant_id', 'entity_id', 'pipeline', 'stage', 'reason', 'result'])
  assert.deepEqual(failed.labels, ['tenant_id', 'entity_id', 'pipeline', 'stage', 'reason', 'result'])
  assert.deepEqual(duration.labels, ['tenant_id', 'entity_id', 'pipeline', 'result'])
})

test('canonical identity metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const canonicalIdentityMetricNames = [
    'legal_structured_identity_used_total',
    'legal_identity_fallback_used_total',
  ]

  for (const name of canonicalIdentityMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'canonical_identity', name)
  }
})

test('canonical read and identity prefixes stay bound to the correct category', () => {
  const metrics = listLegalOperationalMetrics()

  for (const metric of metrics) {
    if (metric.name.startsWith('legal_canonical_read_')) {
      assert.equal(metric.category, 'canonical_read', metric.name)
    }
    if (metric.name.startsWith('legal_structured_identity_') || metric.name.startsWith('legal_identity_fallback_')) {
      assert.equal(metric.category, 'canonical_identity', metric.name)
    }
  }
})

test('message metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const messageMetricNames = [
    'legal_message_received_total',
    'legal_message_sent_total',
    'legal_message_failed_total',
  ]

  for (const name of messageMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'message', name)
  }
})

test('message metrics keep expected labels and description intent', () => {
  const received = assertLegalMetricIsRegistered('legal_message_received_total')
  const sent = assertLegalMetricIsRegistered('legal_message_sent_total')
  const failed = assertLegalMetricIsRegistered('legal_message_failed_total')

  assert.deepEqual(received.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'result'])
  assert.deepEqual(sent.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'result'])
  assert.deepEqual(failed.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'reason', 'result'])
  assert.equal(received.description.toLowerCase().includes('mensagens'), true)
  assert.equal(sent.description.toLowerCase().includes('mensagens'), true)
  assert.equal(failed.description.toLowerCase().includes('falhas'), true)
})

test('message metric prefix stays bound to the message category', () => {
  const metrics = listLegalOperationalMetrics()

  for (const metric of metrics) {
    if (metric.name.startsWith('legal_message_')) {
      assert.equal(metric.category, 'message', metric.name)
    }
    if (metric.name.startsWith('legal_transaction_')) {
      assert.equal(metric.category, 'transaction', metric.name)
    }
  }
})

test('transaction metrics appear exactly once and remain active', () => {
  const metrics = listLegalOperationalMetrics()
  const transactionMetricNames = [
    'legal_transaction_rollbacks_total',
    'legal_transaction_failures_total',
  ]

  for (const name of transactionMetricNames) {
    const matches = metrics.filter((metric) => metric.name === name)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0]?.instrumented, true, name)
    assert.equal(matches[0]?.status, 'active', name)
    assert.equal(matches[0]?.category, 'transaction', name)
  }
})

test('transaction metrics keep expected labels and description intent', () => {
  const rollbacks = assertLegalMetricIsRegistered('legal_transaction_rollbacks_total')
  const failures = assertLegalMetricIsRegistered('legal_transaction_failures_total')

  assert.equal(rollbacks.type, 'counter')
  assert.equal(failures.type, 'counter')
  assert.deepEqual(rollbacks.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'stage', 'reason', 'result'])
  assert.deepEqual(failures.labels, ['tenant_id', 'entity_id', 'source', 'operation', 'stage', 'reason', 'result'])
  assert.equal(rollbacks.description.toLowerCase().includes('rollback') || rollbacks.description.toLowerCase().includes('rollbacks'), true)
  assert.equal(failures.description.toLowerCase().includes('falhas'), true)
})

test('transaction metric prefix stays bound to the transaction category', () => {
  const metrics = listLegalOperationalMetrics()

  for (const metric of metrics) {
    if (metric.name.startsWith('legal_transaction_')) {
      assert.equal(metric.category, 'transaction', metric.name)
    }
  }
})

test('canonical identity metrics keep expected labels and identity descriptions', () => {
  const structured = assertLegalMetricIsRegistered('legal_structured_identity_used_total')
  const fallback = assertLegalMetricIsRegistered('legal_identity_fallback_used_total')

  assert.equal(structured.type, 'counter')
  assert.equal(fallback.type, 'counter')
  assert.equal(structured.instrumented, true)
  assert.equal(fallback.instrumented, true)
  assert.equal(structured.status, 'active')
  assert.equal(fallback.status, 'active')
  assert.equal(structured.category, 'canonical_identity')
  assert.equal(fallback.category, 'canonical_identity')
  assert.deepEqual(structured.labels, ['tenant_id', 'entity_id', 'source', 'result'])
  assert.deepEqual(fallback.labels, ['tenant_id', 'entity_id', 'source', 'reason', 'result'])
  assert.equal(structured.description.toLowerCase().includes('identidade'), true)
  assert.equal(fallback.description.toLowerCase().includes('identidade'), true)
})

test('canonical identity metrics keep the exact final definitions', () => {
  assert.deepEqual(assertLegalMetricIsRegistered('legal_structured_identity_used_total'), {
    name: 'legal_structured_identity_used_total',
    type: 'counter',
    category: 'canonical_identity',
    description: 'Total de leituras que utilizaram identidade estruturada como fonte operacional.',
    labels: ['tenant_id', 'entity_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  })

  assert.deepEqual(assertLegalMetricIsRegistered('legal_identity_fallback_used_total'), {
    name: 'legal_identity_fallback_used_total',
    type: 'counter',
    category: 'canonical_identity',
    description: 'Total de leituras que recorreram a fallback histórico de identidade.',
    labels: ['tenant_id', 'entity_id', 'source', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  })
})

test('transaction rollback metric keeps the exact final definition', () => {
  assert.deepEqual(assertLegalMetricIsRegistered('legal_transaction_rollbacks_total'), {
    name: 'legal_transaction_rollbacks_total',
    type: 'counter',
    category: 'transaction',
    description: 'Total de rollbacks em transações jurídicas operacionais.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'stage', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  })
})

test('getLegalOperationalMetric returns the correct definition', () => {
  const metric = getLegalOperationalMetric('public_triage_request_replays_total')
  assert.ok(metric)
  assert.equal(metric?.category, 'anti_duplication')
  assert.equal(metric?.instrumented, true)
  assert.deepEqual(metric?.labels, ['entity_id', 'source', 'reason'])
})

test('getLegalOperationalMetric returns a unique portal definition', () => {
  const metric = getLegalOperationalMetric('legal_portal_access_created_total')
  assert.ok(metric)
  assert.equal(metric?.category, 'portal')
  assert.equal(metric?.instrumented, true)
  assert.equal(metric?.status, 'active')
})

test('assertLegalMetricIsRegistered throws for unknown metrics', () => {
  assert.throws(
    () => assertLegalMetricIsRegistered('legal_unknown_metric_total'),
    /Unknown legal operational metric/,
  )
})

test('listLegalOperationalMetrics returns immutable external copies', () => {
  const listed = listLegalOperationalMetrics()
  const originalPortal = getLegalOperationalMetric('legal_portal_access_created_total')
  assert.ok(originalPortal)

  listed[0]!.name = 'mutated_metric_name'
  if (listed[0]?.labels.length) {
    listed[0]!.labels[0] = 'mode'
  }

  const afterMutation = getLegalOperationalMetric('legal_portal_access_created_total')
  assert.ok(afterMutation)
  assert.equal(afterMutation?.name, originalPortal?.name)
  assert.deepEqual(afterMutation?.labels, originalPortal?.labels)
})
