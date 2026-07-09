import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import {
  createExecutiveMetrics,
  DECISION_CENTER_BUILD_MS,
  EXECUTIVE_DASHBOARD_BUILD_MS,
  EXECUTIVE_DASHBOARD_REQUESTS_TOTAL,
  EXECUTIVE_FEED_BUILD_MS,
  EXECUTIVE_FEED_GENERATED_TOTAL,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CAPTURED_TOTAL,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CREATED_TOTAL,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_FAILED_TOTAL,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_PROCESSED_TOTAL,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUN_MS,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUNS_TOTAL,
  OFFICE_HEALTH_BUILD_MS,
} from './ExecutiveMetrics.js'

function timingCount(
  snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>,
  metricName: string,
) {
  return Object.keys(snapshot.customTimings).filter((key) => key.startsWith(`${metricName}{`)).length
}

test('executive metrics record request counters and timings with safe labels', () => {
  const observability = createObservabilityService()
  const metrics = createExecutiveMetrics(observability)

  metrics.recordExecutiveDashboardRequest()
  metrics.recordExecutiveDashboardBuildTiming({ durationMs: 12, status: 'success' })
  metrics.recordOfficeHealthBuildTiming({ durationMs: 7, status: 'success' })
  metrics.recordDecisionCenterBuildTiming({ durationMs: 8, status: 'success' })
  metrics.recordExecutiveFeedBuildTiming({ durationMs: 9, status: 'success' })
  metrics.recordExecutiveFeedGenerated({ count: 3, status: 'success' })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[EXECUTIVE_DASHBOARD_REQUESTS_TOTAL], 1)
  assert.equal(snapshot.customCounters[EXECUTIVE_FEED_GENERATED_TOTAL], 3)
  assert.equal(timingCount(snapshot, EXECUTIVE_DASHBOARD_BUILD_MS), 1)
  assert.equal(timingCount(snapshot, OFFICE_HEALTH_BUILD_MS), 1)
  assert.equal(timingCount(snapshot, DECISION_CENTER_BUILD_MS), 1)
  assert.equal(timingCount(snapshot, EXECUTIVE_FEED_BUILD_MS), 1)

  const serialized = JSON.stringify({
    counters: snapshot.customCounterSeries,
    timings: snapshot.customTimings,
  })
  assert.equal(serialized.includes('officeId'), false)
  assert.equal(serialized.includes('tenantId'), false)
  assert.equal(serialized.includes('userId'), false)
  assert.equal(serialized.includes('email'), false)
  assert.equal(serialized.includes('phone'), false)
  assert.equal(serialized.includes('caseId'), false)
})

test('executive metrics record error status without observability failures', () => {
  const observability = createObservabilityService()
  const metrics = createExecutiveMetrics(observability)

  metrics.recordExecutiveDashboardRequest({ status: 'error' })
  metrics.recordExecutiveDashboardBuildTiming({ durationMs: 15, status: 'error' })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[EXECUTIVE_DASHBOARD_REQUESTS_TOTAL], 1)
  assert.equal(
    Object.keys(snapshot.customCounterSeries).some((key) =>
      key.includes('executive_dashboard_requests_total{source=executive_dashboard,status=error}'),
    ),
    true,
  )
  assert.equal(
    Object.keys(snapshot.customTimings).some((key) =>
      key.includes('executive_dashboard_build_ms{source=executive_dashboard,status=error}'),
    ),
    true,
  )
})

test('executive metrics ignore calls when observability is undefined', () => {
  const metrics = createExecutiveMetrics()

  assert.doesNotThrow(() => {
    metrics.recordExecutiveDashboardRequest()
    metrics.recordExecutiveDashboardBuildTiming({ durationMs: 5 })
    metrics.recordOfficeHealthBuildTiming({ durationMs: 5 })
    metrics.recordDecisionCenterBuildTiming({ durationMs: 5 })
    metrics.recordExecutiveFeedBuildTiming({ durationMs: 5 })
    metrics.recordExecutiveFeedGenerated({ count: 2 })
  })
})

test('executive memory trigger metrics record completed and error runs with safe aggregate labels', () => {
  const observability = createObservabilityService()
  const metrics = createExecutiveMetrics(observability)

  metrics.recordExecutiveMemoryCaptureTriggerRun({ status: 'completed' })
  metrics.recordExecutiveMemoryCaptureTriggerRunTiming({ durationMs: 14, status: 'completed' })
  metrics.recordExecutiveMemoryCaptureTriggerBatchTotals({
    status: 'completed',
    processed: 5,
    captured: 4,
    created: 3,
    failed: 1,
  })
  metrics.recordExecutiveMemoryCaptureTriggerRun({ status: 'error' })
  metrics.recordExecutiveMemoryCaptureTriggerRunTiming({ durationMs: 9, status: 'error' })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUNS_TOTAL], 2)
  assert.equal(snapshot.customCounters[EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_PROCESSED_TOTAL], 5)
  assert.equal(snapshot.customCounters[EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CAPTURED_TOTAL], 4)
  assert.equal(snapshot.customCounters[EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CREATED_TOTAL], 3)
  assert.equal(snapshot.customCounters[EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_FAILED_TOTAL], 1)
  assert.equal(timingCount(snapshot, EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUN_MS), 2)

  const serialized = JSON.stringify({
    counters: snapshot.customCounterSeries,
    timings: snapshot.customTimings,
  })
  assert.equal(serialized.includes('tenantId'), false)
  assert.equal(serialized.includes('officeId'), false)
  assert.equal(serialized.includes('cursor'), false)
  assert.equal(serialized.includes('fingerprint'), false)
  assert.equal(serialized.includes('error_message'), false)
})
