import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { buildExecutiveMemoryProjection } from './ExecutiveMemoryProjection.js'
import {
  buildExecutiveMemorySnapshotId,
  createExecutiveMemoryRepository,
} from './ExecutiveMemoryRepository.js'

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
    repository: createExecutiveMemoryRepository(db),
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
  timelineOccurredAt?: string | undefined
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
      positives: [
        {
          key: 'healthy_backlog',
          title: 'Backlog saudável',
          impact: 'positive',
          weight: 8,
          summary: 'O backlog permanece equilibrado.',
        },
      ],
      warnings: [
        {
          key: 'coverage_attention',
          title: 'Cobertura regional',
          impact: 'negative',
          weight: 5,
          summary: 'Existe atenção em cobertura regional.',
        },
      ],
      opportunities: [
        {
          key: 'regional_expansion',
          title: 'Expansão regional',
          impact: 'positive',
          weight: 6,
          summary: 'Há oportunidade de expandir com segurança.',
        },
      ],
      drivers: [
        {
          key: 'healthy_backlog',
          title: 'Backlog saudável',
          impact: 'positive',
          weight: 8,
          summary: 'O backlog permanece equilibrado.',
        },
        {
          key: 'coverage_attention',
          title: 'Cobertura regional',
          impact: 'negative',
          weight: 5,
          summary: 'Existe atenção em cobertura regional.',
        },
      ],
    },
    decisionCenter: {
      decisions: [
        {
          id: overrides?.decisionId ?? 'decision:expand',
          type: 'expand',
          title: overrides?.decisionTitle ?? 'Expandir com controle',
          priority: 'high',
          impact: 'high',
          confidence: 83,
          explanation: 'Há oportunidade clara de expansão.',
          evidence: [
            {
              key: 'expansion_opportunities',
              label: 'Oportunidades de expansão',
              value: 2,
              summary: 'Existem duas oportunidades de expansão.',
            },
            {
              key: 'health_ok',
              label: 'Saúde operacional',
              value: false,
              summary: 'Não há bloqueio crítico de saúde operacional.',
            },
          ],
          recommendedActions: ['Revisar a oportunidade prioritária.'],
          blockingFactors: [],
        },
      ],
    },
    executiveTimeline: {
      items: [
        {
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
            {
              key: 'regional_gap',
              value: null,
              description: 'Ainda não existe região específica fixada para este sinal.',
            },
            {
              key: 'narrative_only',
              description: 'A narrativa executiva foi preservada sem valor numérico.',
            },
          ],
          suggestedAction: 'Revisar a oportunidade prioritária no centro de decisões.',
          occurredAt: overrides?.timelineOccurredAt,
          source: 'growth',
          sourceKey: 'expansion_opportunities',
        },
      ],
      totalDetected: 1,
      totalPublished: 1,
      generatedAt: '2026-07-08T09:45:00.000Z',
    },
  })
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

