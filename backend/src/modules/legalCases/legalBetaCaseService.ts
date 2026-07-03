import type { BackendDatabase } from '../../db/index.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import { createEntityRepository } from '../../repositories/entityRepository.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'

import { createCaseRepository, type CaseRepository } from './caseRepository.js'
import type { CaseMessageDirection, CaseMessageRecord, CaseRecord, CaseStatus, CreateCaseInput, JsonObject } from './caseTypes.js'
import { buildCanonicalCaseInputFromPublicTriage } from './legalCanonicalCaseInput.js'
import { createLegalCanonicalCaseReadService } from './legalCanonicalCaseReadService.js'
import { createLegalCanonicalTimelineWriteService } from './legalCanonicalTimelineWriteService.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import { createNoopCaptchaVerificationProvider, type CaptchaVerificationProvider } from './legalPublicTriageCaptcha.js'
import {
  evaluatePublicTriageSpamPolicy,
  hashPublicTriageIdentityKey,
  PUBLIC_TRIAGE_SPAM_POLICY,
} from './legalPublicTriageSpamPolicy.js'
import { createLegalPublicTriageSpamRepository } from './legalPublicTriageSpamRepository.js'
import {
  buildPublicTriageIntakeFingerprint,
  DEFAULT_PUBLIC_TRIAGE_FINGERPRINT_WINDOW_MS,
} from './legalIntakeFingerprint.js'
import { createLegalIntakeFingerprintRepository } from './legalIntakeFingerprintRepository.js'
import { persistCanonicalCaseWithInitialHistory } from './caseService.js'
import {
  buildCaseOutcome,
  buildClientPortalTimelineProjection,
  buildOfficeBusinessConfigProjection,
  buildStructuredPublicTriageMessage,
  buildStructuredPublicTriageTitle,
  buildPublicOfficeProfile,
  issueCasePortalAccessToken,
  normalizeLegacyCase,
  readEntityBusinessConfig,
  safeJsonObject,
} from '../../api/routes/legalBetaSupport.js'

function normalizePublicTriageIdPart(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'unknown'
}

function buildPublicTriageReferenceId(prefix: string, entityId: string, requestId: string) {
  return `${prefix}:${normalizePublicTriageIdPart(entityId)}:${normalizePublicTriageIdPart(requestId)}`.slice(0, 128)
}

function buildPublicTriageRequestIdWhereClause(db: BackendDatabase) {
  return db.dialect === 'postgres'
    ? "(request_id = ? OR metadata #>> '{publicTriage,requestId}' = ?)"
    : "(request_id = ? OR json_extract(metadata, '$.publicTriage.requestId') = ?)"
}

