import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RETRY_POLICY,
  ExecutiveMemoryCaptureTriggerService,
  createExecutiveMemoryCaptureTriggerService,
} from './ExecutiveMemoryCaptureTriggerService.js'

type ClockStep = {
  iso?: string
  error?: Error
}

function createClock(steps: ClockStep[]) {
  const calls: string[] = []

  return {
    calls,
    clock: {
      now() {
        const step = steps.shift()
        if (!step) {
          throw new Error('clock exhausted')
        }

        if (step.error) {
          throw step.error
        }

        calls.push(step.iso ?? '')
        return new Date(step.iso ?? '2026-07-09T10:00:00.000Z')
      },
    },
  }
}

function createDependencies(overrides?: {
  captureDiscoveredBatch?: (input: {
    capturedAt: string
    captureCycleId: string
    cursor?: string
    limit?: number
  }) => Promise<{
    items: Array<{ officeId: string; tenantId: number; status: 'captured' | 'error' }>
    nextCursor?: string
    totals: {
      processed: number
      captured: number
      created: number
      failed: number
    }
  }>
  clockSteps?: ClockStep[]
  timerValues?: number[]
}) {
  const orchestratorCalls: Array<{
    capturedAt: string
    captureCycleId: string
    cursor?: string
    limit?: number
  }> = []
  const { calls: clockCalls, clock } = createClock(
    overrides?.clockSteps ?? [
      { iso: '2026-07-09T10:00:00.000Z' },
      { iso: '2026-07-09T10:05:00.000Z' },
    ],
  )
  const timerValues = [...(overrides?.timerValues ?? [100, 145])]
  const metricsCalls = {
    runs: [] as Array<{ status: 'completed' | 'already_running' | 'error' }>,
    timings: [] as Array<{ durationMs: number; status: 'completed' | 'error' }>,
    totals: [] as Array<{
      status: 'completed' | 'error'
      processed: number
      captured: number
      created: number
      failed: number
    }>,
  }

  return {
    orchestratorCalls,
    clockCalls,
    metricsCalls,
    dependencies: {
      clock,
      timer: {
        now() {
          const value = timerValues.shift()
          if (typeof value !== 'number') {
            throw new Error('timer exhausted')
          }

          return value
        },
      },
      metrics: {
        recordExecutiveMemoryCaptureTriggerRun(args: {
          status: 'completed' | 'already_running' | 'error'
        }) {
          metricsCalls.runs.push(args)
        },
        recordExecutiveMemoryCaptureTriggerRunTiming(args: {
          durationMs: number
          status: 'completed' | 'error'
        }) {
          metricsCalls.timings.push(args)
        },
        recordExecutiveMemoryCaptureTriggerBatchTotals(args: {
          status: 'completed' | 'error'
          processed: number
          captured: number
          created: number
          failed: number
        }) {
          metricsCalls.totals.push(args)
        },
      },
      orchestrator: {
        async captureDiscoveredBatch(input: {
          capturedAt: string
          captureCycleId: string
          cursor?: string
          limit?: number
        }) {
          orchestratorCalls.push(input)

          if (overrides?.captureDiscoveredBatch) {
            return overrides.captureDiscoveredBatch(input)
          }

          return {
            items: [
              { tenantId: 7, officeId: 'office-1', status: 'captured' as const },
            ],
            nextCursor: 'office-1',
            totals: {
              processed: 1,
              captured: 1,
              created: 1,
              failed: 0,
            },
          }
        },
      },
    },
  }
}

test('factory returns a valid trigger service instance', () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  assert.equal(service instanceof ExecutiveMemoryCaptureTriggerService, true)
})

test('run requires captureCycleId and rejects whitespace', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run({
      captureCycleId: '   ',
    }),
    /captureCycleId/,
  )
})

