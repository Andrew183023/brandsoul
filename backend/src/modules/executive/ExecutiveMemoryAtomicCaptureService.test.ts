import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { buildExecutiveMemoryProjection } from './ExecutiveMemoryProjection.js'
import {
  ExecutiveMemoryAtomicCaptureService,
  createExecutiveMemoryAtomicCaptureService,
  type ExecutiveMemoryAtomicCaptureInput,
} from './ExecutiveMemoryAtomicCaptureService.js'
import { createExecutiveMemoryObservationRepository } from './ExecutiveMemoryObservationRepository.js'
import { createExecutiveMemoryRepository } from './ExecutiveMemoryRepository.js'

async function createSqliteHarness(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  await initializeDatabase(db)

  return {
    db,
    snapshotRepository: createExecutiveMemoryRepository(db),
    observationRepository: createExecutiveMemoryObservationRepository(db),
    atomicCaptureService: createExecutiveMemoryAtomicCaptureService({ db }),
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function createProjection(overrides?: {
  tenantId?: number
  officeId?: string
  capturedAt?: string
  sourceGrowthGeneratedAt?: string
  sourceOperationalGeneratedAt?: string
  officeHealthScore?: number
  decisionId?: string
  decisionTitle?: string
  timelineTitle?: string
}) {
  return buildExecutiveMemoryProjection({
    tenantId: overrides?.tenantId ?? 7,
    officeId: overrides?.officeId ?? 'office-1',
    capturedAt: overrides?.capturedAt ?? '2026-07-08T10:00:00.000Z',
    sourceGrowthGeneratedAt:
      overrides?.sourceGrowthGeneratedAt ?? '2026-07-08T09:00:00.000Z',
    sourceOperationalGeneratedAt:
      overrides?.sourceOperationalGeneratedAt ?? '2026-07-08T09:30:00.000Z',
    officeHealth: {
      score: overrides?.officeHealthScore ?? 82,
      level: 'good',
      explanation: 'Office health is stable.',
      positives: [{
        key: 'healthy_backlog',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece equilibrado.',
      }],
      warnings: [{
        key: 'coverage_attention',
        title: 'Cobertura regional',
        impact: 'negative',
        weight: 5,
        summary: 'Existe atencao em cobertura regional.',
      }],
      opportunities: [{
        key: 'regional_expansion',
        title: 'Expansao regional',
        impact: 'positive',
        weight: 6,
        summary: 'Ha oportunidade de expandir com seguranca.',
      }],
      drivers: [{
        key: 'healthy_backlog',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece equilibrado.',
      }],
    },
    decisionCenter: {
      decisions: [{
        id: overrides?.decisionId ?? 'decision:expand',
        type: 'expand',
        title: overrides?.decisionTitle ?? 'Expandir com controle',
        priority: 'high',
        impact: 'high',
        confidence: 83,
        explanation: 'Ha oportunidade clara de expansao.',
        evidence: [{
          key: 'expansion_opportunities',
          label: 'Oportunidades de expansao',
          value: 2,
          summary: 'Existem duas oportunidades de expansao.',
        }],
        recommendedActions: ['Revisar a oportunidade prioritaria.'],
        blockingFactors: [],
      }],
    },
    executiveTimeline: {
      items: [{
        id: 'executive_timeline:growth:expansion_opportunities',
        category: 'growth',
        importance: 'high',
        temporalKind: 'observed',
        title:
          overrides?.timelineTitle ?? 'Oportunidades de expansao identificadas',
        summary:
          'A inteligencia executiva encontrou oportunidade clara de expansao.',
        evidence: [
          {
            key: 'growth_opportunities',
            value: 0,
            description: 'A contagem atual esta explicitamente registrada.',
          },
          {
            key: 'backlog_flag',
            value: false,
            description: 'A pressao operacional nao esta ativada neste sinal.',
          },
        ],
        suggestedAction: 'Revisar a oportunidade prioritaria.',
        occurredAt: '2026-07-08T09:45:00.000Z',
        source: 'growth',
        sourceKey: 'expansion_opportunities',
      }],
      totalDetected: 1,
      totalPublished: 1,
      generatedAt: '2026-07-08T09:45:00.000Z',
    },
  })
}

function createInput(overrides?: {
  projection?: ReturnType<typeof createProjection>
  captureCycleId?: string
}): ExecutiveMemoryAtomicCaptureInput {
  return {
    projection: overrides?.projection ?? createProjection(),
    captureCycleId: overrides?.captureCycleId ?? 'capture-cycle-1',
  }
}

async function countSnapshots(
  db: Awaited<ReturnType<typeof createDatabaseConnection>>,
) {
  const row = await db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM executive_memory_snapshots
    `,
  )

  return row?.count ?? 0
}

async function countObservations(
  db: Awaited<ReturnType<typeof createDatabaseConnection>>,
) {
  const row = await db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM executive_memory_observations
    `,
  )

  return row?.count ?? 0
}

test('factory returns a valid atomic capture service instance', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-factory-')

  try {
    const service = createExecutiveMemoryAtomicCaptureService({ db: harness.db })
    assert.equal(service instanceof ExecutiveMemoryAtomicCaptureService, true)
  } finally {
    await harness.cleanup()
  }
})

