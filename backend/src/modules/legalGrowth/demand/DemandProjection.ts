import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthDemandProjection } from '../GrowthTypes.js'

export type DemandProjection = GrowthDemandProjection
export type DemandProjectionItem = GrowthDemandProjection['items'][number]

export type DemandEngineResult = {
  projection: DemandProjection
  evidence: GrowthEvidence[]
}
