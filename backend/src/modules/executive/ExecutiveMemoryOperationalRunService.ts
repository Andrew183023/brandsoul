import type { ObservabilityService } from '../../services/observabilityService.js'
import { createExecutiveMetrics, type ExecutiveMemoryOperationalRunMetricsRecorder } from './ExecutiveMetrics.js'
import type {
  ExecutiveMemoryOperationalRunCoordinator,
  ExecutiveMemoryOperationalRunInput,
  ExecutiveMemoryOperationalRunResult,
} from './ExecutiveMemoryOperationalRunCoordinator.js'

export interface ExecutiveMemoryOperationalRunServiceDependencies {
  coordinator: Pick<ExecutiveMemoryOperationalRunCoordinator, 'run'>
  observability?: ObservabilityService
  metrics?: Pick<ExecutiveMemoryOperationalRunMetricsRecorder, 'recordExecutiveMemoryOperationalRun'>
}

export interface ExecutiveMemoryOperationalRunRequest {
  tenantId: number
  maxBatches?: number
  limit?: number
}

export interface ExecutiveMemoryOperationalRunServiceResult {
  status: ExecutiveMemoryOperationalRunResult['status']
  batchesExecuted: number
  captureCycleId?: string
  cursor?: string
  totals: ExecutiveMemoryOperationalRunResult['totals']
  executionState: ExecutiveMemoryOperationalRunResult['executionState']
}

function cloneTotals(
  totals: ExecutiveMemoryOperationalRunResult['totals'],
): ExecutiveMemoryOperationalRunServiceResult['totals'] {
  return {
    processed: totals.processed,
    captured: totals.captured,
    created: totals.created,
    failed: totals.failed,
  }
}

function cloneExecutionState(
  executionState: ExecutiveMemoryOperationalRunResult['executionState'],
): ExecutiveMemoryOperationalRunServiceResult['executionState'] {
  return {
    status: executionState.status,
    captureCycleId: executionState.captureCycleId,
    cursor: executionState.cursor,
    totals: cloneTotals(executionState.totals),
    lastBatch: executionState.lastBatch
      ? {
        ...executionState.lastBatch,
        totals: executionState.lastBatch.totals
          ? cloneTotals(executionState.lastBatch.totals)
          : undefined,
      }
      : undefined,
  }
}

function requirePositiveTenantId(tenantId: number) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Executive memory operational run service requires tenantId.')
  }
}

function buildServiceResult(
  result: ExecutiveMemoryOperationalRunResult,
): ExecutiveMemoryOperationalRunServiceResult {
  return {
    status: result.status,
    batchesExecuted: result.batchesExecuted,
    captureCycleId: result.captureCycleId,
    cursor: result.cursor,
    totals: cloneTotals(result.totals),
    executionState: cloneExecutionState(result.executionState),
  }
}

export class ExecutiveMemoryOperationalRunService {
  private readonly metrics

  constructor(
    private readonly dependencies: ExecutiveMemoryOperationalRunServiceDependencies,
  ) {
    this.metrics = dependencies.metrics
      ?? createExecutiveMetrics(dependencies.observability)
  }

  async run(
    request: ExecutiveMemoryOperationalRunRequest,
  ): Promise<ExecutiveMemoryOperationalRunServiceResult> {
    requirePositiveTenantId(request.tenantId)
    this.metrics.recordExecutiveMemoryOperationalRun({ status: 'requested' })

    let result: ExecutiveMemoryOperationalRunResult
    try {
      result = await this.dependencies.coordinator.run({
        tenantId: request.tenantId,
        maxBatches: request.maxBatches,
        limit: request.limit,
      } satisfies ExecutiveMemoryOperationalRunInput)
    } catch (error) {
      this.metrics.recordExecutiveMemoryOperationalRun({ status: 'error' })
      throw error
    }

    this.metrics.recordExecutiveMemoryOperationalRun({ status: result.status })
    return buildServiceResult(result)
  }
}

export function createExecutiveMemoryOperationalRunService(
  dependencies: ExecutiveMemoryOperationalRunServiceDependencies,
) {
  return new ExecutiveMemoryOperationalRunService(dependencies)
}
