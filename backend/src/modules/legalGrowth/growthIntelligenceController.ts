import type { ObservabilityService } from '../../services/observabilityService.js'
import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { CaseRecord } from '../legalCases/caseTypes.js'

import {
  createGrowthIntelligenceService,
  type GrowthIntelligenceResponse,
} from './growthIntelligenceService.js'

type OfficeProfessionalRecord = {
  id: string
  officeId?: string
  city?: string
  status: 'active' | 'inactive' | 'suspended'
  specialties: string[]
}

export function buildGrowthIntelligenceResponse(args: {
  tenantId: number
  officeId: string
  cases: CaseRecord[]
  professionals: OfficeProfessionalRecord[]
  entityProfile?: EntityProfileDocument | null
  generatedAt?: string
  observability?: ObservabilityService
}): GrowthIntelligenceResponse {
  return createGrowthIntelligenceService({
    observability: args.observability,
  }).build(args)
}