test('run calls clock and orchestrator once and returns a sanitized operational result', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  const result = await service.run({
    captureCycleId: 'capture-cycle-1',
    cursor: 'office-0',
    limit: 12,
  })

  assert.deepEqual(harness.clockCalls, [
    '2026-07-09T10:00:00.000Z',
    '2026-07-09T10:05:00.000Z',
  ])
  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
      captureCycleId: 'capture-cycle-1',
      cursor: 'office-0',
      limit: 12,
    },
  ])
  assert.deepEqual(result, {
    status: 'completed',
    startedAt: '2026-07-09T10:00:00.000Z',
    finishedAt: '2026-07-09T10:05:00.000Z',
    nextCursor: 'office-1',
    totals: {
      processed: 1,
      captured: 1,
      created: 1,
      failed: 0,
    },
  })
  assert.equal('items' in result, false)
  assert.equal('snapshotId' in result, false)
  assert.equal('observationId' in result, false)
  assert.equal('contentFingerprint' in result, false)
  assert.equal('observationFingerprint' in result, false)
  assert.deepEqual(harness.metricsCalls.runs, [{ status: 'completed' }])
  assert.deepEqual(harness.metricsCalls.timings, [{ durationMs: 45, status: 'completed' }])
  assert.deepEqual(harness.metricsCalls.totals, [{
    status: 'completed',
    processed: 1,
    captured: 1,
    created: 1,
    failed: 0,
  }])
})

test('default limit is used when input limit is absent', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await service.run({ captureCycleId: 'capture-cycle-1' })

  assert.equal(
    harness.orchestratorCalls[0]?.limit,
    EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT,
  )
})

test('limit normalization covers zero negative NaN Infinity maximum overflow and fractions', async () => {
  const cases = [
    { input: 0, expected: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT },
    { input: -1, expected: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT },
    { input: Number.NaN, expected: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT },
    { input: Number.POSITIVE_INFINITY, expected: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT },
    {
      input: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT + 1,
      expected: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT,
    },
    { input: 7.9, expected: 7 },
  ]

  for (const scenario of cases) {
    const harness = createDependencies()
    const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

    await service.run({
      captureCycleId: 'capture-cycle-1',
      limit: scenario.input,
    })

    assert.equal(harness.orchestratorCalls[0]?.limit, scenario.expected)
  }
})

test('cursor undefined is preserved and nextCursor may be undefined', async () => {
  const harness = createDependencies({
    captureDiscoveredBatch: async () => ({
      items: [],
      nextCursor: undefined,
      totals: {
        processed: 0,
        captured: 0,
        created: 0,
        failed: 0,
      },
    }),
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  const result = await service.run({ captureCycleId: 'capture-cycle-1' })

  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
      captureCycleId: 'capture-cycle-1',
      cursor: undefined,
      limit: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT,
    },
  ])
  assert.deepEqual(result, {
    status: 'completed',
    startedAt: '2026-07-09T10:00:00.000Z',
    finishedAt: '2026-07-09T10:05:00.000Z',
    nextCursor: undefined,
    totals: {
      processed: 0,
      captured: 0,
      created: 0,
      failed: 0,
    },
  })
})

test('input is not mutated and retries can preserve the same captureCycleId', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)
  const input = {
    captureCycleId: 'capture-cycle-1',
    cursor: 'office-7',
    limit: 15,
  }
  const before = structuredClone(input)

  await service.run(input)

  assert.deepEqual(input, before)
})

test('different captureCycleId values are passed through exactly', async () => {
  const firstHarness = createDependencies()
  const firstService = createExecutiveMemoryCaptureTriggerService(firstHarness.dependencies)
  await firstService.run({
    captureCycleId: 'capture-cycle-1',
  })

  const secondHarness = createDependencies()
  const secondService = createExecutiveMemoryCaptureTriggerService(secondHarness.dependencies)
  await secondService.run({
    captureCycleId: 'capture-cycle-2',
  })

  assert.equal(firstHarness.orchestratorCalls[0]?.captureCycleId, 'capture-cycle-1')
  assert.equal(secondHarness.orchestratorCalls[0]?.captureCycleId, 'capture-cycle-2')
})

