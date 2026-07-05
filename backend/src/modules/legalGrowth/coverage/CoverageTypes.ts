import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type { GrowthProfessionalContext } from '../GrowthContext.js'
import type { GrowthCoverageGapType, GrowthCoverageStatus, GrowthPeriod, GrowthCapacityStatus } from '../GrowthTypes.js'
import type { DemandProjection } from '../demand/DemandProjection.js'
import type { TerritoryProjection } from '../territory/TerritoryProjection.js'

export type CoverageEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  demand: DemandProjection
  territories: TerritoryProjection[]
  professionals?: GrowthProfessionalContext[]
  entityProfile?: EntityProfileDocument | null
}

export type CoverageGapType = GrowthCoverageGapType

export type CoverageCompatibility = {
  professionalsCount: number
  activeProfessionalsCount: number
  compatibleProfessionalsCount: number
  hasCityMatch: boolean
  hasSpecialtyMatch: boolean
}

export type CoverageEvaluation = {
  status: GrowthCoverageStatus
  capacityStatus: GrowthCapacityStatus
  capacityScore: number
  gapType: CoverageGapType
  compatibility: CoverageCompatibility
}
