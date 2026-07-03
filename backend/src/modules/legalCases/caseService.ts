import type { BackendDatabase } from '../../db/index.js'
import { getLegalCaseDispatchTimeoutSeconds } from '../../config/env.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import { buildSemanticFingerprint, getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'

import { CaseRepository, createCaseRepository } from './caseRepository.js'
import { getLawyerInboxChannel, publish, type LawyerInboxEvent, type LawyerInboxEventType } from './lawyerInboxEvents.js'
import { createLegalCanonicalTimelineWriteService } from './legalCanonicalTimelineWriteService.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import { createMatchingService } from './matchingService.js'
import type {
  AcceptCaseResult,
  AddCaseMessageInput,
  AssignmentResponseStatus,
  CaseAssignmentRecord,
  CaseMessageDirection,
  CaseMessageRecord,
  CaseRecord,
  CreateCaseInput,
  JsonObject,
  RejectCaseResult,
  RespondToAssignmentResult,
} from './caseTypes.js'

type AutoDispatchState = {
  strategy: 'top_candidates_broadcast_v1'
  attemptedCandidateIds: string[]
  batchSize: number
  firstDispatchAt?: string
  timeoutMs: number
}

type CaseMetadataWithAutoDispatch = Record<string, unknown> & {
  autoDispatch?: AutoDispatchState
}

function readCreateCaseReplayKey(input: CreateCaseInput): string | null {
  const directRequestId = typeof input.requestId === 'string' && input.requestId.trim().length > 0
    ? input.requestId.trim()
    : null
  if (directRequestId) {
    return directRequestId
  }

  // Legacy compatibility fallback only.
  // New operational identity must come from structured columns / canonical identity.
  const publicTriageRequestId = typeof input.metadata?.publicTriage === 'object'
    && input.metadata?.publicTriage
    && typeof (input.metadata.publicTriage as Record<string, unknown>).requestId === 'string'
    ? ((input.metadata.publicTriage as Record<string, unknown>).requestId as string).trim()
    : ''

  return publicTriageRequestId.length > 0 ? publicTriageRequestId : null
}

function buildCreateCaseSemanticIntentId(input: CreateCaseInput): string {
  const replayKey = readCreateCaseReplayKey(input)
  if (replayKey) {
    return `legal-case-create:${input.tenantId}:${input.entityId ?? 'entityless'}:${replayKey}`
  }

  return `legal-case-create:${input.tenantId}:${input.caseNumber ?? 'none'}:${input.title}:${input.entityId ?? 'entityless'}`
}

function buildRouteError(code: string, message: string): JsonObject {
  return {
    status: 'failed',
    error: {
      code,
      message,
    },
  }
}

function buildAcceptCaseHttpResponse(result: Exclude<AcceptCaseResult, { status: 'replayed' }>): {
  statusCode: number
  body: JsonObject
} {
  if (result.status === 'not_found') {
    return {
      statusCode: 404,
      body: buildRouteError('ASSIGNMENT_NOT_FOUND', 'Assignment not found.'),
    }
  }

  if (result.status === 'accept_conflict') {
    return {
      statusCode: 409,
      body: buildRouteError('CASE_ACCEPT_CONFLICT', 'Case accept is already being processed. Please refresh.'),
    }
  }

  if (result.status === 'case_already_accepted') {
    return {
      statusCode: 409,
      body: {
        ...buildRouteError('CASE_ALREADY_ACCEPTED', 'Case already accepted by another lawyer.'),
        assignment: result.assignment,
        case: result.caseRecord,
      },
    }
  }

  if (result.status === 'invalid_state') {
    return {
      statusCode: 409,
      body: {
        ...buildRouteError('ASSIGNMENT_INVALID_STATE', 'Assignment is not pending or has expired.'),
        assignment: result.assignment,
      },
    }
  }

  return {
    statusCode: 200,
    body: {
      assignment: result.assignment,
      case: result.caseRecord,
    },
  }
}

function isSqliteAcceptContentionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('cannot start a transaction within a transaction')
    || message.includes('sqlite_busy')
    || message.includes('sqlite_locked')
    || message.includes('database is locked')
 }

export async function persistCanonicalCaseWithInitialHistory(
  repository: CaseRepository,
  input: CreateCaseInput,
): Promise<{
  legalCase: CaseRecord
  initialMessage: CaseMessageRecord | null
}> {
  const timelineWriter = createLegalCanonicalTimelineWriteService(repository['db'] as BackendDatabase)
  // Legacy compatibility fallback only.
  // New operational identity must come from structured columns / canonical identity.
  const publicTriageMetadata = (
    input.metadata?.publicTriage
    && typeof input.metadata.publicTriage === 'object'
    && !Array.isArray(input.metadata.publicTriage)
  )
    ? input.metadata.publicTriage as JsonObject
    : undefined
  const initialMessageContent = (
    input.initialMessage?.content
    && typeof input.initialMessage.content === 'object'
    && !Array.isArray(input.initialMessage.content)
  )
    ? input.initialMessage.content
    : undefined
  const legalCase = await repository.createCase(input)
  let initialMessage: CaseMessageRecord | null = null

  if (input.initialMessage?.body) {
    initialMessage = await repository.addMessage({
      tenantId: input.tenantId,
      caseId: legalCase.id,
      authorProfessionalId: input.initialMessage.authorProfessionalId,
      body: input.initialMessage.body,
      messageType: input.initialMessage.messageType,
      messageStatus: input.initialMessage.messageStatus,
      direction: input.initialMessage.direction,
      channel: input.initialMessage.channel,
      subject: input.initialMessage.subject,
      content: input.initialMessage.content,
      attachments: input.initialMessage.attachments,
      sentAt: input.initialMessage.sentAt,
    })
  }

  await timelineWriter.recordCaseCreated({
    tenantId: input.tenantId,
    caseId: legalCase.id,
    actorProfessionalId: input.initialMessage?.authorProfessionalId ?? input.leadProfessionalId,
    entityId: legalCase.entityId ?? null,
    status: legalCase.status,
    priority: legalCase.priority,
    // Legacy compatibility fallback only.
    // New operational identity must come from structured columns / canonical identity.
    source: typeof input.metadata?.source === 'string' ? input.metadata.source : undefined,
    requestId: input.requestId ?? (typeof publicTriageMetadata?.requestId === 'string' ? publicTriageMetadata.requestId : undefined),
    // Legacy compatibility fallback only.
    // New operational identity must come from structured columns / canonical identity.
    leadId: typeof input.metadata?.leadId === 'string' ? input.metadata.leadId : undefined,
    // Legacy compatibility fallback only.
    // New operational identity must come from structured columns / canonical identity.
    intakeId: typeof input.metadata?.intakeId === 'string' ? input.metadata.intakeId : undefined,
  })

  if (initialMessage) {
    await timelineWriter.recordMessageAdded({
      tenantId: input.tenantId,
      caseId: legalCase.id,
      actorProfessionalId: input.initialMessage?.authorProfessionalId,
      messageId: initialMessage.id,
      sequenceNo: initialMessage.sequenceNo,
      messageType: initialMessage.messageType,
      direction: initialMessage.direction,
      source: typeof initialMessageContent?.source === 'string' ? initialMessageContent.source : undefined,
      requestId: typeof initialMessageContent?.requestId === 'string' ? initialMessageContent.requestId : undefined,
      leadId: typeof initialMessageContent?.leadId === 'string' ? initialMessageContent.leadId : undefined,
      intakeId: typeof initialMessageContent?.intakeId === 'string' ? initialMessageContent.intakeId : undefined,
    })
  }

  return {
    legalCase,
    initialMessage,
  }
}

export class CaseService {
  private static readonly dispatchTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly legalMetricsRecorder?: LegalMetricsRecorder

