import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT,
  EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT,
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
}) {
  const orchestratorCalls: Array<{
    capturedAt: string
    cursor?: string
    limit?: number
  }> = []
  const { calls: clockCalls, clock } = createClock(
    overrides?.clockSteps ?? [
      { iso: '2026-07-09T10:00:00.000Z' },
      { iso: '2026-07-09T10:05:00.000Z' },
    ],
  )

  return {
    orchestratorCalls,
    clockCalls,
    dependencies: {
      clock,
      orchestrator: {
        async captureDiscoveredBatch(input: {
          capturedAt: string
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

test('run calls clock and orchestrator once and returns a sanitized operational result', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  const result = await service.run({
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
  assert.equal('contentFingerprint' in result, false)
  assert.equal('sourceFingerprint' in result, false)
  assert.equal('tenantId' in result, false)
  assert.equal('officeId' in result, false)
})

test('default limit is used when input limit is absent', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await service.run()

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
    { input: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT + 1, expected: EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT },
    { input: 7.9, expected: 7 },
  ]

  for (const scenario of cases) {
    const harness = createDependencies()
    const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

    await service.run({ limit: scenario.input })

    assert.equal(harness.orchestratorCalls[0]?.limit, scenario.expected)
  }
})

test('cursor undefined is preserved and nextCursor may be undefined', async () => {
  const harness = createDependencies({
    captureDiscoveredBatch: async (input) => ({
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

  const result = await service.run()

  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
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

test('input is not mutated', async () => {
  const harness = createDependencies()
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)
  const input = {
    cursor: 'office-7',
    limit: 15,
  }
  const before = structuredClone(input)

  await service.run(input)

  assert.deepEqual(input, before)
})

test('second concurrent execution returns already_running and does not call clock or orchestrator', async () => {
  let releaseFirstRun: (() => void) | null = null
  const harness = createDependencies({
    captureDiscoveredBatch: (input) => new Promise((resolve) => {
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

  const firstRun = service.run({ limit: 10 })
  const secondRun = await service.run({ limit: 3 })

  assert.deepEqual(secondRun, {
    status: 'already_running',
  })
  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
      cursor: undefined,
      limit: 10,
    },
  ])
  assert.deepEqual(harness.clockCalls, [
    '2026-07-09T10:00:00.000Z',
  ])

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
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await service.run({ limit: 4 })
  await service.run({ limit: 6 })

  assert.deepEqual(harness.orchestratorCalls, [
    {
      capturedAt: '2026-07-09T10:00:00.000Z',
      cursor: undefined,
      limit: 4,
    },
    {
      capturedAt: '2026-07-09T11:00:00.000Z',
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
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run(),
    /clock start failed/,
  )

  const result = await service.run()
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
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run(),
    /orchestrator failed/,
  )

  const result = await service.run()
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
  })
  const service = createExecutiveMemoryCaptureTriggerService(harness.dependencies)

  await assert.rejects(
    service.run(),
    /clock finish failed/,
  )

  const result = await service.run()
  assert.equal(result.status, 'completed')
  assert.equal(harness.orchestratorCalls.length, 2)
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

  const firstRun = firstService.run()
  const secondRun = await secondService.run()

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
    /Date\.now|new Date|performance\.now|Math\.random|crypto\.randomUUID|setInterval|setTimeout|cron|scheduler|fastify|fetch|axios|window|document|localStorage|sessionStorage|\bany\b/i.test(source),
    false,
  )
  assert.equal(source.includes('ExecutiveDashboardService'), false)
  assert.equal(source.includes('ExecutiveDashboardApplicationService'), false)
  assert.equal(source.includes('executiveDashboardRoutes'), false)
})
