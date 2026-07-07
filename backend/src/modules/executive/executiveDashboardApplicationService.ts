import { performance } from 'node:perf_hooks'

import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import { createExecutiveMetrics } from './ExecutiveMetrics.js'
import { createExecutiveDashboardService, type ExecutiveDashboardService } from './ExecutiveDashboardService.js'
import type { ExecutiveDashboard } from './ExecutiveDashboardTypes.js'
import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'

type CaseRecord = {
  id: string
}

type OfficeProfessionalRecord = {
  id: string
  officeId?: string
  city?: string
  status: 'active' | 'inactive' | 'suspended'
  specialties: string[]
}

export interface ExecutiveDashboardApplicationInput {
  officeId: string
  tenantId: number
  entityProfile?: EntityProfileDocument | null
  generatedAt?: string
}

export interface ExecutiveDashboardApplicationDependencies {
  caseRepository: {
    listCasesByEntity(tenantId: number, officeId: string): Promise<CaseRecord[]>
  }
  officeProfessionalService: {
    listOfficeProfessionals(tenantId: number, officeId: string): Promise<OfficeProfessionalRecord[]>
  }
  growthIntelligenceService: {
    build(input: {
      tenantId: number
      officeId: string
      cases: CaseRecord[]
      professionals: OfficeProfessionalRecord[]
      entityProfile?: EntityProfileDocument | null
      generatedAt?: string
    }): Promise<GrowthIntelligenceResponse> | GrowthIntelligenceResponse
  }
  operationalIntelligenceService: {
    build(input: {
      tenantId: number
      officeId: string
      cases: CaseRecord[]
      generatedAt?: string
    }): Promise<OperationalIntelligenceResponse> | OperationalIntelligenceResponse
  }
  executiveDashboardService?: Pick<ExecutiveDashboardService, 'build'>
  observability?: ObservabilityService
}

export class ExecutiveDashboardApplicationService {
  private readonly executiveDashboardService
  private readonly metrics

  constructor(private readonly dependencies: ExecutiveDashboardApplicationDependencies) {
    this.executiveDashboardService = dependencies.executiveDashboardService
      ?? createExecutiveDashboardService({
        observability: dependencies.observability,
      })
    this.metrics = createExecutiveMetrics(dependencies.observability)
  }

  async build(input: ExecutiveDashboardApplicationInput): Promise<ExecutiveDashboard> {
    const startedAt = performance.now()

    try {
      const [cases, professionals] = await Promise.all([
        this.dependencies.caseRepository.listCasesByEntity(input.tenantId, input.officeId),
        this.dependencies.officeProfessionalService.listOfficeProfessionals(input.tenantId, input.officeId),
      ])

      const growth = await this.dependencies.growthIntelligenceService.build({
        tenantId: input.tenantId,
        officeId: input.officeId,
        cases,
        professionals,
        entityProfile: input.entityProfile ?? null,
        generatedAt: input.generatedAt,
      })

      const operational = await this.dependencies.operationalIntelligenceService.build({
        tenantId: input.tenantId,
        officeId: input.officeId,
        cases,
        generatedAt: input.generatedAt,
      })

      const dashboard = this.executiveDashboardService.build({
        growth,
        operational,
        generatedAt: input.generatedAt,
      })

      this.metrics.recordExecutiveDashboardRequest({ status: 'success' })
      this.metrics.recordExecutiveDashboardBuildTiming({
        durationMs: performance.now() - startedAt,
        status: 'success',
      })

      return dashboard
    } catch (error) {
      this.metrics.recordExecutiveDashboardRequest({ status: 'error' })
      this.metrics.recordExecutiveDashboardBuildTiming({
        durationMs: performance.now() - startedAt,
        status: 'error',
      })
      throw error
    }
  }
}

export function createExecutiveDashboardApplicationService(
  dependencies: ExecutiveDashboardApplicationDependencies,
) {
  return new ExecutiveDashboardApplicationService(dependencies)
}