function readCanonicalPublicTriagePayload(canonicalInput: {
  metadata: Record<string, unknown>
  contact?: string
  contactPreference?: string
  practiceArea?: string
  initialMessage: { body: string }
}) {
  const publicTriage = safeJsonObject(canonicalInput.metadata.publicTriage)
  const urgency: 'critical' | 'priority' | 'planned' = (
    publicTriage.urgency === 'critical'
    || publicTriage.urgency === 'priority'
    || publicTriage.urgency === 'planned'
  )
    ? publicTriage.urgency
    : 'planned'

  return {
    businessContext: {
      officeName: typeof publicTriage.officeName === 'string' ? publicTriage.officeName : undefined,
    },
    triage: {
      practiceArea: canonicalInput.practiceArea,
      context: typeof publicTriage.context === 'string' ? publicTriage.context : '',
      urgency,
      objective: typeof publicTriage.objective === 'string' ? publicTriage.objective : '',
      contactPreference: canonicalInput.contactPreference ?? '',
      contactValue: canonicalInput.contact ?? '',
    },
    userMessage: canonicalInput.initialMessage.body,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class PublicTriageCreationPendingError extends Error {
  constructor(readonly requestId: string) {
    super('Public triage case creation is still pending.')
    this.name = 'PublicTriageCreationPendingError'
  }
}

export class PublicTriageRateLimitedError extends Error {
  constructor(
    readonly requestId: string,
    readonly retryAfterSeconds: number,
  ) {
    super('Public triage is rate limited.')
    this.name = 'PublicTriageRateLimitedError'
  }
}

export class LegalBetaCaseService {
  private readonly legalMetricsRecorder?: LegalMetricsRecorder

  constructor(
    private readonly db: BackendDatabase,
    private readonly sovereignMutationCommandService: SovereignMutationCommandService,
    private readonly observability?: ObservabilityService,
    private readonly captchaProvider: CaptchaVerificationProvider = createNoopCaptchaVerificationProvider(),
    private readonly logger?: {
      info(payload: unknown, message?: string): void
      warn(payload: unknown, message?: string): void
    },
  ) {
    this.legalMetricsRecorder = observability
      ? new LegalMetricsRecorder(observability)
      : undefined
  }

  private get caseRepository() {
    return createCaseRepository(this.db)
  }

  private get entityRepository() {
    return createEntityRepository(this.db)
  }

  private get canonicalCaseReadService() {
    return createLegalCanonicalCaseReadService(this.db, this.legalMetricsRecorder)
  }

  protected issuePortalAccessToken(args: {
    db: BackendDatabase
    tenantId: number
    caseId: string
    source?: string
    requestId?: string
  }) {
    return issueCasePortalAccessToken({
      ...args,
      recorder: this.legalMetricsRecorder,
    })
  }

  protected persistCaseWithInitialHistory(repository: CaseRepository, input: CreateCaseInput) {
    return persistCanonicalCaseWithInitialHistory(repository, input)
  }

  protected async waitForFingerprintCaseCreated(args: {
    tenantId: number
    entityId: string
    fingerprint: string
    attempts?: number
    delayMs?: number
  }) {
    const attempts = typeof args.attempts === 'number' && args.attempts > 0 ? args.attempts : 5
    const delayMs = typeof args.delayMs === 'number' && args.delayMs > 0 ? args.delayMs : 100
    const fingerprintRepository = createLegalIntakeFingerprintRepository(this.db)

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const activeFingerprint = await fingerprintRepository.findActiveFingerprint({
        tenantId: args.tenantId,
        entityId: args.entityId,
        fingerprint: args.fingerprint,
      })

      if (activeFingerprint?.caseId) {
        return activeFingerprint
      }

      if (attempt < attempts - 1) {
        await delay(delayMs)
      }
    }

    return null
  }

  private buildPublicTriageMetricLabels(entityId: string, reason: string) {
    return {
      entity_id: entityId,
      source: 'public_triage',
      reason,
    }
  }

  private recordPublicTriageMetric(name: string, entityId: string, reason: string) {
    this.legalMetricsRecorder?.increment(name, this.buildPublicTriageMetricLabels(entityId, reason))
  }

  private recordPublicTriageCaseCreatedMetric(args: {
    tenantId: number
    entityId?: string | null
  }) {
    this.legalMetricsRecorder?.increment('public_triage_case_created_total', {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      source: 'public_triage',
      result: 'created',
    })
  }

  private logPublicTriageEvent(level: 'info' | 'warn', payload: {
    event: string
    requestId: string
    fingerprintVersion: string
    fingerprintSource: string
    fingerprintId?: string
    caseId?: string
    entityId: string
    tenantId: number
    reason: string
    occurredAt: string
  }) {
    this.logger?.[level](payload, payload.event)
  }

  private buildSpamMetricLabels(entityId: string, reason: string, decision: string) {
    return {
      entity_id: entityId,
      reason,
      decision,
      source: 'public_triage',
    }
  }

  private recordSpamMetric(name: string, entityId: string, reason: string, decision: string) {
    this.legalMetricsRecorder?.increment(name, this.buildSpamMetricLabels(entityId, reason, decision))
  }

  private recordAssignmentMetric(args: {
    metricName:
      | 'legal_assignment_created_total'
      | 'legal_assignment_reassigned_total'
    tenantId: number
    entityId?: string | null
    operation: 'assign' | 'reassign'
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

    if (args.direction === 'inbound') {
      return args.authorProfessionalId ? 'case_service' : 'client_portal'
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
      source: args.source ?? 'legal_beta_case_service',
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
      source: args.source ?? 'legal_beta_case_service',
      operation: args.operation,
      stage: args.stage,
      result: args.result,
      reason: args.reason,
    })
  }

  async listCasesByEntity(tenantId: number, entityId: string) {
    const cases = await this.caseRepository.listCasesByEntity(tenantId, entityId)
    return Promise.all(cases.map((caseRecord) => this.getLegacyCaseProjection(tenantId, caseRecord)))
  }

  async getLegacyCaseProjection(tenantId: number, caseRecord: CaseRecord) {
    const canonical = await this.canonicalCaseReadService.getCanonicalCase({
      tenantId,
      caseId: caseRecord.id,
    })

    const messages = canonical?.case.messages ?? []
    const timeline = canonical?.case.timeline ?? []
    const assignedProfessionalId = canonical?.case.responsibleProfessional?.id

    const legacyCase = normalizeLegacyCase({
      tenantId,
      caseRecord,
      messages,
      timeline,
      projectionAssignedProfessionalId: assignedProfessionalId,
    })

    return {
      ...legacyCase,
      canonical,
    }
  }

  async getCaseById(tenantId: number, caseId: string) {
    const caseRecord = await this.caseRepository.getCaseById(tenantId, caseId)
    if (!caseRecord) {
      return null
    }

    return this.getLegacyCaseProjection(tenantId, caseRecord)
  }

  async getCaseMessages(tenantId: number, caseId: string) {
    return this.canonicalCaseReadService.getCanonicalMessages({
      tenantId,
      caseId,
    })
  }

  private isAllowedStatusTransition(from: CaseStatus, to: CaseStatus) {
    const allowedTransitions: Partial<Record<CaseStatus, CaseStatus[]>> = {
      open: ['dispatched'],
      dispatched: ['accepted'],
      accepted: ['in_progress'],
      in_progress: ['resolved'],
      resolved: ['closed'],
    }

    return allowedTransitions[from]?.includes(to) ?? false
  }

  private resolveOperationalResponsible(
    current: CaseRecord,
    assignments: Array<{ professionalId: string; status: string; assignedAt: string }>,
  ) {
    const activeAssignment = assignments.find((assignment) => assignment.status === 'active')
    if (activeAssignment?.professionalId) {
      return activeAssignment.professionalId
    }

    if (current.leadProfessionalId) {
      return current.leadProfessionalId
    }

    const latestAssignment = assignments
      .slice()
      .sort((left, right) => Date.parse(right.assignedAt) - Date.parse(left.assignedAt))[0]

    return latestAssignment?.professionalId
  }

  async addMessage(args: {
    tenantId: number
    caseId: string
    authorProfessionalId?: string
    body: string
    direction: 'inbound' | 'outbound' | 'internal'
  }): Promise<
    | { status: 'not_found' }
    | { status: 'closed' }
    | { status: 'responsible_required' }
    | { status: 'duplicate'; message: CaseMessageRecord }
    | { status: 'ready'; message: CaseMessageRecord }
  > {
    const messageOperation = this.resolveMessageMetricOperation(args.direction)
    const messageSource = this.resolveMessageMetricSource({
      direction: args.direction,
      authorProfessionalId: args.authorProfessionalId,
    })

    let result:
      | { status: 'not_found' }
      | { status: 'closed' }
      | { status: 'responsible_required' }
      | { status: 'duplicate'; message: CaseMessageRecord }
      | { status: 'ready'; message: CaseMessageRecord; entityId: string | null }
    let mutationStarted = false

    try {
      result = await this.db.transaction(async (tx) => {
        const repository = createCaseRepository(tx)
        const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
        const current = await repository.getCaseByIdForUpdate(args.tenantId, args.caseId)
        if (!current) {
          return { status: 'not_found' as const }
        }

        if (current.status === 'resolved' || current.status === 'closed' || current.status === 'archived') {
          return { status: 'closed' as const }
        }

        const assignments = await repository.listAssignmentsByCase(args.tenantId, args.caseId)
        const activeAssignment = assignments.find((assignment) => assignment.status === 'active')

        if (args.direction !== 'inbound' && !activeAssignment?.professionalId) {
          return { status: 'responsible_required' as const }
        }

        const normalizedAuthorProfessionalId = args.direction === 'inbound'
          ? args.authorProfessionalId
          : activeAssignment?.professionalId

        const latestMessage = await repository.getLatestMessage(args.tenantId, args.caseId)
        const latestMessageTimestamp = latestMessage ? Date.parse(latestMessage.createdAt) : Number.NaN
        const isImmediateRetryDuplicate = Boolean(
          latestMessage
          && latestMessage.body === args.body
          && latestMessage.direction === args.direction
          && (latestMessage.authorProfessionalId ?? undefined) === normalizedAuthorProfessionalId
          && Number.isFinite(latestMessageTimestamp)
          && (Date.now() - latestMessageTimestamp) <= 5_000
        )

        if (isImmediateRetryDuplicate) {
          return {
            status: 'duplicate' as const,
            message: latestMessage as CaseMessageRecord,
          }
        }

        mutationStarted = true
        const message = await repository.addMessage({
          tenantId: args.tenantId,
          caseId: args.caseId,
          authorProfessionalId: normalizedAuthorProfessionalId,
          body: args.body,
          direction: args.direction,
          messageType: 'note',
          messageStatus: 'sent',
          sentAt: new Date().toISOString(),
        })

        await timelineWriter.recordMessageAdded({
          tenantId: args.tenantId,
          caseId: args.caseId,
          actorProfessionalId: normalizedAuthorProfessionalId,
          messageId: message.id,
          sequenceNo: message.sequenceNo,
          messageType: message.messageType,
          direction: message.direction,
        })

        return {
          status: 'ready' as const,
          message,
          entityId: current.entityId ?? null,
        }
      })
    } catch (error) {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'add_message',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'add_message',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      if (messageOperation) {
        this.recordMessageMetric({
          metricName: 'legal_message_failed_total',
          tenantId: args.tenantId,
          source: messageSource,
          operation: messageOperation,
          result: 'failed',
          reason: 'write_failed',
        })
      }
      throw error
    }

    if (result.status === 'ready' && messageOperation) {
      this.recordMessageMetric({
        metricName: messageOperation === 'message_received'
          ? 'legal_message_received_total'
          : 'legal_message_sent_total',
        tenantId: args.tenantId,
        entityId: result.entityId,
        source: messageSource,
        operation: messageOperation,
        result: 'success',
      })
    }

    if (result.status === 'ready') {
      return {
        status: 'ready' as const,
        message: result.message,
      }
    }

    return result
  }

  async updateStatus(args: {
    tenantId: number
    caseId: string
    status: Extract<CaseStatus, 'accepted' | 'in_progress' | 'resolved'>
    reason?: string
  }) {
    let mutationStarted = false
    const result = await this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const current = await repository.getCaseByIdForUpdate(args.tenantId, args.caseId)
      if (!current) {
        return { status: 'not_found' as const }
      }

      if (current.status === args.status) {
        return {
          status: 'unchanged' as const,
          caseRecord: current,
        }
      }

      if (!this.isAllowedStatusTransition(current.status, args.status)) {
        return {
          status: 'invalid_transition' as const,
          caseRecord: current,
        }
      }

      const assignments = await repository.listAssignmentsByCase(args.tenantId, args.caseId)
      const responsibleProfessionalId = this.resolveOperationalResponsible(current, assignments)
      if (!responsibleProfessionalId) {
        return {
          status: 'responsible_required' as const,
          caseRecord: current,
        }
      }

      mutationStarted = true
      const updated = await repository.updateCaseStatus(args.tenantId, args.caseId, args.status, args.reason)
      if (!updated) {
        return { status: 'not_found' as const }
      }

      await timelineWriter.recordStatusChanged({
        tenantId: args.tenantId,
        caseId: args.caseId,
        actorProfessionalId: responsibleProfessionalId,
        from: current.status,
        to: args.status,
        reason: args.reason,
      })

      return {
        status: 'ready' as const,
        caseRecord: updated,
      }
    }).catch((error) => {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'status_change',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'status_change',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      throw error
    })

    if (result.status === 'ready') {
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_status_changed_total',
        tenantId: args.tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'legal_beta_case_service',
        operation: 'status_changed',
        status: result.caseRecord.status,
        result: 'success',
        reason: args.reason ?? 'manual',
      })
    }

    return result
  }

  async assign(args: {
    tenantId: number
    caseId: string
    professionalId: string
    assignedByProfessionalId?: string
  }) {
    let mutationStarted = false
    const result = await this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const current = await repository.getCaseByIdForUpdate(args.tenantId, args.caseId)
      if (!current) {
        return { status: 'not_found' as const }
      }

      if (current.status === 'resolved' || current.status === 'closed' || current.status === 'archived') {
        return { status: 'invalid_state' as const }
      }

      const assignments = await repository.listAssignmentsByCase(args.tenantId, args.caseId)
      const activeAssignment = assignments.find((assignment) => assignment.status === 'active')
      const nextStatus = current.status === 'open' ? 'dispatched' : current.status

      if (activeAssignment?.professionalId === args.professionalId) {
        await repository.updateCaseLeadProfessional(args.tenantId, args.caseId, args.professionalId)

        if (nextStatus !== current.status) {
          await repository.updateCaseStatus(args.tenantId, args.caseId, nextStatus)
        }

        return {
          status: 'assigned' as const,
          eventType: 'assigned' as const,
          entityId: current.entityId ?? null,
          changed: false,
        }
      }

      let eventType: 'assigned' | 'reassigned' = 'assigned'
      let oldProfessionalId: string | undefined

      if (activeAssignment) {
        mutationStarted = true
        await repository.revokeAssignment(args.tenantId, activeAssignment.id)
        eventType = 'reassigned'
        oldProfessionalId = activeAssignment.professionalId
      }

      mutationStarted = true
      const assignment = await repository.createAssignment({
        tenantId: args.tenantId,
        caseId: args.caseId,
        professionalId: args.professionalId,
        assignedByProfessionalId: args.assignedByProfessionalId,
        metadata: {
          source: 'legal-beta-assign',
        },
      })

      await repository.updateCaseLeadProfessional(args.tenantId, args.caseId, args.professionalId)

      if (nextStatus !== current.status) {
        await repository.updateCaseStatus(args.tenantId, args.caseId, nextStatus)
      }

      await timelineWriter.recordAssignmentChanged({
        tenantId: args.tenantId,
        caseId: args.caseId,
        type: eventType,
        actorProfessionalId: args.professionalId,
        professionalId: eventType === 'assigned' ? args.professionalId : undefined,
        oldProfessionalId,
        newProfessionalId: eventType === 'reassigned' ? args.professionalId : undefined,
        assignedByProfessionalId: args.assignedByProfessionalId,
        assignmentId: assignment.id,
        status: assignment.status,
        role: assignment.role,
      })

      return {
        status: 'assigned' as const,
        eventType,
        entityId: current.entityId ?? null,
        changed: true,
      }
    }).catch((error) => {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'assign',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'assign',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      throw error
    })

    if (result.status === 'assigned' && result.changed) {
      const isReassignment = result.eventType === 'reassigned'
      this.recordAssignmentMetric({
        metricName: isReassignment
          ? 'legal_assignment_reassigned_total'
          : 'legal_assignment_created_total',
        tenantId: args.tenantId,
        entityId: result.entityId,
        operation: isReassignment ? 'reassign' : 'assign',
        result: 'success',
        source: 'legal_beta_case_service',
      })

      if (!isReassignment) {
        this.recordCaseLifecycleMetric({
          metricName: 'legal_case_status_changed_total',
          tenantId: args.tenantId,
          entityId: result.entityId,
          source: 'legal_beta_case_service',
          operation: 'status_changed',
          status: 'dispatched',
          result: 'success',
          reason: 'assignment',
        })
      }
    }

    return result
  }

  async close(args: {
    tenantId: number
    caseId: string
    rating: number
    feedback?: string
    closedBy: string
  }) {
    let mutationStarted = false
    const result = await this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
      const timelineWriter = createLegalCanonicalTimelineWriteService(tx)
      const current = await repository.getCaseByIdForUpdate(args.tenantId, args.caseId)
      if (!current) {
        return { status: 'not_found' as const }
      }

      if (current.status === 'closed' || current.status === 'archived') {
        return { status: 'already_closed' as const }
      }

      if (current.status !== 'resolved') {
        return {
          status: 'invalid_state' as const,
          caseRecord: current,
        }
      }

      const assignments = await repository.listAssignmentsByCase(args.tenantId, args.caseId)
      const responsibleProfessionalId = this.resolveOperationalResponsible(current, assignments)
      if (!responsibleProfessionalId) {
        return {
          status: 'responsible_required' as const,
          caseRecord: current,
        }
      }

      const metadata = safeJsonObject(current.metadata)
      metadata.outcome = buildCaseOutcome({
        currentStatus: current.status,
        rating: args.rating,
        feedback: args.feedback,
        closedBy: args.closedBy,
      })

      mutationStarted = true
      await repository.updateCaseMetadata(args.tenantId, args.caseId, metadata)
      const updated = await repository.closeCase(args.tenantId, args.caseId, args.feedback)
      if (!updated) {
        return { status: 'not_found' as const }
      }

      await timelineWriter.recordClosed({
        tenantId: args.tenantId,
        caseId: args.caseId,
        actorProfessionalId: responsibleProfessionalId,
        closedBy: args.closedBy,
        rating: args.rating,
        responsibleProfessionalId,
      })

      return { status: 'closed' as const, caseRecord: updated }
    }).catch((error) => {
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
          operation: 'close_case',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId: args.tenantId,
          source: 'legal_beta_case_service',
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
        tenantId: args.tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'legal_beta_case_service',
        operation: 'status_changed',
        status: result.caseRecord.status,
        result: 'success',
        reason: 'close',
      })
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_closed_total',
        tenantId: args.tenantId,
        entityId: result.caseRecord.entityId ?? null,
        source: 'legal_beta_case_service',
        operation: 'case_closed',
        status: result.caseRecord.status,
        result: 'success',
        reason: args.feedback ? 'resolution' : 'manual',
      })
    }

    return result
  }

  async createPublicTriageCase(args: {
    entityId: string
    requestId: string
    userMessage: string
    sourceIp?: string
    attribution?: {
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
      utmTerm?: string
      utmContent?: string
      referrer?: string
      currentUrl?: string
      pathname?: string
    }
    triage?: {
      context: string
      urgency: 'critical' | 'priority' | 'planned'
      objective: string
      contactPreference: string
      contactValue: string
      clientName?: string
      preferredName?: string
      practiceArea?: string
      city?: string
    }
    businessContext?: {
      officeName?: string
    }
  }) {
    const entity = await this.entityRepository.getEntityById(args.entityId)
    if (!entity || typeof entity.ownerTenantId !== 'number') {
      return null
    }
    const tenantId = entity.ownerTenantId
    const canonicalInput = buildCanonicalCaseInputFromPublicTriage({
      requestId: args.requestId,
      userMessage: args.userMessage,
      leadId: '',
      intakeId: '',
      attribution: args.attribution,
      triage: args.triage,
      businessContext: args.businessContext,
    })
    const triageFingerprint = buildPublicTriageIntakeFingerprint({
      tenantId,
      entityId: args.entityId,
      practiceArea: canonicalInput.practiceArea,
      objective: args.triage?.objective,
      city: canonicalInput.city,
      occurredAt: canonicalInput.openedAt,
      windowMs: DEFAULT_PUBLIC_TRIAGE_FINGERPRINT_WINDOW_MS,
      contactIdentity: canonicalInput.contactIdentity,
      contactPreference: canonicalInput.contactPreference,
      contactValue: canonicalInput.contact,
    })
    const fingerprintExpiresAt = new Date(
      Date.parse(triageFingerprint.components.timeBucket) + DEFAULT_PUBLIC_TRIAGE_FINGERPRINT_WINDOW_MS,
    ).toISOString()
    const canonicalContactKey = hashPublicTriageIdentityKey(
      triageFingerprint.components.canonicalContact || canonicalInput.contact,
    )
    const ipKey = hashPublicTriageIdentityKey(args.sourceIp)
    const spamRepository = createLegalPublicTriageSpamRepository(this.db)
    const captchaVerification = await this.captchaProvider.verify(undefined, {
      tenantId,
      entityId: args.entityId,
      requestId: args.requestId,
      source: 'public_triage',
    })

    if (!captchaVerification.ok) {
      throw new PublicTriageRateLimitedError(args.requestId, captchaVerification.retryAfterSeconds ?? 300)
    }

    const [ipAttempts, contactAttempts, officeAttempts] = await Promise.all([
      ipKey
        ? spamRepository.countActiveEvents({
            ipKey,
            reasons: ['attempt_allowed', 'invalid_payload'],
            decisions: ['allow'],
          })
        : Promise.resolve(0),
      canonicalContactKey
        ? spamRepository.countActiveEvents({
            contactKey: canonicalContactKey,
            reasons: ['attempt_allowed'],
            decisions: ['allow'],
          })
        : Promise.resolve(0),
      spamRepository.countActiveEvents({
        tenantId,
        entityId: args.entityId,
        reasons: ['attempt_allowed', 'invalid_payload'],
        decisions: ['allow'],
      }),
    ])
    const spamDecision = evaluatePublicTriageSpamPolicy({
      ipAttempts,
      contactAttempts,
      officeAttempts,
    })
    const spamEventBase = {
      tenantId,
      entityId: args.entityId,
      ipKey,
      contactKey: canonicalContactKey,
      fingerprint: triageFingerprint.fingerprint,
      requestId: args.requestId,
      metadata: {
        fingerprintVersion: triageFingerprint.fingerprintVersion,
        fingerprintSource: triageFingerprint.source,
      },
    }

    if (spamDecision.decision !== 'allow') {
      await spamRepository.recordEvent({
        ...spamEventBase,
        reason: spamDecision.reason,
        decision: spamDecision.decision,
        expiresAt: new Date(Date.now() + (spamDecision.retryAfterSeconds ?? 300) * 1000).toISOString(),
      })
      this.recordSpamMetric(
        spamDecision.decision === 'cooldown'
          ? 'public_triage_spam_cooldown_total'
          : 'public_triage_spam_rate_limited_total',
        args.entityId,
        spamDecision.reason,
        spamDecision.decision,
      )
      this.recordSpamMetric('public_triage_spam_blocked_total', args.entityId, spamDecision.reason, spamDecision.decision)
      this.logPublicTriageEvent('warn', {
        event: 'public_triage_spam_blocked',
        requestId: args.requestId,
        fingerprintVersion: triageFingerprint.fingerprintVersion,
        fingerprintSource: triageFingerprint.source,
        entityId: args.entityId,
        tenantId,
        reason: spamDecision.reason,
        occurredAt: new Date().toISOString(),
      })
      throw new PublicTriageRateLimitedError(args.requestId, spamDecision.retryAfterSeconds ?? 300)
    }

    await spamRepository.recordEvent({
      ...spamEventBase,
      reason: 'attempt_allowed',
      decision: 'allow',
      expiresAt: new Date(Date.now() + Math.max(
        PUBLIC_TRIAGE_SPAM_POLICY.ip.windowMs,
        PUBLIC_TRIAGE_SPAM_POLICY.contact.windowMs,
        PUBLIC_TRIAGE_SPAM_POLICY.office.windowMs,
      )).toISOString(),
    })
    this.recordSpamMetric('public_triage_spam_allowed_total', args.entityId, 'attempt_allowed', 'allow')

    const portfolioCaptureCommand = {
      type: 'portfolio.public-triage.capture',
      commandId: buildPublicTriageReferenceId('public-triage-command', args.entityId, args.requestId),
      entityId: args.entityId,
      tenantId,
      requestId: args.requestId,
      userMessage: args.userMessage.trim(),
      city: args.triage?.city?.trim() || undefined,
      practiceArea: args.triage?.practiceArea?.trim() || undefined,
      urgency: args.triage?.urgency ?? 'planned',
      objective: args.triage?.objective?.trim() || undefined,
      contactPreference: args.triage?.contactPreference?.trim() || undefined,
      contactValue: args.triage?.contactValue?.trim() || undefined,
      attribution: args.attribution,
    } as const

    let mutationStarted = false
    const persisted = await this.db.transaction(async (tx) => {
      const caseRepository = createCaseRepository(tx)
      const fingerprintRepository = createLegalIntakeFingerprintRepository(tx)
      const publicTriageRequestIdWhereClause = buildPublicTriageRequestIdWhereClause(tx)

      const existing = await tx.get<{ id: string }>(
        `
          SELECT id
          FROM cases
          WHERE tenant_id = ?
            AND entity_id = ?
            AND ${publicTriageRequestIdWhereClause}
          ORDER BY created_at DESC
          LIMIT 1
        `,
        tenantId,
        args.entityId,
        args.requestId,
        args.requestId,
      )

      if (existing?.id) {
        const existingCase = await caseRepository.getCaseById(tenantId, existing.id)
        if (!existingCase) {
          throw new Error(`Public triage case "${existing.id}" could not be reloaded.`)
        }

        const nextMetadata = safeJsonObject(existingCase.metadata)
        const canonicalMetadata = safeJsonObject(canonicalInput.metadata)
        const existingPublicTriage = safeJsonObject(nextMetadata.publicTriage)
        const nextPublicTriage = {
          ...safeJsonObject(canonicalMetadata.publicTriage),
          ...existingPublicTriage,
          attribution: existingPublicTriage.attribution ?? safeJsonObject(canonicalMetadata.publicTriage).attribution,
        }
        nextMetadata.source = 'public-triage'
        nextMetadata.clientName = canonicalInput.clientName ?? nextMetadata.clientName
        nextMetadata.preferredName = safeJsonObject(canonicalInput.metadata).preferredName ?? nextMetadata.preferredName
        nextMetadata.contact = canonicalInput.contact ?? nextMetadata.contact
        nextMetadata.city = canonicalInput.city ?? nextMetadata.city
        nextMetadata.publicTriage = nextPublicTriage
        // Compatibility snapshot only. New operational identity must come from structured columns.

        mutationStarted = true
        await caseRepository.updateCaseMetadata(tenantId, existingCase.id, nextMetadata)
        const portalAccess = await this.issuePortalAccessToken({
          db: tx,
          tenantId,
          caseId: existingCase.id,
          source: 'public_triage_request_replay',
          requestId: args.requestId,
        })
        this.recordPublicTriageMetric('public_triage_request_replays_total', args.entityId, 'request_id_replay')
        this.recordPublicTriageMetric('public_triage_duplicate_prevented_total', args.entityId, 'request_id_replay')
        this.logPublicTriageEvent('info', {
          event: 'public_triage_request_replay_detected',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          caseId: existingCase.id,
          entityId: args.entityId,
          tenantId,
          reason: 'request_id_replay',
          occurredAt: new Date().toISOString(),
        })

        return {
          kind: 'ready' as const,
          caseRecord: (await caseRepository.getCaseById(tenantId, existingCase.id)) ?? existingCase,
          leadId: typeof nextMetadata.leadId === 'string' ? nextMetadata.leadId : '',
          intakeId: typeof nextMetadata.intakeId === 'string' ? nextMetadata.intakeId : '',
          portalAccess,
          lifecycleReason: 'request_replay' as const,
        }
      }

      const activeFingerprint = await fingerprintRepository.findActiveFingerprint({
        tenantId,
        entityId: args.entityId,
        fingerprint: triageFingerprint.fingerprint,
      })

      if (activeFingerprint?.caseId) {
        const existingCase = await caseRepository.getCaseById(tenantId, activeFingerprint.caseId)
        if (!existingCase) {
          throw new Error(`Public triage fingerprint "${activeFingerprint.id}" references missing case "${activeFingerprint.caseId}".`)
        }

        mutationStarted = true
        await fingerprintRepository.markFingerprintReused({
          id: activeFingerprint.id,
          caseId: existingCase.id,
        })

        const portalAccess = await this.issuePortalAccessToken({
          db: tx,
          tenantId,
          caseId: existingCase.id,
          source: 'public_triage_fingerprint_reuse',
          requestId: args.requestId,
        })
        this.recordPublicTriageMetric('public_triage_fingerprint_hits_total', args.entityId, 'pre_lookup_hit')
        this.recordPublicTriageMetric('public_triage_case_reused_total', args.entityId, 'pre_lookup_hit')
        this.recordPublicTriageMetric('public_triage_duplicate_prevented_total', args.entityId, 'pre_lookup_hit')
        this.logPublicTriageEvent('info', {
          event: 'public_triage_fingerprint_reused',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: activeFingerprint.id,
          caseId: existingCase.id,
          entityId: args.entityId,
          tenantId,
          reason: 'pre_lookup_hit',
          occurredAt: new Date().toISOString(),
        })

        return {
          kind: 'ready' as const,
          caseRecord: existingCase,
          leadId: typeof existingCase.metadata.leadId === 'string' ? existingCase.metadata.leadId : '',
          intakeId: typeof existingCase.metadata.intakeId === 'string' ? existingCase.metadata.intakeId : '',
          portalAccess,
          lifecycleReason: 'fingerprint_hit' as const,
        }
      }

      mutationStarted = true
      const fingerprintReservationResult = await fingerprintRepository.createFingerprintReservation({
        tenantId,
        entityId: args.entityId,
        fingerprint: triageFingerprint.fingerprint,
        fingerprintVersion: triageFingerprint.fingerprintVersion,
        source: triageFingerprint.source,
        timeBucket: triageFingerprint.components.timeBucket,
        requestId: args.requestId,
        expiresAt: fingerprintExpiresAt,
        metadata: {
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          source: triageFingerprint.source,
          practiceArea: triageFingerprint.components.practiceArea,
          cityKey: triageFingerprint.components.cityKey,
          objectiveKeyHashPresent: triageFingerprint.components.objectiveKey.length > 0,
          hasCanonicalContact: triageFingerprint.components.canonicalContact.length > 0,
        },
      })
      const fingerprintReservation = fingerprintReservationResult.fingerprint

      if (!fingerprintReservation) {
        throw new Error('Public triage fingerprint reservation could not be reloaded.')
      }

      if (fingerprintReservationResult.outcome === 'created') {
        this.recordPublicTriageMetric('public_triage_fingerprint_reservations_total', args.entityId, 'reservation_created')
        this.logPublicTriageEvent('info', {
          event: 'public_triage_fingerprint_reservation_created',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: fingerprintReservation.id,
          entityId: args.entityId,
          tenantId,
          reason: 'reservation_created',
          occurredAt: new Date().toISOString(),
        })
      } else {
        this.recordPublicTriageMetric('public_triage_duplicate_prevented_total', args.entityId, 'reservation_conflict')
        this.logPublicTriageEvent('warn', {
          event: 'public_triage_fingerprint_conflict_detected',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: fingerprintReservation.id,
          caseId: fingerprintReservation.caseId,
          entityId: args.entityId,
          tenantId,
          reason: 'reservation_conflict',
          occurredAt: new Date().toISOString(),
        })
      }

      if (fingerprintReservation.caseId && fingerprintReservation.requestId !== args.requestId) {
        const existingCase = await caseRepository.getCaseById(tenantId, fingerprintReservation.caseId)
        if (!existingCase) {
          throw new Error(`Public triage fingerprint "${fingerprintReservation.id}" references missing case "${fingerprintReservation.caseId}".`)
        }

        mutationStarted = true
        await fingerprintRepository.markFingerprintReused({
          id: fingerprintReservation.id,
          caseId: existingCase.id,
        })

        const portalAccess = await this.issuePortalAccessToken({
          db: tx,
          tenantId,
          caseId: existingCase.id,
          source: 'public_triage_fingerprint_conflict_reuse',
          requestId: args.requestId,
        })
        this.recordPublicTriageMetric('public_triage_fingerprint_hits_total', args.entityId, 'reservation_conflict_reused')
        this.recordPublicTriageMetric('public_triage_case_reused_total', args.entityId, 'reservation_conflict_reused')
        this.recordPublicTriageMetric('public_triage_duplicate_prevented_total', args.entityId, 'reservation_conflict_reused')
        this.logPublicTriageEvent('info', {
          event: 'public_triage_fingerprint_reused',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: fingerprintReservation.id,
          caseId: existingCase.id,
          entityId: args.entityId,
          tenantId,
          reason: 'reservation_conflict_reused',
          occurredAt: new Date().toISOString(),
        })

        return {
          kind: 'ready' as const,
          caseRecord: existingCase,
          leadId: typeof existingCase.metadata.leadId === 'string' ? existingCase.metadata.leadId : '',
          intakeId: typeof existingCase.metadata.intakeId === 'string' ? existingCase.metadata.intakeId : '',
          portalAccess,
          lifecycleReason: 'fingerprint_hit' as const,
        }
      }

      if (fingerprintReservation.requestId !== args.requestId && !fingerprintReservation.caseId) {
        this.recordPublicTriageMetric('public_triage_concurrency_pending_total', args.entityId, 'pending_wait_started')
        this.logPublicTriageEvent('warn', {
          event: 'public_triage_pending_wait_started',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: fingerprintReservation.id,
          entityId: args.entityId,
          tenantId,
          reason: 'pending_wait_started',
          occurredAt: new Date().toISOString(),
        })
        return {
          kind: 'pending' as const,
          fingerprintId: fingerprintReservation.id,
        }
      }

      mutationStarted = true
      const portfolioCapture = await this.sovereignMutationCommandService.submitPortfolioPublicTriageCaptureInTransaction(
        portfolioCaptureCommand,
        tx,
      ) as {
        signalId: string
        leadId: string
        intakeId: string
      }
      const canonicalInputWithPortfolio = buildCanonicalCaseInputFromPublicTriage({
        requestId: args.requestId,
        userMessage: args.userMessage,
        leadId: portfolioCapture.leadId,
        intakeId: portfolioCapture.intakeId,
        attribution: args.attribution,
        triage: args.triage,
        businessContext: args.businessContext,
      })
      const canonicalTriagePayload = readCanonicalPublicTriagePayload(canonicalInputWithPortfolio)

      const { legalCase: caseRecord } = await this.persistCaseWithInitialHistory(caseRepository, {
        tenantId,
        entityId: args.entityId,
        requestId: args.requestId,
        caseNumber: canonicalInput.caseNumber,
        title: buildStructuredPublicTriageTitle(canonicalTriagePayload),
        description: buildStructuredPublicTriageMessage(canonicalTriagePayload),
        status: canonicalInput.status,
        priority: canonicalInput.priority,
        practiceArea: canonicalInput.practiceArea,
        source: 'public-interaction',
        autoDispatch: false,
        openedAt: canonicalInput.openedAt,
        contactIdentity: canonicalInputWithPortfolio.contactIdentity,
        metadata: canonicalInputWithPortfolio.metadata,
        initialMessage: canonicalInputWithPortfolio.initialMessage,
      })
      await fingerprintRepository.markFingerprintCaseCreated({
        id: fingerprintReservation.id,
        caseId: caseRecord.id,
      })
      const portalAccess = await this.issuePortalAccessToken({
        db: tx,
        tenantId,
        caseId: caseRecord.id,
        source: 'public_triage_case_created',
        requestId: args.requestId,
      })

      return {
        kind: 'ready' as const,
        caseRecord,
        leadId: portfolioCapture.leadId,
        intakeId: portfolioCapture.intakeId,
        portalAccess,
        lifecycleReason: 'created' as const,
      }
    }).catch((error) => {
      this.recordTransactionMetric({
        metricName: 'legal_transaction_failures_total',
        tenantId,
        entityId: args.entityId,
        source: 'public_triage',
        operation: 'public_triage',
        stage: 'transaction',
        result: 'failed',
        reason: 'exception',
      })
      if (mutationStarted) {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_rollbacks_total',
          tenantId,
          entityId: args.entityId,
          source: 'public_triage',
          operation: 'public_triage',
          stage: 'rollback',
          result: 'failed',
          reason: 'exception',
        })
      }
      throw error
    })

    if (persisted.kind === 'pending') {
      const resolvedFingerprint = await this.waitForFingerprintCaseCreated({
        tenantId,
        entityId: args.entityId,
        fingerprint: triageFingerprint.fingerprint,
      })

      if (!resolvedFingerprint?.caseId) {
        this.recordPublicTriageMetric('public_triage_creation_pending_total', args.entityId, 'pending_timeout')
        this.logPublicTriageEvent('warn', {
          event: 'public_triage_creation_pending_timeout',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: persisted.fingerprintId,
          entityId: args.entityId,
          tenantId,
          reason: 'pending_timeout',
          occurredAt: new Date().toISOString(),
        })
        throw new PublicTriageCreationPendingError(args.requestId)
      }
      const resolvedCaseId = resolvedFingerprint.caseId

      let pendingMutationStarted = false
      const resolvedResult = await this.db.transaction(async (tx) => {
        const caseRepository = createCaseRepository(tx)
        const fingerprintRepository = createLegalIntakeFingerprintRepository(tx)
        const existingCase = await caseRepository.getCaseById(tenantId, resolvedCaseId)
        if (!existingCase) {
          throw new Error(`Resolved public triage fingerprint "${resolvedFingerprint.id}" references missing case "${resolvedCaseId}".`)
        }

        pendingMutationStarted = true
        await fingerprintRepository.markFingerprintReused({
          id: resolvedFingerprint.id,
          caseId: existingCase.id,
        })

        const portalAccess = await this.issuePortalAccessToken({
          db: tx,
          tenantId,
          caseId: existingCase.id,
          source: 'public_triage_pending_reuse',
          requestId: args.requestId,
        })
        this.recordPublicTriageMetric('public_triage_fingerprint_hits_total', args.entityId, 'pending_resolved')
        this.recordPublicTriageMetric('public_triage_case_reused_total', args.entityId, 'pending_resolved')
        this.recordPublicTriageMetric('public_triage_duplicate_prevented_total', args.entityId, 'pending_resolved')
        this.logPublicTriageEvent('info', {
          event: 'public_triage_pending_resolved',
          requestId: args.requestId,
          fingerprintVersion: triageFingerprint.fingerprintVersion,
          fingerprintSource: triageFingerprint.source,
          fingerprintId: resolvedFingerprint.id,
          caseId: existingCase.id,
          entityId: args.entityId,
          tenantId,
          reason: 'pending_resolved',
          occurredAt: new Date().toISOString(),
        })

        return {
          caseRecord: existingCase,
          leadRecord: {
            leadId: typeof existingCase.metadata.leadId === 'string' ? existingCase.metadata.leadId : '',
          },
          intakeRecord: {
            intakeId: typeof existingCase.metadata.intakeId === 'string' ? existingCase.metadata.intakeId : '',
          },
          portalAccess,
          entity,
        }
      }).catch((error) => {
        this.recordTransactionMetric({
          metricName: 'legal_transaction_failures_total',
          tenantId,
          entityId: args.entityId,
          source: 'public_triage',
          operation: 'public_triage',
          stage: 'transaction',
          result: 'failed',
          reason: 'exception',
        })
        if (pendingMutationStarted) {
          this.recordTransactionMetric({
            metricName: 'legal_transaction_rollbacks_total',
            tenantId,
            entityId: args.entityId,
            source: 'public_triage',
            operation: 'public_triage',
            stage: 'rollback',
            result: 'failed',
            reason: 'exception',
          })
        }
        throw error
      })

      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_reused_total',
        tenantId,
        entityId: resolvedResult.caseRecord.entityId ?? null,
        source: 'public_triage',
        operation: 'case_reused',
        result: 'success',
        reason: 'pending_resolved',
      })

      return resolvedResult
    }

    this.recordMessageMetric({
      metricName: 'legal_message_received_total',
      tenantId,
      entityId: persisted.caseRecord.entityId ?? null,
      source: 'public_triage',
      operation: 'message_received',
      result: 'success',
    })

    if (persisted.lifecycleReason === 'created') {
      this.recordPublicTriageCaseCreatedMetric({
        tenantId,
        entityId: persisted.caseRecord.entityId ?? null,
      })
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_created_total',
        tenantId,
        entityId: persisted.caseRecord.entityId ?? null,
        source: 'public_triage',
        operation: 'case_created',
        result: 'success',
      })
    } else {
      this.recordCaseLifecycleMetric({
        metricName: 'legal_case_reused_total',
        tenantId,
        entityId: persisted.caseRecord.entityId ?? null,
        source: 'public_triage',
        operation: 'case_reused',
        result: 'success',
        reason: persisted.lifecycleReason,
      })
    }

    return {
      caseRecord: persisted.caseRecord,
      leadRecord: {
        leadId: persisted.leadId,
      },
      intakeRecord: {
        intakeId: persisted.intakeId,
      },
      portalAccess: persisted.portalAccess,
      entity,
    }
  }

  async getClientPortalCase(args: {
    tenantId: number
    caseId: string
  }) {
    const caseRecord = await this.caseRepository.getCaseById(args.tenantId, args.caseId)
    if (!caseRecord) {
      return null
    }

    const [canonical, entity] = await Promise.all([
      this.canonicalCaseReadService.getCanonicalCase({
        tenantId: args.tenantId,
        caseId: args.caseId,
      }),
      caseRecord.entityId ? this.entityRepository.getEntityById(caseRecord.entityId) : Promise.resolve(null),
    ])
    if (!canonical) {
      return null
    }

    const businessConfig = entity ? readEntityBusinessConfig(entity.entityProfile as EntityProfile) : undefined
    const officeName = businessConfig?.officeName ?? (entity ? buildPublicOfficeProfile(entity.id, entity.entityProfile as EntityProfile).name : 'Escritório BrandSoul Legal')
    const clientPortalTimeline = buildClientPortalTimelineProjection(canonical.case.timeline)
    const portalCanonical = {
      ...canonical,
      case: {
        ...canonical.case,
        timeline: clientPortalTimeline,
      },
    }

    return {
      caseId: portalCanonical.case.caseId,
      status: portalCanonical.case.status === 'archived' ? 'closed' : portalCanonical.case.status,
      practiceArea: portalCanonical.case.practiceArea,
      officeName,
      createdAt: portalCanonical.case.openedAt,
      updatedAt: caseRecord.updatedAt,
      responsibleProfessional: portalCanonical.case.responsibleProfessional
        ? {
            id: portalCanonical.case.responsibleProfessional.id,
            displayName: portalCanonical.case.responsibleProfessional.displayName,
            photoUrl: portalCanonical.case.responsibleProfessional.photoUrl,
            oabCredential: portalCanonical.case.responsibleProfessional.oabCredential,
            specialty: portalCanonical.case.responsibleProfessional.specialty,
          }
        : undefined,
      timeline: portalCanonical.case.timeline,
      canonical: portalCanonical,
      _messages: canonical.case.messages,
    }
  }

  async getLawyerReputation(tenantId: number, entityId: string, lawyerId: string) {
    const cases = await this.listCasesByEntity(tenantId, entityId)
    const assignedCases = cases.filter((legalCase) => legalCase.assignedProfessionalId === lawyerId || legalCase.assignedLawyerId === lawyerId)
    const closedCases = assignedCases.filter((legalCase) => legalCase.status === 'closed')
    const ratedCases = closedCases.filter((legalCase) => typeof legalCase.outcome?.rating === 'number')
    const ratingCount = ratedCases.length
    const mockRevenueCents = assignedCases.reduce((total, legalCase) => total + (Number((legalCase.monetization as { amountCents?: number } | undefined)?.amountCents ?? 0)), 0)

    const responseTimesInMinutes = assignedCases.flatMap((legalCase) => {
      const firstUserMessage = legalCase.messages.find((message) => message.role === 'user')
      const firstLawyerReply = legalCase.messages.find((message) => (
        message.role === 'lawyer' && Date.parse(message.createdAt) > Date.parse(firstUserMessage?.createdAt ?? '')
      ))

      if (!firstUserMessage || !firstLawyerReply) {
        return []
      }

      const firstUserTimestamp = Date.parse(firstUserMessage.createdAt)
      const firstLawyerTimestamp = Date.parse(firstLawyerReply.createdAt)
      if (Number.isNaN(firstUserTimestamp) || Number.isNaN(firstLawyerTimestamp) || firstLawyerTimestamp <= firstUserTimestamp) {
        return []
      }

      return [(firstLawyerTimestamp - firstUserTimestamp) / 60_000]
    })

    return {
      assignedCases: assignedCases.length,
      closedCases: closedCases.length,
      averageRating: ratingCount > 0
        ? ratedCases.reduce((total, legalCase) => total + Number(legalCase.outcome?.rating ?? 0), 0) / ratingCount
        : null,
      ratingCount,
      averageFirstResponseMinutes: responseTimesInMinutes.length > 0
        ? responseTimesInMinutes.reduce((total, minutes) => total + minutes, 0) / responseTimesInMinutes.length
        : null,
      mockRevenueCents,
      closureRate: assignedCases.length > 0 ? closedCases.length / assignedCases.length : 0,
    }
  }

  async buildOfficeBusinessConfig(tenantId: number, officeId: string, entityProfile: EntityProfile) {
    const professionals = await this.caseRepository.listDetailedProfessionalsForTenant(tenantId)
    return buildOfficeBusinessConfigProjection(readEntityBusinessConfig(entityProfile), professionals, officeId)
  }

  async listOfficeProfessionals(tenantId: number, officeId: string) {
    const professionals = await this.caseRepository.listDetailedProfessionalsForTenant(tenantId)
    return professionals.filter((professional) => professional.officeId === officeId)
  }

}

export function createLegalBetaCaseService(
  db: BackendDatabase,
  sovereignMutationCommandService: SovereignMutationCommandService,
  options?: {
    observability?: ObservabilityService
    captchaProvider?: CaptchaVerificationProvider
    logger?: {
      info(payload: unknown, message?: string): void
      warn(payload: unknown, message?: string): void
    }
  },
) {
  return new LegalBetaCaseService(
    db,
    sovereignMutationCommandService,
    options?.observability,
    options?.captchaProvider ?? createNoopCaptchaVerificationProvider(),
    options?.logger,
  )
}
