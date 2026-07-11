import type {
  ExecutiveMemoryCaptureTriggerInput,
  ExecutiveMemoryCaptureTriggerResult,
  ExecutiveMemoryCaptureTriggerService,
} from './ExecutiveMemoryCaptureTriggerService.js'

export interface ExecutiveMemoryCaptureCycleIdSource {
  nextCaptureCycleId(): string
}

export interface ExecutiveMemoryCaptureExecutionTotals {
  processed: number
  captured: number
  created: number
  failed: number
}

export type ExecutiveMemoryCaptureExecutionStatus =
  | 'idle'
  | 'running'
  | 'ready_to_continue'
  | 'already_running'
  | 'failed'
  | 'completed'

export interface ExecutiveMemoryCaptureExecutionBatchSummary {
  status: 'completed' | 'already_running' | 'error'
  startedAt?: string
  finishedAt?: string
  nextCursor?: string
  totals?: ExecutiveMemoryCaptureExecutionTotals
  error?: string
}

export interface ExecutiveMemoryCaptureExecutionState {
  status: ExecutiveMemoryCaptureExecutionStatus
  captureCycleId?: string
  cursor?: string
  totals: ExecutiveMemoryCaptureExecutionTotals
  lastBatch?: ExecutiveMemoryCaptureExecutionBatchSummary
}

export interface ExecutiveMemoryCaptureExecutionServiceDependencies {
  triggerService: Pick<ExecutiveMemoryCaptureTriggerService, 'run'>
  captureCycleIdSource: ExecutiveMemoryCaptureCycleIdSource
}

export interface ExecutiveMemoryCaptureExecutionStartInput {
  limit?: number
}

export interface ExecutiveMemoryCaptureExecutionContinueInput {
  limit?: number
}

export interface ExecutiveMemoryCaptureExecutionRetryInput {
  limit?: number
}

const ZERO_TOTALS: ExecutiveMemoryCaptureExecutionTotals = {
  processed: 0,
  captured: 0,
  created: 0,
  failed: 0,
}

function cloneTotals(totals: ExecutiveMemoryCaptureExecutionTotals): ExecutiveMemoryCaptureExecutionTotals {
  return {
    processed: totals.processed,
    captured: totals.captured,
    created: totals.created,
    failed: totals.failed,
  }
}

