import type { BackendDatabase } from '../../db/index.js'
import { createEntityRepository } from '../../repositories/entityRepository.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'

import { createCaseRepository } from './caseRepository.js'
import type { CaseMessageRecord, CaseRecord, CaseStatus, CaseTimelineEventRecord } from './caseTypes.js'
import { buildLegalCaseIdentity } from './legalCanonicalIdentity.js'
import { buildCanonicalCaseInputFromPublicTriage } from './legalCanonicalCaseInput.js'
import { buildCanonicalCaseProjection } from './legalCanonicalProjection.js'
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
    ? "metadata #>> '{publicTriage,requestId}' = ?"
    : "json_extract(metadata, '$.publicTriage.requestId') = ?"
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

export class LegalBetaCaseService {
  constructor(
    private readonly db: BackendDatabase,
    private readonly sovereignMutationCommandService: SovereignMutationCommandService,
  ) {}

  private get caseRepository() {
    return createCaseRepository(this.db)
  }

  private get entityRepository() {
    return createEntityRepository(this.db)
  }

  async listCasesByEntity(tenantId: number, entityId: string) {
    const cases = await this.caseRepository.listCasesByEntity(tenantId, entityId)
    return Promise.all(cases.map((caseRecord) => this.getLegacyCaseProjection(tenantId, caseRecord)))
  }

  async getLegacyCaseProjection(tenantId: number, caseRecord: CaseRecord) {
    const [messages, timeline, assignedProfessionalId] = await Promise.all([
      this.caseRepository.listMessages(tenantId, caseRecord.id),
      this.caseRepository.listTimelineEvents(tenantId, caseRecord.id),
      this.resolveAssignedProfessionalId(tenantId, caseRecord),
    ])

    const legacyCase = normalizeLegacyCase({
      tenantId,
      caseRecord,
      messages,
      timeline,
      projectionAssignedProfessionalId: assignedProfessionalId,
    })

    const lastInteractionAt = messages[messages.length - 1]?.createdAt
      ?? timeline[timeline.length - 1]?.occurredAt
      ?? caseRecord.updatedAt

    const canonical = buildCanonicalCaseProjection({
      ...buildLegalCaseIdentity({
        caseRecord,
        lastInteractionAt,
      }),
      timeline,
      messages,
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
    return this.caseRepository.listMessages(tenantId, caseId)
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
  }) {
    return this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
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
          message: latestMessage!,
        }
      }

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

      await repository.addTimelineEvent({
        tenantId: args.tenantId,
        caseId: args.caseId,
        eventType: 'message_added',
        actorProfessionalId: normalizedAuthorProfessionalId,
        payload: {
          sequenceNo: message.sequenceNo,
        },
      })

