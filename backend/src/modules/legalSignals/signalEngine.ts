import {
  buildCaseAssignedSignals,
  buildCaseClosedSignals,
  buildCaseCreatedSignals,
  buildCaseReassignedSignals,
  buildFirstProfessionalResponseSignals,
  type CaseAssignedSignalInput,
  type CaseClosedSignalInput,
  type CaseCreatedSignalInput,
  type CaseReassignedSignalInput,
  type FirstProfessionalResponseSignalInput,
} from './signalBuilders.js'
import type { LegalOperationalSignal } from './signalTypes.js'

export type LegalOperationalEventInput =
  | ({ eventType: 'case_created' } & CaseCreatedSignalInput)
  | ({ eventType: 'case_assigned' } & CaseAssignedSignalInput)
  | ({ eventType: 'case_reassigned' } & CaseReassignedSignalInput)
  | ({ eventType: 'case_closed' } & CaseClosedSignalInput)
  | ({ eventType: 'first_professional_response' } & FirstProfessionalResponseSignalInput)

export function buildOperationalSignals(event: LegalOperationalEventInput): LegalOperationalSignal[] {
  switch (event.eventType) {
    case 'case_created':
      return buildCaseCreatedSignals(event)
    case 'case_assigned':
      return buildCaseAssignedSignals(event)
    case 'case_reassigned':
      return buildCaseReassignedSignals(event)
    case 'case_closed':
      return buildCaseClosedSignals(event)
    case 'first_professional_response':
      return buildFirstProfessionalResponseSignals(event)
    default: {
      const exhaustiveCheck: never = event
      return exhaustiveCheck
    }
  }
}

export class LegalSignalsEngine {
  build(event: LegalOperationalEventInput) {
    return buildOperationalSignals(event)
  }
}

export function createLegalSignalsEngine() {
  return new LegalSignalsEngine()
}
