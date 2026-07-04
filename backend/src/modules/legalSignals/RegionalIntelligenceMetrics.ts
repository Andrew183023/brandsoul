import type { ObservabilityService } from '../../services/observabilityService.js'

export const REGIONAL_PROJECTION_TOTAL = 'regional_projection_total'
export const REGIONAL_PROJECTION_BUILD_MS = 'regional_projection_build_ms'
export const REGIONAL_PROJECTION_FAILED_TOTAL = 'regional_projection_failed_total'

type RegionalIntelligenceMetricArgs = {
  tenantId: number
  entityId: string
}

export class RegionalIntelligenceMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordProjectionBuilt(args: RegionalIntelligenceMetricArgs & { count: number }) {
    this.observability?.incrementMetric(REGIONAL_PROJECTION_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'regional_intelligence',
      result: 'success',
    })
  }

  recordProjectionBuildTiming(args: RegionalIntelligenceMetricArgs & { durationMs: number }) {
    this.observability?.recordTiming(REGIONAL_PROJECTION_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'regional_intelligence',
      result: 'success',
    })
  }

  recordProjectionBuildFailed(args: RegionalIntelligenceMetricArgs) {
    this.observability?.incrementMetric(REGIONAL_PROJECTION_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'regional_intelligence',
      reason: 'build_failed',
      result: 'failed',
    })
  }
}

export function createRegionalIntelligenceMetrics(observability?: ObservabilityService) {
  return new RegionalIntelligenceMetrics(observability)
}
