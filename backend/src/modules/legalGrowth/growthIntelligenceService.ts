import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import type { CaseRecord } from '../legalCases/caseTypes.js'

import type { GrowthContext, GrowthProfessionalContext } from './GrowthContext.js'
import { createGrowthMetrics } from './GrowthMetrics.js'
import { createGrowthPipeline } from './GrowthPipeline.js'
import type { GrowthSnapshot } from './GrowthSnapshot.js'
import { buildGrowthSummary, type GrowthSummary } from './GrowthSummary.js'

type OfficeProfessionalRecord = {
  id: string
  officeId?: string
  city?: string
  status: 'active' | 'inactive' | 'suspended'
  specialties: string[]
}

export type GrowthIntelligenceResponse = {
  status: 'ready'
  officeId: string
  tenantId: number
  generatedAt: string
  summary: GrowthSummary
  snapshot: GrowthSnapshot
  compatibility: {
    professionalsIncluded: boolean
    entityProfileIncluded: boolean
    landingCandidatesPreparedOnly: true
  }
}

type GrowthIntelligenceServiceOptions = {
  observability?: ObservabilityService
}

function mapProfessionalToGrowthContext(
  professional: OfficeProfessionalRecord,
): GrowthProfessionalContext {
  return {
    id: professional.id,
    officeId: professional.officeId,
    city: professional.city,
    status: professional.status,
    specialties: professional.specialties,
  }
}

export class GrowthIntelligenceService {
  private readonly metrics
  private readonly pipeline

  constructor(private readonly options: GrowthIntelligenceServiceOptions = {}) {
    this.metrics = createGrowthMetrics(options.observability)
    this.pipeline = createGrowthPipeline(options.observability)
  }

  build(args: {
    tenantId: number
    officeId: string
    cases: CaseRecord[]
    professionals: OfficeProfessionalRecord[]
    entityProfile?: EntityProfileDocument | null
    generatedAt?: string
  }): GrowthIntelligenceResponse {
    const startedAt = Date.now()
    this.metrics.recordDashboardRequest({
      tenantId: args.tenantId,
      officeId: args.officeId,
    })

    const context: GrowthContext = {
      officeId: args.officeId,
      tenantId: args.tenantId,
      now: args.generatedAt ?? new Date().toISOString(),
      period: {
        label: 'all_time',
        startsAt: '1970-01-01T00:00:00.000Z',
        endsAt: '9999-12-31T23:59:59.999Z',
        granularity: 'custom',
      },
      cases: args.cases,
      professionals: args.professionals.map(mapProfessionalToGrowthContext),
      entityProfile: args.entityProfile ?? null,
    }

    try {
      const snapshot = this.pipeline.build(context)
      const summaryStartedAt = Date.now()
      const summary = buildGrowthSummary(snapshot)
      this.metrics.recordGrowthSummaryBuildTiming({
        tenantId: args.tenantId,
        officeId: args.officeId,
        durationMs: Date.now() - summaryStartedAt,
      })
      this.metrics.recordGrowthDashboardTotalTiming({
        tenantId: args.tenantId,
        officeId: args.officeId,
        durationMs: Date.now() - startedAt,
      })

      return {
        status: 'ready',
        officeId: args.officeId,
        tenantId: args.tenantId,
        generatedAt: snapshot.generatedAt,
        summary,
        snapshot,
        compatibility: {
          professionalsIncluded: true,
          entityProfileIncluded: Boolean(args.entityProfile),
          landingCandidatesPreparedOnly: true,
        },
      }
    } catch (error) {
      this.metrics.recordGrowthDashboardTotalTiming({
        tenantId: args.tenantId,
        officeId: args.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createGrowthIntelligenceService(
  options: GrowthIntelligenceServiceOptions = {},
) {
  return new GrowthIntelligenceService(options)
}
