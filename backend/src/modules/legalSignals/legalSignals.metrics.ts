import type { ObservabilityService } from '../../services/observabilityService.js'

export const LEGAL_SIGNALS_CREATED_TOTAL = 'signals_created_total'
export const LEGAL_SIGNALS_FAILED_TOTAL = 'signals_failed_total'
export const LEGAL_SIGNALS_BUILD_TOTAL = 'signals_build_total'
export const LEGAL_SIGNALS_BUILD_MS = 'signals_build_ms'
export const LEGAL_SIGNALS_BUILD_FAILED_TOTAL = 'signals_build_failed_total'
export const OPERATIONAL_INTELLIGENCE_DASHBOARD_BUILD_TOTAL = 'operational_intelligence_dashboard_build_total'
export const OPERATIONAL_INTELLIGENCE_DASHBOARD_BUILD_MS = 'operational_intelligence_dashboard_build_ms'
export const OPERATIONAL_INTELLIGENCE_DASHBOARD_BUILD_FAILED_TOTAL = 'operational_intelligence_dashboard_build_failed_total'

type LegalSignalsMetricArgs = {
  tenantId: number
  entityId: string
  source: string
  reason?: string
}

export class LegalSignalsMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordSignalsCreated(args: LegalSignalsMetricArgs) {
    this.observability?.incrementMetric(LEGAL_SIGNALS_CREATED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: args.source,
      result: 'success',
    })
  }

  recordSignalsFailed(args: LegalSignalsMetricArgs) {
    this.observability?.incrementMetric(LEGAL_SIGNALS_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: args.source,
      reason: args.reason ?? 'unknown',
      result: 'failed',
    })
  }

  recordSignalsBuilt(args: LegalSignalsMetricArgs & { count: number }) {
    this.observability?.incrementMetric(LEGAL_SIGNALS_BUILD_TOTAL, args.count, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: args.source,
      result: 'success',
    })
  }

  recordSignalsBuildTiming(args: LegalSignalsMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(LEGAL_SIGNALS_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: args.source,
      result: args.result ?? 'success',
    })
  }

  recordSignalsBuildFailed(args: LegalSignalsMetricArgs) {
    this.observability?.incrementMetric(LEGAL_SIGNALS_BUILD_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: args.source,
      reason: args.reason ?? 'build_failed',
      result: 'failed',
    })
  }
}

export function createLegalSignalsMetrics(observability?: ObservabilityService) {
  return new LegalSignalsMetrics(observability)
}

type OperationalIntelligenceDashboardMetricArgs = {
  tenantId: number
  entityId: string
}

export class OperationalIntelligenceDashboardMetrics {
  constructor(private readonly observability?: ObservabilityService) {}

  recordDashboardBuilt(args: OperationalIntelligenceDashboardMetricArgs) {
    this.observability?.incrementMetric(OPERATIONAL_INTELLIGENCE_DASHBOARD_BUILD_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_intelligence_dashboard',
      result: 'success',
    })
  }

  recordDashboardBuildTiming(args: OperationalIntelligenceDashboardMetricArgs & { durationMs: number; result?: 'success' | 'failed' }) {
    this.observability?.recordTiming(OPERATIONAL_INTELLIGENCE_DASHBOARD_BUILD_MS, args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_intelligence_dashboard',
      result: args.result ?? 'success',
    })
  }

  recordDashboardBuildFailed(args: OperationalIntelligenceDashboardMetricArgs) {
    this.observability?.incrementMetric(OPERATIONAL_INTELLIGENCE_DASHBOARD_BUILD_FAILED_TOTAL, 1, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId,
      source: 'operational_intelligence_dashboard',
      reason: 'build_failed',
      result: 'failed',
    })
  }
}

export function createOperationalIntelligenceDashboardMetrics(observability?: ObservabilityService) {
  return new OperationalIntelligenceDashboardMetrics(observability)
}