function addTotals(
  current: ExecutiveMemoryCaptureExecutionTotals,
  delta: ExecutiveMemoryCaptureExecutionTotals,
): ExecutiveMemoryCaptureExecutionTotals {
  return {
    processed: current.processed + delta.processed,
    captured: current.captured + delta.captured,
    created: current.created + delta.created,
    failed: current.failed + delta.failed,
  }
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory capture execution service requires ${label}.`)
  }
}

function normalizeFailureMessage() {
  return 'Executive memory capture execution failed.'
}

function buildCompletedBatchSummary(
  result: ExecutiveMemoryCaptureTriggerResult,
): ExecutiveMemoryCaptureExecutionBatchSummary {
  return {
    status: 'completed',
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    nextCursor: result.nextCursor,
    totals: result.totals,
  }
}

function buildAlreadyRunningBatchSummary(): ExecutiveMemoryCaptureExecutionBatchSummary {
  return {
    status: 'already_running',
  }
}

function buildFailedBatchSummary(): ExecutiveMemoryCaptureExecutionBatchSummary {
  return {
    status: 'error',
    error: normalizeFailureMessage(),
  }
}

export class ExecutiveMemoryCaptureExecutionService {
  private readonly state: ExecutiveMemoryCaptureExecutionState = {
    status: 'idle',
    totals: cloneTotals(ZERO_TOTALS),
  }

  private inFlight = false

  constructor(
    private readonly dependencies: ExecutiveMemoryCaptureExecutionServiceDependencies,
  ) {}

  getState(): ExecutiveMemoryCaptureExecutionState {
    return {
      status: this.state.status,
      captureCycleId: this.state.captureCycleId,
      cursor: this.state.cursor,
      totals: cloneTotals(this.state.totals),
      lastBatch: this.state.lastBatch
        ? { ...this.state.lastBatch, totals: this.state.lastBatch.totals ? cloneTotals(this.state.lastBatch.totals) : undefined }
        : undefined,
    }
  }

  async start(
    input: ExecutiveMemoryCaptureExecutionStartInput = {},
  ): Promise<ExecutiveMemoryCaptureExecutionState> {
    this.assertNotRunning()

    if (this.state.status !== 'idle') {
      throw new Error('Executive memory capture execution has already started.')
    }

    this.inFlight = true
    this.state.status = 'running'
    this.state.cursor = undefined

    try {
      const captureCycleId = this.dependencies.captureCycleIdSource.nextCaptureCycleId()
      assertNonEmptyString(captureCycleId, 'captureCycleId')

      this.state.captureCycleId = captureCycleId

      return await this.runBatch({
        captureCycleId,
        cursor: undefined,
        limit: input.limit,
      })
    } catch (error) {
      this.state.status = 'idle'
      this.state.cursor = undefined
      this.state.captureCycleId = undefined
      this.inFlight = false
      throw error
    }
  }

  async continueExecution(
    input: ExecutiveMemoryCaptureExecutionContinueInput = {},
  ): Promise<ExecutiveMemoryCaptureExecutionState> {
    this.assertNotRunning()

    if (!this.state.captureCycleId) {
      throw new Error('Executive memory capture execution has not started.')
    }

    if (this.state.status === 'completed') {
      throw new Error('Executive memory capture execution is already completed.')
    }

    if (this.state.status !== 'ready_to_continue') {
      throw new Error('Executive memory capture execution is not ready to continue.')
    }

    return this.runBatch({
      captureCycleId: this.state.captureCycleId,
      cursor: this.state.cursor,
      limit: input.limit,
    })
  }

  async retry(
    input: ExecutiveMemoryCaptureExecutionRetryInput = {},
  ): Promise<ExecutiveMemoryCaptureExecutionState> {
    this.assertNotRunning()

    if (!this.state.captureCycleId) {
      throw new Error('Executive memory capture execution has not started.')
    }

    if (this.state.status !== 'failed' && this.state.status !== 'already_running') {
      throw new Error('Executive memory capture execution is not retryable.')
    }

    return this.runBatch({
      captureCycleId: this.state.captureCycleId,
      cursor: this.state.cursor,
      limit: input.limit,
    })
  }

  private async runBatch(
    input: ExecutiveMemoryCaptureTriggerInput,
  ): Promise<ExecutiveMemoryCaptureExecutionState> {
    const ownsGuard = !this.inFlight
    if (ownsGuard) {
      this.inFlight = true
    }
    this.state.status = 'running'

    try {
      const result = await this.dependencies.triggerService.run({
        captureCycleId: input.captureCycleId,
        cursor: input.cursor,
        limit: input.limit,
      })

      if (result.status === 'already_running') {
        this.state.status = 'already_running'
        this.state.cursor = input.cursor
        this.state.lastBatch = buildAlreadyRunningBatchSummary()
        return this.getState()
      }

      this.state.totals = addTotals(this.state.totals, result.totals ?? cloneTotals(ZERO_TOTALS))
      this.state.cursor = result.nextCursor
      this.state.lastBatch = buildCompletedBatchSummary(result)
      this.state.status = typeof result.nextCursor === 'string'
        ? 'ready_to_continue'
        : 'completed'

      return this.getState()
    } catch {
      this.state.status = 'failed'
      this.state.cursor = input.cursor
      this.state.lastBatch = buildFailedBatchSummary()
      return this.getState()
    } finally {
      if (ownsGuard) {
        this.inFlight = false
      } else {
        this.inFlight = false
      }
    }
  }

  private assertNotRunning() {
    if (this.inFlight) {
      throw new Error('Executive memory capture execution is already running.')
    }
  }
}

export function createExecutiveMemoryCaptureExecutionService(
  dependencies: ExecutiveMemoryCaptureExecutionServiceDependencies,
) {
  return new ExecutiveMemoryCaptureExecutionService(dependencies)
}
