import type { ObservabilityService } from '../../services/observabilityService.js'

export const OPERATIONAL_TIMELINE_ENTRIES_TOTAL = 'operational_timeline_entries_total'
export const OPERATIONAL_TIMELINE_BUILD_MS = 'operational_timeline_build_ms'
export const OPERATIONAL_TIMELINE_FAILED_TOTAL = 'operational_timeline_failed_total'

type OperationalTimelineMetricArgs = {
  tenantId: number
  entityId: string
}

export class OperationalTimelineMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordEntriesBuilt(args: OperationalTimelineMetricArgs & { count: number }) {
    this.observability?.incrementMetric(OPERATIONAL_TIMELINE_ENTRIES_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_timeline',
      result: 'success',
    })
  }

  recordBuildTiming(args: OperationalTimelineMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(OPERATIONAL_TIMELINE_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_timeline',
      result: args.result ?? 'success',
    })
  }

  recordBuildFailed(args: OperationalTimelineMetricArgs) {
    this.observability?.incrementMetric(OPERATIONAL_TIMELINE_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_timeline',
      reason: 'build_failed',
      result: 'failed',
    })
  }
}

export function createOperationalTimelineMetrics(observability?: ObservabilityService) {
  return new OperationalTimelineMetrics(observability)
}
