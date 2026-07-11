import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryOperationalInvocationAdapter,
  ExecutiveMemoryOperationalInvocationForbiddenError,
  createExecutiveMemoryOperationalInvocationAdapter,
} from './index.js'

type InvocationResult = {
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
}

function buildResult(
  overrides: Partial<InvocationResult> & Pick<InvocationResult, 'status'>,
): InvocationResult {
  return {
    status: overrides.status,
    batchesExecuted: overrides.batchesExecuted ?? 2,
    captureCycleId: overrides.captureCycleId ?? 'executive_memory_capture_cycle:cycle-1',
    cursor: overrides.cursor ?? 'cursor-1',
    totals: overrides.totals ?? {
      processed: 3,
      captured: 2,
      created: 2,
      failed: 1,
    },
  }
}

function createHarness(overrides?: {
  invoke?: (input: {
    actor: {
      actorId: string
      tenantId?: number
      roles?: string[]
    }
    maxBatches?: number
    limit?: number
  }) => Promise<InvocationResult>
  result?: InvocationResult
}) {
  const invokeCalls: Array<{
    actor: {
      actorId: string
      tenantId?: number
      roles?: string[]
    }
    maxBatches?: number
    limit?: number
  }> = []

  return {
    invokeCalls,
    dependencies: {
      operationalInvocationService: {
        async invoke(input: {
          actor: {
            actorId: string
            tenantId?: number
            roles?: string[]
          }
          maxBatches?: number
          limit?: number
        }) {
          invokeCalls.push({
            actor: {
              actorId: input.actor.actorId,
              tenantId: input.actor.tenantId,
              roles: input.actor.roles ? [...input.actor.roles] : undefined,
            },
            maxBatches: input.maxBatches,
            limit: input.limit,
          })

          if (overrides?.invoke) {
            return overrides.invoke(input)
          }

          return overrides?.result ?? buildResult({ status: 'completed' })
        },
      },
    },
  }
}

function createRequest(overrides?: {
  principal?: {
    userId?: number
    tenantId?: number
    roles?: string[]
  }
  maxBatches?: number
  limit?: number
  actor?: unknown
  actorId?: unknown
  roles?: unknown
  tenantId?: unknown
}) {
  return {
    principal: {
      userId: overrides?.principal?.userId ?? 11,
      tenantId: overrides?.principal?.tenantId ?? 22,
      roles: overrides?.principal?.roles ?? ['admin', 'owner'],
    },
    maxBatches: overrides?.maxBatches,
    limit: overrides?.limit,
    ...(typeof overrides?.actor === 'undefined' ? {} : { actor: overrides.actor }),
    ...(typeof overrides?.actorId === 'undefined' ? {} : { actorId: overrides.actorId }),
    ...(typeof overrides?.roles === 'undefined' ? {} : { roles: overrides.roles }),
    ...(typeof overrides?.tenantId === 'undefined' ? {} : { tenantId: overrides.tenantId }),
  }
}

test('factory returns a valid adapter instance', () => {
  const harness = createHarness()
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)

  assert.equal(adapter instanceof ExecutiveMemoryOperationalInvocationAdapter, true)
})

test('composition is passive and does not call invocation service', () => {
  const harness = createHarness()

  createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)

  assert.equal(harness.invokeCalls.length, 0)
})

test('principal is translated into canonical actor fields', async () => {
  const harness = createHarness()
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)

  await adapter.invoke(createRequest({
    principal: {
      userId: 44,
      tenantId: 55,
      roles: ['admin', 'operator'],
    },
    maxBatches: 4,
    limit: 25,
  }))

  assert.deepEqual(harness.invokeCalls, [{
    actor: {
      actorId: 'user:44',
      tenantId: 55,
      roles: ['admin', 'operator'],
    },
    maxBatches: 4,
    limit: 25,
  }])
})

test('body extras cannot override actor tenant or roles', async () => {
  const harness = createHarness()
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)
  const request = createRequest({
    principal: {
      userId: 9,
      tenantId: 10,
      roles: ['owner'],
    },
    actor: {
      actorId: 'evil',
      tenantId: 999,
      roles: ['client'],
    },
    actorId: 'evil',
    tenantId: 999,
    roles: ['client'],
    maxBatches: 2,
    limit: 8,
  })
  const before = structuredClone(request)

  await adapter.invoke(request)

  assert.deepEqual(harness.invokeCalls, [{
    actor: {
      actorId: 'user:9',
      tenantId: 10,
      roles: ['owner'],
    },
    maxBatches: 2,
    limit: 8,
  }])
  assert.deepEqual(request, before)
})

test('adapter propagates maxBatches and limit without mutation', async () => {
  const harness = createHarness()
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)
  const request = createRequest({
    maxBatches: 12,
    limit: 30,
  })
  const before = structuredClone(request)

  await adapter.invoke(request)

  assert.deepEqual(harness.invokeCalls[0], {
    actor: {
      actorId: 'user:11',
      tenantId: 22,
      roles: ['admin', 'owner'],
    },
    maxBatches: 12,
    limit: 30,
  })
  assert.deepEqual(request, before)
})

