import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { buildExecutiveMemoryProjection } from './ExecutiveMemoryProjection.js'
import {
  buildExecutiveMemoryObservationFingerprint,
  buildExecutiveMemoryObservationId,
} from './ExecutiveMemoryTemporalIdentity.js'
import {
  ExecutiveMemoryObservationRepository,
  createExecutiveMemoryObservationRepository,
  type SaveExecutiveMemoryObservationInput,
} from './ExecutiveMemoryObservationRepository.js'
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
    sourceGrowthGeneratedAt: overrides?.sourceGrowthGeneratedAt ?? '2026-07-08T09:00:00.000Z',
    sourceOperationalGeneratedAt: overrides?.sourceOperationalGeneratedAt ?? '2026-07-08T09:30:00.000Z',
    officeHealth: {
      score: overrides?.officeHealthScore ?? 82,
      level: 'good',
      explanation: 'Office health is stable.',
      positives: [{
        key: 'healthy_backlog',
        title: 'Backlog saudável',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece equilibrado.',
      }],
      warnings: [{
        key: 'coverage_attention',
        title: 'Cobertura regional',
        impact: 'negative',
        weight: 5,
        summary: 'Existe atenção em cobertura regional.',
      }],
      opportunities: [{
        key: 'regional_expansion',
        title: 'Expansão regional',
        impact: 'positive',
        weight: 6,
        summary: 'Há oportunidade de expandir com segurança.',
      }],
      drivers: [{
        key: 'healthy_backlog',
        title: 'Backlog saudável',
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
        explanation: 'Há oportunidade clara de expansão.',
        evidence: [{
          key: 'expansion_opportunities',
          label: 'Oportunidades de expansão',
          value: 2,
          summary: 'Existem duas oportunidades de expansão.',
        }],
        recommendedActions: ['Revisar a oportunidade prioritária.'],
        blockingFactors: [],
      }],
    },
    executiveTimeline: {
      items: [{
        id: 'executive_timeline:growth:expansion_opportunities',
        category: 'growth',
        importance: 'high',
        temporalKind: 'observed',
        title: overrides?.timelineTitle ?? 'Oportunidades de expansão identificadas',
        summary: 'A inteligência executiva encontrou oportunidade clara de expansão.',
        evidence: [
          {
            key: 'growth_opportunities',
            value: 0,
            description: 'A contagem atual está explicitamente registrada.',
          },
          {
            key: 'backlog_flag',
            value: false,
            description: 'A pressão operacional não está ativada neste sinal.',
          },
        ],
        suggestedAction: 'Revisar a oportunidade prioritária.',
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

async function createState(
  harness: Awaited<ReturnType<typeof createSqliteHarness>>,
  overrides?: Parameters<typeof createProjection>[0],
) {
  return harness.snapshotRepository.saveSnapshot(createProjection(overrides))
}

function createObservationInput(overrides?: Partial<SaveExecutiveMemoryObservationInput> & {
  stateSnapshotId?: string
}) {
  return {
    tenantId: overrides?.tenantId ?? 7,
    officeId: overrides?.officeId ?? 'office-1',
    projectionVersion: overrides?.projectionVersion ?? 1,
    captureCycleId: overrides?.captureCycleId ?? 'capture-cycle-1',
    contentFingerprint: overrides?.contentFingerprint ?? 'content-fingerprint-a',
    capturedAt: overrides?.capturedAt ?? '2026-07-08T10:00:00.000Z',
    sourceFingerprint: overrides?.sourceFingerprint ?? 'source-fingerprint-1',
    stateSnapshotId: overrides?.stateSnapshotId ?? 'missing-state',
  }
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

test('factory returns a valid observation repository instance', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-factory-')

  try {
    const repository = createExecutiveMemoryObservationRepository(harness.db)
    assert.equal(repository instanceof ExecutiveMemoryObservationRepository, true)
  } finally {
    await harness.cleanup()
  }
})

test('saveObservation persists a new observation and derives identity fields', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-save-')

  try {
    const state = await createState(harness)
    const input = createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      sourceFingerprint: state.record.sourceFingerprint,
    })

    const result = await harness.observationRepository.saveObservation(input)

    assert.equal(result.created, true)
    assert.equal(result.record.tenantId, 7)
    assert.equal(result.record.officeId, 'office-1')
    assert.equal(result.record.captureCycleId, 'capture-cycle-1')
    assert.equal(result.record.stateSnapshotId, state.record.id)
    assert.equal(
      result.record.observationFingerprint,
      buildExecutiveMemoryObservationFingerprint({
        projectionVersion: 1,
        tenantId: 7,
        officeId: 'office-1',
        captureCycleId: 'capture-cycle-1',
        contentFingerprint: state.record.contentFingerprint,
      }),
    )
    assert.equal(
      result.record.id,
      buildExecutiveMemoryObservationId({
        projectionVersion: 1,
        tenantId: 7,
        officeId: 'office-1',
        captureCycleId: 'capture-cycle-1',
        contentFingerprint: state.record.contentFingerprint,
      }),
    )
    assert.equal(await countObservations(harness.db), 1)
  } finally {
    await harness.cleanup()
  }
})

