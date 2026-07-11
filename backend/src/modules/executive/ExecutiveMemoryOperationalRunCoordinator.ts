import type {
  ExecutiveMemoryOperationalRunnerExecution,
  ExecutiveMemoryOperationalRunnerResult,
  ExecutiveMemoryOperationalRunnerStatus,
} from './ExecutiveMemoryOperationalRunner.js'

export interface ExecutiveMemoryOperationalRunCoordinatorRuntime {
  createExecution(): ExecutiveMemoryOperationalRunnerExecution
}

export interface ExecutiveMemoryOperationalRunCoordinatorDependencies {
  runtime: ExecutiveMemoryOperationalRunCoordinatorRuntime
  operationalRunner: {
    runToBoundary(input: {
      execution: ExecutiveMemoryOperationalRunnerExecution
      maxBatches?: number
      limit?: number
    }): Promise<ExecutiveMemoryOperationalRunnerResult>
  }
}

export interface ExecutiveMemoryOperationalRunInput {
  maxBatches?: number
  limit?: number
}

export interface ExecutiveMemoryOperationalRunResult {
  status: ExecutiveMemoryOperationalRunnerStatus
  batchesExecuted: number
  captureCycleId?: string
  cursor?: string
  totals: ExecutiveMemoryOperationalRunnerResult['totals']
  executionState: ExecutiveMemoryOperationalRunnerResult['executionState']
}

function buildRunResult(
  runnerResult: ExecutiveMemoryOperationalRunnerResult,
): ExecutiveMemoryOperationalRunResult {
  return {
    status: runnerResult.status,
    batchesExecuted: runnerResult.batchesExecuted,
    captureCycleId: runnerResult.captureCycleId,
    cursor: runnerResult.cursor,
    totals: runnerResult.totals,
    executionState: runnerResult.executionState,
  }
}

export class ExecutiveMemoryOperationalRunCoordinator {
  constructor(
    private readonly dependencies: ExecutiveMemoryOperationalRunCoordinatorDependencies,
  ) {}

  async run(input: ExecutiveMemoryOperationalRunInput = {}): Promise<ExecutiveMemoryOperationalRunResult> {
    const execution = this.dependencies.runtime.createExecution()
    const runnerResult = await this.dependencies.operationalRunner.runToBoundary({
      execution,
      maxBatches: input.maxBatches,
      limit: input.limit,
    })

    return buildRunResult(runnerResult)
  }
}

export function createExecutiveMemoryOperationalRunCoordinator(
  dependencies: ExecutiveMemoryOperationalRunCoordinatorDependencies,
) {
  return new ExecutiveMemoryOperationalRunCoordinator(dependencies)
}
