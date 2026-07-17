import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryOperationalInvocationForbiddenError,
  ExecutiveMemoryOperationalInvocationService,
  createExecutiveMemoryOperationalInvocationService,
} from './index.js'

type ServiceResultStatus =
  | 'completed'
  | 'failed'
  | 'already_running'
  | 'running'
  | 'batch_limit_reached'

type ServiceResult = {
  status: ServiceResultStatus
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
    status: 'idle' | 'running' | 'ready_to_continue' | 'already_running' | 'failed' | 'completed'
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

function buildServiceResult(
  overrides: Partial<ServiceResult> & Pick<ServiceResult, 'status'>,
): ServiceResult {
  const totals = overrides.totals ?? {
    processed: 5,
    captured: 4,
    created: 3,
    failed: 1,
  }

  return {
    status: overrides.status,
    batchesExecuted: overrides.batchesExecuted ?? 2,
    captureCycleId: overrides.captureCycleId ?? 'executive_memory_capture_cycle:cycle-1',
    cursor: overrides.cursor ?? 'cursor-1',
    totals,
    executionState: overrides.executionState ?? {
      status: overrides.status === 'batch_limit_reached' ? 'ready_to_continue' : overrides.status,
      captureCycleId: overrides.captureCycleId ?? 'executive_memory_capture_cycle:cycle-1',
      cursor: overrides.cursor ?? 'cursor-1',
      totals,
      lastBatch: {
        status: overrides.status === 'already_running' ? 'already_running' : 'completed',
        nextCursor: overrides.status === 'batch_limit_reached' ? 'cursor-2' : undefined,
        totals,
      },
    },
  }
}

function createHarness(overrides?: {
  authorize?: (input: {
    actor: { actorId: string; tenantId?: number; roles?: string[] }
    request: { maxBatches?: number; limit?: number }
  }) => Promise<{ allowed: boolean; reason?: string }> | { allowed: boolean; reason?: string }
  run?: (input: { tenantId: number; maxBatches?: number; limit?: number }) => Promise<ServiceResult>
  result?: ServiceResult
}) {
  const authorizeCalls: Array<{
    actor: { actorId: string; tenantId?: number; roles?: string[] }
    request: { maxBatches?: number; limit?: number }
  }> = []
  const runCalls: Array<{ tenantId: number; maxBatches?: number; limit?: number }> = []

  return {
    authorizeCalls,
    runCalls,
    dependencies: {
      authorizationPolicy: {
        async authorize(input: {
          actor: { actorId: string; tenantId?: number; roles?: string[] }
          request: { maxBatches?: number; limit?: number }
        }) {
          authorizeCalls.push({
            actor: {
              actorId: input.actor.actorId,
              tenantId: input.actor.tenantId,
              roles: input.actor.roles ? [...input.actor.roles] : undefined,
            },
            request: {
              maxBatches: input.request.maxBatches,
              limit: input.request.limit,
            },
          })

          if (overrides?.authorize) {
            return overrides.authorize(input)
          }

          return { allowed: true } as const
        },
      },
      operationalRunService: {
        async run(input: { tenantId: number; maxBatches?: number; limit?: number }) {
          runCalls.push({
            tenantId: input.tenantId,
            maxBatches: input.maxBatches,
            limit: input.limit,
          })

          if (overrides?.run) {
            return overrides.run(input)
          }

          return overrides?.result ?? buildServiceResult({ status: 'completed' })
        },
      },
    },
  }
}

test('factory returns a valid invocation service instance', () => {
  const harness = createHarness()
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  assert.equal(service instanceof ExecutiveMemoryOperationalInvocationService, true)
})

test('composition is side-effect free and does not call policy or operational service', () => {
  const harness = createHarness()

  createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  assert.equal(harness.authorizeCalls.length, 0)
  assert.equal(harness.runCalls.length, 0)
})

test('invoke calls authorization exactly once and delegates exactly once when allowed', async () => {
  const harness = createHarness()
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  const result = await service.invoke({
    actor: {
      actorId: 'user:1',
      tenantId: 11,
      roles: ['admin'],
    },
    tenantId: 11,
    maxBatches: 4,
    limit: 25,
  })

  assert.deepEqual(harness.authorizeCalls, [{
    actor: {
      actorId: 'user:1',
      tenantId: 11,
      roles: ['admin'],
    },
    request: {
      maxBatches: 4,
      limit: 25,
    },
  }])
  assert.deepEqual(harness.runCalls, [{
    tenantId: 11,
    maxBatches: 4,
    limit: 25,
  }])
  assert.equal(result.status, 'completed')
})

test('request is not mutated and authorization input is cloned', async () => {
  const harness = createHarness({
    authorize(input) {
      input.actor.roles?.push('mutated')
      input.request.maxBatches = 999
      return { allowed: true }
    },
  })
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)
  const request = {
    actor: {
      actorId: 'user:2',
      tenantId: 12,
      roles: ['operator'],
    },
    tenantId: 12,
    maxBatches: 6,
    limit: 10,
  }
  const before = structuredClone(request)

  await service.invoke(request)

  assert.deepEqual(request, before)
  assert.deepEqual(harness.runCalls, [{
    tenantId: 12,
    maxBatches: 6,
    limit: 10,
  }])
})

