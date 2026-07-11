import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryOperationalRunCoordinator,
  createExecutiveMemoryOperationalRunCoordinator,
} from './ExecutiveMemoryOperationalRunCoordinator.js'

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

type RunnerResult = {
  status: 'completed' | 'failed' | 'already_running' | 'running' | 'batch_limit_reached'
  batchesExecuted: number
  captureCycleId?: string
  cursor?: string
  totals: {
    processed: number
    captured: number
    created: number
    failed: number
  }
  executionState: ExecutionState
}

function buildExecutionState(
  overrides: Partial<ExecutionState> & Pick<ExecutionState, 'status'>,
): ExecutionState {
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

function buildRunnerResult(
  overrides: Partial<RunnerResult> & Pick<RunnerResult, 'status' | 'executionState'>,
): RunnerResult {
  return {
    status: overrides.status,
    batchesExecuted: overrides.batchesExecuted ?? 1,
    captureCycleId: overrides.captureCycleId,
    cursor: overrides.cursor,
    totals: overrides.totals ?? {
      processed: 0,
      captured: 0,
      created: 0,
      failed: 0,
    },
    executionState: overrides.executionState,
  }
}

function createExecution(id: string) {
  const calls = {
    start: 0,
    continueExecution: 0,
    retry: 0,
  }

  return {
    id,
    calls,
    execution: {
      getState() {
        return buildExecutionState({ status: 'idle' })
      },
      async start() {
        calls.start += 1
        return buildExecutionState({ status: 'completed', captureCycleId: `${id}-cycle` })
      },
      async continueExecution() {
        calls.continueExecution += 1
        return buildExecutionState({ status: 'completed', captureCycleId: `${id}-cycle` })
      },
      async retry() {
        calls.retry += 1
        return buildExecutionState({ status: 'completed', captureCycleId: `${id}-cycle` })
      },
    },
  }
}

function createHarness(overrides?: {
  createExecution?: () => ReturnType<typeof createExecution>['execution']
  runToBoundary?: (input: {
    execution: ReturnType<typeof createExecution>['execution']
    maxBatches?: number
    limit?: number
  }) => Promise<RunnerResult>
}) {
  const createExecutionCalls: ReturnType<typeof createExecution>['execution'][] = []
  const runCalls: Array<{
    execution: ReturnType<typeof createExecution>['execution']
    maxBatches?: number
    limit?: number
  }> = []
  let executionIndex = 0

  return {
    createExecutionCalls,
    runCalls,
    dependencies: {
      runtime: {
        createExecution() {
          const executionRecord = overrides?.createExecution?.() ?? createExecution(`execution-${executionIndex += 1}`).execution
          createExecutionCalls.push(executionRecord)
          return executionRecord
        },
      },
      operationalRunner: {
        async runToBoundary(input: {
          execution: ReturnType<typeof createExecution>['execution']
          maxBatches?: number
          limit?: number
        }) {
          runCalls.push(input)

          if (overrides?.runToBoundary) {
            return overrides.runToBoundary(input)
          }

          return buildRunnerResult({
            status: 'completed',
            batchesExecuted: 2,
            captureCycleId: 'cycle-1',
            cursor: 'cursor-1',
            totals: {
              processed: 3,
              captured: 2,
              created: 2,
              failed: 1,
            },
            executionState: buildExecutionState({
              status: 'completed',
              captureCycleId: 'cycle-1',
              cursor: 'cursor-1',
              totals: {
                processed: 3,
                captured: 2,
                created: 2,
                failed: 1,
              },
            }),
          })
        },
      },
    },
  }
}

test('factory returns a valid operational run coordinator instance', () => {
  const harness = createHarness()
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  assert.equal(coordinator instanceof ExecutiveMemoryOperationalRunCoordinator, true)
})

test('composition is side-effect free and does not create executions or call the runner', () => {
  const harness = createHarness()

  createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  assert.equal(harness.createExecutionCalls.length, 0)
  assert.equal(harness.runCalls.length, 0)
})

test('run creates exactly one execution and delegates to the runner exactly once', async () => {
  const harness = createHarness()
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)
  const input = { maxBatches: 9, limit: 25 }
  const before = structuredClone(input)

  const result = await coordinator.run(input)

  assert.equal(harness.createExecutionCalls.length, 1)
  assert.equal(harness.runCalls.length, 1)
  assert.equal(harness.runCalls[0]?.execution, harness.createExecutionCalls[0])
  assert.equal(harness.runCalls[0]?.maxBatches, 9)
  assert.equal(harness.runCalls[0]?.limit, 25)
  assert.deepEqual(input, before)
  assert.deepEqual(result, {
    status: 'completed',
    batchesExecuted: 2,
    captureCycleId: 'cycle-1',
    cursor: 'cursor-1',
    totals: {
      processed: 3,
      captured: 2,
      created: 2,
      failed: 1,
    },
    executionState: {
      status: 'completed',
      captureCycleId: 'cycle-1',
      cursor: 'cursor-1',
      totals: {
        processed: 3,
        captured: 2,
        created: 2,
        failed: 1,
      },
      lastBatch: undefined,
    },
  })
})

