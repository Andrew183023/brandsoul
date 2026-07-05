import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type {
  GrowthCapacityProjection,
  GrowthCoverageProjection,
  GrowthDemandProjection,
  GrowthPeriod,
  GrowthPriority,
  GrowthTerritoryProjection,
} from '../GrowthTypes.js'

export type GrowthScoreEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  demand: GrowthDemandProjection
  territories: GrowthTerritoryProjection[]
  coverage: GrowthCoverageProjection[]
  capacity: GrowthCapacityProjection[]
  entityProfile?: EntityProfileDocument | null
}

export type GrowthScoreComponentSet = {
  demandScore: number
  coverageScore: number
  capacityScore: number
  slaScore: number
  trendScore: number
}

export type GrowthScorePriority = GrowthPriority