test('capture validates captureCycleId and does not mutate input', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-validation-')

  try {
    await assert.rejects(
      harness.atomicCaptureService.capture(createInput({
        captureCycleId: '   ',
      })),
      /captureCycleId/,
    )

    const input = createInput()
    const before = structuredClone(input)

    await harness.atomicCaptureService.capture(input)

    assert.deepEqual(input, before)
  } finally {
    await harness.cleanup()
  }
})

test('state new plus observation new persists atomically with minimal result', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-new-')

  try {
    const input = createInput()
    const result = await harness.atomicCaptureService.capture(input)

    assert.deepEqual(result, {
      tenantId: input.projection.tenantId,
      officeId: input.projection.officeId,
      projectionVersion: input.projection.projectionVersion,
      captureCycleId: input.captureCycleId,
      capturedAt: input.projection.capturedAt,
      snapshotId: `executive_memory_snapshot:${input.projection.tenantId}:${input.projection.officeId}:${input.projection.contentFingerprint}`,
      snapshotCreated: true,
      observationId: `executive_memory_observation:${input.projection.tenantId}:${input.projection.officeId}:${result.observationFingerprint}`,
      observationCreated: true,
      contentFingerprint: input.projection.contentFingerprint,
      sourceFingerprint: input.projection.sourceFingerprint,
      observationFingerprint: result.observationFingerprint,
    })
    assert.equal(await countSnapshots(harness.db), 1)
    assert.equal(await countObservations(harness.db), 1)
    assert.equal('officeHealth' in result, false)
    assert.equal('decisionCenter' in result, false)
    assert.equal('executiveTimeline' in result, false)
  } finally {
    await harness.cleanup()
  }
})

test('state existing plus observation new creates only a new observation', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-existing-state-')

  try {
    const projection = createProjection()

    const first = await harness.atomicCaptureService.capture(createInput({
      projection,
      captureCycleId: 'capture-cycle-1',
    }))
    const second = await harness.atomicCaptureService.capture(createInput({
      projection,
      captureCycleId: 'capture-cycle-2',
    }))

    assert.equal(first.snapshotCreated, true)
    assert.equal(first.observationCreated, true)
    assert.equal(second.snapshotCreated, false)
    assert.equal(second.observationCreated, true)
    assert.equal(first.snapshotId, second.snapshotId)
    assert.notEqual(first.observationId, second.observationId)
    assert.equal(await countSnapshots(harness.db), 1)
    assert.equal(await countObservations(harness.db), 2)
  } finally {
    await harness.cleanup()
  }
})

test('state existing plus observation existing is idempotent for same cycle', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-idempotent-')

  try {
    const input = createInput()
    const first = await harness.atomicCaptureService.capture(input)
    const second = await harness.atomicCaptureService.capture(input)

    assert.equal(first.snapshotCreated, true)
    assert.equal(first.observationCreated, true)
    assert.equal(second.snapshotCreated, false)
    assert.equal(second.observationCreated, false)
    assert.equal(first.snapshotId, second.snapshotId)
    assert.equal(first.observationId, second.observationId)
    assert.equal(await countSnapshots(harness.db), 1)
    assert.equal(await countObservations(harness.db), 1)
  } finally {
    await harness.cleanup()
  }
})

