import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthCoverageProjection } from '../GrowthTypes.js'

export type CoverageProjection = GrowthCoverageProjection

export type CoverageEngineResult = {
  projections: CoverageProjection[]
  evidence: GrowthEvidence[]
}
