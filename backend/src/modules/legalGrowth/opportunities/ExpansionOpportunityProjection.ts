import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthOpportunity } from '../GrowthTypes.js'

export type ExpansionOpportunityProjection = GrowthOpportunity

export type ExpansionOpportunityEngineResult = {
  projections: ExpansionOpportunityProjection[]
  evidence: GrowthEvidence[]
}