test('second concurrent execution returns already_running and does not call clock or orchestrator', async () => {
  let releaseFirstRun: (() => void) | null = null
  const harness = createDependencies({
    captureDiscoveredBatch: () => new Promise((resolve) => {
      releaseFirstRun = () => resolve({
        items: [],
        nextCursor: 'office-2',
        totals: {
          processed: 2,
          captured: 2,
          created: 1,
          failed: 0,
        },
      })
    }),
    clockSteps: [
      { iso: '2026-07-09T10:00:00.000Z' },
      { iso: '2026-07-09T10:05:00.000Z' },
    ],
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  const firstRun = service.run({ captureCycleId: 'capture-cycle-1', limit: 10 })
  const secondRun = await service.run({ captureCycleId: 'capture-cycle-2', limit: 3 })

  assert.deepEqual(secondRun, {
    status: 'already_running',
  })
  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
      captureCycleId: 'capture-cycle-1',
      cursor: undefined,
      limit: 10,
    },
  ])
  assert.deepEqual(harness.clockCalls, [
    '2026-07-09T10:00:00.000Z',
  ])
  assert.deepEqual(harness.metricsCalls.runs, [{ status: 'already_running' }])
  assert.deepEqual(harness.metricsCalls.timings, [])
  assert.deepEqual(harness.metricsCalls.totals, [])

  releaseFirstRun?.()
  await firstRun
})

test('lock is released after success and a later execution can run again', async () => {
  const harness = createDependencies({
    clockSteps: [
      { iso: '2026-07-09T10:00:00.000Z' },
      { iso: '2026-07-09T10:05:00.000Z' },
      { iso: '2026-07-09T11:00:00.000Z' },
      { iso: '2026-07-09T11:05:00.000Z' },
    ],
    timerValues: [100, 145, 200, 245],
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await service.run({ captureCycleId: 'capture-cycle-1', limit: 4 })
  await service.run({ captureCycleId: 'capture-cycle-2', limit: 6 })

  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
      captureCycleId: 'capture-cycle-1',
      cursor: undefined,
      limit: 4,
    },
    {
      capturedAt: '2026-07-09T11:00:00.000Z',
      captureCycleId: 'capture-cycle-2',
      cursor: undefined,
      limit: 6,
    },
  ])
})

