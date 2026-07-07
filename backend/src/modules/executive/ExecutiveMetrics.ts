import type { ObservabilityService } from '../../services/observabilityService.js'

export const EXECUTIVE_DASHBOARD_REQUESTS_TOTAL = 'executive_dashboard_requests_total'
export const EXECUTIVE_DASHBOARD_BUILD_MS = 'executive_dashboard_build_ms'
export const OFFICE_HEALTH_BUILD_MS = 'office_health_build_ms'
export const DECISION_CENTER_BUILD_MS = 'decision_center_build_ms'
export const EXECUTIVE_FEED_GENERATED_TOTAL = 'executive_feed_generated_total'
export const EXECUTIVE_FEED_BUILD_MS = 'executive_feed_build_ms'

export type ExecutiveMetricsStatus = 'success' | 'error'

export interface ExecutiveMetricsRecorder {
  recordTiming(metric: string, durationMs: number, labels?: Record<string, string>): void
  incrementCounter(metric: string, value?: number, labels?: Record<string, string>): void
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

export class ExecutiveMetrics implements ExecutiveMetricsRecorder {
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
}

export function createExecutiveMetrics(observability?: ObservabilityService) {
  return new ExecutiveMetrics(observability)
}