test('same state plus new cycle creates a new observation only', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-new-cycle-')

  try {
    const projection = createProjection()

    await harness.atomicCaptureService.capture(createInput({
      projection,
      captureCycleId: 'capture-cycle-1',
    }))
    const second = await harness.atomicCaptureService.capture(createInput({
      projection,
      captureCycleId: 'capture-cycle-2',
    }))

    assert.equal(second.snapshotCreated, false)
    assert.equal(second.observationCreated, true)
    assert.equal(await countSnapshots(harness.db), 1)
    assert.equal(await countObservations(harness.db), 2)
  } finally {
    await harness.cleanup()
  }
})

test('different state plus same cycle creates distinct states and observations', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-different-state-')

  try {
    const projectionA = createProjection({
      officeHealthScore: 70,
      decisionId: 'decision:a',
      timelineTitle: 'Estado A',
    })
    const projectionB = createProjection({
      officeHealthScore: 88,
      decisionId: 'decision:b',
      timelineTitle: 'Estado B',
      capturedAt: '2026-07-08T12:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T12:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T12:30:00.000Z',
    })

    const first = await harness.atomicCaptureService.capture(createInput({
      projection: projectionA,
      captureCycleId: 'capture-cycle-1',
    }))
    const second = await harness.atomicCaptureService.capture(createInput({
      projection: projectionB,
      captureCycleId: 'capture-cycle-1',
    }))

    assert.equal(first.snapshotCreated, true)
    assert.equal(second.snapshotCreated, true)
    assert.notEqual(first.snapshotId, second.snapshotId)
    assert.notEqual(first.observationId, second.observationId)
    assert.equal(await countSnapshots(harness.db), 2)
    assert.equal(await countObservations(harness.db), 2)
  } finally {
    await harness.cleanup()
  }
})

test('A to B to A yields 2 states and 3 observations', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-aba-')

  try {
    const projectionA = createProjection({
      officeHealthScore: 70,
      decisionId: 'decision:a',
      timelineTitle: 'Estado A',
    })
    const projectionB = createProjection({
      officeHealthScore: 88,
      decisionId: 'decision:b',
      timelineTitle: 'Estado B',
      capturedAt: '2026-07-08T12:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T12:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T12:30:00.000Z',
    })

    await harness.atomicCaptureService.capture(createInput({
      projection: projectionA,
      captureCycleId: 'capture-cycle-1',
    }))
    await harness.atomicCaptureService.capture(createInput({
      projection: projectionB,
      captureCycleId: 'capture-cycle-2',
    }))
    await harness.atomicCaptureService.capture(createInput({
      projection: projectionA,
      captureCycleId: 'capture-cycle-3',
    }))

    assert.equal(await countSnapshots(harness.db), 2)
    assert.equal(await countObservations(harness.db), 3)
  } finally {
    await harness.cleanup()
  }
})

test('rollback removes a newly created state when observation persistence fails', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-rollback-new-')

  try {
    const service = createExecutiveMemoryAtomicCaptureService({
      db: harness.db,
      observationRepositoryFactory() {
        return {
          async saveObservation() {
            throw new Error('forced_observation_failure')
          },
        }
      },
    })

    await assert.rejects(
      service.capture(createInput()),
      /forced_observation_failure/,
    )

    assert.equal(await countSnapshots(harness.db), 0)
    assert.equal(await countObservations(harness.db), 0)
  } finally {
    await harness.cleanup()
  }
})

