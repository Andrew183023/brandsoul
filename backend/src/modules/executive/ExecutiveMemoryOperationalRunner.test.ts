import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES,
  EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_MAX_BATCHES,
  ExecutiveMemoryOperationalRunner,
  createExecutiveMemoryOperationalRunner,
} from './ExecutiveMemoryOperationalRunner.js'

type ExecutionStateStatus =
  | 'idle'
  | 'running'
  | 'ready_to_continue'
  | 'already_running'
  | 'failed'
  | 'completed'

type ExecutionState = {
  status: ExecutionStateStatus
  captureCycleId?: string
  cursor?: string
  totals: {
    processed: number
    captured: number
    created: number
    failed: number
  }
  lastBatch?: {
    status: 'completed' | 'already_running' | 'error'
    startedAt?: string
    finishedAt?: string
    nextCursor?: string
    totals?: {
      processed: number
      captured: number
      created: number
      failed: number
    }
    error?: string
  }
}

function buildState(overrides: Partial<ExecutionState> & Pick<ExecutionState, 'status'>): ExecutionState {
  return {
    status: overrides.status,
    captureCycleId: overrides.captureCycleId,
    cursor: overrides.cursor,
    totals: overrides.totals ?? {
      processed: 0,
      captured: 0,
      created: 0,
      failed: 0,
    },
    lastBatch: overrides.lastBatch,
  }
}

function createExecutionHarness(config: {
  initialState?: ExecutionState
  startStates?: ExecutionState[]
  continueStates?: ExecutionState[]
}) {
  const startStates = [...(config.startStates ?? [])]
  const continueStates = [...(config.continueStates ?? [])]
  let currentState = config.initialState ?? buildState({ status: 'idle' })
  const startCalls: Array<{ limit?: number }> = []
  const continueCalls: Array<{ limit?: number }> = []
  const retryCalls: Array<{ limit?: number }> = []

  const execution = {
    getState() {
      return structuredClone(currentState)
    },
    async start(input?: { limit?: number }) {
      startCalls.push(structuredClone(input ?? {}))
      const next = startStates.shift()
      if (!next) {
        throw new Error('start states exhausted')
      }

      currentState = structuredClone(next)
      return structuredClone(next)
    },
    async continueExecution(input?: { limit?: number }) {
      continueCalls.push(structuredClone(input ?? {}))
      const next = continueStates.shift()
      if (!next) {
        throw new Error('continue states exhausted')
      }

      currentState = structuredClone(next)
      return structuredClone(next)
    },
    async retry(input?: { limit?: number }) {
      retryCalls.push(structuredClone(input ?? {}))
      return structuredClone(currentState)
    },
  }

  return {
    execution,
    startCalls,
    continueCalls,
    retryCalls,
    getCurrentState() {
      return structuredClone(currentState)
    },
  }
}

test('factory returns a valid operational runner instance', () => {
  const runner = createExecutiveMemoryOperationalRunner()

  assert.equal(runner instanceof ExecutiveMemoryOperationalRunner, true)
})

