import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthRecommendation } from '../GrowthTypes.js'

export type RecommendationProjection = GrowthRecommendation

export type RecommendationEngineResult = {
  projections: RecommendationProjection[]
  evidence: GrowthEvidence[]
}
