import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryCaptureExecutionService,
  createExecutiveMemoryCaptureExecutionService,
} from './ExecutiveMemoryCaptureExecutionService.js'

type TriggerRunResult = {
  status: 'completed' | 'already_running'
  startedAt?: string
  finishedAt?: string
  nextCursor?: string
  totals?: {
    processed: number
    captured: number
    created: number
    failed: number
  }
}

function createHarness(overrides?: {
  tenantId?: number
  nextCaptureCycleIds?: string[]
  run?: (input: {
    tenantId: number
    captureCycleId: string
    cursor?: string
    limit?: number
  }) => Promise<TriggerRunResult>
}) {
  const triggerCalls: Array<{
    tenantId: number
    captureCycleId: string
    cursor?: string
    limit?: number
  }> = []
  const identityCalls: string[] = []
  const nextCaptureCycleIds = [...(overrides?.nextCaptureCycleIds ?? ['cycle-1', 'cycle-2'])]

  return {
    triggerCalls,
    identityCalls,
    dependencies: {
      tenantId: overrides?.tenantId ?? 7,
      captureCycleIdSource: {
        nextCaptureCycleId() {
          const nextId = nextCaptureCycleIds.shift()
          if (!nextId) {
            throw new Error('capture cycle ids exhausted')
          }

          identityCalls.push(nextId)
          return nextId
        },
      },
      triggerService: {
        async run(input: {
          tenantId: number
          captureCycleId: string
          cursor?: string
          limit?: number
        }) {
          triggerCalls.push(input)

          if (overrides?.run) {
            return overrides.run(input)
          }

          return {
            status: 'completed' as const,
            startedAt: '2026-07-11T10:00:00.000Z',
            finishedAt: '2026-07-11T10:05:00.000Z',
            nextCursor: 'office-2',
            totals: {
              processed: 2,
              captured: 2,
              created: 1,
              failed: 0,
            },
          }
        },
      },
    },
  }
}

test('factory returns a valid execution service instance', () => {
  const harness = createHarness()
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  assert.equal(service instanceof ExecutiveMemoryCaptureExecutionService, true)
})

test('start generates exactly one captureCycleId and executes at most one batch with cursor undefined', async () => {
  const harness = createHarness()
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  const result = await service.start({ limit: 12 })

  assert.deepEqual(harness.identityCalls, ['cycle-1'])
  assert.deepEqual(harness.triggerCalls, [{
    tenantId: 7,
    captureCycleId: 'cycle-1',
    cursor: undefined,
    limit: 12,
  }])
  assert.deepEqual(result, {
    status: 'ready_to_continue',
    captureCycleId: 'cycle-1',
    cursor: 'office-2',
    totals: {
      processed: 2,
      captured: 2,
      created: 1,
      failed: 0,
    },
    lastBatch: {
      status: 'completed',
      startedAt: '2026-07-11T10:00:00.000Z',
      finishedAt: '2026-07-11T10:05:00.000Z',
      nextCursor: 'office-2',
      totals: {
        processed: 2,
        captured: 2,
        created: 1,
        failed: 0,
      },
    },
  })
})

