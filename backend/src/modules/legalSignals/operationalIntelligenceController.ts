import type { CaseRecord } from '../legalCases/caseTypes.js'
import {
  createOperationalIntelligenceService,
  type OperationalIntelligenceResponse,
} from './operationalIntelligenceService.js'

export function buildOperationalIntelligenceResponse(args: {
  tenantId: number
  officeId: string
  cases: CaseRecord[]
  generatedAt?: string
}): OperationalIntelligenceResponse {
  return createOperationalIntelligenceService().build(args)
}
