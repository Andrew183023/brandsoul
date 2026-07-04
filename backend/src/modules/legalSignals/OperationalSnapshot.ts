export type OperationalSnapshotCaseStatus =
  | 'open'
  | 'accepted'
  | 'assigned'
  | 'pending'
  | 'in_progress'
  | 'waiting'
  | 'on_hold'
  | 'resolved'
  | 'closed'

export type OperationalSnapshotSlaStatus = 'ok' | 'warning' | 'breach'

export type OperationalSnapshotCaseInput = {
  caseId: string
  status: OperationalSnapshotCaseStatus
  assignedProfessionalId?: string | null
  practiceArea?: string | null
  city?: string | null
  resolutionHours?: number | null
  firstResponseMinutes?: number | null
  slaStatus?: OperationalSnapshotSlaStatus | null
}

export type OperationalSnapshotBuildInput = {
  tenantId: number
  entityId: string
  builtAt: string
  cases: OperationalSnapshotCaseInput[]
}

export type OperationalSnapshotDistribution = Record<string, number>

export type OperationalSnapshot = {
  tenantId: number
  entityId: string
  builtAt: string
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  slaWarningCases: number
  slaBreachedCases: number
  casesPerProfessional: OperationalSnapshotDistribution
  casesPerPracticeArea: OperationalSnapshotDistribution
  casesPerCity: OperationalSnapshotDistribution
}
