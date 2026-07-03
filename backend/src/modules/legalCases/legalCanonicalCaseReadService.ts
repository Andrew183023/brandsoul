import type { BackendDatabase } from '../../db/index.js'

import { createCaseRepository } from './caseRepository.js'
import type { CaseMessageRecord, CaseRecord, CaseTimelineEventRecord } from './caseTypes.js'
import { buildLegalCaseIdentity, resolveLegalIdentitySource } from './legalCanonicalIdentity.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import {
  buildCanonicalCaseProjection,
  type LegalCanonicalCaseProjection,
} from './legalCanonicalProjection.js'

export type AdminCanonicalCaseProjection = LegalCanonicalCaseProjection<
  unknown,
  CaseTimelineEventRecord,
  CaseMessageRecord
>

type CaseReadProfessional = Awaited<ReturnType<ReturnType<typeof createCaseRepository>['listDetailedProfessionalsForTenant']>>[number]

export class LegalCanonicalCaseReadService {
  constructor(
    private readonly db: BackendDatabase,
    private readonly recorder?: LegalMetricsRecorder,
  ) {}

  private get caseRepository() {
    return createCaseRepository(this.db)
  }

  private recordCanonicalReadMetric(args: {
    metricName: 'legal_canonical_read_total' | 'legal_canonical_read_failed_total'
    tenantId: number
    entityId?: string | null
    stage: 'start' | 'complete' | 'failed'
    result: 'started' | 'success' | 'not_found' | 'failed'
    reason?: string
  }) {
    this.recorder?.increment(args.metricName, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      pipeline: 'canonical_case_read',
      stage: args.stage,
      result: args.result,
      ...(args.reason ? { reason: args.reason } : {}),
    })
  }

  private recordCanonicalReadTiming(args: {
    tenantId: number
    entityId?: string | null
    durationMs: number
    result: 'success' | 'not_found' | 'failed'
  }) {
    this.recorder?.recordTiming('legal_canonical_read_duration_ms', args.durationMs, {
      tenant_id: String(args.tenantId),
      entity_id: args.entityId ?? 'unknown',
      pipeline: 'canonical_case_read',
      result: args.result,
    })
  }

  private recordCanonicalIdentityMetric(args: {
    tenantId: number
    entityId?: string | null
    caseRecord: CaseRecord
  }) {
    const identitySource = resolveLegalIdentitySource(args.caseRecord)

    if (identitySource.source === 'structured_columns') {
      this.recorder?.increment('legal_structured_identity_used_total', {
        tenant_id: String(args.tenantId),
        entity_id: args.entityId ?? 'unknown',
        source: 'structured_columns',
        result: 'used',
      })
      return
    }

    if (
      identitySource.source === 'canonical_case_input'
      || identitySource.source === 'public_triage'
      || identitySource.source === 'metadata'
    ) {
      this.recorder?.increment('legal_identity_fallback_used_total', {
        tenant_id: String(args.tenantId),
        entity_id: args.entityId ?? 'unknown',
        source: identitySource.source,
        reason: identitySource.reason,
        result: 'fallback',
      })
    }
  }

  async getCanonicalMessages(args: {
    tenantId: number
    caseId: string
  }) {
    return this.caseRepository.listMessages(args.tenantId, args.caseId)
  }

  async getCanonicalTimeline(args: {
    tenantId: number
    caseId: string
  }) {
    return this.caseRepository.listTimelineEvents(args.tenantId, args.caseId)
  }

  private async resolveResponsibleProfessional(args: {
    tenantId: number
    caseRecord: CaseRecord
    professionals: CaseReadProfessional[]
  }) {
    const assignments = await this.caseRepository.listAssignmentsByCase(args.tenantId, args.caseRecord.id)
    const activeAssignments = assignments
      .filter((assignment) => assignment.status === 'active')
      .sort((left, right) => Date.parse(right.assignedAt) - Date.parse(left.assignedAt))

    const responsibleProfessionalId = activeAssignments[0]?.professionalId ?? args.caseRecord.leadProfessionalId
    if (!responsibleProfessionalId) {
      return null
    }

    return args.professionals.find((professional) => professional.id === responsibleProfessionalId) ?? null
  }

  async getCanonicalCase(args: {
    tenantId: number
    caseId: string
    entity?: unknown | null
  }): Promise<AdminCanonicalCaseProjection | null> {
    const startedAt = Date.now()
    this.recordCanonicalReadMetric({
      metricName: 'legal_canonical_read_total',
      tenantId: args.tenantId,
      stage: 'start',
      result: 'started',
    })

    try {
      const caseRecord = await this.caseRepository.getCaseById(args.tenantId, args.caseId)
      if (!caseRecord) {
        this.recordCanonicalReadMetric({
          metricName: 'legal_canonical_read_total',
          tenantId: args.tenantId,
          stage: 'complete',
          result: 'not_found',
          reason: 'case_not_found',
        })
        this.recordCanonicalReadTiming({
          tenantId: args.tenantId,
          durationMs: Date.now() - startedAt,
          result: 'not_found',
        })
        return null
      }

      const [messages, timeline, professionals] = await Promise.all([
        this.getCanonicalMessages({
          tenantId: args.tenantId,
          caseId: args.caseId,
        }),
        this.getCanonicalTimeline({
          tenantId: args.tenantId,
          caseId: args.caseId,
        }),
        this.caseRepository.listDetailedProfessionalsForTenant(args.tenantId),
      ])

      const responsibleProfessional = await this.resolveResponsibleProfessional({
        tenantId: args.tenantId,
        caseRecord,
        professionals,
      })

      const lastInteractionAt = messages[messages.length - 1]?.createdAt
        ?? timeline[timeline.length - 1]?.occurredAt
        ?? caseRecord.updatedAt

      const projection = buildCanonicalCaseProjection({
        ...buildLegalCaseIdentity({
          caseRecord,
          responsibleProfessional,
          lastInteractionAt,
        }),
        timeline,
        messages,
      })

      this.recordCanonicalIdentityMetric({
        tenantId: args.tenantId,
        entityId: caseRecord.entityId ?? null,
        caseRecord,
      })

      this.recordCanonicalReadMetric({
        metricName: 'legal_canonical_read_total',
        tenantId: args.tenantId,
        entityId: caseRecord.entityId ?? null,
        stage: 'complete',
        result: 'success',
      })
      this.recordCanonicalReadTiming({
        tenantId: args.tenantId,
        entityId: caseRecord.entityId ?? null,
        durationMs: Date.now() - startedAt,
        result: 'success',
      })

      return projection
    } catch (error) {
      this.recordCanonicalReadMetric({
        metricName: 'legal_canonical_read_failed_total',
        tenantId: args.tenantId,
        stage: 'failed',
        result: 'failed',
        reason: 'exception',
      })
      this.recordCanonicalReadTiming({
        tenantId: args.tenantId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createLegalCanonicalCaseReadService(db: BackendDatabase, recorder?: LegalMetricsRecorder) {
  return new LegalCanonicalCaseReadService(db, recorder)
}
