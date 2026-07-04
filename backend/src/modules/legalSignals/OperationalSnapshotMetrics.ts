import type { ObservabilityService } from '../../services/observabilityService.js'

export const SNAPSHOT_BUILD_MS = 'snapshot_build_ms'
export const SNAPSHOT_BUILD_TOTAL = 'snapshot_build_total'
export const SNAPSHOT_BUILD_FAILED_TOTAL = 'snapshot_build_failed_total'

type OperationalSnapshotMetricArgs = {
  tenantId: number
  entityId: string
}

export class OperationalSnapshotMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordBuild(args: OperationalSnapshotMetricArgs) {
    this.observability?.incrementMetric(SNAPSHOT_BUILD_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_snapshot',
      result: 'success',
    })
  }

  recordBuildFailed(args: OperationalSnapshotMetricArgs) {
    this.observability?.incrementMetric(SNAPSHOT_BUILD_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_snapshot',
      reason: 'build_failed',
      result: 'failed',
    })
  }

  recordBuildTiming(args: OperationalSnapshotMetricArgs & { durationMs: number }) {
    this.observability?.recordTiming(SNAPSHOT_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_snapshot',
      result: 'success',
    })
  }
}

export function createOperationalSnapshotMetrics(observability?: ObservabilityService) {
  return new OperationalSnapshotMetrics(observability)
}
