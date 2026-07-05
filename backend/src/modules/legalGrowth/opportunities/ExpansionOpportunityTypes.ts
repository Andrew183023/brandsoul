import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type {
  GrowthOpportunityType,
  GrowthPeriod,
  GrowthRecommendation,
  GrowthScoreProjection,
} from '../GrowthTypes.js'

export type ExpansionOpportunityEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  scores: GrowthScoreProjection[]
  recommendations: GrowthRecommendation[]
  entityProfile?: EntityProfileDocument | null
}

export type ExpansionOpportunityDecision = {
  type: GrowthOpportunityType
  expectedImpact: string
  justification: string
  requiredActions: string[]
}
