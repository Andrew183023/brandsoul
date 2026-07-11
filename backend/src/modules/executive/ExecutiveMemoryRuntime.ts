import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import type { CaseRecord } from '../legalCases/caseTypes.js'
import {
  createExecutiveMemoryAtomicCaptureService,
  type ExecutiveMemoryAtomicCaptureService,
} from './ExecutiveMemoryAtomicCaptureService.js'
import {
  createExecutiveMemoryCaptureCycleIdSource,
  type ExecutiveMemoryCaptureCycleIdSourceDependencies,
} from './ExecutiveMemoryCaptureCycleIdSource.js'
import {
  createExecutiveMemoryCaptureExecutionService,
  type ExecutiveMemoryCaptureCycleIdSource,
  type ExecutiveMemoryCaptureExecutionService,
} from './ExecutiveMemoryCaptureExecutionService.js'
import {
  createExecutiveMemoryCaptureOrchestrator,
  type ExecutiveMemoryCaptureOrchestrator,
} from './ExecutiveMemoryCaptureOrchestrator.js'
import {
  createExecutiveMemoryCaptureTriggerService,
  type ExecutiveMemoryCaptureTriggerClock,
  type ExecutiveMemoryCaptureTriggerService,
} from './ExecutiveMemoryCaptureTriggerService.js'
import {
  createExecutiveMemoryOfficeDiscoveryService,
  type ExecutiveMemoryOfficeDiscoveryService,
} from './ExecutiveMemoryOfficeDiscovery.js'
import { createExecutiveMetrics, type ExecutiveMetrics } from './ExecutiveMetrics.js'
import { createDecisionCenterEngine } from './DecisionCenterEngine.js'
import { createExecutiveTimelineEngine } from './ExecutiveTimelineEngine.js'
import { createOfficeHealthEngine } from './OfficeHealthEngine.js'
import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'

type OfficeProfessionalRecord = {
  id: string
  officeId?: string
  city?: string
  status: 'active' | 'inactive' | 'suspended'
  specialties: string[]
}

export interface ExecutiveMemoryRuntime {
  officeDiscoveryService: ExecutiveMemoryOfficeDiscoveryService
  atomicCaptureService: ExecutiveMemoryAtomicCaptureService
  orchestrator: ExecutiveMemoryCaptureOrchestrator
  triggerService: ExecutiveMemoryCaptureTriggerService
  metrics: ExecutiveMetrics
  createExecution(): ExecutiveMemoryCaptureExecutionService
  createExecutionService(
    captureCycleIdSource: ExecutiveMemoryCaptureCycleIdSource,
  ): ExecutiveMemoryCaptureExecutionService
}

export interface ExecutiveMemoryRuntimeDependencies {
  db: BackendDatabase
  clock: ExecutiveMemoryCaptureTriggerClock
  timer?: {
    now(): number
  }
  captureCycleIdSource?: ExecutiveMemoryCaptureCycleIdSource
  captureCycleIdSourceDependencies?: ExecutiveMemoryCaptureCycleIdSourceDependencies
  observability?: ObservabilityService
  entityRepository: Pick<EntityRepository, 'getEntityById'>
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
}

export function createExecutiveMemoryRuntime(
  dependencies: ExecutiveMemoryRuntimeDependencies,
): ExecutiveMemoryRuntime {
  const officeDiscoveryService = createExecutiveMemoryOfficeDiscoveryService(dependencies.db)
  const atomicCaptureService = createExecutiveMemoryAtomicCaptureService({
    db: dependencies.db,
  })
  const orchestrator = createExecutiveMemoryCaptureOrchestrator({
    entityRepository: dependencies.entityRepository,
    caseRepository: dependencies.caseRepository,
    officeProfessionalService: dependencies.officeProfessionalService,
    growthIntelligenceService: dependencies.growthIntelligenceService,
    operationalIntelligenceService: dependencies.operationalIntelligenceService,
    officeHealthEngine: createOfficeHealthEngine(),
    decisionCenterEngine: createDecisionCenterEngine(),
    executiveTimelineEngine: createExecutiveTimelineEngine(),
    atomicCaptureService,
    officeDiscoveryService,
  })
  const metrics = createExecutiveMetrics(dependencies.observability)
  const triggerService = createExecutiveMemoryCaptureTriggerService({
    orchestrator,
    clock: dependencies.clock,
    metrics,
    timer: dependencies.timer,
  })
  const captureCycleIdSource = dependencies.captureCycleIdSource
    ?? createExecutiveMemoryCaptureCycleIdSource(dependencies.captureCycleIdSourceDependencies)

  return {
    officeDiscoveryService,
    atomicCaptureService,
    orchestrator,
    triggerService,
    metrics,
    createExecution() {
      return createExecutiveMemoryCaptureExecutionService({
        triggerService,
        captureCycleIdSource,
      })
    },
    createExecutionService(captureCycleIdSource: ExecutiveMemoryCaptureCycleIdSource) {
      return createExecutiveMemoryCaptureExecutionService({
        triggerService,
        captureCycleIdSource,
      })
    },
  }
}