      return {
        status: 'ready' as const,
        message,
      }
    })
  }

  async updateStatus(args: {
    tenantId: number
    caseId: string
    status: Extract<CaseStatus, 'accepted' | 'in_progress' | 'resolved'>
    reason?: string
  }) {
    return this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
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

      const updated = await repository.updateCaseStatus(args.tenantId, args.caseId, args.status, args.reason)
      if (!updated) {
        return { status: 'not_found' as const }
      }

      await repository.addTimelineEvent({
        tenantId: args.tenantId,
        caseId: args.caseId,
        eventType: 'status_changed',
        actorProfessionalId: responsibleProfessionalId,
        payload: {
          from: current.status,
          to: args.status,
          reason: args.reason,
        },
      })

      return {
        status: 'ready' as const,
        caseRecord: updated,
      }
    })
  }

  async assign(args: {
    tenantId: number
    caseId: string
    professionalId: string
    assignedByProfessionalId?: string
  }) {
    return this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
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

        return { status: 'assigned' as const }
      }

      let eventType: 'assigned' | 'reassigned' = 'assigned'
      let payload: Record<string, unknown> = {
        professionalId: args.professionalId,
        assignedByProfessionalId: args.assignedByProfessionalId,
      }

      if (activeAssignment) {
        await repository.revokeAssignment(args.tenantId, activeAssignment.id)
        eventType = 'reassigned'
        payload = {
          oldProfessionalId: activeAssignment.professionalId,
          newProfessionalId: args.professionalId,
          assignedByProfessionalId: args.assignedByProfessionalId,
        }
      }

      await repository.createAssignment({
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

      await repository.addTimelineEvent({
        tenantId: args.tenantId,
        caseId: args.caseId,
        eventType,
        actorProfessionalId: args.professionalId,
        payload,
      })

      return { status: 'assigned' as const }
    })
  }

  async close(args: {
    tenantId: number
    caseId: string
    rating: number
    feedback?: string
    closedBy: string
  }) {
    return this.db.transaction(async (tx) => {
      const repository = createCaseRepository(tx)
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

      await repository.updateCaseMetadata(args.tenantId, args.caseId, metadata)
      const updated = await repository.closeCase(args.tenantId, args.caseId, args.feedback)
      if (!updated) {
        return { status: 'not_found' as const }
      }

      await repository.addTimelineEvent({
        tenantId: args.tenantId,
        caseId: args.caseId,
        eventType: 'closed',
        actorProfessionalId: responsibleProfessionalId,
        payload: {
          closedBy: args.closedBy,
          rating: args.rating,
          responsibleProfessionalId,
        },
      })

      return { status: 'closed' as const, caseRecord: updated }
    })
  }

  async createPublicTriageCase(args: {
    entityId: string
    requestId: string
    userMessage: string
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

    const portfolioCapture = await this.sovereignMutationCommandService.submitCommand({
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
    }) as {
      signalId: string
      leadId: string
      intakeId: string
    }

    const canonicalInput = buildCanonicalCaseInputFromPublicTriage({
      requestId: args.requestId,
      userMessage: args.userMessage,
      leadId: portfolioCapture.leadId,
      intakeId: portfolioCapture.intakeId,
      attribution: args.attribution,
      triage: args.triage,
      businessContext: args.businessContext,
    })

    const persisted = await this.db.transaction(async (tx) => {
      const caseRepository = createCaseRepository(tx)
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
        nextMetadata.leadId = portfolioCapture.leadId
        nextMetadata.intakeId = portfolioCapture.intakeId
        nextMetadata.clientName = canonicalInput.clientName ?? nextMetadata.clientName
        nextMetadata.preferredName = safeJsonObject(canonicalInput.metadata).preferredName ?? nextMetadata.preferredName
        nextMetadata.contact = canonicalInput.contact ?? nextMetadata.contact
        nextMetadata.city = canonicalInput.city ?? nextMetadata.city
        nextMetadata.publicTriage = nextPublicTriage
        nextMetadata.canonicalCaseInput = {
          ...safeJsonObject(canonicalMetadata.canonicalCaseInput),
          clientName: canonicalInput.clientName ?? safeJsonObject(canonicalMetadata.canonicalCaseInput).clientName,
          contact: canonicalInput.contact ?? safeJsonObject(canonicalMetadata.canonicalCaseInput).contact,
          contactPreference:
            canonicalInput.contactPreference ?? safeJsonObject(canonicalMetadata.canonicalCaseInput).contactPreference,
          city: canonicalInput.city ?? safeJsonObject(canonicalMetadata.canonicalCaseInput).city,
          practiceArea: canonicalInput.practiceArea ?? safeJsonObject(canonicalMetadata.canonicalCaseInput).practiceArea,
          metadata: {
            ...safeJsonObject(safeJsonObject(canonicalMetadata.canonicalCaseInput).metadata),
            clientName: canonicalInput.clientName ?? nextMetadata.clientName,
            preferredName: safeJsonObject(canonicalInput.metadata).preferredName ?? nextMetadata.preferredName,
            city: canonicalInput.city ?? nextMetadata.city,
            contact: canonicalInput.contact ?? nextMetadata.contact,
            publicTriage: nextPublicTriage,
          },
        }

        await caseRepository.updateCaseMetadata(tenantId, existingCase.id, nextMetadata)

        return {
          caseRecord: (await caseRepository.getCaseById(tenantId, existingCase.id)) ?? existingCase,
          leadId: portfolioCapture.leadId,
          intakeId: portfolioCapture.intakeId,
        }
      }

      const canonicalTriagePayload = readCanonicalPublicTriagePayload(canonicalInput)

      const caseRecord = await caseRepository.createCase({
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
        metadata: canonicalInput.metadata,
        initialMessage: canonicalInput.initialMessage,
      })

      await caseRepository.addTimelineEvent({
        tenantId,
        caseId: caseRecord.id,
        eventType: 'created',
        payload: {
          source: 'public-triage',
          leadId: portfolioCapture.leadId,
          intakeId: portfolioCapture.intakeId,
        },
      })

      return {
        caseRecord,
        leadId: portfolioCapture.leadId,
        intakeId: portfolioCapture.intakeId,
      }
    })

    const portalAccess = await issueCasePortalAccessToken({
      db: this.db,
      tenantId,
      caseId: persisted.caseRecord.id,
    })

    return {
      caseRecord: persisted.caseRecord,
      leadRecord: {
        leadId: persisted.leadId,
      },
      intakeRecord: {
        intakeId: persisted.intakeId,
      },
      portalAccess,
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

    const [messages, timeline, entity, assignedProfessionalId] = await Promise.all([
      this.caseRepository.listMessages(args.tenantId, args.caseId),
      this.caseRepository.listTimelineEvents(args.tenantId, args.caseId),
      caseRecord.entityId ? this.entityRepository.getEntityById(caseRecord.entityId) : Promise.resolve(null),
      this.resolveAssignedProfessionalId(args.tenantId, caseRecord),
    ])

    const businessConfig = entity ? readEntityBusinessConfig(entity.entityProfile as EntityProfile) : undefined
    const officeName = businessConfig?.officeName ?? (entity ? buildPublicOfficeProfile(entity.id, entity.entityProfile as EntityProfile).name : 'Escritório BrandSoul Legal')
    const professionals = await this.caseRepository.listDetailedProfessionalsForTenant(args.tenantId)
    const responsibleProfessional = professionals.find((professional) => professional.id === assignedProfessionalId) ?? null
    const lastInteractionAt = messages[messages.length - 1]?.createdAt
      ?? timeline[timeline.length - 1]?.occurredAt
      ?? caseRecord.updatedAt
    const clientPortalTimeline = buildClientPortalTimelineProjection(timeline)
    const canonical = buildCanonicalCaseProjection({
      ...buildLegalCaseIdentity({
        caseRecord,
        responsibleProfessional,
        lastInteractionAt,
      }),
      timeline: clientPortalTimeline,
    })

    return {
      caseId: canonical.case.caseId,
      status: canonical.case.status === 'archived' ? 'closed' : canonical.case.status,
      practiceArea: canonical.case.practiceArea,
      officeName,
      createdAt: canonical.case.openedAt,
      updatedAt: caseRecord.updatedAt,
      responsibleProfessional: canonical.case.responsibleProfessional
        ? {
            id: canonical.case.responsibleProfessional.id,
            displayName: canonical.case.responsibleProfessional.displayName,
            photoUrl: canonical.case.responsibleProfessional.photoUrl,
            oabCredential: canonical.case.responsibleProfessional.oabCredential,
            specialty: canonical.case.responsibleProfessional.specialty,
          }
        : undefined,
      timeline: canonical.case.timeline,
      canonical,
      _messages: messages,
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

  async resolveAssignedProfessionalId(tenantId: number, caseRecord: CaseRecord) {
    const assignments = await this.caseRepository.listAssignmentsByCase(tenantId, caseRecord.id)
    const activeAssignments = assignments
      .filter((assignment) => assignment.status === 'active')
      .sort((left, right) => Date.parse(right.assignedAt) - Date.parse(left.assignedAt))

    return activeAssignments[0]?.professionalId ?? caseRecord.leadProfessionalId
  }
}

export function createLegalBetaCaseService(db: BackendDatabase, sovereignMutationCommandService: SovereignMutationCommandService) {
  return new LegalBetaCaseService(db, sovereignMutationCommandService)
}
