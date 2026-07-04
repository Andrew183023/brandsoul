export type LegalSignalType =
  | 'NEW_DEMAND'
  | 'NEW_CLIENT'
  | 'CASE_ASSIGNED'
  | 'CASE_REASSIGNED'
  | 'CASE_CLOSED'
  | 'FIRST_RESPONSE'
  | 'SLA_WARNING'
  | 'SLA_BREACH'
  | 'WORKLOAD_CHANGED'
  | 'BACKLOG_CHANGED'
  | 'REGIONAL_DEMAND'
  | 'SPECIALTY_DEMAND'

export type LegalSignalSeverity = 'info' | 'warning' | 'critical'

export type LegalSignalSource =
  | 'CASE_CREATED'
  | 'CASE_ASSIGNED'
  | 'CASE_REASSIGNED'
  | 'CASE_CLOSED'
  | 'FIRST_PROFESSIONAL_RESPONSE'

export type LegalSignalPayload = Record<string, unknown>

export type LegalOperationalSignal = {
  tenantId: number
  entityId: string
  caseId?: string | null
  signalType: LegalSignalType
  severity: LegalSignalSeverity
  source: LegalSignalSource
  occurredAt: string
  payload: LegalSignalPayload
}
