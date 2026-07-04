import type { ObservabilityService } from '../../services/observabilityService.js'

export const SPECIALTY_PROJECTION_TOTAL = 'specialty_projection_total'
export const SPECIALTY_PROJECTION_BUILD_MS = 'specialty_projection_build_ms'
export const SPECIALTY_PROJECTION_FAILED_TOTAL = 'specialty_projection_failed_total'

type SpecialtyIntelligenceMetricArgs = {
  tenantId: number
  entityId: string
}

export class SpecialtyIntelligenceMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordProjectionBuilt(args: SpecialtyIntelligenceMetricArgs & { count: number }) {
    this.observability?.incrementMetric(SPECIALTY_PROJECTION_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'specialty_intelligence',
      result: 'success',
    })
  }

  recordProjectionBuildTiming(args: SpecialtyIntelligenceMetricArgs & { durationMs: number }) {
    this.observability?.recordTiming(SPECIALTY_PROJECTION_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'specialty_intelligence',
      result: 'success',
    })
  }

  recordProjectionBuildFailed(args: SpecialtyIntelligenceMetricArgs) {
    this.observability?.incrementMetric(SPECIALTY_PROJECTION_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'specialty_intelligence',
      reason: 'build_failed',
      result: 'failed',
    })
  }
}

export function createSpecialtyIntelligenceMetrics(observability?: ObservabilityService) {
  return new SpecialtyIntelligenceMetrics(observability)
}
