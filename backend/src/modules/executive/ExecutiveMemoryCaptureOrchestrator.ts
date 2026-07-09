import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { ExecutiveMemoryCaptureService } from './ExecutiveMemoryCaptureService.js'
import type { ExecutiveMemoryOfficeDiscoveryService } from './ExecutiveMemoryOfficeDiscovery.js'
import type { DecisionCenterEngine } from './DecisionCenterEngine.js'
import type { ExecutiveTimelineEngine } from './ExecutiveTimelineEngine.js'
import type { OfficeHealthEngine } from './OfficeHealthEngine.js'
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

export interface ExecutiveMemoryCaptureOfficeInput {
  tenantId: number
  officeId: string
  capturedAt: string
}

export interface ExecutiveMemoryCaptureOfficeResult {
  status: 'captured'
  created: boolean
  tenantId: number
  officeId: string
  capturedAt: string
  snapshotId: string
  contentFingerprint: string
  sourceFingerprint: string
}

export interface ExecutiveMemoryCaptureBatchInput {
  capturedAt: string
  cursor?: string
  limit?: number
}

export interface ExecutiveMemoryCaptureBatchItemResult {
  tenantId: number
  officeId: string
  status: 'captured' | 'error'
  created?: boolean
  snapshotId?: string
  contentFingerprint?: string
  sourceFingerprint?: string
  error?: string
}

export interface ExecutiveMemoryCaptureBatchResult {
  items: ExecutiveMemoryCaptureBatchItemResult[]
  nextCursor?: string
  totals: {
    processed: number
    captured: number
    created: number
    failed: number
  }
}

export interface ExecutiveMemoryCaptureOrchestratorDependencies {
  entityRepository: {
    getEntityById(officeId: string): Promise<{ entityProfile: EntityProfileDocument } | null>
  }
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
  officeHealthEngine: Pick<OfficeHealthEngine, 'build'>
  decisionCenterEngine: Pick<DecisionCenterEngine, 'build'>
  executiveTimelineEngine: Pick<ExecutiveTimelineEngine, 'build'>
  memoryCaptureService: Pick<ExecutiveMemoryCaptureService, 'capture'>
  officeDiscoveryService?: Pick<ExecutiveMemoryOfficeDiscoveryService, 'listEligibleOffices'>
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory capture orchestrator requires ${label}.`)
  }
}

function normalizeBatchError() {
  return 'Executive memory capture failed.'
}

export class ExecutiveMemoryCaptureOrchestrator {
  constructor(private readonly dependencies: ExecutiveMemoryCaptureOrchestratorDependencies) {}

  async captureOffice(
    input: ExecutiveMemoryCaptureOfficeInput,
  ): Promise<ExecutiveMemoryCaptureOfficeResult> {
    assertNonEmptyString(input.officeId, 'officeId')
    assertNonEmptyString(input.capturedAt, 'capturedAt')

    const [entity, cases, professionals] = await Promise.all([
      this.dependencies.entityRepository.getEntityById(input.officeId),
      this.dependencies.caseRepository.listCasesByEntity(input.tenantId, input.officeId),
      this.dependencies.officeProfessionalService.listOfficeProfessionals(input.tenantId, input.officeId),
    ])

    const growth = await this.dependencies.growthIntelligenceService.build({
      tenantId: input.tenantId,
      officeId: input.officeId,
      cases,
      professionals,
      entityProfile: entity?.entityProfile ?? null,
      generatedAt: input.capturedAt,
    })

    const operational = await this.dependencies.operationalIntelligenceService.build({
      tenantId: input.tenantId,
      officeId: input.officeId,
      cases,
      generatedAt: input.capturedAt,
    })

    const officeHealth = this.dependencies.officeHealthEngine.build({
      growth,
      operational,
    })

    const decisionCenter = this.dependencies.decisionCenterEngine.build({
      growth,
      operational,
      officeHealth,
    })

    const executiveTimeline = this.dependencies.executiveTimelineEngine.build({
      growth,
      operational,
      officeHealth,
      decisionCenter,
      generatedAt: input.capturedAt,
    })

    const captured = await this.dependencies.memoryCaptureService.capture({
      tenantId: input.tenantId,
      officeId: input.officeId,
      capturedAt: input.capturedAt,
      sourceGrowthGeneratedAt: growth.generatedAt,
      sourceOperationalGeneratedAt: operational.generatedAt,
      officeHealth,
      decisionCenter,
      executiveTimeline,
    })

    return {
      status: 'captured',
      created: captured.created,
      tenantId: captured.tenantId,
      officeId: captured.officeId,
      capturedAt: captured.capturedAt,
      snapshotId: captured.snapshotId,
      contentFingerprint: captured.contentFingerprint,
      sourceFingerprint: captured.sourceFingerprint,
    }
  }

  async captureDiscoveredBatch(
    input: ExecutiveMemoryCaptureBatchInput,
  ): Promise<ExecutiveMemoryCaptureBatchResult> {
    if (!this.dependencies.officeDiscoveryService) {
      throw new Error('Executive memory capture orchestrator requires officeDiscoveryService.')
    }

    assertNonEmptyString(input.capturedAt, 'capturedAt')

    const page = await this.dependencies.officeDiscoveryService.listEligibleOffices({
      cursor: input.cursor,
      limit: input.limit,
    })

    const items: ExecutiveMemoryCaptureBatchItemResult[] = []
    let capturedCount = 0
    let createdCount = 0
    let failedCount = 0

    for (const office of page.items) {
      try {
        const result = await this.captureOffice({
          tenantId: office.tenantId,
          officeId: office.officeId,
          capturedAt: input.capturedAt,
        })

        items.push({
          tenantId: result.tenantId,
          officeId: result.officeId,
          status: 'captured',
          created: result.created,
          snapshotId: result.snapshotId,
          contentFingerprint: result.contentFingerprint,
          sourceFingerprint: result.sourceFingerprint,
        })
        capturedCount += 1
        if (result.created) {
          createdCount += 1
        }
      } catch {
        items.push({
          tenantId: office.tenantId,
          officeId: office.officeId,
          status: 'error',
          error: normalizeBatchError(),
        })
        failedCount += 1
      }
    }

    return {
      items,
      nextCursor: page.nextCursor,
      totals: {
        processed: page.items.length,
        captured: capturedCount,
        created: createdCount,
        failed: failedCount,
      },
    }
  }
}

export function createExecutiveMemoryCaptureOrchestrator(
  dependencies: ExecutiveMemoryCaptureOrchestratorDependencies,
) {
  return new ExecutiveMemoryCaptureOrchestrator(dependencies)
}
