import type { ObservabilityService } from '../../services/observabilityService.js'

export const GROWTH_SNAPSHOT_BUILD_MS = 'growth_snapshot_build_ms'
export const GROWTH_SCORE_BUILD_MS = 'growth_score_build_ms'
export const DEMAND_PROJECTION_MS = 'demand_projection_ms'
export const TERRITORY_PROJECTION_MS = 'territory_projection_ms'
export const COVERAGE_PROJECTION_MS = 'coverage_projection_ms'
export const CAPACITY_PROJECTION_MS = 'capacity_projection_ms'
export const RECOMMENDATION_BUILD_MS = 'recommendation_build_ms'
export const LANDING_INTELLIGENCE_BUILD_MS = 'landing_intelligence_build_ms'
export const GROWTH_SUMMARY_BUILD_MS = 'growth_summary_build_ms'
export const GROWTH_DASHBOARD_TOTAL_MS = 'growth_dashboard_total_ms'
export const OPPORTUNITIES_GENERATED_TOTAL = 'opportunities_generated_total'
export const GROWTH_DASHBOARD_REQUESTS_TOTAL = 'growth_dashboard_requests_total'

type GrowthMetricArgs = {
  tenantId: number
  officeId: string
}

export class GrowthMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordSnapshotBuildTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(GROWTH_SNAPSHOT_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordGrowthScoreBuildTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(GROWTH_SCORE_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordDemandProjectionTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(DEMAND_PROJECTION_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordTerritoryProjectionTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(TERRITORY_PROJECTION_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordCoverageProjectionTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(COVERAGE_PROJECTION_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordCapacityProjectionTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(CAPACITY_PROJECTION_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordRecommendationBuildTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(RECOMMENDATION_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordLandingIntelligenceBuildTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(LANDING_INTELLIGENCE_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordGrowthSummaryBuildTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(GROWTH_SUMMARY_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordGrowthDashboardTotalTiming(args: GrowthMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(GROWTH_DASHBOARD_TOTAL_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: args.result ?? 'success',
    })
  }

  recordOpportunitiesGenerated(args: GrowthMetricArgs & { count: number }) {
    this.observability?.incrementMetric(OPPORTUNITIES_GENERATED_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: 'success',
    })
  }

  recordDashboardRequest(args: GrowthMetricArgs) {
    this.observability?.incrementMetric(GROWTH_DASHBOARD_REQUESTS_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.officeId,
      source: 'legal_growth',
      result: 'success',
    })
  }
}

export function createGrowthMetrics(observability?: ObservabilityService) {
  return new GrowthMetrics(observability)
}