test('adapter preserves sanitized invocation result and does not expose executionState', async () => {
  const harness = createHarness({
    result: buildResult({
      status: 'batch_limit_reached',
      batchesExecuted: 5,
      captureCycleId: 'executive_memory_capture_cycle:cycle-status',
      cursor: 'cursor-status',
      totals: {
        processed: 8,
        captured: 6,
        created: 5,
        failed: 2,
      },
    }),
  })
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)

  const result = await adapter.invoke(createRequest())

  assert.deepEqual(result, {
    status: 'batch_limit_reached',
    batchesExecuted: 5,
    captureCycleId: 'executive_memory_capture_cycle:cycle-status',
    cursor: 'cursor-status',
    totals: {
      processed: 8,
      captured: 6,
      created: 5,
      failed: 2,
    },
  })
  assert.equal('executionState' in result, false)
})

test('forbidden and generic errors propagate without retry or duplicate invocation', async () => {
  const forbidden = new ExecutiveMemoryOperationalInvocationForbiddenError('forbidden')
  const forbiddenHarness = createHarness({
    async invoke() {
      throw forbidden
    },
  })
  const forbiddenAdapter = createExecutiveMemoryOperationalInvocationAdapter(forbiddenHarness.dependencies)

  await assert.rejects(() => forbiddenAdapter.invoke(createRequest()), forbidden)
  assert.equal(forbiddenHarness.invokeCalls.length, 1)

  const generic = new Error('boom')
  const genericHarness = createHarness({
    async invoke() {
      throw generic
    },
  })
  const genericAdapter = createExecutiveMemoryOperationalInvocationAdapter(genericHarness.dependencies)

  await assert.rejects(() => genericAdapter.invoke(createRequest()), generic)
  assert.equal(genericHarness.invokeCalls.length, 1)
})

test('sequential and concurrent calls remain independent', async () => {
  let releaseFirst: (() => void) | null = null
  let releaseSecond: (() => void) | null = null
  const harness = createHarness({
    async invoke() {
      if (harness.invokeCalls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      } else if (harness.invokeCalls.length === 2) {
        await new Promise<void>((resolve) => {
          releaseSecond = resolve
        })
      }

      return buildResult({
        status: 'completed',
        captureCycleId: harness.invokeCalls.length === 1
          ? 'executive_memory_capture_cycle:cycle-1'
          : 'executive_memory_capture_cycle:cycle-2',
      })
    },
  })
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)

  const first = adapter.invoke(createRequest({
    principal: {
      userId: 1,
      tenantId: 2,
      roles: ['admin'],
    },
  }))
  const second = adapter.invoke(createRequest({
    principal: {
      userId: 3,
      tenantId: 4,
      roles: ['owner'],
    },
  }))
  await Promise.resolve()

  assert.equal(harness.invokeCalls.length, 2)

  releaseFirst?.()
  releaseSecond?.()

  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.equal(firstResult.captureCycleId, 'executive_memory_capture_cycle:cycle-1')
  assert.equal(secondResult.captureCycleId, 'executive_memory_capture_cycle:cycle-2')
})

test('adapter rejects invalid principal fields before delegation', async () => {
  const harness = createHarness()
  const adapter = createExecutiveMemoryOperationalInvocationAdapter(harness.dependencies)

  await assert.rejects(
    () => adapter.invoke(createRequest({
      principal: {
        userId: 0,
      },
    })),
    /principal\.userId/,
  )
  await assert.rejects(
    () => adapter.invoke(createRequest({
      principal: {
        tenantId: 0,
      },
    })),
    /principal\.tenantId/,
  )
  await assert.rejects(
    () => adapter.invoke(createRequest({
      principal: {
        roles: undefined,
      },
    })),
    /principal\.roles/,
  )

  assert.equal(harness.invokeCalls.length, 0)
})

test('structural guard keeps adapter isolated from forbidden dependencies and lower layers', async () => {
  const source = await readFile(
    path.join(import.meta.dirname, 'ExecutiveMemoryOperationalInvocationAdapter.ts'),
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
    /ExecutiveMemoryOperationalRunService/,
    /ExecutiveMemoryOperationalRunCoordinator/,
    /ExecutiveMemoryOperationalRunner/,
    /ExecutiveMemoryCaptureExecutionService/,
    /ExecutiveMemoryCaptureTriggerService/,
    /ExecutiveMemoryCaptureOrchestrator/,
    /ExecutiveMemoryAtomicCaptureService/,
    /database/i,
    /repository/i,
    /\bsql\b/i,
    /window/,
    /document/,
    /localStorage/,
    /sessionStorage/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `unexpected forbidden pattern: ${pattern}`)
  }
})
