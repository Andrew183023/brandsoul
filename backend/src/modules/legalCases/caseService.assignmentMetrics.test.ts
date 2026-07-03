import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { CaseService } from './caseService.js'

async function createTempSqliteDb(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  return {
    db,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

async function seedEntity(db: Awaited<ReturnType<typeof createDatabaseConnection>>, entityId: string, tenantId: number) {
  const now = '2026-06-29T10:00:00.000Z'
  await db.run(
    `
      INSERT INTO entity_profile (
        id,
        owner_id,
        owner_user_id,
        owner_tenant_id,
        created_at,
        updated_at,
        entity_profile
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    entityId,
    `user:100:tenant:${tenantId}`,
    100,
    tenantId,
    now,
    now,
    JSON.stringify({
      id: entityId,
      metadata: {
        businessConfig: {
          businessType: 'legal',
          officeName: 'Ana Rocha Advocacia',
        },
      },
    }),
  )
}

async function seedProfessional(args: {
  db: Awaited<ReturnType<typeof createDatabaseConnection>>
  tenantId: number
  officeId: string
  professionalId: string
  userId: number
}) {
  const now = '2026-06-29T10:10:00.000Z'
  await args.db.run(
    `
      INSERT INTO professionals (
        id,
        tenant_id,
        user_id,
        external_ref,
        kind,
        status,
        display_name,
        primary_email,
        primary_phone,
        metadata,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args.professionalId,
    args.tenantId,
    args.userId,
    null,
    'human',
    'active',
    `Profissional ${args.professionalId}`,
    `${args.professionalId}@exemplo.com`,
    '31999990000',
    JSON.stringify({
      officeId: args.officeId,
      isResponsible: true,
      isPublic: true,
    }),
    now,
    now,
  )
}

async function seedCase(args: {
  db: Awaited<ReturnType<typeof createDatabaseConnection>>
  tenantId: number
  entityId: string
  requestId: string
}) {
  const repository = createCaseRepository(args.db)
  return repository.createCase({
    tenantId: args.tenantId,
    entityId: args.entityId,
    requestId: args.requestId,
    title: 'Caso jurídico',
    description: 'Descrição inicial',
    status: 'open',
    priority: 'medium',
    practiceArea: 'Direito Civil',
    source: 'public-interaction',
    openedAt: '2026-06-29T10:20:00.000Z',
    metadata: {},
  })
}

function findSeriesKey(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metricName: string) {
  return Object.keys(snapshot.customCounterSeries).find((key) => key.startsWith(`${metricName}{`))
}

test('CaseService emits assignment created, accepted, rejected and expired metrics without sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-service-assignment-metrics-')
  const tenantId = 11
  const entityId = 'office-case-service-assignment-metrics-1'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, entityId, tenantId)
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId: entityId,
      professionalId: 'prof-assignment-created',
      userId: 100,
    })
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId: entityId,
      professionalId: 'prof-assignment-rejected',
      userId: 101,
    })
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId: entityId,
      professionalId: 'prof-assignment-expired',
      userId: 102,
    })

    const observability = createObservabilityService()
    const service = new CaseService(harness.db, createCaseRepository, observability)

    const acceptedCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'assignment-metrics-accepted',
    })
    const acceptedDispatch = await service.dispatchCase(
      tenantId,
      acceptedCase.id,
      'prof-assignment-created',
      'prof-assignment-created',
    )
    assert.ok(acceptedDispatch)
    const accepted = await service.acceptCase(tenantId, acceptedCase.id, 'prof-assignment-created')
    assert.equal(accepted.status, 'accepted')

    const rejectedCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'assignment-metrics-rejected',
    })
    const rejectedDispatch = await service.dispatchCase(
      tenantId,
      rejectedCase.id,
      'prof-assignment-rejected',
      'prof-assignment-rejected',
    )
    assert.ok(rejectedDispatch)
    const rejected = await service.rejectCase(tenantId, rejectedCase.id, 'prof-assignment-rejected')
    assert.equal(rejected.status, 'rejected')

    const expiredCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'assignment-metrics-expired',
    })
    const expiredDispatch = await service.dispatchCase(
      tenantId,
      expiredCase.id,
      'prof-assignment-expired',
      'prof-assignment-expired',
    )
    assert.ok(expiredDispatch)

    const expiredDispatchId = typeof expiredDispatch.assignment.metadata?.dispatchId === 'string'
      ? expiredDispatch.assignment.metadata.dispatchId
      : null
    assert.ok(expiredDispatchId)

    await (service as unknown as {
      handleDispatchTimeout(tenantId: number, caseId: string, dispatchId: string): Promise<void>
    }).handleDispatchTimeout(tenantId, expiredCase.id, expiredDispatchId)

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_assignment_created_total, 3)
    assert.equal(snapshot.customCounters.legal_assignment_accepted_total, 1)
    assert.equal(snapshot.customCounters.legal_assignment_rejected_total, 1)
    assert.equal(snapshot.customCounters.legal_assignment_expired_total, 1)

    const createdSeries = findSeriesKey(snapshot, 'legal_assignment_created_total')
    const acceptedSeries = findSeriesKey(snapshot, 'legal_assignment_accepted_total')
    const rejectedSeries = findSeriesKey(snapshot, 'legal_assignment_rejected_total')
    const expiredSeries = findSeriesKey(snapshot, 'legal_assignment_expired_total')

    assert.equal(
      createdSeries,
      'legal_assignment_created_total{entity_id=office-case-service-assignment-metrics-1,operation=assign,result=success,source=case_service,tenant_id=11}',
    )
    assert.equal(
      acceptedSeries,
      'legal_assignment_accepted_total{entity_id=office-case-service-assignment-metrics-1,operation=accept,result=success,source=case_service,tenant_id=11}',
    )
    assert.equal(
      rejectedSeries,
      'legal_assignment_rejected_total{entity_id=office-case-service-assignment-metrics-1,operation=reject,result=success,source=case_service,tenant_id=11}',
    )
    assert.equal(
      expiredSeries,
      'legal_assignment_expired_total{entity_id=office-case-service-assignment-metrics-1,operation=expire,result=success,source=case_service,tenant_id=11}',
    )

    for (const key of [createdSeries, acceptedSeries, rejectedSeries, expiredSeries]) {
      assert.equal(key?.includes(acceptedCase.id), false)
      assert.equal(key?.includes(rejectedCase.id), false)
      assert.equal(key?.includes(expiredCase.id), false)
      assert.equal(key?.includes('prof-assignment-created'), false)
      assert.equal(key?.includes('prof-assignment-rejected'), false)
      assert.equal(key?.includes('prof-assignment-expired'), false)
    }
  } finally {
    await harness.cleanup()
  }
})
