import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { CaseService } from './caseService.js'
import type { CaseRecord, JsonObject } from './caseTypes.js'

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
  leadProfessionalId?: string
  status?: CaseRecord['status']
  metadata?: JsonObject
}) {
  const repository = createCaseRepository(args.db)
  return repository.createCase({
    tenantId: args.tenantId,
    entityId: args.entityId,
    requestId: args.requestId,
    title: 'Caso jurídico',
    description: 'Descrição inicial',
    status: args.status ?? 'open',
    priority: 'medium',
    practiceArea: 'Direito Civil',
    source: 'public-interaction',
    leadProfessionalId: args.leadProfessionalId,
    openedAt: '2026-06-29T10:20:00.000Z',
    metadata: args.metadata ?? {},
  })
}

test('CaseService emits created, status changed and closed lifecycle metrics without sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-service-lifecycle-metrics-')
  const tenantId = 11
  const entityId = 'office-case-service-lifecycle-metrics-1'
  const professionalId = 'prof-lifecycle-1'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, entityId, tenantId)
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId: entityId,
      professionalId,
      userId: 100,
    })

    const observability = createObservabilityService()
    const service = new CaseService(harness.db, createCaseRepository, observability)

    const createdCase = await service.createCase({
      tenantId,
      entityId,
      requestId: 'lifecycle-created',
      title: 'Novo caso',
      description: 'Descrição do caso',
      status: 'open',
      priority: 'high',
      practiceArea: 'Direito Civil',
      source: 'public-interaction',
      openedAt: '2026-06-29T10:25:00.000Z',
      metadata: {},
    })
    assert.ok(createdCase.id)

    const acceptedCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'lifecycle-message-progression',
      leadProfessionalId: professionalId,
      status: 'accepted',
    })
    await service.addMessage({
      tenantId,
      caseId: acceptedCase.id,
      body: 'Cliente respondeu.',
      direction: 'inbound',
    })

    const transitionCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'lifecycle-transition',
      leadProfessionalId: professionalId,
      status: 'in_progress',
    })
    const transitioned = await service.transitionCaseStatus({
      tenantId,
      caseId: transitionCase.id,
      status: 'on_hold',
      reason: 'manual',
      actorProfessionalId: professionalId,
    })
    assert.equal(transitioned.status, 'updated')

    const closableCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'lifecycle-close',
      leadProfessionalId: professionalId,
      status: 'resolved',
    })
    const closed = await service.closeCase({
      tenantId,
      caseId: closableCase.id,
      resolutionReason: 'Atendimento concluído.',
      actorProfessionalId: professionalId,
    })
    assert.equal(closed.status, 'closed')

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_case_created_total, 1)
    assert.equal(snapshot.customCounters.legal_case_status_changed_total, 3)
    assert.equal(snapshot.customCounters.legal_case_closed_total, 1)

    const lifecycleSeries = Object.keys(snapshot.customCounterSeries).filter((key) => key.startsWith('legal_case_'))
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_created_total{entity_id=office-case-service-lifecycle-metrics-1,operation=case_created,result=success,source=case_service,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-case-service-lifecycle-metrics-1,operation=status_changed,reason=message_progression,result=success,source=case_service,status=in_progress,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-case-service-lifecycle-metrics-1,operation=status_changed,reason=manual,result=success,source=case_service,status=on_hold,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-case-service-lifecycle-metrics-1,operation=status_changed,reason=close,result=success,source=case_service,status=closed,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_closed_total{entity_id=office-case-service-lifecycle-metrics-1,operation=case_closed,reason=resolution,result=success,source=case_service,status=closed,tenant_id=11}',
      ),
      true,
    )

    for (const key of lifecycleSeries) {
      assert.equal(key.includes(createdCase.id), false)
      assert.equal(key.includes(acceptedCase.id), false)
      assert.equal(key.includes(transitionCase.id), false)
      assert.equal(key.includes(closableCase.id), false)
      assert.equal(key.includes(professionalId), false)
      assert.equal(key.includes('Cliente respondeu.'), false)
    }
  } finally {
    await harness.cleanup()
  }
})
