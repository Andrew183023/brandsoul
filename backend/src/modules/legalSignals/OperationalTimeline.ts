import type {
  LegalOperationalSignal,
  LegalSignalPayload,
  LegalSignalSeverity,
  LegalSignalSource,
  LegalSignalType,
} from './signalTypes.js'

export type OperationalTimelineEventType = LegalSignalSource

export type OperationalTimelineEntry = {
  id: string
  occurredAt: string
  eventType: OperationalTimelineEventType
  signalType: LegalSignalType
  title: string
  description: string
  severity: LegalSignalSeverity
  metadata: {
    tenantId: number
    entityId: string
    caseId?: string | null
    source: LegalSignalSource
    payload: LegalSignalPayload
  }
}

export type OperationalTimelineBuildInput = {
  tenantId: number
  entityId: string
  signals: LegalOperationalSignal[]
}
