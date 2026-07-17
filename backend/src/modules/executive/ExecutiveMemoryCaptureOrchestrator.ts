import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import { buildExecutiveMemoryProjection } from './ExecutiveMemoryProjection.js'
import type { ExecutiveMemoryAtomicCaptureService } from './ExecutiveMemoryAtomicCaptureService.js'
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
  captureCycleId: string
}

export interface ExecutiveMemoryCaptureOfficeResult {
  status: 'captured'
  tenantId: number
  officeId: string
  capturedAt: string
  captureCycleId: string
  snapshotId: string
  snapshotCreated: boolean
  observationId: string
  observationCreated: boolean
  contentFingerprint: string
  sourceFingerprint: string
  observationFingerprint: string
}

export interface ExecutiveMemoryCaptureBatchInput {
  tenantId: number
  capturedAt: string
  captureCycleId: string
  cursor?: string
  limit?: number
}

export interface ExecutiveMemoryCaptureBatchItemResult {
  tenantId: number
  officeId: string
  status: 'captured' | 'error'
  captureCycleId?: string
  snapshotId?: string
  snapshotCreated?: boolean
  observationId?: string
  observationCreated?: boolean
  contentFingerprint?: string
  sourceFingerprint?: string
  observationFingerprint?: string
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
  atomicCaptureService: Pick<ExecutiveMemoryAtomicCaptureService, 'capture'>
  officeDiscoveryService?: Pick<ExecutiveMemoryOfficeDiscoveryService, 'listEligibleOffices'>
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory capture orchestrator requires ${label}.`)
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Executive memory capture orchestrator requires ${label}.`)
  }
}

export class ExecutiveMemoryTenantScopeMismatchError extends Error {
  constructor() {
    super('Executive memory capture tenant scope mismatch.')
    this.name = 'ExecutiveMemoryTenantScopeMismatchError'
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
    assertPositiveInteger(input.tenantId, 'tenantId')
    assertNonEmptyString(input.officeId, 'officeId')
    assertNonEmptyString(input.capturedAt, 'capturedAt')
    assertNonEmptyString(input.captureCycleId, 'captureCycleId')

    const [entity, cases, professionals] = await Promise.all([
      this.dependencies.entityRepository.getEntityById(input.officeId),
      this.dependencies.caseRepository.listCasesByEntity(input.tenantId, input.officeId),
      this.dependencies.officeProfessionalService.listOfficeProfessionals(
        input.tenantId,
        input.officeId,
      ),
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

    const projection = buildExecutiveMemoryProjection({
      tenantId: input.tenantId,
      officeId: input.officeId,
      capturedAt: input.capturedAt,
      sourceGrowthGeneratedAt: growth.generatedAt,
      sourceOperationalGeneratedAt: operational.generatedAt,
      officeHealth,
      decisionCenter,
      executiveTimeline,
    })

    const captured = await this.dependencies.atomicCaptureService.capture({
      projection,
      captureCycleId: input.captureCycleId,
    })

    return {
      status: 'captured',
      tenantId: captured.tenantId,
      officeId: captured.officeId,
      capturedAt: captured.capturedAt,
      captureCycleId: captured.captureCycleId,
      snapshotId: captured.snapshotId,
      snapshotCreated: captured.snapshotCreated,
      observationId: captured.observationId,
      observationCreated: captured.observationCreated,
      contentFingerprint: captured.contentFingerprint,
      sourceFingerprint: captured.sourceFingerprint,
      observationFingerprint: captured.observationFingerprint,
    }
  }

  async captureDiscoveredBatch(
    input: ExecutiveMemoryCaptureBatchInput,
  ): Promise<ExecutiveMemoryCaptureBatchResult> {
    if (!this.dependencies.officeDiscoveryService) {
      throw new Error('Executive memory capture orchestrator requires officeDiscoveryService.')
    }

    assertPositiveInteger(input.tenantId, 'tenantId')
    assertNonEmptyString(input.capturedAt, 'capturedAt')
    assertNonEmptyString(input.captureCycleId, 'captureCycleId')

    const page = await this.dependencies.officeDiscoveryService.listEligibleOffices({
      tenantId: input.tenantId,
      cursor: input.cursor,
      limit: input.limit,
    })

    const items: ExecutiveMemoryCaptureBatchItemResult[] = []
    let capturedCount = 0
    let createdCount = 0
    let failedCount = 0

    for (const office of page.items) {
      if (office.tenantId !== input.tenantId) {
        throw new ExecutiveMemoryTenantScopeMismatchError()
      }

      try {
        const result = await this.captureOffice({
          tenantId: input.tenantId,
          officeId: office.officeId,
          capturedAt: input.capturedAt,
          captureCycleId: input.captureCycleId,
        })

        items.push({
          tenantId: result.tenantId,
          officeId: result.officeId,
          status: 'captured',
          captureCycleId: result.captureCycleId,
          snapshotId: result.snapshotId,
          snapshotCreated: result.snapshotCreated,
          observationId: result.observationId,
          observationCreated: result.observationCreated,
          contentFingerprint: result.contentFingerprint,
          sourceFingerprint: result.sourceFingerprint,
          observationFingerprint: result.observationFingerprint,
        })
        capturedCount += 1
        if (result.observationCreated) {
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
