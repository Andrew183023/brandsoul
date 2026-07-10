import type { BackendDatabase } from '../../db/index.js'
import type { ExecutiveMemoryProjection } from './ExecutiveMemoryProjectionTypes.js'
import {
  createExecutiveMemoryObservationRepository,
  type ExecutiveMemoryObservationRepository,
  type SaveExecutiveMemoryObservationResult,
} from './ExecutiveMemoryObservationRepository.js'
import {
  createExecutiveMemoryRepository,
  type ExecutiveMemoryRepository,
  type SaveExecutiveMemorySnapshotResult,
} from './ExecutiveMemoryRepository.js'

export interface ExecutiveMemoryAtomicCaptureInput {
  projection: ExecutiveMemoryProjection
  captureCycleId: string
}

export interface ExecutiveMemoryAtomicCaptureResult {
  tenantId: number
  officeId: string
  projectionVersion: number
  captureCycleId: string
  capturedAt: string
  snapshotId: string
  snapshotCreated: boolean
  observationId: string
  observationCreated: boolean
  contentFingerprint: string
  sourceFingerprint: string
  observationFingerprint: string
}

export interface ExecutiveMemoryAtomicCaptureServiceDependencies {
  db: BackendDatabase
  snapshotRepositoryFactory?: (
    db: BackendDatabase,
  ) => Pick<ExecutiveMemoryRepository, 'saveSnapshot'>
  observationRepositoryFactory?: (
    db: BackendDatabase,
  ) => Pick<ExecutiveMemoryObservationRepository, 'saveObservation'>
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory atomic capture service requires ${label}.`)
  }
}

function validateInput(input: ExecutiveMemoryAtomicCaptureInput) {
  if (!input.projection) {
    throw new Error('Executive memory atomic capture service requires projection.')
  }

  assertNonEmptyString(input.captureCycleId, 'captureCycleId')
}

function mapResult(args: {
  captureCycleId: string
  snapshotResult: SaveExecutiveMemorySnapshotResult
  observationResult: SaveExecutiveMemoryObservationResult
}): ExecutiveMemoryAtomicCaptureResult {
  return {
    tenantId: args.snapshotResult.record.tenantId,
    officeId: args.snapshotResult.record.officeId,
    projectionVersion: args.snapshotResult.record.projectionVersion,
    captureCycleId: args.captureCycleId,
    capturedAt: args.snapshotResult.record.capturedAt,
    snapshotId: args.snapshotResult.record.id,
    snapshotCreated: args.snapshotResult.created,
    observationId: args.observationResult.record.id,
    observationCreated: args.observationResult.created,
    contentFingerprint: args.snapshotResult.record.contentFingerprint,
    sourceFingerprint: args.snapshotResult.record.sourceFingerprint,
    observationFingerprint: args.observationResult.record.observationFingerprint,
  }
}

export class ExecutiveMemoryAtomicCaptureService {
  private readonly snapshotRepositoryFactory

  private readonly observationRepositoryFactory

  constructor(
    private readonly dependencies: ExecutiveMemoryAtomicCaptureServiceDependencies,
  ) {
    this.snapshotRepositoryFactory =
      dependencies.snapshotRepositoryFactory ?? createExecutiveMemoryRepository
    this.observationRepositoryFactory =
      dependencies.observationRepositoryFactory ?? createExecutiveMemoryObservationRepository
  }

  async capture(
    input: ExecutiveMemoryAtomicCaptureInput,
  ): Promise<ExecutiveMemoryAtomicCaptureResult> {
    validateInput(input)

    return this.dependencies.db.transaction(async (tx) => {
      const snapshotRepository = this.snapshotRepositoryFactory(tx)
      const observationRepository = this.observationRepositoryFactory(tx)

      const snapshotResult = await snapshotRepository.saveSnapshot(input.projection)
      const observationResult = await observationRepository.saveObservation({
        projectionVersion: input.projection.projectionVersion,
        tenantId: input.projection.tenantId,
        officeId: input.projection.officeId,
        captureCycleId: input.captureCycleId,
        contentFingerprint: input.projection.contentFingerprint,
        capturedAt: input.projection.capturedAt,
        sourceFingerprint: input.projection.sourceFingerprint,
        stateSnapshotId: snapshotResult.record.id,
      })

      return mapResult({
        captureCycleId: input.captureCycleId,
        snapshotResult,
        observationResult,
      })
    })
  }
}

export function createExecutiveMemoryAtomicCaptureService(
  dependencies: ExecutiveMemoryAtomicCaptureServiceDependencies,
) {
  return new ExecutiveMemoryAtomicCaptureService(dependencies)
}
