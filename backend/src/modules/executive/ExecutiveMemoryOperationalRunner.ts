import type {
  ExecutiveMemoryCaptureExecutionContinueInput,
  ExecutiveMemoryCaptureExecutionStartInput,
  ExecutiveMemoryCaptureExecutionState,
  ExecutiveMemoryCaptureExecutionStatus,
  ExecutiveMemoryCaptureExecutionTotals,
} from './ExecutiveMemoryCaptureExecutionService.js'

export const EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES = 10
export const EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_MAX_BATCHES = 100

export type ExecutiveMemoryOperationalRunnerStatus =
  | 'completed'
  | 'failed'
  | 'already_running'
  | 'batch_limit_reached'
  | 'running'

export interface ExecutiveMemoryOperationalRunnerExecution {
  start(input?: ExecutiveMemoryCaptureExecutionStartInput): Promise<ExecutiveMemoryCaptureExecutionState>
  continueExecution(
    input?: ExecutiveMemoryCaptureExecutionContinueInput,
  ): Promise<ExecutiveMemoryCaptureExecutionState>
  getState(): ExecutiveMemoryCaptureExecutionState
}

export interface ExecutiveMemoryOperationalRunnerInput {
  execution: ExecutiveMemoryOperationalRunnerExecution
  maxBatches?: number
  limit?: number
}

export interface ExecutiveMemoryOperationalRunnerResult {
  status: ExecutiveMemoryOperationalRunnerStatus
  batchesExecuted: number
  captureCycleId?: string
  cursor?: string
  totals: ExecutiveMemoryCaptureExecutionTotals
  executionState: ExecutiveMemoryCaptureExecutionState
}

const TERMINAL_RESULT_STATUS_BY_EXECUTION_STATUS: Partial<
  Record<ExecutiveMemoryCaptureExecutionStatus, ExecutiveMemoryOperationalRunnerStatus>
> = {
  completed: 'completed',
  failed: 'failed',
  already_running: 'already_running',
  running: 'running',
}

function cloneTotals(totals: ExecutiveMemoryCaptureExecutionTotals): ExecutiveMemoryCaptureExecutionTotals {
  return {
    processed: totals.processed,
    captured: totals.captured,
    created: totals.created,
    failed: totals.failed,
  }
}

function normalizeMaxBatches(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES
  }

  const normalized = Math.floor(value)
  if (normalized < 1) {
    return EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES
  }

  return Math.min(normalized, EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_MAX_BATCHES)
}

function buildResult(
  status: ExecutiveMemoryOperationalRunnerStatus,
  batchesExecuted: number,
  executionState: ExecutiveMemoryCaptureExecutionState,
): ExecutiveMemoryOperationalRunnerResult {
  return {
    status,
    batchesExecuted,
    captureCycleId: executionState.captureCycleId,
    cursor: executionState.cursor,
    totals: cloneTotals(executionState.totals),
    executionState,
  }
}

function mapTerminalStatus(
  executionStatus: ExecutiveMemoryCaptureExecutionStatus,
): ExecutiveMemoryOperationalRunnerStatus {
  const status = TERMINAL_RESULT_STATUS_BY_EXECUTION_STATUS[executionStatus]
  if (!status) {
    throw new Error(`Unsupported executive memory execution status: ${executionStatus}`)
  }

  return status
}

export class ExecutiveMemoryOperationalRunner {
  async runToBoundary(
    input: ExecutiveMemoryOperationalRunnerInput,
  ): Promise<ExecutiveMemoryOperationalRunnerResult> {
    const maxBatches = normalizeMaxBatches(input.maxBatches)
    let batchesExecuted = 0
    let executionState = input.execution.getState()

    if (executionState.status === 'completed'
      || executionState.status === 'failed'
      || executionState.status === 'already_running'
      || executionState.status === 'running') {
      return buildResult(
        mapTerminalStatus(executionState.status),
        batchesExecuted,
        executionState,
      )
    }

    if (executionState.status === 'idle') {
      executionState = await input.execution.start({ limit: input.limit })
      batchesExecuted += 1
    }

    while (executionState.status === 'ready_to_continue' && batchesExecuted < maxBatches) {
      executionState = await input.execution.continueExecution({ limit: input.limit })
      batchesExecuted += 1
    }

    if (executionState.status === 'ready_to_continue') {
      return buildResult('batch_limit_reached', batchesExecuted, executionState)
    }

    return buildResult(
      mapTerminalStatus(executionState.status),
      batchesExecuted,
      executionState,
    )
  }
}

export function createExecutiveMemoryOperationalRunner() {
  return new ExecutiveMemoryOperationalRunner()
}