test('lock is released after first clock failure', async () => {
  const harness = createDependencies({
    clockSteps: [
      { error: new Error('clock start failed') },
      { iso: '2026-07-09T11:00:00.000Z' },
      { iso: '2026-07-09T11:05:00.000Z' },
    ],
    timerValues: [100, 145, 200, 245],
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run({ captureCycleId: 'capture-cycle-1' }),
    /clock start failed/,
  )

  assert.deepEqual(harness.metricsCalls.runs, [{ status: 'error' }])
  assert.deepEqual(harness.metricsCalls.timings, [{ durationMs: 45, status: 'error' }])
  assert.deepEqual(harness.metricsCalls.totals, [])

  const result = await service.run({ captureCycleId: 'capture-cycle-2' })
  assert.equal(result.status, 'completed')
  assert.equal(harness.orchestratorCalls.length, 1)
})

test('lock is released after orchestrator failure and the error is propagated', async () => {
  let fail = true
  const harness = createDependencies({
    captureDiscoveredBatch: async () => {
      if (fail) {
        fail = false
        throw new Error('orchestrator failed')
      }

      return {
        items: [],
        nextCursor: undefined,
        totals: {
          processed: 0,
          captured: 0,
          created: 0,
          failed: 0,
        },
      }
    },
    clockSteps: [
      { iso: '2026-07-09T10:00:00.000Z' },
      { iso: '2026-07-09T11:00:00.000Z' },
      { iso: '2026-07-09T11:05:00.000Z' },
    ],
    timerValues: [100, 145, 200, 245],
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run({ captureCycleId: 'capture-cycle-1' }),
    /orchestrator failed/,
  )

  assert.deepEqual(harness.metricsCalls.runs, [{ status: 'error' }])
  assert.deepEqual(harness.metricsCalls.timings, [{ durationMs: 45, status: 'error' }])
  assert.deepEqual(harness.metricsCalls.totals, [])

  const result = await service.run({ captureCycleId: 'capture-cycle-2' })
  assert.equal(result.status, 'completed')
  assert.equal(harness.orchestratorCalls.length, 2)
})

test('lock is released after finishedAt clock failure and the error is propagated', async () => {
  const harness = createDependencies({
    clockSteps: [
      { iso: '2026-07-09T10:00:00.000Z' },
      { error: new Error('clock finish failed') },
      { iso: '2026-07-09T11:00:00.000Z' },
      { iso: '2026-07-09T11:05:00.000Z' },
    ],
    timerValues: [100, 145, 200, 245],
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run({ captureCycleId: 'capture-cycle-1' }),
    /clock finish failed/,
  )

  assert.deepEqual(harness.metricsCalls.runs, [{ status: 'error' }])
  assert.deepEqual(harness.metricsCalls.timings, [{ durationMs: 45, status: 'error' }])
  assert.deepEqual(harness.metricsCalls.totals, [])

  const result = await service.run({ captureCycleId: 'capture-cycle-2' })
  assert.equal(result.status, 'completed')
  assert.equal(harness.orchestratorCalls.length, 2)
})

test('metrics are optional and do not change trigger behavior when omitted', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService({
    clock: harness.dependencies.clock,
    orchestrator: harness.dependencies.orchestrator,
    timer: harness.dependencies.timer,
  })

  const result = await service.run({ captureCycleId: 'capture-cycle-1' })

  assert.equal(result.status, 'completed')
})

test('retry policy explicitly disables automatic retries', () => {
  assert.equal(EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RETRY_POLICY.automaticRetryEnabled, false)
  assert.equal(
    EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RETRY_POLICY.recommendedStrategy,
    'external_controlled_retry',
  )
})

test('different service instances do not share a global lock', async () => {
  let releaseFirstRun: (() => void) | null = null
  const firstHarness = createDependencies({
    captureDiscoveredBatch: async () => new Promise((resolve) => {
      releaseFirstRun = () => resolve({
        items: [],
        nextCursor: undefined,
        totals: {
          processed: 0,
          captured: 0,
          created: 0,
          failed: 0,
        },
      })
    }),
  })
  const secondHarness = createDependencies()

  const firstService = createExecutiveMemoryCaptureTriggerService(firstHarness.dependencies)
  const secondService = createExecutiveMemoryCaptureTriggerService(secondHarness.dependencies)

  const firstRun = firstService.run({ captureCycleId: 'capture-cycle-1' })
  const secondRun = await secondService.run({ captureCycleId: 'capture-cycle-2' })

  assert.equal(secondRun.status, 'completed')
  assert.equal(secondHarness.orchestratorCalls.length, 1)

  releaseFirstRun?.()
  await firstRun
})

test('module remains structurally isolated from forbidden dependencies', async () => {
  const source = await readFile(
    path.resolve('backend/src/modules/executive/ExecutiveMemoryCaptureTriggerService.ts'),
    'utf8',
  )

  assert.equal(
    /Date\.now|new Date|Math\.random|crypto\.randomUUID|setInterval|setTimeout|cron|scheduler|fastify|fetch|axios|window|document|localStorage|sessionStorage|\bany\b/i.test(source),
    false,
  )
  assert.equal(source.includes('ExecutiveMemoryAtomicCaptureService'), false)
  assert.equal(source.includes('ExecutiveDashboardService'), false)
  assert.equal(source.includes('executiveDashboardApplicationService'), false)
  assert.equal(source.includes('executiveDashboardRoutes'), false)
  assert.equal(source.includes('captureCycleId:'), true)
})