test('same state and same capture cycle are idempotent', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-idempotent-')

  try {
    const state = await createState(harness)
    const firstInput = createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      sourceFingerprint: state.record.sourceFingerprint,
      capturedAt: '2026-07-08T10:00:00.000Z',
    })
    const secondInput = createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      sourceFingerprint: 'source-fingerprint-2',
      capturedAt: '2026-07-08T11:00:00.000Z',
    })

    const first = await harness.observationRepository.saveObservation(firstInput)
    const second = await harness.observationRepository.saveObservation(secondInput)

    assert.equal(first.created, true)
    assert.equal(second.created, false)
    assert.equal(first.record.id, second.record.id)
    assert.equal(first.record.observationFingerprint, second.record.observationFingerprint)
    assert.equal(await countObservations(harness.db), 1)
  } finally {
    await harness.cleanup()
  }
})

test('same state with different capture cycles creates new observations', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-different-cycles-')

  try {
    const state = await createState(harness)

    const first = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      captureCycleId: 'capture-cycle-1',
      sourceFingerprint: state.record.sourceFingerprint,
    }))
    const second = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      captureCycleId: 'capture-cycle-2',
      sourceFingerprint: state.record.sourceFingerprint,
      capturedAt: '2026-07-08T11:00:00.000Z',
    }))

    assert.equal(first.created, true)
    assert.equal(second.created, true)
    assert.notEqual(first.record.id, second.record.id)
    assert.equal(await countObservations(harness.db), 2)
  } finally {
    await harness.cleanup()
  }
})

test('different states within the same capture cycle create new observations', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-different-states-')

  try {
    const stateA = await createState(harness, {
      officeHealthScore: 70,
      decisionId: 'decision:a',
      timelineTitle: 'Estado A',
    })
    const stateB = await createState(harness, {
      officeHealthScore: 88,
      decisionId: 'decision:b',
      timelineTitle: 'Estado B',
      capturedAt: '2026-07-08T12:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T12:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T12:30:00.000Z',
    })

    const first = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateA.record.id,
      contentFingerprint: stateA.record.contentFingerprint,
      sourceFingerprint: stateA.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
    }))
    const second = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateB.record.id,
      contentFingerprint: stateB.record.contentFingerprint,
      sourceFingerprint: stateB.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
      capturedAt: '2026-07-08T12:00:00.000Z',
    }))

    assert.equal(first.created, true)
    assert.equal(second.created, true)
    assert.notEqual(first.record.observationFingerprint, second.record.observationFingerprint)
    assert.equal(await countObservations(harness.db), 2)
  } finally {
    await harness.cleanup()
  }
})

