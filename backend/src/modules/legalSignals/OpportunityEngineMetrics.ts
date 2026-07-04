import type { ObservabilityService } from '../../services/observabilityService.js'

export const OPPORTUNITY_PROJECTION_TOTAL = 'opportunity_projection_total'
export const OPPORTUNITY_PROJECTION_BUILD_MS = 'opportunity_projection_build_ms'
export const OPPORTUNITY_PROJECTION_FAILED_TOTAL = 'opportunity_projection_failed_total'

type OpportunityEngineMetricArgs = {
  tenantId: number
  entityId: string
}

export class OpportunityEngineMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordProjectionBuilt(args: OpportunityEngineMetricArgs & { count: number }) {
    this.observability?.incrementMetric(OPPORTUNITY_PROJECTION_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'opportunity_engine',
      result: 'success',
    })
  }

  recordProjectionBuildTiming(args: OpportunityEngineMetricArgs & { durationMs: number }) {
    this.observability?.recordTiming(OPPORTUNITY_PROJECTION_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'opportunity_engine',
      result: 'success',
    })
  }

  recordProjectionBuildFailed(args: OpportunityEngineMetricArgs) {
    this.observability?.incrementMetric(OPPORTUNITY_PROJECTION_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'opportunity_engine',
      reason: 'build_failed',
      result: 'failed',
    })
  }
}

export function createOpportunityEngineMetrics(observability?: ObservabilityService) {
  return new OpportunityEngineMetrics(observability)
}
