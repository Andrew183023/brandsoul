import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { LandingIntelligenceProjection } from './LandingIntelligenceTypes.js'

export type LandingIntelligenceEngineResult = {
  projections: LandingIntelligenceProjection[]
  evidence: GrowthEvidence[]
}

export type { LandingIntelligenceProjection }
