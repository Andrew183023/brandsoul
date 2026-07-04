import type { ObservabilityService } from '../../services/observabilityService.js'

export const WORKLOAD_PROJECTION_TOTAL = 'workload_projection_total'
export const WORKLOAD_PROJECTION_BUILD_MS = 'workload_projection_build_ms'
export const WORKLOAD_PROJECTION_FAILED_TOTAL = 'workload_projection_failed_total'

type WorkloadEngineMetricArgs = {
  tenantId: number
  entityId: string
}

export class WorkloadEngineMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordProjectionBuilt(args: WorkloadEngineMetricArgs & { count: number }) {
    this.observability?.incrementMetric(WORKLOAD_PROJECTION_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'workload_engine',
      result: 'success',
    })
  }

  recordProjectionBuildTiming(args: WorkloadEngineMetricArgs & { durationMs: number }) {
    this.observability?.recordTiming(WORKLOAD_PROJECTION_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'workload_engine',
      result: 'success',
    })
  }

  recordProjectionBuildFailed(args: WorkloadEngineMetricArgs) {
    this.observability?.incrementMetric(WORKLOAD_PROJECTION_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'workload_engine',
      reason: 'build_failed',
      result: 'failed',
    })
  }
}

export function createWorkloadEngineMetrics(observability?: ObservabilityService) {
  return new WorkloadEngineMetrics(observability)
}
