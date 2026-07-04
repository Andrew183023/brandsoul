import type { ObservabilityService } from '../../services/observabilityService.js'

export const LEGAL_SIGNALS_CREATED_TOTAL = 'signals_created_total'
export const LEGAL_SIGNALS_FAILED_TOTAL = 'signals_failed_total'

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
}

export function createLegalSignalsMetrics(observability?: ObservabilityService) {
  return new LegalSignalsMetrics(observability)
}
