import type { CasePriority, CaseRecord } from '../legalCases/caseTypes.js'

import {
  buildOperationalSnapshot,
} from './OperationalSnapshotBuilder.js'
import type {
  OperationalSnapshotCaseInput,
  OperationalSnapshotCaseStatus,
} from './OperationalSnapshot.js'
import {
  buildRegionalProjections,
} from './RegionalIntelligenceBuilder.js'
import {
  buildSpecialtyProjections,
} from './SpecialtyIntelligenceBuilder.js'
import {
  buildProfessionalWorkloadProjections,
} from './WorkloadEngineBuilder.js'
import type {
  ProfessionalWorkloadCaseInput,
  WorkloadCasePriority,
} from './WorkloadEngine.js'
import {
  buildOperationalOpportunities,
} from './OpportunityEngineBuilder.js'

function mapCaseStatus(status: CaseRecord['status']): OperationalSnapshotCaseStatus | null {
  switch (status) {
    case 'open':
    case 'pending':
    case 'accepted':
    case 'in_progress':
    case 'on_hold':
    case 'resolved':
    case 'closed':
      return status
    case 'dispatched':
      return 'assigned'
    case 'archived':
      return null
    default:
      return null
  }
}

function mapPriority(priority: CasePriority): WorkloadCasePriority | undefined {
  switch (priority) {
    case 'urgent':
      return 'critical'
    case 'high':
      return 'high'
    case 'normal':
      return 'normal'
    case 'low':
      return 'low'
    default:
      return undefined
  }
}

function resolveResolutionHours(legalCase: CaseRecord) {
  if (!legalCase.closedAt) {
    return undefined
  }

  const openedAtMs = Date.parse(legalCase.openedAt)
  const closedAtMs = Date.parse(legalCase.closedAt)
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs) || closedAtMs < openedAtMs) {
    return undefined
  }

  return (closedAtMs - openedAtMs) / (1000 * 60 * 60)
}

function mapCaseRecordToOperationalSnapshotCaseInput(legalCase: CaseRecord): OperationalSnapshotCaseInput | null {
  const mappedStatus = mapCaseStatus(legalCase.status)
  if (!mappedStatus) {
    return null
  }

  return {
    caseId: legalCase.id,
    status: mappedStatus,
    assignedProfessionalId: legalCase.leadProfessionalId ?? undefined,
    practiceArea: legalCase.practiceArea ?? undefined,
    city: legalCase.clientCanonicalCity ?? legalCase.clientDisplayCity ?? undefined,
    resolutionHours: resolveResolutionHours(legalCase),
    firstResponseMinutes: undefined,
    slaStatus: undefined,
  }
}

function mapCaseRecordToProfessionalWorkloadCaseInput(legalCase: CaseRecord): ProfessionalWorkloadCaseInput | null {
  const snapshotCase = mapCaseRecordToOperationalSnapshotCaseInput(legalCase)
  if (!snapshotCase) {
    return null
  }

  return {
    ...snapshotCase,
    priority: mapPriority(legalCase.priority),
    severity: undefined,
    waitingFor: undefined,
  }
}

export type OperationalIntelligenceResponse = {
  status: 'ready'
  officeId: string
  tenantId: number
  generatedAt: string
  snapshot: ReturnType<typeof buildOperationalSnapshot>
  signals: []
  timeline: []
  regional: ReturnType<typeof buildRegionalProjections>
  specialties: ReturnType<typeof buildSpecialtyProjections>
  workload: ReturnType<typeof buildProfessionalWorkloadProjections>
  opportunities: ReturnType<typeof buildOperationalOpportunities>
  compatibility: {
    firstResponseMinutesDerived: false
    slaStatusDerived: false
    waitingForDerived: false
    archivedCasesExcluded: true
  }
}

export function buildOperationalIntelligenceResponse(args: {
  tenantId: number
  officeId: string
  cases: CaseRecord[]
  generatedAt?: string
}): OperationalIntelligenceResponse {
  const generatedAt = args.generatedAt ?? new Date().toISOString()
  const snapshotCases = args.cases
    .map(mapCaseRecordToOperationalSnapshotCaseInput)
    .filter((legalCase): legalCase is OperationalSnapshotCaseInput => legalCase !== null)
  const workloadCases = args.cases
    .map(mapCaseRecordToProfessionalWorkloadCaseInput)
    .filter((legalCase): legalCase is ProfessionalWorkloadCaseInput => legalCase !== null)

  const snapshot = buildOperationalSnapshot({
    tenantId: args.tenantId,
    entityId: args.officeId,
    builtAt: generatedAt,
    cases: snapshotCases,
  })

  const regional = buildRegionalProjections({
    snapshot,
    cases: snapshotCases,
  })

  const specialties = buildSpecialtyProjections({
    snapshot,
    cases: snapshotCases,
  })

  const workload = buildProfessionalWorkloadProjections({
    snapshot,
    cases: workloadCases,
  })

  const opportunities = buildOperationalOpportunities({
    snapshot,
    regional,
    specialties,
    workloads: workload,
  })

  return {
    status: 'ready',
    officeId: args.officeId,
    tenantId: args.tenantId,
    generatedAt,
    snapshot,
    signals: [],
    timeline: [],
    regional,
    specialties,
    workload,
    opportunities,
    compatibility: {
      firstResponseMinutesDerived: false,
      slaStatusDerived: false,
      waitingForDerived: false,
      archivedCasesExcluded: true,
    },
  }
}