test('concurrent start rejects the second call before consuming a second captureCycleId or overwriting state', async () => {
  let releaseFirstRun: (() => void) | null = null
  const harness = createHarness({
    nextCaptureCycleIds: ['cycle-1', 'cycle-2'],
    run: (input) => new Promise((resolve) => {
      releaseFirstRun = () => resolve({
        status: 'completed',
        startedAt: '2026-07-11T10:00:00.000Z',
        finishedAt: '2026-07-11T10:05:00.000Z',
        nextCursor: 'office-2',
        totals: {
          processed: 2,
          captured: 2,
          created: 1,
          failed: 0,
        },
      })
    }),
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)
  const input = { limit: 6 }
  const before = structuredClone(input)

  const firstStart = service.start(input)

  assert.deepEqual(service.getState(), {
    status: 'running',
    captureCycleId: 'cycle-1',
    cursor: undefined,
    totals: {
      processed: 0,
      captured: 0,
      created: 0,
      failed: 0,
    },
    lastBatch: undefined,
  })

  await assert.rejects(service.start(), /already running/)

  assert.deepEqual(harness.identityCalls, ['cycle-1'])
  assert.deepEqual(harness.triggerCalls, [{
    tenantId: 7,
    captureCycleId: 'cycle-1',
    cursor: undefined,
    limit: 6,
  }])
  assert.equal(service.getState().captureCycleId, 'cycle-1')
  assert.deepEqual(input, before)

  releaseFirstRun?.()
  const finalState = await firstStart

  assert.deepEqual(finalState, {
    status: 'ready_to_continue',
    captureCycleId: 'cycle-1',
    cursor: 'office-2',
    totals: {
      processed: 2,
      captured: 2,
      created: 1,
      failed: 0,
    },
    lastBatch: {
      status: 'completed',
      startedAt: '2026-07-11T10:00:00.000Z',
      finishedAt: '2026-07-11T10:05:00.000Z',
      nextCursor: 'office-2',
      totals: {
        processed: 2,
        captured: 2,
        created: 1,
        failed: 0,
      },
    },
  })
})

test('start completes execution when nextCursor is undefined', async () => {
  const harness = createHarness({
    run: async () => ({
      status: 'completed',
      startedAt: '2026-07-11T10:00:00.000Z',
      finishedAt: '2026-07-11T10:01:00.000Z',
      nextCursor: undefined,
      totals: {
        processed: 1,
        captured: 1,
        created: 1,
        failed: 0,
      },
    }),
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  const result = await service.start()

  assert.equal(result.status, 'completed')
  assert.equal(result.cursor, undefined)
})

test('continueExecution reuses the same captureCycleId and previous nextCursor without generating a new cycle', async () => {
  let callIndex = 0
  const harness = createHarness({
    run: async (input) => {
      callIndex += 1
      if (callIndex === 1) {
        return {
          status: 'completed',
          startedAt: '2026-07-11T10:00:00.000Z',
          finishedAt: '2026-07-11T10:05:00.000Z',
          nextCursor: 'office-2',
          totals: {
            processed: 2,
            captured: 2,
            created: 1,
            failed: 0,
          },
        }
      }

      return {
        status: 'completed',
        startedAt: '2026-07-11T10:06:00.000Z',
        finishedAt: '2026-07-11T10:10:00.000Z',
        nextCursor: 'office-4',
        totals: {
          processed: 2,
          captured: 1,
          created: 1,
          failed: 1,
        },
      }
    },
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  await service.start({ limit: 3 })
  const result = await service.continueExecution({ limit: 4 })

  assert.deepEqual(harness.identityCalls, ['cycle-1'])
  assert.deepEqual(harness.triggerCalls, [
    {
      tenantId: 7,
      captureCycleId: 'cycle-1',
      cursor: undefined,
      limit: 3,
    },
    {
      tenantId: 7,
      captureCycleId: 'cycle-1',
      cursor: 'office-2',
      limit: 4,
    },
  ])
  assert.deepEqual(result.totals, {
    processed: 4,
    captured: 3,
    created: 2,
    failed: 1,
  })
  assert.equal(result.cursor, 'office-4')
})

test('trigger failure preserves cycle and cursor and retry reuses both without generating a new cycle', async () => {
  let callIndex = 0
  const harness = createHarness({
    run: async (input) => {
      callIndex += 1
      if (callIndex === 1) {
        return {
          status: 'completed',
          startedAt: '2026-07-11T10:00:00.000Z',
          finishedAt: '2026-07-11T10:05:00.000Z',
          nextCursor: 'office-2',
          totals: {
            processed: 2,
            captured: 2,
            created: 1,
            failed: 0,
          },
        }
      }

      if (callIndex === 2) {
        throw new Error('boom')
      }

      return {
        status: 'completed',
        startedAt: '2026-07-11T10:06:00.000Z',
        finishedAt: '2026-07-11T10:09:00.000Z',
        nextCursor: undefined,
        totals: {
          processed: 1,
          captured: 1,
          created: 1,
          failed: 0,
        },
      }
    },
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  await service.start()
  const failedState = await service.continueExecution()
  const retriedState = await service.retry()

  assert.equal(failedState.status, 'failed')
  assert.equal(failedState.captureCycleId, 'cycle-1')
  assert.equal(failedState.cursor, 'office-2')
  assert.deepEqual(failedState.lastBatch, {
    status: 'error',
    error: 'Executive memory capture execution failed.',
  })
  assert.deepEqual(retriedState.totals, {
    processed: 3,
    captured: 3,
    created: 2,
    failed: 0,
  })
  assert.equal(retriedState.captureCycleId, 'cycle-1')
  assert.equal(retriedState.status, 'completed')
  assert.deepEqual(harness.identityCalls, ['cycle-1'])
  assert.deepEqual(harness.triggerCalls, [
    {
      tenantId: 7,
      captureCycleId: 'cycle-1',
      cursor: undefined,
      limit: undefined,
    },
    {
      tenantId: 7,
      captureCycleId: 'cycle-1',
      cursor: 'office-2',
      limit: undefined,
    },
    {
      tenantId: 7,
      captureCycleId: 'cycle-1',
      cursor: 'office-2',
      limit: undefined,
    },
  ])
})

test('already_running is explicit does not advance cursor and does not accumulate totals', async () => {
  let callIndex = 0
  const harness = createHarness({
    run: async () => {
      callIndex += 1
      if (callIndex === 1) {
        return {
          status: 'completed',
          startedAt: '2026-07-11T10:00:00.000Z',
          finishedAt: '2026-07-11T10:05:00.000Z',
          nextCursor: 'office-2',
          totals: {
            processed: 2,
            captured: 2,
            created: 1,
            failed: 0,
          },
        }
      }

      return {
        status: 'already_running',
      }
    },
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  await service.start()
  const result = await service.continueExecution()

  assert.deepEqual(result, {
    status: 'already_running',
    captureCycleId: 'cycle-1',
    cursor: 'office-2',
    totals: {
      processed: 2,
      captured: 2,
      created: 1,
      failed: 0,
    },
    lastBatch: {
      status: 'already_running',
    },
  })
})

test('start twice continue before start continue after completed retry without failure and concurrent same execution are rejected', async () => {
  const harness = createHarness({
    run: async () => ({
      status: 'completed',
      startedAt: '2026-07-11T10:00:00.000Z',
      finishedAt: '2026-07-11T10:05:00.000Z',
      nextCursor: undefined,
      totals: {
        processed: 1,
        captured: 1,
        created: 1,
        failed: 0,
      },
    }),
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  await assert.rejects(service.continueExecution(), /has not started/)
  await service.start()
  await assert.rejects(service.start(), /already started/)
  await assert.rejects(service.continueExecution(), /already completed/)
  await assert.rejects(service.retry(), /not retryable/)

  let release: (() => void) | null = null
  const concurrentHarness = createHarness({
    run: () => new Promise((resolve) => {
      release = () => resolve({
        status: 'completed',
        startedAt: '2026-07-11T10:00:00.000Z',
        finishedAt: '2026-07-11T10:05:00.000Z',
        nextCursor: 'office-2',
        totals: {
          processed: 1,
          captured: 1,
          created: 1,
          failed: 0,
        },
      })
    }),
  })
  const concurrentService = createExecutiveMemoryCaptureExecutionService(concurrentHarness.dependencies)

  const runningStart = concurrentService.start()
  await assert.rejects(concurrentService.retry(), /has not started|already running|not retryable/)
  await assert.rejects(concurrentService.continueExecution(), /has not started|already running|not ready to continue/)
  release?.()
  await runningStart

  let releaseContinue: (() => void) | null = null
  let secondPhaseCall = false
  const sameExecutionHarness = createHarness({
    run: async (input) => {
      if (!secondPhaseCall) {
        secondPhaseCall = true
        return {
          status: 'completed',
          startedAt: '2026-07-11T10:00:00.000Z',
          finishedAt: '2026-07-11T10:05:00.000Z',
          nextCursor: 'office-2',
          totals: {
            processed: 1,
            captured: 1,
            created: 1,
            failed: 0,
          },
        }
      }

      return new Promise((resolve) => {
        releaseContinue = () => resolve({
          status: 'completed' as const,
          startedAt: '2026-07-11T10:06:00.000Z',
          finishedAt: '2026-07-11T10:07:00.000Z',
          nextCursor: 'office-3',
          totals: {
            processed: 1,
            captured: 1,
            created: 0,
            failed: 0,
          },
        })
      })
    },
  })
  const sameExecutionService = createExecutiveMemoryCaptureExecutionService(sameExecutionHarness.dependencies)
  await sameExecutionService.start()
  const runningContinue = sameExecutionService.continueExecution()
  await assert.rejects(sameExecutionService.retry(), /already running|not retryable/)
  await assert.rejects(sameExecutionService.continueExecution(), /already running|not ready to continue/)
  releaseContinue?.()
  await runningContinue
})

test('different execution services do not share state or capture cycle ownership', async () => {
  const firstHarness = createHarness({ nextCaptureCycleIds: ['cycle-a'] })
  const secondHarness = createHarness({ nextCaptureCycleIds: ['cycle-b'] })
  const firstService = createExecutiveMemoryCaptureExecutionService(firstHarness.dependencies)
  const secondService = createExecutiveMemoryCaptureExecutionService(secondHarness.dependencies)

  const firstResult = await firstService.start()
  const secondResult = await secondService.start()

  assert.equal(firstResult.captureCycleId, 'cycle-a')
  assert.equal(secondResult.captureCycleId, 'cycle-b')
})

test('execution requires tenantId and preserves the original tenant across lifecycle calls', async () => {
  assert.throws(
    () => createExecutiveMemoryCaptureExecutionService(createHarness({ tenantId: 0 }).dependencies),
    /tenantId/,
  )

  let callIndex = 0
  const harness = createHarness({
    tenantId: 9,
    run: async () => {
      callIndex += 1
      if (callIndex === 1) {
        return {
          status: 'completed',
          startedAt: '2026-07-11T10:00:00.000Z',
          finishedAt: '2026-07-11T10:01:00.000Z',
          nextCursor: 'cursor-1',
          totals: {
            processed: 1,
            captured: 1,
            created: 1,
            failed: 0,
          },
        }
      }

      if (callIndex === 2) {
        throw new Error('boom')
      }

      return {
        status: 'completed',
        startedAt: '2026-07-11T10:02:00.000Z',
        finishedAt: '2026-07-11T10:03:00.000Z',
        nextCursor: undefined,
        totals: {
          processed: 1,
          captured: 1,
          created: 0,
          failed: 0,
        },
      }
    },
  })
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)

  await service.start()
  await service.continueExecution()
  await service.retry()

  assert.deepEqual(harness.triggerCalls.map((call) => call.tenantId), [9, 9, 9])
})

test('inputs are not mutated and whitespace captureCycleId from the source is rejected', async () => {
  const harness = createHarness()
  const service = createExecutiveMemoryCaptureExecutionService(harness.dependencies)
  const startInput = { limit: 7 }
  const before = structuredClone(startInput)

  await service.start(startInput)

  assert.deepEqual(startInput, before)

  const invalidHarness = createHarness({ nextCaptureCycleIds: ['   '] })
  const invalidService = createExecutiveMemoryCaptureExecutionService(invalidHarness.dependencies)

  await assert.rejects(invalidService.start(), /captureCycleId/)
})

test('productive execution service stays isolated from forbidden dependencies and primitives', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'backend/src/modules/executive/ExecutiveMemoryCaptureExecutionService.ts'),
    'utf-8',
  )

  assert.equal(
    /Date\.now|new Date|performance\.now|Math\.random|randomUUID|crypto|Fastify|fetch|axios|setInterval|setTimeout|process\.env|\bany\b/i.test(source),
    false,
  )
  assert.equal(/AtomicCapture|Orchestrator|repository|createDatabaseConnection|initializeDatabase/i.test(source), false)
})
