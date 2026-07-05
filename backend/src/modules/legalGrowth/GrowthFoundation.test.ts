import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import {
  GROWTH_SNAPSHOT_BUILD_MS,
  createGrowthMetrics,
  createGrowthPipeline,
  createGrowthRepository,
  type GrowthContext,
} from './index.js'

function createContext(overrides: Partial<GrowthContext> = {}): GrowthContext {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    now: overrides.now ?? '2026-07-04T12:00:00.000Z',
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: overrides.cases,
    professionals: overrides.professionals,
    entityProfile: overrides.entityProfile,
  }
}

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

test('growth pipeline builds a valid base snapshot preserving office tenant and period', () => {
  const pipeline = createGrowthPipeline()

  const snapshot = pipeline.build(createContext())

  assert.equal(snapshot.officeId, 'office-1')
  assert.equal(snapshot.tenantId, 11)
  assert.deepEqual(snapshot.period, {
    label: '2026-07',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T23:59:59.999Z',
    granularity: 'month',
  })
  assert.equal(snapshot.generatedAt, '2026-07-04T12:00:00.000Z')
  assert.deepEqual(snapshot.demand.items, [])
  assert.deepEqual(snapshot.territories, [])
  assert.deepEqual(snapshot.coverage, [])
  assert.deepEqual(snapshot.capacity, [])
  assert.deepEqual(snapshot.scores, [])
  assert.deepEqual(snapshot.recommendations, [])
  assert.deepEqual(snapshot.opportunities, [])
  assert.deepEqual(snapshot.landingCandidates, [])
  assert.deepEqual(snapshot.metadata.evidence, [])
  assert.equal(snapshot.metadata.deterministic, true)
  assert.equal(snapshot.metadata.foundationVersion, 'g7.0')
})

test('growth repository saves snapshots and returns the latest by office id', () => {
  const repository = createGrowthRepository()
  const pipeline = createGrowthPipeline()

  const first = pipeline.build(createContext({
    now: '2026-07-04T10:00:00.000Z',
  }))
  const second = pipeline.build(createContext({
    now: '2026-07-04T13:00:00.000Z',
  }))

  repository.save(first)
  repository.save(second)

  assert.deepEqual(repository.getLatestByOfficeId('office-1'), second)
  assert.deepEqual(repository.listByOfficeId('office-1'), [second, first])
})

test('growth pipeline is deterministic for equal inputs', () => {
  const pipeline = createGrowthPipeline()
  const context = createContext({
    now: new Date('2026-07-04T12:00:00.000Z'),
  })

  const first = pipeline.build(context)
  const second = pipeline.build(context)

  assert.deepEqual(first, second)
})

test('growth metrics and pipeline do not break when observability is omitted', () => {
  const metrics = createGrowthMetrics()
  metrics.recordSnapshotBuildTiming({
    tenantId: 11,
    officeId: 'office-1',
    durationMs: 5,
  })

  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext())
  assert.equal(snapshot.officeId, 'office-1')
})

test('growth pipeline records timing when observability is provided', () => {
  const observability = createObservabilityService()
  const pipeline = createGrowthPipeline(observability)

  pipeline.build(createContext())

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, GROWTH_SNAPSHOT_BUILD_MS), 1)
})
