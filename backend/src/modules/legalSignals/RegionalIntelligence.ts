import type {
  OperationalSnapshot,
  OperationalSnapshotCaseInput,
  OperationalSnapshotDistribution,
} from './OperationalSnapshot.js'

export type RegionalProjection = {
  tenantId: number
  entityId: string
  city: string
  totalCases: number
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  slaWarningCases: number
  slaBreachedCases: number
  practiceAreas: OperationalSnapshotDistribution
  generatedAt: string
}

export type RegionalIntelligenceBuildInput = {
  snapshot: OperationalSnapshot
  cases: OperationalSnapshotCaseInput[]
}
