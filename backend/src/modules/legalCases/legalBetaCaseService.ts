import type { BackendDatabase } from '../../db/index.js'
import { createEntityRepository } from '../../repositories/entityRepository.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'

import { createCaseRepository } from './caseRepository.js'
import type { CaseMessageRecord, CaseRecord, CaseStatus, CaseTimelineEventRecord } from './caseTypes.js'
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
  resolvePublicTriagePriority,
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

    return normalizeLegacyCase({
      tenantId,
      caseRecord,
      messages,
      timeline,
      projectionAssignedProfessionalId: assignedProfessionalId,
    })
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

  async addMessage(args: {
    tenantId: number
    caseId: string
    authorProfessionalId?: string
    body: string
    direction: 'inbound' | 'outbound' | 'internal'
  }) {
    const message = await this.caseRepository.addMessage({
      tenantId: args.tenantId,
      caseId: args.caseId,
      authorProfessionalId: args.authorProfessionalId,
      body: args.body,
      direction: args.direction,
      messageType: 'note',
      messageStatus: 'sent',
      sentAt: new Date().toISOString(),
    })

    await this.caseRepository.addTimelineEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      eventType: 'message_added',
      actorProfessionalId: args.authorProfessionalId,
      payload: {
        sequenceNo: message.sequenceNo,
      },
    })

    return message
  }

  async updateStatus(args: {
    tenantId: number
    caseId: string
    status: Extract<CaseStatus, 'in_progress' | 'pending' | 'on_hold'>
    reason?: string
  }) {
    const current = await this.caseRepository.getCaseById(args.tenantId, args.caseId)
    if (!current) {
      return null
    }

    const updated = await this.caseRepository.updateCaseStatus(args.tenantId, args.caseId, args.status, args.reason)
    if (!updated) {
      return null
    }

    await this.caseRepository.addTimelineEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      eventType: 'status_changed',
      payload: {
        from: current.status,
        to: args.status,
        reason: args.reason,
      },
    })

    return updated
  }

  async assign(args: {
    tenantId: number
    caseId: string
    professionalId: string
    assignedByProfessionalId?: string
  }) {
    const current = await this.caseRepository.getCaseById(args.tenantId, args.caseId)
    if (!current) {
      return { status: 'not_found' as const }
    }

    const assignments = await this.caseRepository.listAssignmentsByCase(args.tenantId, args.caseId)
    const alreadyActive = assignments.find((assignment) => assignment.professionalId === args.professionalId && assignment.status === 'active')

    if (!alreadyActive) {
      await this.caseRepository.createAssignment({
        tenantId: args.tenantId,
        caseId: args.caseId,
        professionalId: args.professionalId,
        assignedByProfessionalId: args.assignedByProfessionalId,
        metadata: {
          source: 'legal-beta-assign',
        },
      })
    }

    await this.caseRepository.updateCaseLeadProfessional(args.tenantId, args.caseId, args.professionalId)

    const nextStatus = current.status === 'open' ? 'dispatched' : current.status
    if (nextStatus !== current.status) {
      await this.caseRepository.updateCaseStatus(args.tenantId, args.caseId, nextStatus)
    }

    await this.caseRepository.addTimelineEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      eventType: 'assigned',
      actorProfessionalId: args.professionalId,
      payload: {
        professionalId: args.professionalId,
      },
    })

    return { status: 'assigned' as const }
  }

  async close(args: {
    tenantId: number
    caseId: string
    rating: number
    feedback?: string
    closedBy: string
  }) {
    const current = await this.caseRepository.getCaseById(args.tenantId, args.caseId)
    if (!current) {
      return { status: 'not_found' as const }
    }

    if (current.status === 'closed' || current.status === 'archived') {
      return { status: 'already_closed' as const }
    }

    const metadata = safeJsonObject(current.metadata)
    metadata.outcome = buildCaseOutcome({
      currentStatus: current.status,
      rating: args.rating,
      feedback: args.feedback,
      closedBy: args.closedBy,
    })

    await this.caseRepository.updateCaseMetadata(args.tenantId, args.caseId, metadata)
    const updated = await this.caseRepository.closeCase(args.tenantId, args.caseId, args.feedback)
    if (!updated) {
      return { status: 'not_found' as const }
    }

    await this.caseRepository.addTimelineEvent({
      tenantId: args.tenantId,
      caseId: args.caseId,
      eventType: 'closed',
      payload: {
        closedBy: args.closedBy,
        rating: args.rating,
      },
    })

    return { status: 'closed' as const, caseRecord: updated }
  }

  async createPublicTriageCase(args: {
    entityId: string
    requestId: string
    userMessage: string
    triage?: {
      context: string
      urgency: 'critical' | 'priority' | 'planned'
      objective: string
      contactPreference: string
      contactValue: string
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
    }) as {
      signalId: string
      leadId: string
      intakeId: string
    }

    const persisted = await this.db.transaction(async (tx) => {
      const caseRepository = createCaseRepository(tx)

      const existing = await tx.get<{ id: string }>(
        `
          SELECT id
          FROM cases
          WHERE tenant_id = ?
            AND entity_id = ?
            AND json_extract(metadata, '$.publicTriage.requestId') = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
        tenantId,
        args.entityId,
        args.requestId,
      ).catch(() => null)

      if (existing?.id) {
        const existingCase = await caseRepository.getCaseById(tenantId, existing.id)
        if (!existingCase) {
          throw new Error(`Public triage case "${existing.id}" could not be reloaded.`)
        }

        const nextMetadata = safeJsonObject(existingCase.metadata)
        nextMetadata.source = 'public-triage'
        nextMetadata.leadId = portfolioCapture.leadId
        nextMetadata.intakeId = portfolioCapture.intakeId
        nextMetadata.contact = args.triage?.contactValue?.trim() || nextMetadata.contact
        nextMetadata.city = args.triage?.city?.trim() || nextMetadata.city
        nextMetadata.publicTriage = {
          ...safeJsonObject(nextMetadata.publicTriage),
          requestId: args.requestId,
          city: args.triage?.city?.trim() || undefined,
          contactPreference: args.triage?.contactPreference?.trim() || undefined,
          contactValue: args.triage?.contactValue?.trim() || undefined,
          urgency: args.triage?.urgency ?? 'planned',
          leadId: portfolioCapture.leadId,
          intakeId: portfolioCapture.intakeId,
        }

        await caseRepository.updateCaseMetadata(tenantId, existingCase.id, nextMetadata)

        return {
          caseRecord: (await caseRepository.getCaseById(tenantId, existingCase.id)) ?? existingCase,
          leadId: portfolioCapture.leadId,
          intakeId: portfolioCapture.intakeId,
        }
      }

      const caseRecord = await caseRepository.createCase({
        tenantId,
        entityId: args.entityId,
        requestId: args.requestId,
        title: buildStructuredPublicTriageTitle(args),
        description: buildStructuredPublicTriageMessage(args),
        status: 'open',
        priority: resolvePublicTriagePriority(args.triage?.urgency ?? 'planned'),
        practiceArea: args.triage?.practiceArea,
        source: 'public-interaction',
        autoDispatch: false,
        metadata: {
          source: 'public-triage',
          leadId: portfolioCapture.leadId,
          intakeId: portfolioCapture.intakeId,
          publicTriage: {
            requestId: args.requestId,
            city: args.triage?.city?.trim() || undefined,
            contactPreference: args.triage?.contactPreference?.trim() || undefined,
            contactValue: args.triage?.contactValue?.trim() || undefined,
            urgency: args.triage?.urgency ?? 'planned',
            leadId: portfolioCapture.leadId,
            intakeId: portfolioCapture.intakeId,
          },
          city: args.triage?.city?.trim() || undefined,
          contact: args.triage?.contactValue?.trim() || undefined,
        },
        initialMessage: {
          body: args.userMessage.trim(),
          direction: 'inbound',
          messageType: 'note',
          messageStatus: 'sent',
        },
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
    const responsibleProfessional = professionals.find((professional) => professional.id === assignedProfessionalId)

    return {
      caseId: caseRecord.id,
      status: caseRecord.status === 'archived' ? 'closed' : caseRecord.status,
      practiceArea: caseRecord.practiceArea,
      officeName,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
      responsibleProfessional: responsibleProfessional ? {
        id: responsibleProfessional.id,
        displayName: responsibleProfessional.displayName,
        photoUrl: responsibleProfessional.photoUrl,
        oabCredential: responsibleProfessional.oabCredential,
        specialty: responsibleProfessional.specialties[0],
      } : undefined,
      timeline: buildClientPortalTimelineProjection(timeline),
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
    if (caseRecord.leadProfessionalId) {
      return caseRecord.leadProfessionalId
    }

    const assignments = await this.caseRepository.listAssignmentsByCase(tenantId, caseRecord.id)
    const activeAssignments = assignments
      .filter((assignment) => assignment.status === 'active')
      .sort((left, right) => Date.parse(right.assignedAt) - Date.parse(left.assignedAt))

    return activeAssignments[0]?.professionalId
  }
}

export function createLegalBetaCaseService(db: BackendDatabase, sovereignMutationCommandService: SovereignMutationCommandService) {
  return new LegalBetaCaseService(db, sovereignMutationCommandService)
}