test('idle execution starts once and completes without continue', async () => {
  const harness = createExecutionHarness({
    startStates: [
      buildState({
        status: 'completed',
        captureCycleId: 'cycle-1',
        totals: {
          processed: 2,
          captured: 2,
          created: 1,
          failed: 0,
        },
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
    limit: 12,
  })

  assert.deepEqual(harness.startCalls, [{ limit: 12 }])
  assert.deepEqual(harness.continueCalls, [])
  assert.equal(result.status, 'completed')
  assert.equal(result.batchesExecuted, 1)
  assert.equal(result.captureCycleId, 'cycle-1')
  assert.deepEqual(result.totals, {
    processed: 2,
    captured: 2,
    created: 1,
    failed: 0,
  })
})

test('runner continues batch by batch until completed', async () => {
  const harness = createExecutionHarness({
    startStates: [
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-1',
        cursor: 'cursor-1',
        totals: {
          processed: 2,
          captured: 2,
          created: 1,
          failed: 0,
        },
      }),
    ],
    continueStates: [
      buildState({
        status: 'completed',
        captureCycleId: 'cycle-1',
        totals: {
          processed: 4,
          captured: 3,
          created: 2,
          failed: 1,
        },
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
    limit: 25,
    maxBatches: 3,
  })

  assert.deepEqual(harness.startCalls, [{ limit: 25 }])
  assert.deepEqual(harness.continueCalls, [{ limit: 25 }])
  assert.equal(result.status, 'completed')
  assert.equal(result.batchesExecuted, 2)
  assert.equal(result.captureCycleId, 'cycle-1')
  assert.deepEqual(result.totals, {
    processed: 4,
    captured: 3,
    created: 2,
    failed: 1,
  })
})

test('runner never exceeds maxBatches and returns batch_limit_reached explicitly', async () => {
  const harness = createExecutionHarness({
    startStates: [
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-1',
        cursor: 'cursor-1',
        totals: {
          processed: 1,
          captured: 1,
          created: 1,
          failed: 0,
        },
      }),
    ],
    continueStates: [
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-1',
        cursor: 'cursor-2',
        totals: {
          processed: 2,
          captured: 2,
          created: 2,
          failed: 0,
        },
      }),
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-1',
        cursor: 'cursor-3',
        totals: {
          processed: 3,
          captured: 3,
          created: 2,
          failed: 1,
        },
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
    limit: 20,
    maxBatches: 3,
  })

  assert.equal(result.status, 'batch_limit_reached')
  assert.equal(result.batchesExecuted, 3)
  assert.equal(result.cursor, 'cursor-3')
  assert.deepEqual(harness.startCalls, [{ limit: 20 }])
  assert.deepEqual(harness.continueCalls, [{ limit: 20 }, { limit: 20 }])
})

test('ready_to_continue execution skips start and continues from current state', async () => {
  const harness = createExecutionHarness({
    initialState: buildState({
      status: 'ready_to_continue',
      captureCycleId: 'cycle-9',
      cursor: 'cursor-9',
      totals: {
        processed: 4,
        captured: 3,
        created: 2,
        failed: 1,
      },
    }),
    continueStates: [
      buildState({
        status: 'completed',
        captureCycleId: 'cycle-9',
        totals: {
          processed: 5,
          captured: 4,
          created: 3,
          failed: 1,
        },
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
    limit: 7,
  })

  assert.deepEqual(harness.startCalls, [])
  assert.deepEqual(harness.continueCalls, [{ limit: 7 }])
  assert.equal(result.batchesExecuted, 1)
  assert.equal(result.status, 'completed')
})

test('completed execution returns immediately without calling start or continue', async () => {
  const harness = createExecutionHarness({
    initialState: buildState({
      status: 'completed',
      captureCycleId: 'cycle-1',
      totals: {
        processed: 3,
        captured: 2,
        created: 2,
        failed: 1,
      },
    }),
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.batchesExecuted, 0)
  assert.deepEqual(harness.startCalls, [])
  assert.deepEqual(harness.continueCalls, [])
})

test('failed execution returns immediately and never retries automatically', async () => {
  const harness = createExecutionHarness({
    initialState: buildState({
      status: 'failed',
      captureCycleId: 'cycle-2',
      cursor: 'cursor-2',
      totals: {
        processed: 2,
        captured: 1,
        created: 1,
        failed: 1,
      },
    }),
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.batchesExecuted, 0)
  assert.deepEqual(harness.retryCalls, [])
})

test('already_running execution returns immediately without retry', async () => {
  const harness = createExecutionHarness({
    initialState: buildState({
      status: 'already_running',
      captureCycleId: 'cycle-3',
      cursor: 'cursor-3',
    }),
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
  })

  assert.equal(result.status, 'already_running')
  assert.equal(result.batchesExecuted, 0)
  assert.deepEqual(harness.startCalls, [])
  assert.deepEqual(harness.continueCalls, [])
})

test('running execution returns explicit running boundary without executing another batch', async () => {
  const harness = createExecutionHarness({
    initialState: buildState({
      status: 'running',
      captureCycleId: 'cycle-4',
    }),
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
  })

  assert.equal(result.status, 'running')
  assert.equal(result.batchesExecuted, 0)
})

test('runner stops immediately when a batch returns failed', async () => {
  const harness = createExecutionHarness({
    startStates: [
      buildState({
        status: 'failed',
        captureCycleId: 'cycle-5',
        cursor: 'cursor-5',
        totals: {
          processed: 1,
          captured: 1,
          created: 0,
          failed: 0,
        },
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
    limit: 5,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.batchesExecuted, 1)
  assert.deepEqual(harness.continueCalls, [])
  assert.deepEqual(harness.retryCalls, [])
})

test('runner stops immediately when a batch returns already_running', async () => {
  const harness = createExecutionHarness({
    startStates: [
      buildState({
        status: 'already_running',
        captureCycleId: 'cycle-6',
        cursor: 'cursor-6',
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  const result = await runner.runToBoundary({
    execution: harness.execution,
    limit: 5,
  })

  assert.equal(result.status, 'already_running')
  assert.equal(result.batchesExecuted, 1)
  assert.deepEqual(harness.continueCalls, [])
})

test('maxBatches normalization is deterministic and bounded', async () => {
  const runner = createExecutiveMemoryOperationalRunner()

  for (const maxBatches of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const harness = createExecutionHarness({
      initialState: buildState({
        status: 'ready_to_continue',
        captureCycleId: `cycle-default-${String(maxBatches)}`,
        cursor: 'cursor-default',
      }),
      continueStates: Array.from(
        { length: EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES },
        (_, index) => buildState({
          status: index === EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES - 1
            ? 'ready_to_continue'
            : 'ready_to_continue',
          captureCycleId: `cycle-default-${String(maxBatches)}`,
          cursor: `cursor-${index + 1}`,
        }),
      ),
    })

    const result = await runner.runToBoundary({
      execution: harness.execution,
      maxBatches,
    })

    assert.equal(result.status, 'batch_limit_reached')
    assert.equal(result.batchesExecuted, EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_DEFAULT_MAX_BATCHES)
  }

  const fractionalHarness = createExecutionHarness({
    initialState: buildState({
      status: 'ready_to_continue',
      captureCycleId: 'cycle-fractional',
      cursor: 'cursor-fractional',
    }),
    continueStates: [
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-fractional',
        cursor: 'cursor-next',
      }),
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-fractional',
        cursor: 'cursor-overflow',
      }),
    ],
  })

  const fractionalResult = await runner.runToBoundary({
    execution: fractionalHarness.execution,
    maxBatches: 1.9,
  })

  assert.equal(fractionalResult.status, 'batch_limit_reached')
  assert.equal(fractionalResult.batchesExecuted, 1)

  const cappedHarness = createExecutionHarness({
    initialState: buildState({
      status: 'ready_to_continue',
      captureCycleId: 'cycle-cap',
      cursor: 'cursor-cap',
    }),
    continueStates: Array.from(
      { length: EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_MAX_BATCHES },
      (_, index) => buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-cap',
        cursor: `cursor-cap-${index + 1}`,
      }),
    ),
  })

  const cappedResult = await runner.runToBoundary({
    execution: cappedHarness.execution,
    maxBatches: EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_MAX_BATCHES + 50,
  })

  assert.equal(cappedResult.status, 'batch_limit_reached')
  assert.equal(cappedResult.batchesExecuted, EXECUTIVE_MEMORY_OPERATIONAL_RUNNER_MAX_BATCHES)
})

test('limit is propagated to start and every continue call', async () => {
  const harness = createExecutionHarness({
    startStates: [
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-7',
        cursor: 'cursor-7',
      }),
    ],
    continueStates: [
      buildState({
        status: 'ready_to_continue',
        captureCycleId: 'cycle-7',
        cursor: 'cursor-8',
      }),
      buildState({
        status: 'completed',
        captureCycleId: 'cycle-7',
      }),
    ],
  })
  const runner = createExecutiveMemoryOperationalRunner()

  await runner.runToBoundary({
    execution: harness.execution,
    limit: 33,
    maxBatches: 5,
  })

  assert.deepEqual(harness.startCalls, [{ limit: 33 }])
  assert.deepEqual(harness.continueCalls, [{ limit: 33 }, { limit: 33 }])
})

test('runner does not mutate input', async () => {
  const harness = createExecutionHarness({
    initialState: buildState({
      status: 'completed',
      captureCycleId: 'cycle-8',
    }),
  })
  const runner = createExecutiveMemoryOperationalRunner()
  const input = {
    execution: harness.execution,
    maxBatches: 9,
    limit: 21,
  }
  const before = {
    execution: input.execution,
    maxBatches: input.maxBatches,
    limit: input.limit,
  }

  await runner.runToBoundary(input)

  assert.equal(input.execution, before.execution)
  assert.equal(input.maxBatches, before.maxBatches)
  assert.equal(input.limit, before.limit)
})

test('structural guard keeps the operational runner isolated from forbidden dependencies', async () => {
  const filePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'ExecutiveMemoryOperationalRunner.ts')
  const source = await readFile(filePath, 'utf8')

  const forbiddenPatterns = [
    /\bany\b/,
    /Date\.now/,
    /new Date/,
    /performance\.now/,
    /Math\.random/,
    /randomUUID/,
    /ExecutiveMemoryAtomicCapture/,
    /ExecutiveMemoryCaptureOrchestrator/,
    /ExecutiveMemoryCaptureTriggerService/,
    /Fastify/,
    /fetch/,
    /axios/,
    /scheduler/i,
    /cron/i,
    /\bjob\b/i,
    /setInterval/,
    /setTimeout/,
    /process\.env/,
    /window/,
    /document/,
    /localStorage/,
    /sessionStorage/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `unexpected forbidden pattern: ${pattern}`)
  }
})