test('preserves all runner statuses without semantic conversion', async () => {
  for (const status of ['completed', 'failed', 'already_running', 'running', 'batch_limit_reached'] as const) {
    const runnerResult = buildRunnerResult({
      status,
      batchesExecuted: 4,
      captureCycleId: 'cycle-status',
      cursor: 'cursor-status',
      totals: {
        processed: 7,
        captured: 5,
        created: 4,
        failed: 2,
      },
      executionState: buildExecutionState({
        status: status === 'batch_limit_reached' ? 'ready_to_continue' : status,
        captureCycleId: 'cycle-status',
        cursor: 'cursor-status',
        totals: {
          processed: 7,
          captured: 5,
          created: 4,
          failed: 2,
        },
      }),
    })
    const harness = createHarness({
      runToBoundary: async () => runnerResult,
    })
    const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

    const result = await coordinator.run()

    assert.equal(result.status, status)
    assert.equal(result.captureCycleId, 'cycle-status')
    assert.equal(result.cursor, 'cursor-status')
    assert.deepEqual(result.totals, {
      processed: 7,
      captured: 5,
      created: 4,
      failed: 2,
    })
    assert.equal(result.batchesExecuted, 4)
  }
})

test('sequential runs create distinct executions', async () => {
  const harness = createHarness()
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  await coordinator.run()
  await coordinator.run()

  assert.equal(harness.createExecutionCalls.length, 2)
  assert.notEqual(harness.createExecutionCalls[0], harness.createExecutionCalls[1])
  assert.equal(harness.runCalls[0]?.execution, harness.createExecutionCalls[0])
  assert.equal(harness.runCalls[1]?.execution, harness.createExecutionCalls[1])
})

test('concurrent runs create distinct executions and invoke the runner once per execution', async () => {
  let releaseFirst: (() => void) | null = null
  let releaseSecond: (() => void) | null = null
  const harness = createHarness({
    runToBoundary: async (input) => {
      if (harness.runCalls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      } else {
        await new Promise<void>((resolve) => {
          releaseSecond = resolve
        })
      }

      return buildRunnerResult({
        status: 'completed',
        batchesExecuted: 1,
        captureCycleId: input.execution === harness.createExecutionCalls[0] ? 'cycle-1' : 'cycle-2',
        executionState: buildExecutionState({
          status: 'completed',
          captureCycleId: input.execution === harness.createExecutionCalls[0] ? 'cycle-1' : 'cycle-2',
        }),
      })
    },
  })
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  const first = coordinator.run()
  const second = coordinator.run()

  await Promise.resolve()
  assert.equal(harness.createExecutionCalls.length, 2)
  assert.notEqual(harness.createExecutionCalls[0], harness.createExecutionCalls[1])
  assert.equal(harness.runCalls.length, 2)
  assert.equal(harness.runCalls[0]?.execution, harness.createExecutionCalls[0])
  assert.equal(harness.runCalls[1]?.execution, harness.createExecutionCalls[1])

  releaseFirst?.()
  releaseSecond?.()

  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(firstResult.captureCycleId, 'cycle-1')
  assert.equal(secondResult.captureCycleId, 'cycle-2')
})

test('createExecution failure is propagated and the runner is not called', async () => {
  const harness = createHarness()
  const expected = new Error('create execution failed')
  harness.dependencies.runtime.createExecution = () => {
    throw expected
  }
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  await assert.rejects(() => coordinator.run(), expected)
  assert.equal(harness.runCalls.length, 0)
})

test('runner failure is propagated without retry or second execution', async () => {
  const harness = createHarness({
    runToBoundary: async () => {
      throw new Error('runner failed')
    },
  })
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  await assert.rejects(() => coordinator.run(), /runner failed/)
  assert.equal(harness.createExecutionCalls.length, 1)
  assert.equal(harness.runCalls.length, 1)
})

test('coordinator never calls execution start continueExecution or retry directly', async () => {
  const executionRecord = createExecution('guarded-execution')
  const harness = createHarness({
    createExecution: () => executionRecord.execution,
  })
  const coordinator = createExecutiveMemoryOperationalRunCoordinator(harness.dependencies)

  await coordinator.run()

  assert.deepEqual(executionRecord.calls, {
    start: 0,
    continueExecution: 0,
    retry: 0,
  })
})

test('structural guard keeps the coordinator isolated from forbidden dependencies and direct execution driving', async () => {
  const filePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'ExecutiveMemoryOperationalRunCoordinator.ts')
  const source = await readFile(filePath, 'utf8')

  const forbiddenPatterns = [
    /\bany\b/,
    /as any/,
    /@ts-ignore/,
    /@ts-expect-error/,
    /Date\.now/,
    /new Date/,
    /performance\.now/,
    /Math\.random/,
    /randomUUID/,
    /setTimeout/,
    /setInterval/,
    /process\.env/,
    /Fastify/,
    /fetch/,
    /axios/,
    /scheduler/i,
    /cron/i,
    /\bjob\b/i,
    /\bworker\b/i,
    /retry\(/,
    /\.start\(/,
    /continueExecution\(/,
    /AtomicCapture/,
    /Orchestrator/,
    /TriggerService/,
    /createDatabaseConnection/,
    /initializeDatabase/,
    /repository/i,
    /window/,
    /document/,
    /localStorage/,
    /sessionStorage/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `unexpected forbidden pattern: ${pattern}`)
  }
})
