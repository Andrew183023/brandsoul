import {
  buildExecutiveMemoryProjection,
} from './ExecutiveMemoryProjection.js'
import type {
  ExecutiveMemoryProjection,
  ExecutiveMemoryProjectionInput,
} from './ExecutiveMemoryProjectionTypes.js'
import type {
  ExecutiveMemoryRepository,
  SaveExecutiveMemorySnapshotResult,
} from './ExecutiveMemoryRepository.js'

export interface ExecutiveMemoryCaptureInput extends ExecutiveMemoryProjectionInput {}

export interface ExecutiveMemoryCaptureResult {
  created: boolean
  snapshotId: string
  tenantId: number
  officeId: string
  projectionVersion: number
  capturedAt: string
  contentFingerprint: string
  sourceFingerprint: string
}

export interface ExecutiveMemoryCaptureServiceDependencies {
  repository: Pick<ExecutiveMemoryRepository, 'saveSnapshot'>
  projectionBuilder?: (input: ExecutiveMemoryCaptureInput) => ExecutiveMemoryProjection
}

function mapCaptureResult(
  saved: SaveExecutiveMemorySnapshotResult,
): ExecutiveMemoryCaptureResult {
  return {
    created: saved.created,
    snapshotId: saved.record.id,
    tenantId: saved.record.tenantId,
    officeId: saved.record.officeId,
    projectionVersion: saved.record.projectionVersion,
    capturedAt: saved.record.capturedAt,
    contentFingerprint: saved.record.contentFingerprint,
    sourceFingerprint: saved.record.sourceFingerprint,
  }
}

export class ExecutiveMemoryCaptureService {
  private readonly projectionBuilder

  constructor(private readonly dependencies: ExecutiveMemoryCaptureServiceDependencies) {
    this.projectionBuilder = dependencies.projectionBuilder ?? buildExecutiveMemoryProjection
  }

  async capture(input: ExecutiveMemoryCaptureInput): Promise<ExecutiveMemoryCaptureResult> {
    const projection = this.projectionBuilder(input)
    const saved = await this.dependencies.repository.saveSnapshot(projection)

    return mapCaptureResult(saved)
  }
}

export function createExecutiveMemoryCaptureService(
  dependencies: ExecutiveMemoryCaptureServiceDependencies,
) {
  return new ExecutiveMemoryCaptureService(dependencies)
}
