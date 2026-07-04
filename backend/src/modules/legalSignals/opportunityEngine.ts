import type { OperationalSnapshot } from './OperationalSnapshot.js'
import type { RegionalProjection } from './RegionalIntelligence.js'
import type { SpecialtyProjection } from './SpecialtyIntelligence.js'
import type { ProfessionalWorkloadProjection } from './WorkloadEngine.js'

export type OperationalOpportunityType =
  | 'CITY_GROWTH'
  | 'SPECIALTY_GROWTH'
  | 'HIGH_BACKLOG'
  | 'PROFESSIONAL_OVERLOAD'
  | 'LOW_COVERAGE'
  | 'HIGH_SLA_RISK'
  | 'HIGH_DEMAND'
  | 'CAPACITY_IMBALANCE'

export type OperationalOpportunitySeverity = 'low' | 'medium' | 'high' | 'critical'

export type OperationalOpportunityAffectedEntity =
  | { kind: 'office'; id: string }
  | { kind: 'city'; id: string }
  | { kind: 'practice_area'; id: string }
  | { kind: 'professional'; id: string }

export type OperationalOpportunityEvidence = Record<string, unknown>

export type OperationalOpportunity = {
  id: string
  tenantId: number
  entityId: string
  type: OperationalOpportunityType
  severity: OperationalOpportunitySeverity
  title: string
  description: string
  affectedEntity: OperationalOpportunityAffectedEntity
  evidence: OperationalOpportunityEvidence
  score: number
  generatedAt: string
}

export type OpportunityEngineThresholds = {
  cityGrowthBacklog: number
  specialtyGrowthBacklog: number
  officeBacklog: number
  highDemandTotalCases: number
  capacityImbalanceActiveCases: number
}

export type OpportunityEngineBuildInput = {
  snapshot: OperationalSnapshot
  regional: RegionalProjection[]
  specialties: SpecialtyProjection[]
  workloads: ProfessionalWorkloadProjection[]
  thresholds?: Partial<OpportunityEngineThresholds>
}