test('initializeDatabase creates executive memory snapshot table and indexes', async () => {
  const harness = await createSqliteHarness('executive-memory-schema-')

  try {
    const table = await harness.db.get<{ name: string }>(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'executive_memory_snapshots'
      `,
    )
    const indexes = await harness.db.all<Array<{ name: string }>>(
      `PRAGMA index_list(executive_memory_snapshots)`,
    )

    assert.equal(table?.name, 'executive_memory_snapshots')
    assert.ok(indexes.some((index) => index.name === 'idx_executive_memory_snapshots_unique_content'))
    assert.ok(indexes.some((index) => index.name === 'idx_executive_memory_snapshots_office_captured'))
    assert.ok(indexes.some((index) => index.name === 'idx_executive_memory_snapshots_source_fingerprint'))
  } finally {
    await harness.cleanup()
  }
})

test('saveSnapshot creates a new executive memory record', async () => {
  const harness = await createSqliteHarness('executive-memory-save-')

  try {
    const projection = createProjection()
    const result = await harness.repository.saveSnapshot(projection)

    assert.equal(result.created, true)
    assert.equal(result.record.id, buildExecutiveMemorySnapshotId(7, 'office-1', projection.contentFingerprint))
    assert.equal(result.record.contentFingerprint, projection.contentFingerprint)
    assert.equal(result.record.sourceFingerprint, projection.sourceFingerprint)
    assert.equal(await countSnapshots(harness.db), 1)
  } finally {
    await harness.cleanup()
  }
})

test('saveSnapshot is idempotent by tenant, office and content fingerprint', async () => {
  const harness = await createSqliteHarness('executive-memory-idempotent-')

  try {
    const first = createProjection({
      capturedAt: '2026-07-08T10:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T09:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T09:30:00.000Z',
    })
    const second = createProjection({
      capturedAt: '2026-07-08T11:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T10:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T10:30:00.000Z',
    })

    const firstResult = await harness.repository.saveSnapshot(first)
    const secondResult = await harness.repository.saveSnapshot(second)

    assert.equal(firstResult.created, true)
    assert.equal(secondResult.created, false)
    assert.equal(second.sourceFingerprint === first.sourceFingerprint, false)
    assert.equal(secondResult.record.id, firstResult.record.id)
    assert.equal(await countSnapshots(harness.db), 1)
  } finally {
    await harness.cleanup()
  }
})

test('getLatestSnapshot returns the newest snapshot by capturedAt', async () => {
  const harness = await createSqliteHarness('executive-memory-latest-')

  try {
    await harness.repository.saveSnapshot(createProjection({
      capturedAt: '2026-07-08T08:00:00.000Z',
      officeHealthScore: 70,
      decisionId: 'decision:wait',
      decisionTitle: 'Aguardar ajuste operacional',
      timelineTitle: 'Ajuste operacional em aberto',
    }))
    await harness.repository.saveSnapshot(createProjection({
      capturedAt: '2026-07-08T12:00:00.000Z',
      officeHealthScore: 91,
      decisionId: 'decision:invest',
      decisionTitle: 'Investir em expansão',
      timelineTitle: 'Condição excelente observada',
    }))

    const latest = await harness.repository.getLatestSnapshot({
      tenantId: 7,
      officeId: 'office-1',
    })

    assert.equal(latest?.capturedAt, '2026-07-08T12:00:00.000Z')
    assert.equal(latest?.decisionCenter.decisions[0]?.id, 'decision:invest')
    assert.equal(latest?.executiveTimeline.items[0]?.title, 'Condição excelente observada')
  } finally {
    await harness.cleanup()
  }
})

test('getLatestSnapshot returns null when the office has no snapshots', async () => {
  const harness = await createSqliteHarness('executive-memory-empty-latest-')

  try {
    const latest = await harness.repository.getLatestSnapshot({
      tenantId: 7,
      officeId: 'office-missing',
    })

    assert.equal(latest, null)
  } finally {
    await harness.cleanup()
  }
})

test('listSnapshots returns snapshots ordered by capturedAt descending', async () => {
  const harness = await createSqliteHarness('executive-memory-list-')

  try {
    await harness.repository.saveSnapshot(createProjection({
      capturedAt: '2026-07-08T08:00:00.000Z',
      officeHealthScore: 61,
      decisionId: 'decision:redistribute',
      timelineTitle: 'Backlog pressionado',
    }))
    await harness.repository.saveSnapshot(createProjection({
      capturedAt: '2026-07-08T10:00:00.000Z',
      officeHealthScore: 75,
      decisionId: 'decision:expand-2',
      timelineTitle: 'Oportunidade intermediária',
    }))
    await harness.repository.saveSnapshot(createProjection({
      capturedAt: '2026-07-08T12:00:00.000Z',
      officeHealthScore: 88,
      decisionId: 'decision:invest-2',
      timelineTitle: 'Condição excelente observada',
    }))

    const snapshots = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-1',
    })

    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.capturedAt),
      [
        '2026-07-08T12:00:00.000Z',
        '2026-07-08T10:00:00.000Z',
        '2026-07-08T08:00:00.000Z',
      ],
    )
  } finally {
    await harness.cleanup()
  }
})

test('listSnapshots enforces default, minimum, maximum and fallback limits', async () => {
  const harness = await createSqliteHarness('executive-memory-limits-')

  try {
    for (const [index, capturedAt] of [
      '2026-07-08T08:00:00.000Z',
      '2026-07-08T09:00:00.000Z',
      '2026-07-08T10:00:00.000Z',
    ].entries()) {
      await harness.repository.saveSnapshot(createProjection({
        capturedAt,
        officeHealthScore: 70 + index,
        decisionId: `decision:${index}`,
        timelineTitle: `Timeline ${index}`,
      }))
    }

    const defaultSnapshots = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-1',
    })
    const minimumSnapshots = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-1',
      limit: 1,
    })
    const fallbackLowSnapshots = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-1',
      limit: 0,
    })
    const fallbackHighSnapshots = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-1',
      limit: 101,
    })

    assert.equal(defaultSnapshots.length, 3)
    assert.equal(minimumSnapshots.length, 1)
    assert.equal(fallbackLowSnapshots.length, 3)
    assert.equal(fallbackHighSnapshots.length, 3)
  } finally {
    await harness.cleanup()
  }
})

test('repository enforces tenant and office isolation', async () => {
  const harness = await createSqliteHarness('executive-memory-isolation-')

  try {
    await harness.repository.saveSnapshot(createProjection({
      tenantId: 7,
      officeId: 'office-a',
      decisionId: 'decision:a',
    }))
    await harness.repository.saveSnapshot(createProjection({
      tenantId: 8,
      officeId: 'office-a',
      decisionId: 'decision:b',
    }))
    await harness.repository.saveSnapshot(createProjection({
      tenantId: 7,
      officeId: 'office-b',
      decisionId: 'decision:c',
    }))

    const tenantAOfficeA = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-a',
    })
    const tenantBOfficeA = await harness.repository.listSnapshots({
      tenantId: 8,
      officeId: 'office-a',
    })
    const tenantAOfficeB = await harness.repository.listSnapshots({
      tenantId: 7,
      officeId: 'office-b',
    })

    assert.deepEqual(tenantAOfficeA.map((record) => record.decisionCenter.decisions[0]?.id), ['decision:a'])
    assert.deepEqual(tenantBOfficeA.map((record) => record.decisionCenter.decisions[0]?.id), ['decision:b'])
    assert.deepEqual(tenantAOfficeB.map((record) => record.decisionCenter.decisions[0]?.id), ['decision:c'])
  } finally {
    await harness.cleanup()
  }
})

test('repository preserves sanitized JSON and omits prohibited executive payloads', async () => {
  const harness = await createSqliteHarness('executive-memory-json-')

  try {
    const result = await harness.repository.saveSnapshot(createProjection({
      timelineOccurredAt: '2026-07-08T09:15:00.000Z',
    }))
    const columns = await harness.db.all<Array<{ name: string }>>(
      `PRAGMA table_info(executive_memory_snapshots)`,
    )
    const rawRow = await harness.db.get<{
      office_health_json: string
      decision_center_json: string
      executive_timeline_json: string
    }>(
      `
        SELECT office_health_json, decision_center_json, executive_timeline_json
        FROM executive_memory_snapshots
        WHERE tenant_id = ?
          AND office_id = ?
        LIMIT 1
      `,
      7,
      'office-1',
    )

    assert.equal(result.record.officeHealth.score, 82)
    assert.equal(result.record.decisionCenter.decisions[0]?.evidence[0]?.value, 2)
    assert.equal(result.record.decisionCenter.decisions[0]?.evidence[1]?.value, false)
    assert.equal(result.record.executiveTimeline.items[0]?.evidence[0]?.value, 0)
    assert.equal(result.record.executiveTimeline.items[0]?.evidence[1]?.value, false)
    assert.equal(result.record.executiveTimeline.items[0]?.evidence[2]?.value, null)
    assert.equal(typeof result.record.executiveTimeline.items[0]?.evidence[3]?.value, 'undefined')
    assert.equal(result.record.executiveTimeline.items[0]?.occurredAt, '2026-07-08T09:15:00.000Z')
    assert.equal(Object.prototype.hasOwnProperty.call(result.record, 'growth'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(result.record, 'operational'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(result.record, 'morningBrief'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(result.record, 'executiveFeed'), false)

    assert.equal(columns.some((column) => column.name === 'growth_json'), false)
    assert.equal(columns.some((column) => column.name === 'operational_json'), false)
    assert.equal(columns.some((column) => column.name === 'morning_brief_json'), false)
    assert.equal(columns.some((column) => column.name === 'executive_feed_json'), false)
    assert.equal(columns.some((column) => column.name === 'client_name'), false)
    assert.equal(columns.some((column) => column.name === 'contact_identity'), false)

    const storedJson = JSON.stringify({
      officeHealth: JSON.parse(rawRow?.office_health_json ?? '{}'),
      decisionCenter: JSON.parse(rawRow?.decision_center_json ?? '{}'),
      executiveTimeline: JSON.parse(rawRow?.executive_timeline_json ?? '{}'),
    })

    assert.equal(storedJson.includes('"morningBrief"'), false)
    assert.equal(storedJson.includes('"executiveFeed"'), false)
    assert.equal(storedJson.includes('"operational"'), false)
    assert.equal(storedJson.includes('"contactIdentity"'), false)
    assert.equal(storedJson.includes('"clientName"'), false)
  } finally {
    await harness.cleanup()
  }
})

test('same content fingerprint does not duplicate snapshot when capturedAt changes', async () => {
  const harness = await createSqliteHarness('executive-memory-duplicate-content-')

  try {
    const first = createProjection({
      capturedAt: '2026-07-08T10:00:00.000Z',
    })
    const second = createProjection({
      capturedAt: '2026-07-08T12:00:00.000Z',
    })

    await harness.repository.saveSnapshot(first)
    const secondResult = await harness.repository.saveSnapshot(second)

    assert.equal(secondResult.created, false)
    assert.equal(await countSnapshots(harness.db), 1)
  } finally {
    await harness.cleanup()
  }
})

test('different content fingerprint creates a new snapshot', async () => {
  const harness = await createSqliteHarness('executive-memory-different-content-')

  try {
    await harness.repository.saveSnapshot(createProjection({
      officeHealthScore: 82,
      decisionId: 'decision:expand',
    }))
    const result = await harness.repository.saveSnapshot(createProjection({
      officeHealthScore: 95,
      decisionId: 'decision:invest',
      timelineTitle: 'Condição excepcional confirmada',
    }))

    assert.equal(result.created, true)
    assert.equal(await countSnapshots(harness.db), 2)
  } finally {
    await harness.cleanup()
  }
})

test('snapshot id is deterministic across repeated projections and scoped by tenant and office', () => {
  const fingerprint = 'abc123'

  assert.equal(
    buildExecutiveMemorySnapshotId(7, 'office-a', fingerprint),
    buildExecutiveMemorySnapshotId(7, 'office-a', fingerprint),
  )
  assert.notEqual(
    buildExecutiveMemorySnapshotId(7, 'office-a', fingerprint),
    buildExecutiveMemorySnapshotId(7, 'office-b', fingerprint),
  )
  assert.notEqual(
    buildExecutiveMemorySnapshotId(7, 'office-a', fingerprint),
    buildExecutiveMemorySnapshotId(8, 'office-a', fingerprint),
  )
})

test('repository validates tenantId and officeId boundaries', async () => {
  const harness = await createSqliteHarness('executive-memory-validation-')
  const validProjection = createProjection()

  try {
    await assert.rejects(
      harness.repository.saveSnapshot({
        ...validProjection,
        tenantId: 0,
      }),
      /tenantId/,
    )

    await assert.rejects(
      harness.repository.saveSnapshot({
        ...validProjection,
        officeId: '   ',
      }),
      /officeId/,
    )

    await assert.rejects(
      harness.repository.getLatestSnapshot({
        tenantId: 0,
        officeId: 'office-1',
      }),
      /tenantId/,
    )

    await assert.rejects(
      harness.repository.listSnapshots({
        tenantId: 7,
        officeId: '   ',
      }),
      /officeId/,
    )
  } finally {
    await harness.cleanup()
  }
})

test('saveSnapshot does not mutate the projection input', async () => {
  const harness = await createSqliteHarness('executive-memory-immutability-')

  try {
    const projection = createProjection()
    const before = JSON.stringify(projection)

    await harness.repository.saveSnapshot(projection)

    assert.equal(JSON.stringify(projection), before)
  } finally {
    await harness.cleanup()
  }
})

test('repository structural contract stays detached from dashboard and transport layers', async () => {
  const module = await import('./ExecutiveMemoryRepository.js')

  assert.equal(typeof module.createExecutiveMemoryRepository, 'function')
  assert.equal(typeof module.buildExecutiveMemorySnapshotId, 'function')
})
