export const caseStatuses = ['open', 'pending', 'dispatched', 'accepted', 'in_progress', 'on_hold', 'resolved', 'closed', 'archived'] as const
export const casePriorities = ['low', 'normal', 'high', 'urgent'] as const
export const caseTimelineEventTypes = [
  'created',
  'message_added',
  'matched',
  'assigned',
  'accepted',
  'rejected',
  'closed',
  'reopened',
  'archived',
  'feedback_received',
] as const
export const caseMessageTypes = ['note', 'email', 'sms', 'call', 'chat', 'system'] as const
export const caseMessageDirections = ['inbound', 'outbound', 'internal'] as const
export const caseMessageStatuses = ['draft', 'queued', 'sent', 'delivered', 'failed', 'read'] as const

export type JsonObject = Record<string, unknown>

export type CaseStatus = typeof caseStatuses[number]
export type CasePriority = typeof casePriorities[number]
export type CaseTimelineEventType = typeof caseTimelineEventTypes[number]
export type CaseMessageType = typeof caseMessageTypes[number]
export type CaseMessageDirection = typeof caseMessageDirections[number]
export type CaseMessageStatus = typeof caseMessageStatuses[number]
export type CaseAssignmentStatus = 'active' | 'accepted' | 'rejected' | 'completed' | 'revoked' | 'expired'

export type CreateCaseInput = {
  tenantId: number
  entityId: string
  createdByUserId?: number
  caseNumber?: string
  title: string
  description?: string
  status?: CaseStatus
  priority?: CasePriority
  practiceArea?: string
  source?: string
  leadProfessionalId?: string
  centelhaContext?: JsonObject
  metadata?: JsonObject
  openedAt?: string
  initialMessage?: {
    authorProfessionalId?: string
    body: string
    messageType?: CaseMessageType
    messageStatus?: CaseMessageStatus
    direction?: CaseMessageDirection
    channel?: string
    subject?: string
    content?: JsonObject
    attachments?: unknown[]
    sentAt?: string
  }
}

export type AddCaseMessageInput = {
  tenantId: number
  caseId: string
  authorProfessionalId?: string
  body: string
  messageType?: CaseMessageType
  messageStatus?: CaseMessageStatus
  direction?: CaseMessageDirection
  channel?: string
  subject?: string
  content?: JsonObject
  attachments?: unknown[]
  sentAt?: string
}

export type DispatchCaseInput = {
  tenantId: number
  caseId: string
  professionalId: string
  assignedByProfessionalId?: string
  assignedAt?: string
  metadata?: JsonObject
}

export type AssignmentResponseStatus = 'accepted' | 'rejected'

export type CaseRecord = {
  id: string
  tenantId: number
  caseNumber?: string
  entityId?: string
  createdByUserId?: number
  title: string
  description?: string
  status: CaseStatus
  priority: CasePriority
  practiceArea?: string
  source?: string
  openedAt: string
  closedAt?: string
  archivedAt?: string
  resolutionReason?: string
  leadProfessionalId?: string
  centelhaContext: JsonObject
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export type CaseMessageRecord = {
  id: string
  tenantId: number
  caseId: string
  authorProfessionalId?: string
  messageType: CaseMessageType
  messageStatus: CaseMessageStatus
  direction: CaseMessageDirection
  channel?: string
  subject?: string
  body: string
  content: JsonObject
  attachments: unknown[]
  sequenceNo: number
  sentAt: string
  createdAt: string
  updatedAt: string
}

export type CaseAssignmentRecord = {
  id: string
  tenantId: number
  caseId: string
  professionalId: string
  role: string
  status: CaseAssignmentStatus
  assignedByProfessionalId?: string
  assignedAt: string
  unassignedAt?: string
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export type CaseDispatchStatus = 'pending' | 'accepted' | 'rejected' | 'expired'

export type CaseDispatchRecord = {
  id: string
  tenantId: number
  caseId: string
  professionalId: string
  status: CaseDispatchStatus
  createdAt: string
  updatedAt: string
  expiresAt: string
  acceptedAt?: string
  rejectedAt?: string
  expiredAt?: string
  metadata: JsonObject
}

export type RespondToAssignmentResult =
  | {
      status: 'not_found'
    }
  | {
      status: 'invalid_state'
      assignment: CaseAssignmentRecord
    }
  | {
      status: 'accepted' | 'rejected'
      assignment: CaseAssignmentRecord
      caseRecord: CaseRecord
    }

export type AcceptCaseResult =
  | {
      status: 'not_found'
    }
  | {
      status: 'replayed'
      responseStatusCode: number
      responseBody: JsonObject
    }
  | {
      status: 'accept_conflict'
    }
  | {
      status: 'invalid_state'
      assignment: CaseAssignmentRecord
    }
  | {
      status: 'case_already_accepted'
      assignment: CaseAssignmentRecord
      caseRecord: CaseRecord
    }
  | {
      status: 'accepted'
      assignment: CaseAssignmentRecord
      caseRecord: CaseRecord
    }

export type RejectCaseResult =
  | {
      status: 'not_found'
    }
  | {
      status: 'invalid_state'
      assignment: CaseAssignmentRecord
    }
  | {
      status: 'rejected'
      assignment: CaseAssignmentRecord
      caseRecord: CaseRecord
    }

export type NotificationRecord = {
  id: string
  tenantId: number
  caseId: string
  professionalId: string
  eventType: string
  title: string
  message: string
  priority: 'high' | 'medium' | 'low'
  isRead: boolean
  readAt?: string
  occurredAt: string
  payload: JsonObject
}

export type CaseTimelineEventInput = {
  tenantId: number
  caseId: string
  eventType: CaseTimelineEventType
  actorProfessionalId?: string
  occurredAt?: string
  payload?: JsonObject
}

export type CaseTimelineEventRecord = {
  id: string
  tenantId: number
  caseId: string
  eventType: CaseTimelineEventType
  actorProfessionalId?: string
  actorUserId?: number
  occurredAt: string
  payload: JsonObject
  createdAt: string
  updatedAt: string
}
