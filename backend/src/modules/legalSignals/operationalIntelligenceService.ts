import type { ObservabilityService } from '../../services/observabilityService.js'
import type { CasePriority, CaseRecord } from '../legalCases/caseTypes.js'

import { buildOperationalSnapshot } from './OperationalSnapshotBuilder.js'
import type {
  OperationalSnapshotCaseInput,
  OperationalSnapshotCaseStatus,
} from './OperationalSnapshot.js'
import { createOperationalSnapshotMetrics } from './OperationalSnapshotMetrics.js'
import { buildRegionalProjections } from './RegionalIntelligenceBuilder.js'
import { createRegionalIntelligenceMetrics } from './RegionalIntelligenceMetrics.js'
import { buildSpecialtyProjections } from './SpecialtyIntelligenceBuilder.js'
import { createSpecialtyIntelligenceMetrics } from './SpecialtyIntelligenceMetrics.js'
import { buildProfessionalWorkloadProjections } from './WorkloadEngineBuilder.js'
import type {
  ProfessionalWorkloadCaseInput,
  WorkloadCasePriority,
} from './WorkloadEngine.js'
import { createWorkloadEngineMetrics } from './WorkloadEngineMetrics.js'
import { buildOperationalOpportunities } from './OpportunityEngineBuilder.js'
import { createOpportunityEngineMetrics } from './OpportunityEngineMetrics.js'
import { createOperationalTimelineMetrics } from './OperationalTimelineMetrics.js'
import {
  createLegalSignalsMetrics,
  createOperationalIntelligenceDashboardMetrics,
} from './legalSignals.metrics.js'

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

type EmptySignalsProvider = (args: {
  tenantId: number
  officeId: string
  cases: CaseRecord[]
}) => []

type EmptyTimelineProvider = (args: {
  tenantId: number
  officeId: string
  cases: CaseRecord[]
}) => []

type OperationalIntelligenceServiceOptions = {
  observability?: ObservabilityService
  buildSignals?: EmptySignalsProvider
  buildTimeline?: EmptyTimelineProvider
}

export class OperationalIntelligenceService {
  private readonly snapshotMetrics
  private readonly timelineMetrics
  private readonly regionalMetrics
  private readonly specialtyMetrics
  private readonly workloadMetrics
  private readonly opportunityMetrics
  private readonly signalsMetrics
  private readonly dashboardMetrics
  private readonly buildSignals: EmptySignalsProvider
  private readonly buildTimeline: EmptyTimelineProvider

  constructor(private readonly options: OperationalIntelligenceServiceOptions = {}) {
    this.snapshotMetrics = createOperationalSnapshotMetrics(options.observability)
    this.timelineMetrics = createOperationalTimelineMetrics(options.observability)
    this.regionalMetrics = createRegionalIntelligenceMetrics(options.observability)
    this.specialtyMetrics = createSpecialtyIntelligenceMetrics(options.observability)
    this.workloadMetrics = createWorkloadEngineMetrics(options.observability)
    this.opportunityMetrics = createOpportunityEngineMetrics(options.observability)
    this.signalsMetrics = createLegalSignalsMetrics(options.observability)
    this.dashboardMetrics = createOperationalIntelligenceDashboardMetrics(options.observability)
    this.buildSignals = options.buildSignals ?? (() => [])
    this.buildTimeline = options.buildTimeline ?? (() => [])
  }

  build(args: {
    tenantId: number
    officeId: string
    cases: CaseRecord[]
    generatedAt?: string
  }): OperationalIntelligenceResponse {
    const generatedAt = args.generatedAt ?? new Date().toISOString()
    const dashboardStartedAt = Date.now()
    let currentStage:
      | 'snapshot'
      | 'signals'
      | 'timeline'
      | 'regional'
      | 'specialty'
      | 'workload'
      | 'opportunity'
      | null = null
    let stageStartedAt = dashboardStartedAt
    const snapshotCases = args.cases
      .map(mapCaseRecordToOperationalSnapshotCaseInput)
      .filter((legalCase): legalCase is OperationalSnapshotCaseInput => legalCase !== null)
    const workloadCases = args.cases
      .map(mapCaseRecordToProfessionalWorkloadCaseInput)
      .filter((legalCase): legalCase is ProfessionalWorkloadCaseInput => legalCase !== null)

    try {
      currentStage = 'snapshot'
      stageStartedAt = Date.now()
      const snapshot = buildOperationalSnapshot({
        tenantId: args.tenantId,
        entityId: args.officeId,
        builtAt: generatedAt,
        cases: snapshotCases,
      })
      this.snapshotMetrics.recordBuild({ tenantId: args.tenantId, entityId: args.officeId })
      this.snapshotMetrics.recordBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
      })

