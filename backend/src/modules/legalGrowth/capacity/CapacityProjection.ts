import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthCapacityProjection } from '../GrowthTypes.js'

export type CapacityProjection = GrowthCapacityProjection

export type CapacityEngineResult = {
  projections: CapacityProjection[]
  evidence: GrowthEvidence[]
}
