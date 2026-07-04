import type {
  OperationalSnapshot,
  OperationalSnapshotDistribution,
  OperationalSnapshotCaseInput,
} from './OperationalSnapshot.js'

export type WorkloadCasePriority = 'low' | 'normal' | 'high' | 'critical'
export type WorkloadCaseSeverity = 'info' | 'warning' | 'critical'
export type WorkloadWaitingFor = 'client' | 'professional' | 'office' | 'system'
export type WorkloadLevel = 'idle' | 'normal' | 'high' | 'overloaded'

export type ProfessionalWorkloadCaseInput = OperationalSnapshotCaseInput & {
  priority?: WorkloadCasePriority | null
  severity?: WorkloadCaseSeverity | null
  waitingFor?: WorkloadWaitingFor | null
}

export type ProfessionalWorkloadProjection = {
  tenantId: number
  entityId: string
  professionalId: string
  activeCases: number
  totalCases: number
  closedCases: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  averageSlaRiskScore: number | null
  criticalCases: number
  delayedCases: number
  waitingResponseCases: number
  slaWarningCases: number
  slaBreachedCases: number
  practiceAreas: OperationalSnapshotDistribution
  cities: OperationalSnapshotDistribution
  workloadLevel: WorkloadLevel
  generatedAt: string
}

export type WorkloadEngineBuildInput = {
  snapshot: OperationalSnapshot
  cases: ProfessionalWorkloadCaseInput[]
}
