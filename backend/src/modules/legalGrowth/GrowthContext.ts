import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { CaseRecord } from '../legalCases/caseTypes.js'
import type { GrowthPeriod } from './GrowthTypes.js'

export type GrowthProfessionalContext = {
  id: string
  officeId?: string
  city?: string
  specialties?: string[]
  status?: 'active' | 'inactive' | 'suspended'
}

export type GrowthContext = {
  officeId: string
  tenantId: number
  now: string | Date
  period: GrowthPeriod
  cases?: CaseRecord[]
  professionals?: GrowthProfessionalContext[]
  entityProfile?: EntityProfileDocument | null
}
