import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthScoreProjection as BaseGrowthScoreProjection } from '../GrowthTypes.js'

export type GrowthScoreProjection = BaseGrowthScoreProjection

export type GrowthScoreEngineResult = {
  projections: GrowthScoreProjection[]
  evidence: GrowthEvidence[]
}
