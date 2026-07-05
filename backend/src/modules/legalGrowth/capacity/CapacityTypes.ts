import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type { CaseRecord } from '../../legalCases/caseTypes.js'
import type { GrowthProfessionalContext } from '../GrowthContext.js'
import type { GrowthDemandProjection, GrowthPeriod, GrowthCoverageProjection } from '../GrowthTypes.js'

export type CapacityRecommendation =
  | 'pode_crescer'
  | 'manter'
  | 'reduzir_demanda'
  | 'contratar'
  | 'sem_dados_suficientes'

export type CapacityEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  cases?: CaseRecord[]
  professionals?: GrowthProfessionalContext[]
  demand: GrowthDemandProjection
  coverage: GrowthCoverageProjection[]
  entityProfile?: EntityProfileDocument | null
}

export type CapacityCaseCounters = {
  workloadCount: number
  backlogCount: number
  openCasesCount: number
  closedCasesCount: number
  totalResolutionHours: number
  resolutionSamples: number
}
