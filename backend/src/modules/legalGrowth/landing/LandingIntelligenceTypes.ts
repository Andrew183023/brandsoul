import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type {
  GrowthConfidence,
  GrowthPeriod,
  GrowthPriority,
  GrowthRecommendation,
  GrowthScoreProjection,
  GrowthScoreValue,
  GrowthSpecialtyKey,
  GrowthCityKey,
  GrowthOpportunity,
} from '../GrowthTypes.js'

export type LandingIntelligenceProjection = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  city?: GrowthCityKey
  specialty?: GrowthSpecialtyKey
  growthScore: GrowthScoreValue
  seoScore: GrowthScoreValue
  priority: GrowthPriority
  confidence: GrowthConfidence
  eligible: boolean
  reason: string
  evidenceIds: string[]
}

export type LandingIntelligenceEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  opportunities: GrowthOpportunity[]
  scores: GrowthScoreProjection[]
  recommendations: GrowthRecommendation[]
  entityProfile?: EntityProfileDocument | null
}
