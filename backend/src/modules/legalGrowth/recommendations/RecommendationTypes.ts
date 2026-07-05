import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type {
  GrowthCapacityProjection,
  GrowthCoverageProjection,
  GrowthDemandProjection,
  GrowthPeriod,
  GrowthRecommendationType,
  GrowthScoreProjection,
  GrowthTerritoryProjection,
} from '../GrowthTypes.js'

export type RecommendationEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  scores: GrowthScoreProjection[]
  demand: GrowthDemandProjection
  territories: GrowthTerritoryProjection[]
  coverage: GrowthCoverageProjection[]
  capacity: GrowthCapacityProjection[]
  entityProfile?: EntityProfileDocument | null
}

export type RecommendationDecision = {
  type: GrowthRecommendationType
  title: string
  description: string
  expectedImpact: string
}
