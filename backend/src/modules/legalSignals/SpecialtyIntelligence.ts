import type {
  OperationalSnapshot,
  OperationalSnapshotCaseInput,
  OperationalSnapshotDistribution,
} from './OperationalSnapshot.js'

export type SpecialtyProjection = {
  tenantId: number
  entityId: string
  practiceArea: string
  totalCases: number
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  slaWarningCases: number
  slaBreachedCases: number
  cities: OperationalSnapshotDistribution
  generatedAt: string
  revenuePotentialPrepared: null
}

export type SpecialtyIntelligenceBuildInput = {
  snapshot: OperationalSnapshot
  cases: OperationalSnapshotCaseInput[]
}
