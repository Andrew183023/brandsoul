import type { GrowthEvidence } from './GrowthEvidence.js'
import type { LandingIntelligenceProjection } from './landing/LandingIntelligenceTypes.js'
import type { DemandProjection } from './demand/DemandProjection.js'
import type {
  GrowthCapacityProjection,
  GrowthCoverageProjection,
  GrowthOpportunity,
  GrowthPeriod,
  GrowthRecommendation,
  GrowthScoreProjection,
  GrowthTerritoryProjection,
} from './GrowthTypes.js'

export type GrowthSnapshot = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  generatedAt: string
  demand: DemandProjection
  territories: GrowthTerritoryProjection[]
  coverage: GrowthCoverageProjection[]
  capacity: GrowthCapacityProjection[]
  scores: GrowthScoreProjection[]
  recommendations: GrowthRecommendation[]
  opportunities: GrowthOpportunity[]
  landingCandidates: LandingIntelligenceProjection[]
  metadata: {
    deterministic: true
    foundationVersion: 'g7.0'
    evidence: GrowthEvidence[]
  }
}
