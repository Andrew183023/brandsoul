import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthTerritoryProjection } from '../GrowthTypes.js'

export type TerritoryProjection = GrowthTerritoryProjection

export type TerritoryEngineResult = {
  projections: TerritoryProjection[]
  evidence: GrowthEvidence[]
}