  static clearAllDispatchTimeoutsForTesting() {
    for (const handle of CaseService.dispatchTimeouts.values()) {
      clearTimeout(handle)
    }
    CaseService.dispatchTimeouts.clear()
  }

  static getDispatchTimeoutCountForTesting() {
    return CaseService.dispatchTimeouts.size
  }

  constructor(
    private readonly db: BackendDatabase,
    private readonly repositoryFactory: (db: BackendDatabase) => CaseRepository = createCaseRepository,
    private readonly observability?: ObservabilityService,
  ) {
    this.legalMetricsRecorder = observability
      ? new LegalMetricsRecorder(observability)
      : undefined
  }

  private recordAssignmentMetric(args: {
    metricName:
      | 'legal_assignment_created_total'
      | 'legal_assignment_accepted_total'
      | 'legal_assignment_rejected_total'
      | 'legal_assignment_reassigned_total'
      | 'legal_assignment_expired_total'
    tenantId: number
    entityId?: string | null
    operation: 'assign' | 'accept' | 'reject' | 'reassign' | 'expire'
    result: 'success' | 'failed'
    source?: string
  }) {
    this.legalMetricsRecorder?.increment(args.metricName, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      operation: args.operation,
      result: args.result,
      ...(args.source ? { source: args.source } : {}),
    })
  }

  private resolveMessageMetricSource(args: {
    direction?: CaseMessageDirection
    channel?: string
    content?: JsonObject
    authorProfessionalId?: string
  }) {
    const contentSource = typeof args.content?.source === 'string'
      ? args.content.source.trim().toLowerCase()
      : ''
    const channelSource = typeof args.channel === 'string'
      ? args.channel.trim().toLowerCase()
      : ''
    const explicitSource = channelSource || contentSource
    if (explicitSource) {
      return explicitSource
    }

    if (args.direction === 'outbound') {
      return args.authorProfessionalId ? 'professional' : 'case_service'
    }

    return 'case_service'
  }

  private resolveMessageMetricOperation(direction?: CaseMessageDirection) {
    if (direction === 'inbound') {
      return 'message_received' as const
    }
    if (direction === 'outbound') {
      return 'message_sent' as const
    }
    return null
  }

  private recordMessageMetric(args: {
    metricName:
      | 'legal_message_received_total'
      | 'legal_message_sent_total'
      | 'legal_message_failed_total'
    tenantId: number
    entityId?: string | null
    source?: string
    operation: 'message_received' | 'message_sent'
    result: 'success' | 'failed'
    reason?: string
  }) {
    this.legalMetricsRecorder?.increment(args.metricName, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      source: args.source ?? 'case_service',
      operation: args.operation,
      result: args.result,
      ...(args.reason ? { reason: args.reason } : {}),
    })
  }

  private recordCaseLifecycleMetric(args: {
    metricName:
      | 'legal_case_created_total'
      | 'legal_case_reused_total'
      | 'legal_case_status_changed_total'
      | 'legal_case_closed_total'
    tenantId: number
    entityId?: string | null
    source?: string
    operation: 'case_created' | 'case_reused' | 'status_changed' | 'case_closed'
    status?: string
    result: 'success'
    reason?: string
  }) {
    this.legalMetricsRecorder?.increment(args.metricName, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      source: args.source ?? 'case_service',
      operation: args.operation,
      ...(args.status ? { status: args.status } : {}),
      result: args.result,
      ...(args.reason ? { reason: args.reason } : {}),
    })
  }

  private recordTransactionMetric(args: {
    metricName:
      | 'legal_transaction_failures_total'
      | 'legal_transaction_rollbacks_total'
    tenantId: number
    entityId?: string | null
    source?: string
    operation: 'create_case' | 'add_message' | 'status_change' | 'close_case' | 'assign' | 'public_triage'
    stage: 'transaction' | 'rollback'
    result: 'failed'
    reason: 'exception'
  }) {
    this.legalMetricsRecorder?.increment(args.metricName, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      source: args.source ?? 'case_service',
      operation: args.operation,
      stage: args.stage,
      result: args.result,
      reason: args.reason,
    })
  }

  private getDispatchTimeoutMs() {
    return Math.round(getLegalCaseDispatchTimeoutSeconds() * 1000)
  }

  private clearDispatchTimeout(dispatchId: string) {
    const handle = CaseService.dispatchTimeouts.get(dispatchId)
    if (handle) {
      clearTimeout(handle)
      CaseService.dispatchTimeouts.delete(dispatchId)
    }
  }

  private scheduleDispatchTimeout(tenantId: number, caseId: string, dispatchId: string, timeoutMs: number) {
    this.clearDispatchTimeout(dispatchId)
    const handle = setTimeout(() => {
      this.handleDispatchTimeout(tenantId, caseId, dispatchId).catch(() => {
      })
    }, timeoutMs)
    handle.unref?.()
    CaseService.dispatchTimeouts.set(dispatchId, handle)
  }

  private async handleDispatchTimeout(tenantId: number, caseId: string, dispatchId: string) {
    let expiredAssignmentId: string | null = null
    let expiredAssignmentProfessionalId: string | null = null
    let expiredAssignmentEntityId: string | null = null

    await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const dispatch = await repository.getCaseDispatchById(tenantId, dispatchId)
      if (!dispatch || dispatch.caseId !== caseId || dispatch.status !== 'pending') {
        return
      }

      await repository.updateCaseDispatchStatus(tenantId, dispatchId, 'expired')
      const legalCase = await repository.getCaseById(tenantId, caseId)
      expiredAssignmentEntityId = legalCase?.entityId ?? null
      const assignments = await repository.listAssignmentsByCase(tenantId, caseId)
      const linkedAssignment = assignments.find((assignment) => {
        // Legacy compatibility fallback only.
        // New operational identity must come from structured columns / canonical identity.
        const assignmentDispatchId = typeof assignment.metadata?.dispatchId === 'string'
          ? assignment.metadata.dispatchId
          : null
        return assignmentDispatchId === dispatchId && assignment.status === 'active'
      })
      if (linkedAssignment) {
        const updatedAssignment = await repository.updateAssignmentStatus(tenantId, linkedAssignment.id, 'expired')
        expiredAssignmentId = updatedAssignment?.id ?? null
        expiredAssignmentProfessionalId = updatedAssignment?.professionalId ?? null
      }

      await timelineWriter.recordAssignmentDecision({
        tenantId,
        caseId,
        type: 'rejected',
        actorProfessionalId: dispatch.professionalId,
        dispatchId,
        professionalId: dispatch.professionalId,
        status: 'expired',
      })
    })

    this.clearDispatchTimeout(dispatchId)
    if (expiredAssignmentId && expiredAssignmentProfessionalId) {
      this.publishLawyerInboxEvent(tenantId, expiredAssignmentProfessionalId, 'assignment.expired', {
        caseId,
        assignmentId: expiredAssignmentId,
      })
      this.recordAssignmentMetric({
        metricName: 'legal_assignment_expired_total',
        tenantId,
        entityId: expiredAssignmentEntityId,
        operation: 'expire',
        result: 'success',
        source: 'case_service',
      })
    }
    await this.advanceAutoDispatch(tenantId, caseId, 'timeout')
  }

  private publishLawyerInboxEvent(
    tenantId: number,
    professionalId: string,
    type: LawyerInboxEventType,
    details: Pick<LawyerInboxEvent, 'caseId' | 'assignmentId'> = {},
  ) {
    publish(getLawyerInboxChannel(tenantId, professionalId), {
      type,
      caseId: details.caseId,
      assignmentId: details.assignmentId,
      occurredAt: new Date().toISOString(),
    })
  }

  private async appendCaseStatusChangedEvent(
    repository: CaseRepository,
    input: {
      tenantId: number
      caseId: string
      actorProfessionalId?: string
      fromStatus: string
      toStatus: string
      reason?: string
    },
  ) {
    if (input.fromStatus === input.toStatus) {
      return
    }

    const timelineWriter = createLegalCanonicalTimelineWriteService(repository['db'] as BackendDatabase)
    await timelineWriter.recordStatusChanged({
      tenantId: input.tenantId,
      caseId: input.caseId,
      actorProfessionalId: input.actorProfessionalId,
      from: input.fromStatus as CaseRecord['status'],
      to: input.toStatus as CaseRecord['status'],
      reason: input.reason ?? undefined,
    })
  }

  private resolveAutoDispatchMetadata(caseRecord: CaseRecord): AutoDispatchState | null {
    const metadata = (caseRecord.metadata ?? {}) as CaseMetadataWithAutoDispatch
    // Legacy compatibility fallback only.
    // New operational identity must come from structured columns / canonical identity.
    const state = metadata.autoDispatch
    if (!state) {
      return null
    }

    return {
      strategy: 'top_candidates_broadcast_v1',
      attemptedCandidateIds: Array.isArray(state.attemptedCandidateIds)
        ? state.attemptedCandidateIds.filter((id) => typeof id === 'string')
        : [],
      batchSize: Number.isInteger(state.batchSize) && state.batchSize > 0 ? state.batchSize : 3,
      firstDispatchAt: typeof state.firstDispatchAt === 'string' ? state.firstDispatchAt : undefined,
      timeoutMs: Number.isInteger(state.timeoutMs) ? state.timeoutMs : this.getDispatchTimeoutMs(),
    }
  }

  private async setAutoDispatchMetadata(repository: CaseRepository, caseRecord: CaseRecord, nextState: AutoDispatchState) {
    const mergedMetadata: CaseMetadataWithAutoDispatch = {
      ...(caseRecord.metadata ?? {}),
      autoDispatch: nextState,
    }
    return repository.updateCaseMetadata(caseRecord.tenantId, caseRecord.id, mergedMetadata)
  }

  private async broadcastDispatchBatch(
    repository: CaseRepository,
    caseRecord: CaseRecord,
    candidateIds: string[],
    state: AutoDispatchState,
    assignedByProfessionalId?: string,
  ): Promise<{ caseRecord: CaseRecord; assignments: CaseAssignmentRecord[] } | null> {
    if (candidateIds.length === 0) {
      return null
    }

    const nowIso = new Date().toISOString()
    const expiresAt = new Date(Date.now() + state.timeoutMs).toISOString()
    const createdAssignments: CaseAssignmentRecord[] = []

    for (const candidateId of candidateIds) {
      const dispatchResult = await this.dispatchCase(
        caseRecord.tenantId,
        caseRecord.id,
        candidateId,
        assignedByProfessionalId,
        repository,
        {
          expiresAt,
          source: 'auto_dispatch',
        },
      )
      if (!dispatchResult) {
        continue
      }

      createdAssignments.push(dispatchResult.assignment)

      // Legacy compatibility fallback only.
      // New operational identity must come from structured columns / canonical identity.
      const dispatchId = typeof dispatchResult.assignment.metadata?.dispatchId === 'string'
        ? dispatchResult.assignment.metadata.dispatchId
        : null
      if (dispatchId) {
        this.scheduleDispatchTimeout(caseRecord.tenantId, caseRecord.id, dispatchId, state.timeoutMs)
      }
    }

    if (createdAssignments.length === 0) {
      return null
    }

    const updatedCase = await repository.updateCaseStatus(caseRecord.tenantId, caseRecord.id, 'dispatched')
    const caseForState = updatedCase ?? caseRecord
    await this.setAutoDispatchMetadata(repository, caseForState, {
      ...state,
      firstDispatchAt: state.firstDispatchAt ?? nowIso,
    })

    const attempts = await repository.countAssignmentsForCase(caseRecord.tenantId, caseRecord.id)
    await repository.addLearningEvent({
      tenantId: caseRecord.tenantId,
      professionalId: candidateIds[0],
      caseId: caseRecord.id,
      eventType: 'manual_override',
      source: 'assignment_attempts',
      impactScore: attempts,
      payload: {
        metric: 'assignment_attempts',
        caseId: caseRecord.id,
        attempts,
        candidateIds,
      },
    })

    return {
      caseRecord: caseForState,
      assignments: createdAssignments,
    }
  }

  async triggerAutomaticDispatchForCase(tenantId: number, caseId: string) {
    const caseSnapshot = await this.repositoryFactory(this.db).getCaseById(tenantId, caseId)
    const entityId = caseSnapshot?.entityId
    console.info('case.auto_dispatch_started', {
      tenantId,
      caseId,
      entityId,
    })

    const matchingService = createMatchingService(this.db, this.observability)
    const candidates = await matchingService.matchCaseToProfessionals(tenantId, caseId)
    const topCandidates = candidates.slice(0, 3).map((candidate) => candidate.professionalId)
    console.info('case.match_candidates_found', {
      tenantId,
      caseId,
      entityId,
      candidateCount: topCandidates.length,
      professionalIds: topCandidates,
    })
    if (topCandidates.length === 0) {
      await this.repositoryFactory(this.db).addLearningEvent({
        tenantId,
        caseId,
        eventType: 'auto_dispatch_no_candidates',
        source: 'auto_dispatch_no_candidates',
        payload: {
          candidateCount: 0,
          professionalIds: [],
        },
      })
      console.warn('case.auto_dispatch_no_candidates', {
        tenantId,
        caseId,
        entityId,
        candidateCount: 0,
        professionalIds: [],
      })
      return null
    }

    const dispatchResult = await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const legalCase = await repository.getCaseById(tenantId, caseId)
      if (!legalCase) {
        return null
      }

      const state: AutoDispatchState = {
        strategy: 'top_candidates_broadcast_v1',
        attemptedCandidateIds: [...new Set(topCandidates)],
        batchSize: 3,
        timeoutMs: this.getDispatchTimeoutMs(),
      }

      const caseWithState = await this.setAutoDispatchMetadata(repository, legalCase, state)
      if (!caseWithState) {
        return null
      }

      await timelineWriter.recordMatched({
        tenantId,
        caseId,
        strategy: state.strategy,
        candidateIds: topCandidates,
      })

      return this.broadcastDispatchBatch(repository, caseWithState, topCandidates, state)
    })

    for (const assignment of dispatchResult?.assignments ?? []) {
      this.publishLawyerInboxEvent(tenantId, assignment.professionalId, 'assignment.created', {
        caseId,
        assignmentId: assignment.id,
      })
      this.recordAssignmentMetric({
        metricName: 'legal_assignment_created_total',
        tenantId,
        entityId: dispatchResult?.caseRecord.entityId ?? entityId ?? null,
        operation: 'assign',
        result: 'success',
        source: 'case_service',
      })
    }

    return dispatchResult
  }

  async advanceAutoDispatch(tenantId: number, caseId: string, reason: 'rejected' | 'timeout') {
    const dispatchResult = await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const legalCase = await repository.getCaseById(tenantId, caseId)
      if (!legalCase) {
        return null
      }

      const state = this.resolveAutoDispatchMetadata(legalCase)
      if (!state) {
        return null
      }

      const dispatches = await repository.listCaseDispatchesByCase(tenantId, caseId)
      if (dispatches.some((dispatch) => dispatch.status === 'pending')) {
        return null
      }

      const matchingService = createMatchingService(tx, this.observability)
      const candidates = await matchingService.matchCaseToProfessionals(tenantId, caseId)
      const nextBatch = candidates
        .map((candidate) => candidate.professionalId)
        .filter((professionalId) => !state.attemptedCandidateIds.includes(professionalId))
        .slice(0, state.batchSize)

      if (nextBatch.length === 0) {
        await repository.addLearningEvent({
          tenantId,
          caseId,
          eventType: 'auto_dispatch_no_candidates',
          source: 'auto_dispatch_no_candidates',
          payload: {
            reason,
            candidatePoolSize: candidates.length,
            attemptedCandidateIds: state.attemptedCandidateIds,
          },
        })

        console.warn('case.auto_dispatch_no_candidates', {
          tenantId,
          caseId,
          reason,
          candidatePoolSize: candidates.length,
          attemptedCandidateIds: state.attemptedCandidateIds,
        })

        await repository.addLearningEvent({
          tenantId,
          caseId,
          eventType: 'rejected',
          source: 'acceptance_rate',
          impactScore: 0,
          payload: {
            metric: 'acceptance_rate',
            accepted: false,
            reason,
            candidatePoolSize: state.attemptedCandidateIds.length,
          },
        })
        return null
      }

      const updatedState: AutoDispatchState = {
        ...state,
        attemptedCandidateIds: [...new Set([...state.attemptedCandidateIds, ...nextBatch])],
      }
      const caseWithUpdatedState = await this.setAutoDispatchMetadata(repository, legalCase, updatedState)
      if (!caseWithUpdatedState) {
        return null
      }

      return this.broadcastDispatchBatch(repository, caseWithUpdatedState, nextBatch, updatedState)
    })

    for (const assignment of dispatchResult?.assignments ?? []) {
      this.publishLawyerInboxEvent(tenantId, assignment.professionalId, 'assignment.created', {
        caseId,
        assignmentId: assignment.id,
      })
      this.recordAssignmentMetric({
        metricName: 'legal_assignment_created_total',
        tenantId,
        entityId: dispatchResult?.caseRecord.entityId ?? null,
        operation: 'assign',
        result: 'success',
        source: 'case_service',
      })
    }

    return dispatchResult
  }

  async createCase(input: CreateCaseInput): Promise<CaseRecord> {
    const messageOperation = this.resolveMessageMetricOperation(input.initialMessage?.direction)
    const messageSource = this.resolveMessageMetricSource({
      direction: input.initialMessage?.direction,
      channel: input.initialMessage?.channel,
      content: input.initialMessage?.content,
      authorProfessionalId: input.initialMessage?.authorProfessionalId,
    })

    let createdCase: CaseRecord
    let transactionStarted = false
    let mutationStarted = false
    try {
      const persistenceResult = await getSemanticMutationExecutor().executeSemanticMutation({
        authoritySource: 'backend/src/modules/legalCases/caseService.ts#createCase',
        intent: {
          intentId: buildCreateCaseSemanticIntentId(input),
          intentType: 'legal.case.create',
          domain: 'legal_case',
          actor: 'public',
          targetRef: {
            entityId: input.entityId ?? undefined,
            tenantId: String(input.tenantId),
          },
          semanticPurpose: 'open a legal case record and establish the initial case timeline',
          expectedInstitutionalEffect: ['legal_case_opened', 'initial_case_timeline_recorded'],
          riskLevel: 'high',
          replayRelevant: true,
          continuityRelevant: true,
          authRelevant: false,
          createdAt: new Date().toISOString(),
        },
        captureBeforeState: () => ({
          tenantId: input.tenantId,
          entityId: input.entityId ?? null,
        }),
        executePersistence: () => {
          transactionStarted = true
          return this.db.transaction(async (tx) => {
          const repository = this.repositoryFactory(tx)
          mutationStarted = true
          const { legalCase } = await persistCanonicalCaseWithInitialHistory(repository, input)
          return legalCase
          })
        },
        captureAfterState: (persisted) => ({
          caseId: persisted.id,
          tenantId: persisted.tenantId,
          status: persisted.status,
          entityId: persisted.entityId ?? null,
        }),
        deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
          effectId: `${intent.intentId}:effect`,
          intentId: intent.intentId,
          effectType: 'legal.case.create.completed',
          domain: intent.domain,
          beforeFingerprint: buildSemanticFingerprint(beforeState),
          afterFingerprint: buildSemanticFingerprint(afterState),
          changedFields: ['case', 'case_message', 'case_timeline'],
          institutionalMeaning: 'a legal case now exists as an institutional service obligation for the tenant',
          replayFingerprint: buildSemanticFingerprint({
            intentType: intent.intentType,
            beforeState,
            afterState,
          }),
          continuityLineageHash: sovereignAttestation.lineageHash,
          mutationLineageHash: '',
          verified: false,
        }),
      })
      createdCase = persistenceResult.result
    } catch (error) {
      if (transactionStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: input.tenantId,
          entityId: input.entityId ?? null,
          source: 'case_service',
          operation: 'create_case',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
      }
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: input.tenantId,
          entityId: input.entityId ?? null,
          source: 'case_service',
          operation: 'create_case',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      if (input.initialMessage?.body && messageOperation) {
        this.recordMessageMetric({
          metricName: 'legal_message_failed_total',
          tenantId: input.tenantId,
          entityId: input.entityId ?? null,
          source: messageSource,
          operation: messageOperation,
          result: 'failed',
          reason: 'write_failed',
        })
      }
      throw error
    }

    console.info('case.created', {
      tenantId: createdCase.tenantId,
      caseId: createdCase.id,
      entityId: createdCase.entityId,
      candidateCount: null,
      professionalIds: [],
    })

    this.recordCaseLifecycleMetric({
      metricName: 'legal_case_created_total',
      tenantId: input.tenantId,
      entityId: createdCase.entityId ?? null,
      source: 'case_service',
      operation: 'case_created',
      result: 'success',
    })

    if (input.autoDispatch === true) {
      await this.triggerAutomaticDispatchForCase(input.tenantId, createdCase.id).catch((error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        console.error('case.auto_dispatch_failed', {
          tenantId: input.tenantId,
          caseId: createdCase.id,
          entityId: createdCase.entityId,
          candidateCount: null,
          professionalIds: [],
          error: normalizedError.message,
          stack: normalizedError.stack,
        })
      })
    }

    if (input.initialMessage?.body && messageOperation) {
      this.recordMessageMetric({
        metricName: messageOperation === 'message_received'
          ? 'legal_message_received_total'
          : 'legal_message_sent_total',
        tenantId: input.tenantId,
        entityId: createdCase.entityId ?? null,
        source: messageSource,
        operation: messageOperation,
        result: 'success',
      })
    }

    return (await this.repositoryFactory(this.db).getCaseById(input.tenantId, createdCase.id)) ?? createdCase
  }

  async addMessage(input: AddCaseMessageInput): Promise<CaseMessageRecord> {
    const messageOperation = this.resolveMessageMetricOperation(input.direction)
    const messageSource = this.resolveMessageMetricSource({
      direction: input.direction,
      channel: input.channel,
      content: input.content,
      authorProfessionalId: input.authorProfessionalId,
    })

    let persisted: {
      message: CaseMessageRecord
      entityId: string | null
      statusChangedTo?: string
    }
    let mutationStarted = false
    try {
      persisted = await this.db.transaction(async (tx) => {
        const repository = this.repositoryFactory(tx)
        const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
        const legalCase = await repository.getCaseById(input.tenantId, input.caseId)
        if (!legalCase) {
          throw new Error(`Case ${input.caseId} not found.`)
        }

        mutationStarted = true
        const message = await repository.addMessage(input)

        if (legalCase.status === 'accepted') {
          const updatedCase = await repository.updateCaseStatus(input.tenantId, input.caseId, 'in_progress')
          await this.appendCaseStatusChangedEvent(repository, {
            tenantId: input.tenantId,
            caseId: input.caseId,
            actorProfessionalId: input.authorProfessionalId,
            fromStatus: legalCase.status,
            toStatus: updatedCase?.status ?? 'in_progress',
            reason: 'message_progression',
          })
        }

        await timelineWriter.recordMessageAdded({
          tenantId: input.tenantId,
          caseId: input.caseId,
          actorProfessionalId: input.authorProfessionalId,
          messageId: message.id,
          sequenceNo: message.sequenceNo,
          messageType: message.messageType,
          direction: message.direction,
        })

        if (legalCase.leadProfessionalId && legalCase.leadProfessionalId !== input.authorProfessionalId) {
          await repository.addLearningEvent({
            tenantId: input.tenantId,
            professionalId: legalCase.leadProfessionalId,
            caseId: input.caseId,
            eventType: 'message_added',
            source: 'case_message',
            payload: {
              messageId: message.id,
              sequenceNo: message.sequenceNo,
              messageType: message.messageType,
              direction: message.direction,
            },
          })
        }

        return {
          message,
          entityId: legalCase.entityId ?? null,
          statusChangedTo: legalCase.status === 'accepted' ? 'in_progress' : undefined,
        }
      })
    } catch (error) {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: input.tenantId,
          source: 'case_service',
          operation: 'add_message',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: input.tenantId,
          source: 'case_service',
          operation: 'add_message',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      if (messageOperation) {
        this.recordMessageMetric({
          metricName: 'legal_message_failed_total',
          tenantId: input.tenantId,
          source: messageSource,
          operation: messageOperation,
          result: 'failed',
          reason: 'write_failed',
        })
      }
      throw error
    }

    if (messageOperation) {
      this.recordMessageMetric({
        metricName: messageOperation === 'message_received'
          ? 'legal_message_received_total'
          : 'legal_message_sent_total',
        tenantId: input.tenantId,
        entityId: persisted.entityId,
        source: messageSource,
        operation: messageOperation,
        result: 'success',
      })
    }

    if (persisted.statusChangedTo) {
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_status_changed_total',
        tenantId: input.tenantId,
        entityId: persisted.entityId,
        source: 'case_service',
        operation: 'status_changed',
        status: persisted.statusChangedTo,
        result: 'success',
        reason: 'message_progression',
      })
    }

    return persisted.message
  }

  async transitionCaseStatus(input: {
    tenantId: number
    caseId: string
    status: 'in_progress' | 'pending' | 'on_hold'
    reason?: string
    actorProfessionalId?: string
  }): Promise<
    | { status: 'not_found' }
    | { status: 'invalid_target'; message: string }
    | { status: 'invalid_state'; message: string; caseRecord: CaseRecord }
    | { status: 'updated'; caseRecord: CaseRecord }
  > {
    const allowedTargetStatuses = new Set<string>(['in_progress', 'pending', 'on_hold'])
    if (!allowedTargetStatuses.has(input.status)) {
      return {
        status: 'invalid_target',
        message: 'This endpoint only supports transitions to in_progress, pending, or on_hold.',
      }
    }

    let mutationStarted = false
    const result = await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const currentCase = await repository.getCaseById(input.tenantId, input.caseId)
      if (!currentCase) {
        return { status: 'not_found' as const }
      }

      if (currentCase.status === 'closed' || currentCase.status === 'archived') {
        return {
          status: 'invalid_state' as const,
          message: 'Closed or archived cases cannot be transitioned through this endpoint.',
          caseRecord: currentCase,
        }
      }

      if (currentCase.status === input.status) {
        return {
          status: 'updated' as const,
          changed: false as const,
          caseRecord: currentCase,
        }
      }

      mutationStarted = true
      const updatedCase = await repository.updateCaseStatus(input.tenantId, input.caseId, input.status)
      if (!updatedCase) {
        return { status: 'not_found' as const }
      }

      await this.appendCaseStatusChangedEvent(repository, {
        tenantId: input.tenantId,
        caseId: input.caseId,
        actorProfessionalId: input.actorProfessionalId,
        fromStatus: currentCase.status,
        toStatus: updatedCase.status,
        reason: input.reason,
      })

      return {
        status: 'updated' as const,
        changed: true as const,
        caseRecord: updatedCase,
      }
    }).catch((error) => {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: input.tenantId,
          source: 'case_service',
          operation: 'status_change',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: input.tenantId,
          source: 'case_service',
          operation: 'status_change',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      throw error
    })

    if (result.status === 'updated' && result.changed) {
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_status_changed_total',
        tenantId: input.tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'case_service',
        operation: 'status_changed',
        status: result.caseRecord.status,
        result: 'success',
        reason: input.reason ?? 'manual',
      })
    }

    return result
  }

  async closeCase(input: {
    tenantId: number
    caseId: string
    resolutionReason?: string
    actorProfessionalId?: string
    outcomeMetadata?: JsonObject
  }): Promise<
    | { status: 'not_found' }
    | { status: 'already_closed'; caseRecord: CaseRecord }
    | { status: 'closed'; caseRecord: CaseRecord }
  > {
    let mutationStarted = false
    const result = await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const currentCase = await repository.getCaseById(input.tenantId, input.caseId)
      if (!currentCase) {
        return { status: 'not_found' as const }
      }

      if (currentCase.status === 'closed' || currentCase.status === 'archived') {
        return {
          status: 'already_closed' as const,
          caseRecord: currentCase,
        }
      }

      mutationStarted = true
      const closedCase = await repository.closeCase(
        input.tenantId,
        input.caseId,
        input.resolutionReason,
      )
      if (!closedCase) {
        return { status: 'not_found' as const }
      }

      const effectiveCase = input.outcomeMetadata
        ? await repository.updateCaseMetadata(
          input.tenantId,
          input.caseId,
          {
            ...closedCase.metadata,
            outcome: input.outcomeMetadata,
          },
        ) ?? closedCase
        : closedCase

      await this.appendCaseStatusChangedEvent(repository, {
        tenantId: input.tenantId,
        caseId: input.caseId,
        actorProfessionalId: input.actorProfessionalId,
        fromStatus: currentCase.status,
        toStatus: effectiveCase.status,
        reason: 'case_closed',
      })

      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      await timelineWriter.recordClosed({
        tenantId: input.tenantId,
        caseId: input.caseId,
        actorProfessionalId: input.actorProfessionalId,
        resolutionReason: input.resolutionReason ?? null,
        status: effectiveCase.status,
      })

      return {
        status: 'closed' as const,
        caseRecord: effectiveCase,
      }
    }).catch((error) => {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: input.tenantId,
          source: 'case_service',
          operation: 'close_case',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: input.tenantId,
          source: 'case_service',
          operation: 'close_case',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      throw error
    })

    if (result.status === 'closed') {
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_status_changed_total',
        tenantId: input.tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'case_service',
        operation: 'status_changed',
        status: result.caseRecord.status,
        result: 'success',
        reason: 'close',
      })
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_closed_total',
        tenantId: input.tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'case_service',
        operation: 'case_closed',
        status: result.caseRecord.status,
        result: 'success',
        reason: input.resolutionReason ? 'resolution' : 'manual',
      })
    }

    return result
  }

  async dispatchCase(
    tenantId: number,
    caseId: string,
    professionalId: string,
    assignedByProfessionalId?: string,
    repositoryArg?: CaseRepository,
    dispatchOptions?: {
      expiresAt?: string
      source?: string
    },
  ): Promise<{ caseRecord: CaseRecord; assignment: CaseAssignmentRecord } | null> {
    const executeDispatch = async (repository: CaseRepository) => {
      const timelineWriter = createLegalCanonicalTimelineWriteService(repository['db'] as BackendDatabase)
      const legalCase = await repository.getCaseById(tenantId, caseId)
      if (!legalCase) {
        return null
      }

      const professional = await repository.getProfessionalById(tenantId, professionalId)
      if (!professional) {
        return null
      }

      const dispatch = await repository.createCaseDispatch({
        tenantId,
        caseId,
        professionalId,
        expiresAt: dispatchOptions?.expiresAt ?? new Date(Date.now() + this.getDispatchTimeoutMs()).toISOString(),
        metadata: {
          source: dispatchOptions?.source ?? 'manual_dispatch',
        },
      })

      const assignment = await repository.createAssignment({
        tenantId,
        caseId,
        professionalId,
        assignedByProfessionalId,
        metadata: {
          dispatchId: dispatch.id,
        },
      })

      await timelineWriter.recordAssignmentChanged({
        tenantId,
        caseId,
        type: 'assigned',
        actorProfessionalId: assignedByProfessionalId,
        professionalId: assignment.professionalId,
        assignedByProfessionalId,
        assignmentId: assignment.id,
        dispatchId: dispatch.id,
        role: assignment.role,
        status: assignment.status,
        expiresAt: dispatch.expiresAt,
      })

      await repository.addLearningEvent({
        tenantId,
        professionalId: assignment.professionalId,
        caseId,
        eventType: 'assigned',
        source: 'case_dispatch',
        payload: {
          assignmentId: assignment.id,
          dispatchId: dispatch.id,
          professionalId: assignment.professionalId,
          role: assignment.role,
          status: assignment.status,
        },
      })

      console.info('case.dispatch_created', {
        tenantId,
        caseId,
        entityId: legalCase.entityId,
        candidateCount: 1,
        professionalIds: [professionalId],
        dispatchId: dispatch.id,
      })
      console.info('case.assignment_created', {
        tenantId,
        caseId,
        entityId: legalCase.entityId,
        candidateCount: 1,
        professionalIds: [professionalId],
        assignmentId: assignment.id,
      })

      return {
        caseRecord: legalCase,
        assignment,
      }
    }

    const result = repositoryArg
      ? await executeDispatch(repositoryArg)
      : await this.db.transaction(async (tx) => executeDispatch(this.repositoryFactory(tx)))

    if (result && !repositoryArg) {
      this.publishLawyerInboxEvent(tenantId, result.assignment.professionalId, 'assignment.created', {
        caseId,
        assignmentId: result.assignment.id,
      })
      this.recordAssignmentMetric({
        metricName: 'legal_assignment_created_total',
        tenantId,
        entityId: result.caseRecord.entityId ?? null,
        operation: 'assign',
        result: 'success',
        source: 'case_service',
      })
    }

    return result
  }

  async assignCase(
    tenantId: number,
    caseId: string,
    professionalId: string,
    assignedByProfessionalId?: string,
  ): Promise<
    | { status: 'not_found' }
    | { status: 'invalid_state'; caseRecord: CaseRecord }
    | { status: 'assigned'; caseRecord: CaseRecord; assignment: CaseAssignmentRecord }
  > {
    const result = await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const legalCase = await repository.getCaseById(tenantId, caseId)
      if (!legalCase) {
        return { status: 'not_found' as const }
      }

      if (!['open', 'pending', 'dispatched'].includes(legalCase.status) || legalCase.leadProfessionalId) {
        return {
          status: 'invalid_state' as const,
          caseRecord: legalCase,
        }
      }

      const existingAssignments = await repository.listAssignmentsByCase(tenantId, caseId)
      if (existingAssignments.some((assignment) => assignment.professionalId === professionalId && assignment.status === 'active')) {
        return {
          status: 'invalid_state' as const,
          caseRecord: legalCase,
        }
      }

      const dispatchResult = await this.dispatchCase(
        tenantId,
        caseId,
        professionalId,
        assignedByProfessionalId,
        repository,
        {
          source: 'owner_dispatch',
        },
      )
      if (!dispatchResult) {
        return { status: 'not_found' as const }
      }

      const updatedCase = await repository.updateCaseStatus(tenantId, caseId, 'dispatched')
      await this.appendCaseStatusChangedEvent(repository, {
        tenantId,
        caseId,
        actorProfessionalId: assignedByProfessionalId,
        fromStatus: legalCase.status,
        toStatus: updatedCase?.status ?? 'dispatched',
        reason: 'owner_assignment',
      })

      return {
        status: 'assigned' as const,
        caseRecord: updatedCase ?? dispatchResult.caseRecord,
        assignment: dispatchResult.assignment,
      }
    })

    if (result.status === 'assigned') {
      this.recordAssignmentMetric({
        metricName: 'legal_assignment_created_total',
        tenantId,
        entityId: result.caseRecord.entityId ?? null,
        operation: 'assign',
        result: 'success',
        source: 'case_service',
      })

      if (result.caseRecord.status === 'dispatched') {
        this.recordCaseLifecycleMetric({
          metricName: 'legal_case_status_changed_total',
          tenantId,
          entityId: result.caseRecord.entityId ?? null,
          source: 'case_service',
          operation: 'status_changed',
          status: result.caseRecord.status,
          result: 'success',
          reason: 'assignment',
        })
      }
    }

    return result
  }

  async respondToAssignment(tenantId: number, assignmentId: string, status: AssignmentResponseStatus): Promise<RespondToAssignmentResult> {
    const postCommitEvents: Array<{ professionalId: string; type: LawyerInboxEventType; caseId: string; assignmentId: string }> = []

    const result = await this.db.transaction<RespondToAssignmentResult>(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const assignment = await repository.getAssignmentById(tenantId, assignmentId)

      if (!assignment) {
        return {
          status: 'not_found',
        }
      }

      if (assignment.status !== 'active') {
        return {
          status: 'invalid_state',
          assignment,
        }
      }

      // Legacy compatibility fallback only.
      // New operational identity must come from structured columns / canonical identity.
      const dispatchId = typeof assignment.metadata?.dispatchId === 'string'
        ? assignment.metadata.dispatchId
        : null
      const dispatch = dispatchId ? await repository.getCaseDispatchById(tenantId, dispatchId) : null
      if (dispatchId && dispatch && dispatch.status !== 'pending') {
        return {
          status: 'invalid_state',
          assignment,
        }
      }

      if (dispatchId) {
        const updatedDispatch = await repository.updateCaseDispatchStatus(tenantId, dispatchId, status)
        if (!updatedDispatch) {
          return {
            status: 'not_found',
          }
        }
      }

      const updatedAssignment = await repository.updateAssignmentStatus(tenantId, assignmentId, status)
      if (!updatedAssignment) {
        return {
          status: 'not_found',
        }
      }

      let caseRecord: CaseRecord | null
      if (status === 'accepted') {
        const currentCase = await repository.getCaseById(tenantId, assignment.caseId)
        if (!currentCase) {
          return {
            status: 'not_found',
          }
        }

        if (currentCase.leadProfessionalId && currentCase.leadProfessionalId !== assignment.professionalId) {
          return {
            status: 'invalid_state',
            assignment,
          }
        }

        if (currentCase.leadProfessionalId === assignment.professionalId) {
          caseRecord = currentCase
        } else {
          const leadAssignmentChanges = await repository.assignCaseLeadProfessionalIfUnassigned(
            tenantId,
            assignment.caseId,
            assignment.professionalId,
          )
          caseRecord = await repository.getCaseById(tenantId, assignment.caseId)
          if (leadAssignmentChanges === 0 || !caseRecord || caseRecord.leadProfessionalId !== assignment.professionalId) {
            return {
              status: 'invalid_state',
              assignment,
            }
          }
        }
      } else {
        caseRecord = await repository.getCaseById(tenantId, assignment.caseId)
      }

      if (!caseRecord) {
        return {
          status: 'not_found',
        }
      }

      await timelineWriter.recordAssignmentDecision({
        tenantId,
        caseId: assignment.caseId,
        type: status,
        actorProfessionalId: assignment.professionalId,
        assignmentId: updatedAssignment.id,
        dispatchId: dispatchId ?? undefined,
        professionalId: updatedAssignment.professionalId,
        status: updatedAssignment.status,
      })

      if (dispatchId) {
        this.clearDispatchTimeout(dispatchId)
      }

      if (status === 'accepted') {
        if (dispatchId) {
          await repository.expirePendingDispatchesForCaseExcept(tenantId, assignment.caseId, dispatchId)
        }
        const siblingAssignments = await repository.listAssignmentsByCase(tenantId, assignment.caseId)
        for (const sibling of siblingAssignments) {
          if (sibling.id === updatedAssignment.id || sibling.status !== 'active') {
            continue
          }
          const rejectedSibling = await repository.updateAssignmentStatus(tenantId, sibling.id, 'rejected')
          const siblingDispatchId = typeof sibling.metadata?.dispatchId === 'string'
            ? sibling.metadata.dispatchId
            : null
          if (siblingDispatchId) {
            this.clearDispatchTimeout(siblingDispatchId)
          }
          if (rejectedSibling) {
            postCommitEvents.push({
              professionalId: rejectedSibling.professionalId,
              type: 'assignment.rejected',
              caseId: assignment.caseId,
              assignmentId: rejectedSibling.id,
            })
          }
        }

        const metadataState = this.resolveAutoDispatchMetadata(caseRecord)
        const startedAt = metadataState?.firstDispatchAt
        const dispatchTimeMs = startedAt ? Math.max(0, Date.now() - Date.parse(startedAt)) : null
        const acceptedCase = await repository.updateCaseStatus(tenantId, assignment.caseId, 'accepted')
        await this.appendCaseStatusChangedEvent(repository, {
          tenantId,
          caseId: assignment.caseId,
          actorProfessionalId: assignment.professionalId,
          fromStatus: caseRecord.status,
          toStatus: acceptedCase?.status ?? 'accepted',
          reason: 'assignment_accepted',
        })
        await repository.addLearningEvent({
          tenantId,
          professionalId: assignment.professionalId,
          caseId: assignment.caseId,
          eventType: 'accepted',
          source: 'acceptance_rate',
          impactScore: 1,
          payload: {
            metric: 'acceptance_rate',
            accepted: true,
          },
        })

        if (dispatchTimeMs !== null) {
          await repository.addLearningEvent({
            tenantId,
            professionalId: assignment.professionalId,
            caseId: assignment.caseId,
            eventType: 'accepted',
            source: 'dispatch_time',
            impactScore: dispatchTimeMs,
            payload: {
              metric: 'dispatch_time',
              dispatchTimeMs,
            },
          })
        }

        postCommitEvents.push({
          professionalId: updatedAssignment.professionalId,
          type: 'assignment.accepted',
          caseId: assignment.caseId,
          assignmentId: updatedAssignment.id,
        })

        return {
          status,
          assignment: updatedAssignment,
          caseRecord: acceptedCase ?? caseRecord,
        }
      }

      postCommitEvents.push({
        professionalId: updatedAssignment.professionalId,
        type: 'assignment.rejected',
        caseId: assignment.caseId,
        assignmentId: updatedAssignment.id,
      })

      const currentCase = await repository.getCaseById(tenantId, assignment.caseId)
      const rejectedCase = await repository.updateCaseStatus(tenantId, assignment.caseId, 'pending')
      await this.appendCaseStatusChangedEvent(repository, {
        tenantId,
        caseId: assignment.caseId,
        actorProfessionalId: assignment.professionalId,
        fromStatus: currentCase?.status ?? 'dispatched',
        toStatus: rejectedCase?.status ?? 'pending',
        reason: 'assignment_rejected',
      })
      return {
        status,
        assignment: updatedAssignment,
        caseRecord: rejectedCase ?? caseRecord,
      }
    })

    if (result.status === 'rejected') {
      await this.advanceAutoDispatch(tenantId, result.caseRecord.id, 'rejected')
    }

    if (result.status === 'accepted' || result.status === 'rejected') {
      this.recordAssignmentMetric({
        metricName: result.status === 'accepted'
          ? 'legal_assignment_accepted_total'
          : 'legal_assignment_rejected_total',
        tenantId,
        entityId: result.caseRecord.entityId ?? null,
        operation: result.status === 'accepted' ? 'accept' : 'reject',
        result: 'success',
        source: 'case_service',
      })
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_status_changed_total',
        tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'case_service',
        operation: 'status_changed',
        status: result.caseRecord.status,
        result: 'success',
        reason: 'assignment',
      })
    }

    for (const event of postCommitEvents) {
      this.publishLawyerInboxEvent(tenantId, event.professionalId, event.type, {
        caseId: event.caseId,
        assignmentId: event.assignmentId,
      })
    }
    return result
  }

  async acceptCase(
    tenantId: number,
    caseId: string,
    professionalId: string,
    idempotencyKey?: string,
  ): Promise<AcceptCaseResult> {
    const normalizedIdempotencyKey = typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0
      ? idempotencyKey.trim()
      : null
    const postCommitEvents: Array<{ professionalId: string; type: LawyerInboxEventType; caseId: string; assignmentId: string }> = []

    try {
    const result = await this.db.transaction<AcceptCaseResult>(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)

        const completeIdempotentResult = async (
          result: Exclude<AcceptCaseResult, { status: 'replayed' }>,
        ): Promise<AcceptCaseResult> => {
          if (!normalizedIdempotencyKey) {
            return result
          }

          const response = buildAcceptCaseHttpResponse(result)
          await repository.completeCaseAcceptIdempotencyRecord(
            tenantId,
            caseId,
            professionalId,
            normalizedIdempotencyKey,
            response.statusCode,
            response.body,
          )
          return result
        }

        if (normalizedIdempotencyKey) {
          const inserted = await repository.createCaseAcceptIdempotencyRecord(
            tenantId,
            caseId,
            professionalId,
            normalizedIdempotencyKey,
          )

          if (!inserted) {
            const existing = await repository.getCaseAcceptIdempotencyRecord(
              tenantId,
              caseId,
              professionalId,
              normalizedIdempotencyKey,
            )

            if (existing?.responseStatusCode && existing.responseBody) {
              return {
                status: 'replayed',
                responseStatusCode: existing.responseStatusCode,
                responseBody: existing.responseBody,
              }
            }

            throw new Error(`Idempotency replay payload missing for case ${caseId}.`)
          }
        }

        const currentCase = await repository.getCaseByIdForUpdate(tenantId, caseId)
        if (!currentCase) {
          return completeIdempotentResult({
            status: 'not_found',
          })
        }

        const assignment = await repository.getLatestAssignmentForCaseProfessional(tenantId, caseId, professionalId)

        if (!assignment) {
          return completeIdempotentResult({
            status: 'not_found',
          })
        }

        if (currentCase.leadProfessionalId && currentCase.leadProfessionalId !== professionalId) {
          return completeIdempotentResult({
            status: 'case_already_accepted',
            assignment,
            caseRecord: currentCase,
          })
        }

        if (assignment.status !== 'active') {
          return completeIdempotentResult({
            status: 'invalid_state',
            assignment,
          })
        }

        // Legacy compatibility fallback only.
        // New operational identity must come from structured columns / canonical identity.
        const dispatchId = typeof assignment.metadata?.dispatchId === 'string'
          ? assignment.metadata.dispatchId
          : null
        const dispatch = dispatchId ? await repository.getCaseDispatchById(tenantId, dispatchId) : null

        if (!dispatch || dispatch.status !== 'pending' || Date.parse(dispatch.expiresAt) <= Date.now()) {
          if (dispatch && dispatch.status === 'pending' && Date.parse(dispatch.expiresAt) <= Date.now()) {
            await repository.updateCaseDispatchStatus(tenantId, dispatch.id, 'expired')
            this.clearDispatchTimeout(dispatch.id)
          }

          return completeIdempotentResult({
            status: 'invalid_state',
            assignment,
          })
        }

        const updatedAssignment = await repository.updateAssignmentStatus(tenantId, assignment.id, 'accepted')
        if (!updatedAssignment) {
          return completeIdempotentResult({
            status: 'not_found',
          })
        }

        const acceptedDispatch = await repository.updateCaseDispatchStatus(tenantId, dispatch.id, 'accepted')
        if (!acceptedDispatch) {
          return completeIdempotentResult({
            status: 'not_found',
          })
        }

        const leadAssignmentChanges = await repository.assignCaseLeadProfessionalIfUnassigned(tenantId, caseId, professionalId)
        if (leadAssignmentChanges === 0) {
          const latestCase = await repository.getCaseById(tenantId, caseId)
          return completeIdempotentResult({
            status: 'case_already_accepted',
            assignment: updatedAssignment,
            caseRecord: latestCase ?? currentCase,
          })
        }

        await repository.updateCaseStatus(tenantId, caseId, 'in_progress')
        await repository.expirePendingDispatchesForCaseExcept(tenantId, caseId, dispatch.id)
        const siblingAssignments = await repository.listAssignmentsByCase(tenantId, caseId)
        await repository.expireAssignmentsForCaseExcept(tenantId, caseId, professionalId)

        for (const sibling of siblingAssignments) {
          if (sibling.id === updatedAssignment.id || sibling.professionalId === professionalId || sibling.status !== 'active') {
            continue
          }

          postCommitEvents.push({
            professionalId: sibling.professionalId,
            type: 'assignment.expired',
            caseId,
            assignmentId: sibling.id,
          })
        }

        await timelineWriter.recordAssignmentDecision({
          tenantId,
          caseId,
          type: 'accepted',
          actorProfessionalId: professionalId,
          assignmentId: updatedAssignment.id,
          dispatchId: acceptedDispatch.id,
          professionalId,
          status: updatedAssignment.status,
          source: 'case.accepted',
        })

        const acceptedCase = await repository.getCaseById(tenantId, caseId)
        if (!acceptedCase) {
          return completeIdempotentResult({
            status: 'not_found',
          })
        }

        this.clearDispatchTimeout(dispatch.id)
        console.info('case.accepted', {
          tenantId,
          caseId,
          professionalId,
          assignmentId: updatedAssignment.id,
        })

        postCommitEvents.push({
          professionalId,
          type: 'assignment.accepted',
          caseId,
          assignmentId: updatedAssignment.id,
        })

        return completeIdempotentResult({
          status: 'accepted',
          assignment: updatedAssignment,
          caseRecord: acceptedCase,
        })
      })

      for (const event of postCommitEvents) {
        this.publishLawyerInboxEvent(tenantId, event.professionalId, event.type, {
          caseId: event.caseId,
          assignmentId: event.assignmentId,
        })
      }

      if (result.status === 'accepted') {
        this.recordAssignmentMetric({
          metricName: 'legal_assignment_accepted_total',
          tenantId,
          entityId: result.caseRecord.entityId ?? null,
          operation: 'accept',
          result: 'success',
          source: 'case_service',
        })
        this.recordCaseLifecycleMetric({
          metricName: 'legal_case_status_changed_total',
          tenantId,
          entityId: result.caseRecord.entityId ?? null,
          source: 'case_service',
          operation: 'status_changed',
          status: result.caseRecord.status,
          result: 'success',
          reason: 'assignment',
        })
      }

      return result
    } catch (error) {
      if (!isSqliteAcceptContentionError(error)) {
        throw error
      }

      const conflictResult: Exclude<AcceptCaseResult, { status: 'replayed' }> = {
        status: 'accept_conflict',
      }

      if (normalizedIdempotencyKey) {
        const response = buildAcceptCaseHttpResponse(conflictResult)
        const repository = this.repositoryFactory(this.db)
        await repository.completeCaseAcceptIdempotencyRecord(
          tenantId,
          caseId,
          professionalId,
          normalizedIdempotencyKey,
          response.statusCode,
          response.body,
        ).catch(() => {
        })
      }

      return conflictResult
    }
  }

  async rejectCase(tenantId: number, caseId: string, professionalId: string): Promise<RejectCaseResult> {
    const postCommitEvents: Array<{ professionalId: string; type: LawyerInboxEventType; caseId: string; assignmentId: string }> = []

    const result = await this.db.transaction<RejectCaseResult>(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const assignment = await repository.getLatestAssignmentForCaseProfessional(tenantId, caseId, professionalId)

      if (!assignment) {
        return {
          status: 'not_found',
        }
      }

      if (assignment.status !== 'active') {
        return {
          status: 'invalid_state',
          assignment,
        }
      }

      // Legacy compatibility fallback only.
      // New operational identity must come from structured columns / canonical identity.
      const dispatchId = typeof assignment.metadata?.dispatchId === 'string'
        ? assignment.metadata.dispatchId
        : null
      const dispatch = dispatchId ? await repository.getCaseDispatchById(tenantId, dispatchId) : null

      if (!dispatch || dispatch.status !== 'pending' || Date.parse(dispatch.expiresAt) <= Date.now()) {
        if (dispatch && dispatch.status === 'pending' && Date.parse(dispatch.expiresAt) <= Date.now()) {
          await repository.updateCaseDispatchStatus(tenantId, dispatch.id, 'expired')
          this.clearDispatchTimeout(dispatch.id)
        }

        return {
          status: 'invalid_state',
          assignment,
        }
      }

      const updatedAssignment = await repository.updateAssignmentStatus(tenantId, assignment.id, 'rejected')
      if (!updatedAssignment) {
        return {
          status: 'not_found',
        }
      }

      const rejectedDispatch = await repository.updateCaseDispatchStatus(tenantId, dispatch.id, 'rejected')
      if (!rejectedDispatch) {
        return {
          status: 'not_found',
        }
      }

      await timelineWriter.recordAssignmentDecision({
        tenantId,
        caseId,
        type: 'rejected',
        actorProfessionalId: professionalId,
        assignmentId: updatedAssignment.id,
        dispatchId: rejectedDispatch.id,
        professionalId,
        status: updatedAssignment.status,
        source: 'case.rejected',
      })

      const currentCase = await repository.getCaseById(tenantId, caseId)
      if (!currentCase) {
        return {
          status: 'not_found',
        }
      }

      this.clearDispatchTimeout(dispatch.id)
      console.info('case.rejected', {
        tenantId,
        caseId,
        professionalId,
        assignmentId: updatedAssignment.id,
      })

      postCommitEvents.push({
        professionalId,
        type: 'assignment.rejected',
        caseId,
        assignmentId: updatedAssignment.id,
      })

      return {
        status: 'rejected',
        assignment: updatedAssignment,
        caseRecord: currentCase,
      }
    })

    for (const event of postCommitEvents) {
      this.publishLawyerInboxEvent(tenantId, event.professionalId, event.type, {
        caseId: event.caseId,
        assignmentId: event.assignmentId,
      })
    }

    return result
  }

  async expireAssignmentsForProfessionalInbox(tenantId: number, professionalId: string) {
    const repository = this.repositoryFactory(this.db)
    const assignments = await repository.listAssignmentsForProfessionalInbox(tenantId, professionalId)
    const nowMs = Date.now()
    const expiredAssignments = assignments.filter((assignment) => (
      assignment.status === 'active'
      && typeof assignment.dispatchExpiresAt === 'string'
      && Date.parse(assignment.dispatchExpiresAt) <= nowMs
    ))
    const changes = await repository.expireAssignmentsPastDispatchExpiry(tenantId, professionalId)

    if (changes > 0) {
      for (const assignment of expiredAssignments) {
        this.publishLawyerInboxEvent(tenantId, professionalId, 'assignment.expired', {
          caseId: assignment.caseId,
          assignmentId: assignment.assignmentId,
        })
      }
    }

    return changes
  }
}

export function createCaseService(db: BackendDatabase, observability?: ObservabilityService) {
  return new CaseService(db, createCaseRepository, observability)
}