      currentStage = 'signals'
      stageStartedAt = Date.now()
      const signals = this.buildSignals({
        tenantId: args.tenantId,
        officeId: args.officeId,
        cases: args.cases,
      })
      this.signalsMetrics.recordSignalsBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
        count: signals.length,
        source: 'operational_intelligence_dashboard',
      })
      this.signalsMetrics.recordSignalsBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
        source: 'operational_intelligence_dashboard',
      })

      currentStage = 'timeline'
      stageStartedAt = Date.now()
      const timeline = this.buildTimeline({
        tenantId: args.tenantId,
        officeId: args.officeId,
        cases: args.cases,
      })
      this.timelineMetrics.recordEntriesBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
        count: timeline.length,
      })
      this.timelineMetrics.recordBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
      })

      currentStage = 'regional'
      stageStartedAt = Date.now()
      const regional = buildRegionalProjections({
        snapshot,
        cases: snapshotCases,
      })
      this.regionalMetrics.recordProjectionBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
        count: regional.length,
      })
      this.regionalMetrics.recordProjectionBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
      })

      currentStage = 'specialty'
      stageStartedAt = Date.now()
      const specialties = buildSpecialtyProjections({
        snapshot,
        cases: snapshotCases,
      })
      this.specialtyMetrics.recordProjectionBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
        count: specialties.length,
      })
      this.specialtyMetrics.recordProjectionBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
      })

      currentStage = 'workload'
      stageStartedAt = Date.now()
      const workload = buildProfessionalWorkloadProjections({
        snapshot,
        cases: workloadCases,
      })
      this.workloadMetrics.recordProjectionBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
        count: workload.length,
      })
      this.workloadMetrics.recordProjectionBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
      })

      currentStage = 'opportunity'
      stageStartedAt = Date.now()
      const opportunities = buildOperationalOpportunities({
        snapshot,
        regional,
        specialties,
        workloads: workload,
      })
      this.opportunityMetrics.recordProjectionBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
        count: opportunities.length,
      })
      this.opportunityMetrics.recordProjectionBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - stageStartedAt,
      })

      currentStage = null
      this.dashboardMetrics.recordDashboardBuilt({
        tenantId: args.tenantId,
        entityId: args.officeId,
      })
      this.dashboardMetrics.recordDashboardBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - dashboardStartedAt,
      })

      return {
        status: 'ready',
        officeId: args.officeId,
        tenantId: args.tenantId,
        generatedAt,
        snapshot,
        signals,
        timeline,
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
    } catch (error) {
      const stageDurationMs = Date.now() - stageStartedAt
      switch (currentStage) {
        case 'snapshot':
          this.snapshotMetrics.recordBuildFailed({ tenantId: args.tenantId, entityId: args.officeId })
          this.snapshotMetrics.recordBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            result: 'failed',
          })
          break
        case 'signals':
          this.signalsMetrics.recordSignalsBuildFailed({
            tenantId: args.tenantId,
            entityId: args.officeId,
            source: 'operational_intelligence_dashboard',
            reason: 'build_failed',
          })
          this.signalsMetrics.recordSignalsBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            source: 'operational_intelligence_dashboard',
            result: 'failed',
          })
          break
        case 'timeline':
          this.timelineMetrics.recordBuildFailed({ tenantId: args.tenantId, entityId: args.officeId })
          this.timelineMetrics.recordBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            result: 'failed',
          })
          break
        case 'regional':
          this.regionalMetrics.recordProjectionBuildFailed({ tenantId: args.tenantId, entityId: args.officeId })
          this.regionalMetrics.recordProjectionBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            result: 'failed',
          })
          break
        case 'specialty':
          this.specialtyMetrics.recordProjectionBuildFailed({ tenantId: args.tenantId, entityId: args.officeId })
          this.specialtyMetrics.recordProjectionBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            result: 'failed',
          })
          break
        case 'workload':
          this.workloadMetrics.recordProjectionBuildFailed({ tenantId: args.tenantId, entityId: args.officeId })
          this.workloadMetrics.recordProjectionBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            result: 'failed',
          })
          break
        case 'opportunity':
          this.opportunityMetrics.recordProjectionBuildFailed({ tenantId: args.tenantId, entityId: args.officeId })
          this.opportunityMetrics.recordProjectionBuildTiming({
            tenantId: args.tenantId,
            entityId: args.officeId,
            durationMs: stageDurationMs,
            result: 'failed',
          })
          break
        default:
          break
      }
      this.dashboardMetrics.recordDashboardBuildFailed({
        tenantId: args.tenantId,
        entityId: args.officeId,
      })
      this.dashboardMetrics.recordDashboardBuildTiming({
        tenantId: args.tenantId,
        entityId: args.officeId,
        durationMs: Date.now() - dashboardStartedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createOperationalIntelligenceService(options?: OperationalIntelligenceServiceOptions) {
  return new OperationalIntelligenceService(options)
}
