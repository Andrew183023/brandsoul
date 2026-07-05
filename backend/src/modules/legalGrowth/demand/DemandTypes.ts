import type { GrowthContext } from '../GrowthContext.js'
import type {
  GrowthCityKey,
  GrowthOriginKey,
  GrowthPeriod,
  GrowthSpecialtyKey,
} from '../GrowthTypes.js'

export type DemandCaseOrigin = GrowthOriginKey

export type DemandAggregateKey = {
  officeId: string
  city: GrowthCityKey
  specialty: GrowthSpecialtyKey
  origin: DemandCaseOrigin
}

export type DemandAggregateBucket = DemandAggregateKey & {
  tenantId: number
  period: GrowthPeriod
  caseIds: string[]
  casesCount: number
  leadsCount: number
  backlogCount: number
  closedCasesCount: number
  resolutionHoursTotal: number
}

export type DemandEngineInput = Pick<GrowthContext, 'officeId' | 'tenantId' | 'period'> & {
  cases: NonNullable<GrowthContext['cases']>
}
