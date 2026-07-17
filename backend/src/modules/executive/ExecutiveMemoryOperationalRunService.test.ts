import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import {
  EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL,
  ExecutiveMemoryOperationalRunService,
  createExecutiveMemoryOperationalRunService,
} from './index.js'

type CoordinatorResultStatus =
  | 'completed'
  | 'failed'
  | 'already_running'
  | 'running'
  | 'batch_limit_reached'

type ExecutionStateStatus =
  | 'idle'
  | 'running'
  | 'ready_to_continue'
  | 'already_running'
  | 'failed'
  | 'completed'

type CoordinatorResult = {
  status: CoordinatorResultStatus
  batchesExecuted: number
  captureCycleId?: string
  cursor?: string
  totals: {
    processed: number
    captured: number
    created: number
    failed: number
  }
  executionState: {
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
}

function buildCoordinatorResult(
  overrides: Partial<CoordinatorResult> & Pick<CoordinatorResult, 'status'>,
): CoordinatorResult {
  const totals = overrides.totals ?? {
    processed: 3,
    captured: 2,
    created: 2,
    failed: 1,
  }

  return {
    status: overrides.status,
    batchesExecuted: overrides.batchesExecuted ?? 2,
    captureCycleId: overrides.captureCycleId ?? 'cycle-1',
    cursor: overrides.cursor ?? 'cursor-1',
    totals,
    executionState: overrides.executionState ?? {
      status: overrides.status === 'batch_limit_reached' ? 'ready_to_continue' : overrides.status,
      captureCycleId: overrides.captureCycleId ?? 'cycle-1',
      cursor: overrides.cursor ?? 'cursor-1',
      totals,
      lastBatch: undefined,
    },
  }
}

function createHarness(overrides?: {
  result?: CoordinatorResult
  run?: (input: { tenantId: number; maxBatches?: number; limit?: number }) => Promise<CoordinatorResult>
}) {
  const runCalls: Array<{ tenantId: number; maxBatches?: number; limit?: number }> = []

  return {
    runCalls,
    dependencies: {
      coordinator: {
        async run(input: { tenantId: number; maxBatches?: number; limit?: number }) {
          runCalls.push({
            tenantId: input.tenantId,
            maxBatches: input.maxBatches,
            limit: input.limit,
          })

          if (overrides?.run) {
            return overrides.run(input)
          }

          return overrides?.result ?? buildCoordinatorResult({ status: 'completed' })
        },
      },
    },
  }
}

function counterSeries(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, status: string) {
  return Object.keys(snapshot.customCounterSeries).some((key) =>
    key.includes(`executive_memory_operational_runs_total{source=executive_memory_operational_run,status=${status}}`),
  )
}

test('factory returns a valid operational run service instance', () => {
  const harness = createHarness()
  const service = createExecutiveMemoryOperationalRunService(harness.dependencies)

  assert.equal(service instanceof ExecutiveMemoryOperationalRunService, true)
})

test('composition is side-effect free and does not call the coordinator', () => {
  const harness = createHarness()

  createExecutiveMemoryOperationalRunService(harness.dependencies)

  assert.equal(harness.runCalls.length, 0)
})

test('run delegates exactly once to the coordinator with tenant scope', async () => {
  const harness = createHarness()
  const service = createExecutiveMemoryOperationalRunService(harness.dependencies)

  const result = await service.run({ tenantId: 11 })

  assert.deepEqual(harness.runCalls, [{
    tenantId: 11,
    maxBatches: undefined,
    limit: undefined,
  }])
  assert.equal(result.status, 'completed')
})

test('request fields are propagated without mutation', async () => {
  const harness = createHarness()
  const service = createExecutiveMemoryOperationalRunService(harness.dependencies)
  const request = { tenantId: 22, maxBatches: 12, limit: 25 }
  const before = structuredClone(request)

  await service.run(request)

  assert.deepEqual(harness.runCalls, [{ tenantId: 22, maxBatches: 12, limit: 25 }])
  assert.deepEqual(request, before)
})

test('service preserves every coordinator status and canonical operational fields', async () => {
  for (const status of ['completed', 'failed', 'already_running', 'running', 'batch_limit_reached'] as const) {
    const expected = buildCoordinatorResult({
      status,
      batchesExecuted: 5,
      captureCycleId: 'cycle-status',
      cursor: 'cursor-status',
      totals: {
        processed: 8,
        captured: 6,
        created: 5,
        failed: 2,
      },
    })
    const harness = createHarness({ result: expected })
    const service = createExecutiveMemoryOperationalRunService(harness.dependencies)

    const result = await service.run()

    assert.deepEqual(result, expected)
  }
})

test('service clones the coordinator result instead of exposing the same references', async () => {
  const coordinatorResult = buildCoordinatorResult({ status: 'completed' })
  const harness = createHarness({ result: coordinatorResult })
  const service = createExecutiveMemoryOperationalRunService(harness.dependencies)

  const result = await service.run()

  assert.notEqual(result, coordinatorResult)
  assert.notEqual(result.totals, coordinatorResult.totals)
  assert.notEqual(result.executionState, coordinatorResult.executionState)
  assert.notEqual(result.executionState.totals, coordinatorResult.executionState.totals)
})

test('coordinator errors are propagated without retry or duplicate delegation', async () => {
  const expected = new Error('coordinator failed')
  const harness = createHarness({
    run: async () => {
      throw expected
    },
  })
  const service = createExecutiveMemoryOperationalRunService(harness.dependencies)

  await assert.rejects(() => service.run({ tenantId: 7, maxBatches: 3, limit: 10 }), expected)
  assert.equal(harness.runCalls.length, 1)
})

test('sequential and concurrent runs remain independent', async () => {
  let releaseFirst: (() => void) | null = null
  let releaseSecond: (() => void) | null = null
  const harness = createHarness({
    run: async () => {
      if (harness.runCalls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      } else if (harness.runCalls.length === 2) {
        await new Promise<void>((resolve) => {
          releaseSecond = resolve
        })
      }

      return buildCoordinatorResult({
        status: 'completed',
        captureCycleId: harness.runCalls.length === 1 ? 'cycle-1' : 'cycle-2',
      })
    },
  })
  const service = createExecutiveMemoryOperationalRunService(harness.dependencies)

  const first = service.run({ tenantId: 1, maxBatches: 1 })
  const second = service.run({ tenantId: 2, maxBatches: 2 })
  await Promise.resolve()

  assert.equal(harness.runCalls.length, 2)
  assert.deepEqual(harness.runCalls[0], { tenantId: 1, maxBatches: 1, limit: undefined })
  assert.deepEqual(harness.runCalls[1], { tenantId: 2, maxBatches: 2, limit: undefined })

  releaseFirst?.()
  releaseSecond?.()

  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.equal(firstResult.captureCycleId, 'cycle-1')
  assert.equal(secondResult.captureCycleId, 'cycle-2')
})

test('operational run service records requested terminal and thrown error observability with safe labels', async () => {
  const observability = createObservabilityService()
  const successHarness = createHarness({
    result: buildCoordinatorResult({ status: 'batch_limit_reached' }),
  })
  const successService = createExecutiveMemoryOperationalRunService({
    coordinator: successHarness.dependencies.coordinator,
    observability,
  })

  await successService.run({ tenantId: 9, maxBatches: 4, limit: 25 })

  const failureHarness = createHarness({
    run: async () => {
      throw new Error('boom')
    },
  })
  const failureService = createExecutiveMemoryOperationalRunService({
    coordinator: failureHarness.dependencies.coordinator,
    observability,
  })

  await assert.rejects(() => failureService.run(), /boom/)

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL], 4)
  assert.equal(counterSeries(snapshot, 'requested'), true)
  assert.equal(counterSeries(snapshot, 'batch_limit_reached'), true)
  assert.equal(counterSeries(snapshot, 'error'), true)

  const serialized = JSON.stringify(snapshot.customCounterSeries)
  assert.equal(serialized.includes('tenantId'), false)
  assert.equal(serialized.includes('officeId'), false)
  assert.equal(serialized.includes('cursor'), false)
  assert.equal(serialized.includes('captureCycleId'), false)
  assert.equal(serialized.includes('fingerprint'), false)
})

test('structural guard keeps the operational run service isolated from forbidden dependencies and direct execution driving', async () => {
  const filePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'ExecutiveMemoryOperationalRunService.ts')
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
    /ExecutiveMemoryOperationalRunner/,
    /createExecutiveMemoryOperationalRunner/,
    /ExecutiveMemoryCaptureExecutionService/,
    /ExecutiveMemoryCaptureTriggerService/,
    /ExecutiveMemoryCaptureOrchestrator/,
    /ExecutiveMemoryAtomicCaptureService/,
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