test('denied authorization throws forbidden error and does not call operational run service', async () => {
  const harness = createHarness({
    authorize() {
      return {
        allowed: false,
        reason: 'not allowed',
      }
    },
  })
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  await assert.rejects(
    () => service.invoke({
      actor: { actorId: 'user:3' },
      maxBatches: 1,
    }),
    (error: unknown) => {
      assert.equal(error instanceof ExecutiveMemoryOperationalInvocationForbiddenError, true)
      assert.equal((error as ExecutiveMemoryOperationalInvocationForbiddenError).message, 'not allowed')
      return true
    },
  )

  assert.equal(harness.authorizeCalls.length, 1)
  assert.equal(harness.runCalls.length, 0)
})

test('policy errors propagate and prevent operational execution', async () => {
  const expected = new Error('policy failed')
  const harness = createHarness({
    authorize() {
      throw expected
    },
  })
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  await assert.rejects(
    () => service.invoke({
      actor: { actorId: 'user:4' },
    }),
    expected,
  )

  assert.equal(harness.authorizeCalls.length, 1)
  assert.equal(harness.runCalls.length, 0)
})

test('service errors propagate without retry or duplicate execution', async () => {
  const expected = new Error('run failed')
  const harness = createHarness({
    async run() {
      throw expected
    },
  })
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  await assert.rejects(
    () => service.invoke({
      actor: { actorId: 'user:5' },
      limit: 20,
    }),
    expected,
  )

  assert.equal(harness.authorizeCalls.length, 1)
  assert.equal(harness.runCalls.length, 1)
})

test('invocation result preserves public statuses and hides executionState', async () => {
  for (const status of ['completed', 'failed', 'already_running', 'running', 'batch_limit_reached'] as const) {
    const harness = createHarness({
      result: buildServiceResult({
        status,
        batchesExecuted: 7,
        captureCycleId: 'executive_memory_capture_cycle:cycle-status',
        cursor: 'cursor-status',
        totals: {
          processed: 9,
          captured: 8,
          created: 7,
          failed: 2,
        },
      }),
    })
    const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

    const result = await service.invoke({
      actor: { actorId: 'user:6' },
    })

    assert.deepEqual(result, {
      status,
      batchesExecuted: 7,
      captureCycleId: 'executive_memory_capture_cycle:cycle-status',
      cursor: 'cursor-status',
      totals: {
        processed: 9,
        captured: 8,
        created: 7,
        failed: 2,
      },
    })
    assert.equal('executionState' in result, false)
  }
})

test('result totals are cloned instead of exposing service references', async () => {
  const serviceResult = buildServiceResult({ status: 'completed' })
  const harness = createHarness({
    result: serviceResult,
  })
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  const result = await service.invoke({
    actor: { actorId: 'user:7' },
  })

  assert.notEqual(result.totals, serviceResult.totals)
})

test('sequential and concurrent invocations stay independent', async () => {
  let releaseFirst: (() => void) | null = null
  let releaseSecond: (() => void) | null = null
  const harness = createHarness({
    async run() {
      if (harness.runCalls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      } else if (harness.runCalls.length === 2) {
        await new Promise<void>((resolve) => {
          releaseSecond = resolve
        })
      }

      return buildServiceResult({
        status: 'completed',
        captureCycleId: harness.runCalls.length === 1
          ? 'executive_memory_capture_cycle:cycle-1'
          : 'executive_memory_capture_cycle:cycle-2',
      })
    },
  })
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  const first = service.invoke({
    actor: { actorId: 'user:8' },
    maxBatches: 1,
  })
  const second = service.invoke({
    actor: { actorId: 'user:9' },
    maxBatches: 2,
  })
  await Promise.resolve()

  assert.equal(harness.authorizeCalls.length, 2)
  assert.equal(harness.runCalls.length, 2)

  releaseFirst?.()
  releaseSecond?.()

  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.equal(firstResult.captureCycleId, 'executive_memory_capture_cycle:cycle-1')
  assert.equal(secondResult.captureCycleId, 'executive_memory_capture_cycle:cycle-2')
})

test('actorId is required', async () => {
  const harness = createHarness()
  const service = createExecutiveMemoryOperationalInvocationService(harness.dependencies)

  await assert.rejects(
    () => service.invoke({
      actor: { actorId: '   ' },
    }),
    /requires actor\.actorId/,
  )

  assert.equal(harness.authorizeCalls.length, 0)
  assert.equal(harness.runCalls.length, 0)
})

test('structural guard keeps invocation service isolated from forbidden dependencies and internals', async () => {
  const source = await readFile(
    path.join(import.meta.dirname, 'ExecutiveMemoryOperationalInvocationService.ts'),
    'utf8',
  )

  const forbiddenPatterns = [
    /\bany\b/,
    /\bas any\b/,
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
    /\bcron\b/i,
    /\bjob\b/i,
    /\bworker\b/i,
    /retry\(/,
    /\.start\(/,
    /continueExecution\(/,
    /ExecutiveMemoryRuntime/,
    /ExecutiveMemoryOperationalRunCoordinator/,
    /ExecutiveMemoryOperationalRunner/,
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