test('A to B to A across distinct cycles produces 2 states and 3 observations', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-aba-')

  try {
    const stateA = await createState(harness, {
      officeHealthScore: 70,
      decisionId: 'decision:a',
      timelineTitle: 'Estado A',
    })
    const stateB = await createState(harness, {
      officeHealthScore: 88,
      decisionId: 'decision:b',
      timelineTitle: 'Estado B',
      capturedAt: '2026-07-08T12:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T12:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T12:30:00.000Z',
    })

    await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateA.record.id,
      contentFingerprint: stateA.record.contentFingerprint,
      sourceFingerprint: stateA.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
    }))
    await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateB.record.id,
      contentFingerprint: stateB.record.contentFingerprint,
      sourceFingerprint: stateB.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-2',
      capturedAt: '2026-07-08T12:00:00.000Z',
    }))
    await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateA.record.id,
      contentFingerprint: stateA.record.contentFingerprint,
      sourceFingerprint: stateA.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-3',
      capturedAt: '2026-07-08T13:00:00.000Z',
    }))

    const stateRows = await harness.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM executive_memory_snapshots`,
    )

    assert.equal(stateRows?.count, 2)
    assert.equal(await countObservations(harness.db), 3)
  } finally {
    await harness.cleanup()
  }
})

test('saveObservation rejects missing or mismatched state snapshots before insert', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-state-validation-')

  try {
    const state = await createState(harness)

    await assert.rejects(
      harness.observationRepository.saveObservation(createObservationInput({
        stateSnapshotId: 'missing-state',
        contentFingerprint: state.record.contentFingerprint,
        sourceFingerprint: state.record.sourceFingerprint,
      })),
      /matching persisted state snapshot/,
    )
    assert.equal(await countObservations(harness.db), 0)

    await assert.rejects(
      harness.observationRepository.saveObservation(createObservationInput({
        tenantId: 8,
        stateSnapshotId: state.record.id,
        officeId: state.record.officeId,
        contentFingerprint: state.record.contentFingerprint,
        sourceFingerprint: state.record.sourceFingerprint,
      })),
      /matching persisted state snapshot/,
    )
    await assert.rejects(
      harness.observationRepository.saveObservation(createObservationInput({
        tenantId: state.record.tenantId,
        officeId: 'office-2',
        stateSnapshotId: state.record.id,
        contentFingerprint: state.record.contentFingerprint,
        sourceFingerprint: state.record.sourceFingerprint,
      })),
      /matching persisted state snapshot/,
    )
    await assert.rejects(
      harness.observationRepository.saveObservation(createObservationInput({
        stateSnapshotId: state.record.id,
        projectionVersion: 2,
        contentFingerprint: state.record.contentFingerprint,
        sourceFingerprint: state.record.sourceFingerprint,
      })),
      /projectionVersion/,
    )
    await assert.rejects(
      harness.observationRepository.saveObservation(createObservationInput({
        stateSnapshotId: state.record.id,
        contentFingerprint: 'different-content',
        sourceFingerprint: state.record.sourceFingerprint,
      })),
      /contentFingerprint/,
    )
    assert.equal(await countObservations(harness.db), 0)
  } finally {
    await harness.cleanup()
  }
})

test('getObservationByFingerprint and getLatestObservation return null on empty dataset', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-empty-')

  try {
    const byFingerprint = await harness.observationRepository.getObservationByFingerprint({
      tenantId: 7,
      officeId: 'office-1',
      observationFingerprint: 'missing',
    })
    const latest = await harness.observationRepository.getLatestObservation({
      tenantId: 7,
      officeId: 'office-1',
    })

    assert.equal(byFingerprint, null)
    assert.equal(latest, null)
  } finally {
    await harness.cleanup()
  }
})

test('read methods return ordered and isolated observation histories', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-read-')

  try {
    const stateA = await createState(harness, {
      officeId: 'office-1',
      officeHealthScore: 70,
      decisionId: 'decision:a',
      timelineTitle: 'Estado A',
    })
    const stateB = await createState(harness, {
      officeId: 'office-1',
      officeHealthScore: 88,
      decisionId: 'decision:b',
      timelineTitle: 'Estado B',
      capturedAt: '2026-07-08T12:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T12:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T12:30:00.000Z',
    })
    const stateOtherOffice = await createState(harness, {
      officeId: 'office-2',
      officeHealthScore: 65,
      decisionId: 'decision:other',
      timelineTitle: 'Estado Outro',
    })
    const stateOtherTenant = await createState(harness, {
      tenantId: 8,
      officeId: 'office-1',
      officeHealthScore: 64,
      decisionId: 'decision:tenant',
      timelineTitle: 'Estado Tenant',
    })

    const observationA1 = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateA.record.id,
      contentFingerprint: stateA.record.contentFingerprint,
      sourceFingerprint: stateA.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
      capturedAt: '2026-07-08T10:00:00.000Z',
    }))
    const observationB = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateB.record.id,
      contentFingerprint: stateB.record.contentFingerprint,
      sourceFingerprint: stateB.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-2',
      capturedAt: '2026-07-08T12:00:00.000Z',
    }))
    const observationA2 = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: stateA.record.id,
      contentFingerprint: stateA.record.contentFingerprint,
      sourceFingerprint: stateA.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-3',
      capturedAt: '2026-07-08T13:00:00.000Z',
    }))
    await harness.observationRepository.saveObservation(createObservationInput({
      tenantId: 7,
      officeId: 'office-2',
      stateSnapshotId: stateOtherOffice.record.id,
      contentFingerprint: stateOtherOffice.record.contentFingerprint,
      sourceFingerprint: stateOtherOffice.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
      capturedAt: '2026-07-08T09:00:00.000Z',
    }))
    await harness.observationRepository.saveObservation(createObservationInput({
      tenantId: 8,
      officeId: 'office-1',
      stateSnapshotId: stateOtherTenant.record.id,
      contentFingerprint: stateOtherTenant.record.contentFingerprint,
      sourceFingerprint: stateOtherTenant.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
      capturedAt: '2026-07-08T09:30:00.000Z',
    }))

    const found = await harness.observationRepository.getObservationByFingerprint({
      tenantId: 7,
      officeId: 'office-1',
      observationFingerprint: observationB.record.observationFingerprint,
    })
    const latest = await harness.observationRepository.getLatestObservation({
      tenantId: 7,
      officeId: 'office-1',
    })
    const list = await harness.observationRepository.listObservations({
      tenantId: 7,
      officeId: 'office-1',
    })
    const byState = await harness.observationRepository.listObservationsByState({
      tenantId: 7,
      officeId: 'office-1',
      contentFingerprint: stateA.record.contentFingerprint,
    })
    const byCycle = await harness.observationRepository.listObservationsByCaptureCycle({
      tenantId: 7,
      officeId: 'office-1',
      captureCycleId: 'capture-cycle-1',
    })

    assert.equal(found?.id, observationB.record.id)
    assert.equal(latest?.id, observationA2.record.id)
    assert.deepEqual(
      list.map((item) => item.id),
      [observationA2.record.id, observationB.record.id, observationA1.record.id],
    )
    assert.deepEqual(
      byState.map((item) => item.id),
      [observationA2.record.id, observationA1.record.id],
    )
    assert.deepEqual(byCycle.map((item) => item.id), [observationA1.record.id])
  } finally {
    await harness.cleanup()
  }
})

test('list methods normalize limits and preserve input immutability', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-limits-')

  try {
    const state = await createState(harness)
    for (const [index, cycle] of ['capture-cycle-1', 'capture-cycle-2', 'capture-cycle-3'].entries()) {
      await harness.observationRepository.saveObservation(createObservationInput({
        stateSnapshotId: state.record.id,
        contentFingerprint: state.record.contentFingerprint,
        sourceFingerprint: state.record.sourceFingerprint,
        captureCycleId: cycle,
        capturedAt: `2026-07-08T1${index}:00:00.000Z`,
      }))
    }

    const listInput = {
      tenantId: 7,
      officeId: 'office-1',
      limit: 1.5,
    }
    const before = structuredClone(listInput)

    const defaultList = await harness.observationRepository.listObservations({
      tenantId: 7,
      officeId: 'office-1',
    })
    const minList = await harness.observationRepository.listObservations({
      tenantId: 7,
      officeId: 'office-1',
      limit: 1,
    })
    const fallbackLow = await harness.observationRepository.listObservations({
      tenantId: 7,
      officeId: 'office-1',
      limit: 0,
    })
    const fallbackHigh = await harness.observationRepository.listObservations({
      tenantId: 7,
      officeId: 'office-1',
      limit: 101,
    })
    const fallbackFraction = await harness.observationRepository.listObservations(listInput)

    assert.equal(defaultList.length, 3)
    assert.equal(minList.length, 1)
    assert.equal(fallbackLow.length, 3)
    assert.equal(fallbackHigh.length, 3)
    assert.equal(fallbackFraction.length, 3)
    assert.deepEqual(listInput, before)
  } finally {
    await harness.cleanup()
  }
})

test('concurrent inserts of the same observation remain idempotent', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-concurrency-')

  try {
    const state = await createState(harness)
    const input = createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      sourceFingerprint: state.record.sourceFingerprint,
      captureCycleId: 'capture-cycle-1',
    })

    const [first, second] = await Promise.all([
      harness.observationRepository.saveObservation(input),
      harness.observationRepository.saveObservation(input),
    ])

    assert.equal(await countObservations(harness.db), 1)
    assert.equal(first.record.id, second.record.id)
    assert.equal([first.created, second.created].filter(Boolean).length, 1)
  } finally {
    await harness.cleanup()
  }
})

test('observation record remains minimal and does not expose state payload or pii', async () => {
  const harness = await createSqliteHarness('executive-memory-observation-privacy-')

  try {
    const state = await createState(harness)
    const result = await harness.observationRepository.saveObservation(createObservationInput({
      stateSnapshotId: state.record.id,
      contentFingerprint: state.record.contentFingerprint,
      sourceFingerprint: state.record.sourceFingerprint,
    }))

    assert.deepEqual(Object.keys(result.record).sort(), [
      'captureCycleId',
      'capturedAt',
      'contentFingerprint',
      'createdAt',
      'id',
      'observationFingerprint',
      'officeId',
      'projectionVersion',
      'sourceFingerprint',
      'stateSnapshotId',
      'tenantId',
    ].sort())

    const serialized = JSON.stringify(result.record)
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
    assert.equal(serialized.includes('email'), false)
    assert.equal(serialized.includes('phone'), false)
  } finally {
    await harness.cleanup()
  }
})

test('observation repository implementation remains structurally isolated', async () => {
  const source = await readFile(
    path.resolve('backend/src/modules/executive/ExecutiveMemoryObservationRepository.ts'),
    'utf8',
  )

  assert.equal(
    /Date\.now|new Date|performance\.now|Math\.random|randomUUID|fetch|axios|fastify|react|window|document|localStorage|sessionStorage|\bany\b/i.test(source),
    false,
  )
  assert.equal(source.includes('ExecutiveMemoryCaptureService'), false)
  assert.equal(source.includes('ExecutiveMemoryCaptureOrchestrator'), false)
  assert.equal(source.includes('ExecutiveMemoryCaptureTriggerService'), false)
  assert.equal(source.includes('scheduler'), false)
  assert.equal(source.includes('cron'), false)
})
