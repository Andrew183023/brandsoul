import type { ObservabilityService } from '../../services/observabilityService.js'

export const EXECUTIVE_DASHBOARD_REQUESTS_TOTAL = 'executive_dashboard_requests_total'
export const EXECUTIVE_DASHBOARD_BUILD_MS = 'executive_dashboard_build_ms'
export const OFFICE_HEALTH_BUILD_MS = 'office_health_build_ms'
export const DECISION_CENTER_BUILD_MS = 'decision_center_build_ms'
export const EXECUTIVE_FEED_GENERATED_TOTAL = 'executive_feed_generated_total'
export const EXECUTIVE_FEED_BUILD_MS = 'executive_feed_build_ms'
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUNS_TOTAL = 'executive_memory_capture_trigger_runs_total'
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUN_MS = 'executive_memory_capture_trigger_run_ms'
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_PROCESSED_TOTAL = 'executive_memory_capture_trigger_batch_processed_total'
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CAPTURED_TOTAL = 'executive_memory_capture_trigger_batch_captured_total'
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CREATED_TOTAL = 'executive_memory_capture_trigger_batch_created_total'
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_FAILED_TOTAL = 'executive_memory_capture_trigger_batch_failed_total'
export const EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL = 'executive_memory_operational_runs_total'

export type ExecutiveMetricsStatus = 'success' | 'error'
export type ExecutiveMemoryCaptureTriggerMetricsStatus = 'completed' | 'already_running' | 'error'
export type ExecutiveMemoryOperationalRunMetricsStatus =
  | 'requested'
  | 'completed'
  | 'failed'
  | 'already_running'
  | 'running'
  | 'batch_limit_reached'
  | 'error'

export interface ExecutiveMetricsRecorder {
  recordTiming(metric: string, durationMs: number, labels?: Record<string, string>): void
  incrementCounter(metric: string, value?: number, labels?: Record<string, string>): void
}

export interface ExecutiveMemoryCaptureTriggerMetricsRecorder {
  recordExecutiveMemoryCaptureTriggerRun(args: {
    status: ExecutiveMemoryCaptureTriggerMetricsStatus
  }): void
  recordExecutiveMemoryCaptureTriggerRunTiming(args: {
    durationMs: number
    status: Exclude<ExecutiveMemoryCaptureTriggerMetricsStatus, 'already_running'>
  }): void
  recordExecutiveMemoryCaptureTriggerBatchTotals(args: {
    status: Exclude<ExecutiveMemoryCaptureTriggerMetricsStatus, 'already_running'>
    processed: number
    captured: number
    created: number
    failed: number
  }): void
}

export interface ExecutiveMemoryOperationalRunMetricsRecorder {
  recordExecutiveMemoryOperationalRun(args: {
    status: ExecutiveMemoryOperationalRunMetricsStatus
  }): void
}

type ExecutiveMetricArgs = {
  status?: ExecutiveMetricsStatus
}

function buildLabels(status: ExecutiveMetricsStatus = 'success') {
  return {
    source: 'executive_dashboard',
    status,
  }
}

function buildExecutiveMemoryCaptureTriggerLabels(
  status: ExecutiveMemoryCaptureTriggerMetricsStatus,
) {
  return {
    source: 'executive_memory_capture_trigger',
    status,
  }
}

function buildExecutiveMemoryOperationalRunLabels(
  status: ExecutiveMemoryOperationalRunMetricsStatus,
) {
  return {
    source: 'executive_memory_operational_run',
    status,
  }
}

export class ExecutiveMetrics
implements
ExecutiveMetricsRecorder,
ExecutiveMemoryCaptureTriggerMetricsRecorder,
ExecutiveMemoryOperationalRunMetricsRecorder {
  constructor(private readonly observability?: ObservabilityService) {}

  recordTiming(metric: string, durationMs: number, labels?: Record<string, string>) {
    this.observability?.recordTiming(metric, durationMs, labels)
  }

  incrementCounter(metric: string, value = 1, labels?: Record<string, string>) {
    this.observability?.incrementMetric(metric, value, labels)
  }

  recordExecutiveDashboardRequest(args: ExecutiveMetricArgs = {}) {
    this.incrementCounter(EXECUTIVE_DASHBOARD_REQUESTS_TOTAL, 1, buildLabels(args.status))
  }

  recordExecutiveDashboardBuildTiming(args: ExecutiveMetricArgs & { durationMs: number }) {
    this.recordTiming(EXECUTIVE_DASHBOARD_BUILD_MS, args.durationMs, buildLabels(args.status))
  }

  recordOfficeHealthBuildTiming(args: ExecutiveMetricArgs & { durationMs: number }) {
    this.recordTiming(OFFICE_HEALTH_BUILD_MS, args.durationMs, buildLabels(args.status))
  }

  recordDecisionCenterBuildTiming(args: ExecutiveMetricArgs & { durationMs: number }) {
    this.recordTiming(DECISION_CENTER_BUILD_MS, args.durationMs, buildLabels(args.status))
  }

  recordExecutiveFeedBuildTiming(args: ExecutiveMetricArgs & { durationMs: number }) {
    this.recordTiming(EXECUTIVE_FEED_BUILD_MS, args.durationMs, buildLabels(args.status))
  }

  recordExecutiveFeedGenerated(args: ExecutiveMetricArgs & { count: number }) {
    this.incrementCounter(EXECUTIVE_FEED_GENERATED_TOTAL, args.count, buildLabels(args.status))
  }

  recordExecutiveMemoryCaptureTriggerRun(args: {
    status: ExecutiveMemoryCaptureTriggerMetricsStatus
  }) {
    this.incrementCounter(
      EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUNS_TOTAL,
      1,
      buildExecutiveMemoryCaptureTriggerLabels(args.status),
    )
  }

  recordExecutiveMemoryCaptureTriggerRunTiming(args: {
    durationMs: number
    status: Exclude<ExecutiveMemoryCaptureTriggerMetricsStatus, 'already_running'>
  }) {
    this.recordTiming(
      EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RUN_MS,
      args.durationMs,
      buildExecutiveMemoryCaptureTriggerLabels(args.status),
    )
  }

  recordExecutiveMemoryCaptureTriggerBatchTotals(args: {
    status: Exclude<ExecutiveMemoryCaptureTriggerMetricsStatus, 'already_running'>
    processed: number
    captured: number
    created: number
    failed: number
  }) {
    const labels = buildExecutiveMemoryCaptureTriggerLabels(args.status)
    this.incrementCounter(EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_PROCESSED_TOTAL, args.processed, labels)
    this.incrementCounter(EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CAPTURED_TOTAL, args.captured, labels)
    this.incrementCounter(EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_CREATED_TOTAL, args.created, labels)
    this.incrementCounter(EXECUTIVE_MEMORY_CAPTURE_TRIGGER_BATCH_FAILED_TOTAL, args.failed, labels)
  }

  recordExecutiveMemoryOperationalRun(args: {
    status: ExecutiveMemoryOperationalRunMetricsStatus
  }) {
    this.incrementCounter(
      EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL,
      1,
      buildExecutiveMemoryOperationalRunLabels(args.status),
    )
  }
}

export function createExecutiveMetrics(observability?: ObservabilityService) {
  return new ExecutiveMetrics(observability)
}