test('rollback preserves a pre-existing state when observation persistence fails', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-rollback-existing-')

  try {
    const input = createInput()
    const existingSnapshot = await harness.snapshotRepository.saveSnapshot(input.projection)

    const service = createExecutiveMemoryAtomicCaptureService({
      db: harness.db,
      observationRepositoryFactory() {
        return {
          async saveObservation() {
            throw new Error('forced_observation_failure')
          },
        }
      },
    })

    await assert.rejects(
      service.capture(input),
      /forced_observation_failure/,
    )

    assert.equal(await countSnapshots(harness.db), 1)
    assert.equal(await countObservations(harness.db), 0)

    const latest = await harness.snapshotRepository.getLatestSnapshot({
      tenantId: input.projection.tenantId,
      officeId: input.projection.officeId,
    })
    assert.equal(latest?.id, existingSnapshot.record.id)
  } finally {
    await harness.cleanup()
  }
})

test('atomic capture service keeps transaction scope observable through rollback', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-transaction-scope-')

  try {
    let snapshotCallCount = 0
    const service = createExecutiveMemoryAtomicCaptureService({
      db: harness.db,
      snapshotRepositoryFactory(db) {
        const repository = createExecutiveMemoryRepository(db)
        return {
          async saveSnapshot(projection) {
            snapshotCallCount += 1
            return repository.saveSnapshot(projection)
          },
        }
      },
      observationRepositoryFactory() {
        return {
          async saveObservation() {
            throw new Error('forced_observation_failure')
          },
        }
      },
    })

    await assert.rejects(service.capture(createInput()), /forced_observation_failure/)

    assert.equal(snapshotCallCount, 1)
    assert.equal(await countSnapshots(harness.db), 0)
    assert.equal(await countObservations(harness.db), 0)
  } finally {
    await harness.cleanup()
  }
})

test('result preserves canonical identities and excludes raw payloads', async () => {
  const harness = await createSqliteHarness('executive-memory-atomic-result-')

  try {
    const input = createInput()
    const result = await harness.atomicCaptureService.capture(input)

    assert.equal(result.tenantId, input.projection.tenantId)
    assert.equal(result.officeId, input.projection.officeId)
    assert.equal(result.projectionVersion, input.projection.projectionVersion)
    assert.equal(result.captureCycleId, input.captureCycleId)
    assert.equal(result.capturedAt, input.projection.capturedAt)
    assert.equal(result.contentFingerprint, input.projection.contentFingerprint)
    assert.equal(result.sourceFingerprint, input.projection.sourceFingerprint)
    assert.equal(result.snapshotId.length > 0, true)
    assert.equal(result.observationId.length > 0, true)
    assert.equal(result.observationFingerprint.length > 0, true)

    const serialized = JSON.stringify(result)
    assert.equal(serialized.includes('officeHealth'), false)
    assert.equal(serialized.includes('decisionCenter'), false)
    assert.equal(serialized.includes('executiveTimeline'), false)
    assert.equal(serialized.includes('growth'), false)
    assert.equal(serialized.includes('operational'), false)
    assert.equal(serialized.includes('morningBrief'), false)
    assert.equal(serialized.includes('executiveFeed'), false)
    assert.equal(serialized.includes('cases'), false)
    assert.equal(serialized.includes('professionals'), false)
    assert.equal(serialized.includes('entityProfile'), false)
  } finally {
    await harness.cleanup()
  }
})

test('module remains structurally isolated from forbidden dependencies', async () => {
  const source = await readFile(
    path.resolve('backend/src/modules/executive/ExecutiveMemoryAtomicCaptureService.ts'),
    'utf8',
  )

  assert.equal(
    /Date\.now|new Date|performance\.now|Math\.random|randomUUID|uuid|fetch|axios|fastify|react|window|document|localStorage|sessionStorage|setTimeout|setInterval|\bany\b/i.test(source),
    false,
  )
  assert.equal(source.includes('ExecutiveDashboardService'), false)
  assert.equal(source.includes('executiveDashboardApplicationService'), false)
  assert.equal(source.includes('executiveDashboardRoutes'), false)
  assert.equal(source.includes('growthIntelligenceService'), false)
  assert.equal(source.includes('operationalIntelligenceService'), false)
  assert.equal(source.includes('ExecutiveMemoryCaptureOrchestrator'), false)
  assert.equal(source.includes('ExecutiveMemoryCaptureTriggerService'), false)
})
