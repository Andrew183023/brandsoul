import type { BackendDatabase } from '../../db/index.js'
import { getLegalCaseDispatchTimeoutSeconds } from '../../config/env.js'

import { CaseRepository, createCaseRepository } from './caseRepository.js'
import { getLawyerInboxChannel, publish, type LawyerInboxEvent, type LawyerInboxEventType } from './lawyerInboxEvents.js'
import { createMatchingService } from './matchingService.js'
import type {
  AcceptCaseResult,
  AddCaseMessageInput,
  AssignmentResponseStatus,
  CaseAssignmentRecord,
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

export class CaseService {
  private static readonly dispatchTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

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
  ) {}

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

    await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const dispatch = await repository.getCaseDispatchById(tenantId, dispatchId)
      if (!dispatch || dispatch.caseId !== caseId || dispatch.status !== 'pending') {
        return
      }

      await repository.updateCaseDispatchStatus(tenantId, dispatchId, 'expired')
      const assignments = await repository.listAssignmentsByCase(tenantId, caseId)
      const linkedAssignment = assignments.find((assignment) => {
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

      await repository.addTimelineEvent({
        tenantId,
        caseId,
        eventType: 'rejected',
        actorProfessionalId: dispatch.professionalId,
        payload: {
          dispatchId,
          professionalId: dispatch.professionalId,
          status: 'expired',
        },
      })
    })

    this.clearDispatchTimeout(dispatchId)
    if (expiredAssignmentId && expiredAssignmentProfessionalId) {
      this.publishLawyerInboxEvent(tenantId, expiredAssignmentProfessionalId, 'assignment.expired', {
        caseId,
        assignmentId: expiredAssignmentId,
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

  private resolveAutoDispatchMetadata(caseRecord: CaseRecord): AutoDispatchState | null {
    const metadata = (caseRecord.metadata ?? {}) as CaseMetadataWithAutoDispatch
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

    const matchingService = createMatchingService(this.db)
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

      await repository.addTimelineEvent({
        tenantId,
        caseId,
        eventType: 'matched',
        payload: {
          strategy: state.strategy,
          candidateIds: topCandidates,
        },
      })

      return this.broadcastDispatchBatch(repository, caseWithState, topCandidates, state)
    })

    for (const assignment of dispatchResult?.assignments ?? []) {
      this.publishLawyerInboxEvent(tenantId, assignment.professionalId, 'assignment.created', {
        caseId,
        assignmentId: assignment.id,
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

      const matchingService = createMatchingService(tx)
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
    }

    return dispatchResult
  }

  async createCase(input: CreateCaseInput): Promise<CaseRecord> {
    const createdCase = await this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const legalCase = await repository.createCase(input)

      if (input.initialMessage?.body) {
        await repository.addMessage({
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

      await repository.addTimelineEvent({
        tenantId: input.tenantId,
        caseId: legalCase.id,
        eventType: 'created',
        actorProfessionalId: input.initialMessage?.authorProfessionalId ?? input.leadProfessionalId,
        payload: {
          entityId: legalCase.entityId ?? null,
          status: legalCase.status,
          priority: legalCase.priority,
        },
      })

      return legalCase
    })

    console.info('case.created', {
      tenantId: createdCase.tenantId,
      caseId: createdCase.id,
      entityId: createdCase.entityId,
      candidateCount: null,
      professionalIds: [],
    })

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

    return (await this.repositoryFactory(this.db).getCaseById(input.tenantId, createdCase.id)) ?? createdCase
  }

  async addMessage(input: AddCaseMessageInput): Promise<CaseMessageRecord> {
    return this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const legalCase = await repository.getCaseById(input.tenantId, input.caseId)
      if (!legalCase) {
        throw new Error(`Case ${input.caseId} not found.`)
      }

      const message = await repository.addMessage(input)

      if (legalCase.status === 'accepted') {
        await repository.updateCaseStatus(input.tenantId, input.caseId, 'in_progress')
      }

      await repository.addTimelineEvent({
        tenantId: input.tenantId,
        caseId: input.caseId,
        eventType: 'message_added',
        actorProfessionalId: input.authorProfessionalId,
        payload: {
          messageId: message.id,
          sequenceNo: message.sequenceNo,
          messageType: message.messageType,
          direction: message.direction,
        },
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

      return message
    })
  }

  async closeCase(tenantId: number, caseId: string, resolutionReason?: string, actorProfessionalId?: string): Promise<CaseRecord | null> {
    return this.db.transaction(async (tx) => {
      const repository = this.repositoryFactory(tx)
      const legalCase = await repository.closeCase(tenantId, caseId, resolutionReason)

      if (!legalCase) {
        return null
      }

      await repository.addTimelineEvent({
        tenantId,
        caseId,
        eventType: 'closed',
        actorProfessionalId,
        payload: {
          resolutionReason: resolutionReason ?? null,
          status: legalCase.status,
        },
      })

      return legalCase
    })
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

      await repository.addTimelineEvent({
        tenantId,
        caseId,
        eventType: 'assigned',
        actorProfessionalId: assignedByProfessionalId,
        payload: {
          assignmentId: assignment.id,
          dispatchId: dispatch.id,
          professionalId: assignment.professionalId,
          role: assignment.role,
          status: assignment.status,
          expiresAt: dispatch.expiresAt,
        },
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
    }

    return result
  }

  async respondToAssignment(tenantId: number, assignmentId: string, status: AssignmentResponseStatus): Promise<RespondToAssignmentResult> {
    const postCommitEvents: Array<{ professionalId: string; type: LawyerInboxEventType; caseId: string; assignmentId: string }> = []

    const result = await this.db.transaction<RespondToAssignmentResult>(async (tx) => {
      const repository = this.repositoryFactory(tx)
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

      await repository.addTimelineEvent({
        tenantId,
        caseId: assignment.caseId,
        eventType: status,
        actorProfessionalId: assignment.professionalId,
        payload: {
          assignmentId: updatedAssignment.id,
          dispatchId,
          professionalId: updatedAssignment.professionalId,
          status: updatedAssignment.status,
        },
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

      await repository.updateCaseStatus(tenantId, assignment.caseId, 'pending')
      return {
        status,
        assignment: updatedAssignment,
        caseRecord,
      }
    })

    if (result.status === 'rejected') {
      await this.advanceAutoDispatch(tenantId, result.caseRecord.id, 'rejected')
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

        await repository.addTimelineEvent({
          tenantId,
          caseId,
          eventType: 'accepted',
          actorProfessionalId: professionalId,
          payload: {
            assignmentId: updatedAssignment.id,
            dispatchId: acceptedDispatch.id,
            professionalId,
            status: updatedAssignment.status,
            source: 'case.accepted',
          },
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

      await repository.addTimelineEvent({
        tenantId,
        caseId,
        eventType: 'rejected',
        actorProfessionalId: professionalId,
        payload: {
          assignmentId: updatedAssignment.id,
          dispatchId: rejectedDispatch.id,
          professionalId,
          status: updatedAssignment.status,
          source: 'case.rejected',
        },
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

export function createCaseService(db: BackendDatabase) {
  return new CaseService(db)
}
