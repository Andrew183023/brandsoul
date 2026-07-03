import type { BackendDatabase } from '../../db/index.js'

import { createCaseRepository } from './caseRepository.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import type {
  CaseMessageDirection,
  CaseMessageType,
  CasePriority,
  CaseStatus,
  CaseTimelineEventRecord,
} from './caseTypes.js'

type RecordTimelineEventArgs = {
  tenantId: number
  caseId: string
  entityId?: string | null
  eventType: CaseTimelineEventRecord['eventType']
  actorProfessionalId?: string
  actorUserId?: number
  occurredAt?: string
  payload?: Record<string, unknown>
}

export class LegalCanonicalTimelineWriteService {
  constructor(
    private readonly db: BackendDatabase,
    private readonly recorder?: LegalMetricsRecorder,
  ) {}

  private get caseRepository() {
    return createCaseRepository(this.db)
  }

  private recordTimelineMetric(args: {
    tenantId: number
    entityId?: string | null
    eventType: CaseTimelineEventRecord['eventType']
    result: 'success' | 'failed'
    reason?: string
  }) {
    this.recorder?.increment(
      args.result === 'success'
        ? 'legal_timeline_events_total'
        : 'legal_timeline_write_failures_total',
      {
        tenant_id: String(args.tenantId),
        entity_id: args.entityId ?? 'unknown',
        event: args.eventType,
        result: args.result,
        ...(args.reason ? { reason: args.reason } : {}),
      },
    )
  }

  private async recordEvent(args: RecordTimelineEventArgs) {
    try {
      const event = await this.caseRepository.addTimelineEvent({
        tenantId: args.tenantId,
        caseId: args.caseId,
        eventType: args.eventType,
        actorProfessionalId: args.actorProfessionalId,
        actorUserId: args.actorUserId,
        occurredAt: args.occurredAt,
        payload: args.payload,
      })
      this.recordTimelineMetric({
        tenantId: args.tenantId,
        entityId: args.entityId,
        eventType: args.eventType,
        result: 'success',
      })
      return event
    } catch (error) {
      this.recordTimelineMetric({
        tenantId: args.tenantId,
        entityId: args.entityId,
        eventType: args.eventType,
        result: 'failed',
        reason: 'write_failed',
      })
      throw error
    }
  }

  async recordCaseCreated(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    status: CaseStatus
    priority: CasePriority
    source?: string
    requestId?: string
    leadId?: string
    intakeId?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'created',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        entityId: args.entityId ?? null,
        status: args.status,
        priority: args.priority,
        source: args.source,
        requestId: args.requestId,
        leadId: args.leadId,
        intakeId: args.intakeId,
      },
    })
  }

  async recordMessageAdded(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    messageId?: string
    sequenceNo?: number
    messageType?: CaseMessageType
    direction?: CaseMessageDirection
    source?: string
    requestId?: string
    leadId?: string
    intakeId?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'message_added',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        messageId: args.messageId,
        sequenceNo: args.sequenceNo,
        messageType: args.messageType,
        direction: args.direction,
        source: args.source,
        requestId: args.requestId,
        leadId: args.leadId,
        intakeId: args.intakeId,
      },
    })
  }

  async recordStatusChanged(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    from: CaseStatus
    to: CaseStatus
    reason?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'status_changed',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        from: args.from,
        to: args.to,
        fromStatus: args.from,
        toStatus: args.to,
        reason: args.reason,
      },
    })
  }

  async recordAssignmentChanged(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    type: 'assigned' | 'reassigned'
    professionalId?: string
    oldProfessionalId?: string
    newProfessionalId?: string
    assignedByProfessionalId?: string
    assignmentId?: string
    dispatchId?: string
    role?: string
    status?: string
    expiresAt?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: args.type,
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        professionalId: args.professionalId,
        oldProfessionalId: args.oldProfessionalId,
        newProfessionalId: args.newProfessionalId,
        assignedByProfessionalId: args.assignedByProfessionalId,
        assignmentId: args.assignmentId,
        dispatchId: args.dispatchId,
        role: args.role,
        status: args.status,
        expiresAt: args.expiresAt,
      },
    })
  }

  async recordMatched(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    strategy: string
    candidateIds: string[]
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'matched',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        strategy: args.strategy,
        candidateIds: args.candidateIds,
      },
    })
  }

  async recordAssignmentDecision(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    type: 'accepted' | 'rejected'
    assignmentId?: string
    dispatchId?: string
    professionalId?: string
    status?: string
    source?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: args.type,
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        assignmentId: args.assignmentId,
        dispatchId: args.dispatchId,
        professionalId: args.professionalId,
        status: args.status,
        source: args.source,
      },
    })
  }

  async recordClosed(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    closedBy?: string
    rating?: number
    responsibleProfessionalId?: string
    resolutionReason?: string | null
    status?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'closed',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        closedBy: args.closedBy,
        rating: args.rating,
        responsibleProfessionalId: args.responsibleProfessionalId,
        resolutionReason: args.resolutionReason,
        status: args.status,
      },
    })
  }

  async recordPortalAccessCreated(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    tokenId: string
    expiresAt: string
    source?: string
    requestId?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'portal_access_created',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        tokenId: args.tokenId,
        expiresAt: args.expiresAt,
        source: args.source,
        requestId: args.requestId,
      },
    })
  }

  async recordPortalAccessUsed(args: {
    tenantId: number
    caseId: string
    actorProfessionalId?: string
    actorUserId?: number
    occurredAt?: string
    entityId?: string | null
    tokenId: string
    usedAt: string
    source?: string
  }) {
    return this.recordEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      entityId: args.entityId,
      eventType: 'portal_access_used',
      actorProfessionalId: args.actorProfessionalId,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      payload: {
        tokenId: args.tokenId,
        usedAt: args.usedAt,
        source: args.source,
      },
    })
  }
}

export function createLegalCanonicalTimelineWriteService(db: BackendDatabase, recorder?: LegalMetricsRecorder) {
  return new LegalCanonicalTimelineWriteService(db, recorder)
}
