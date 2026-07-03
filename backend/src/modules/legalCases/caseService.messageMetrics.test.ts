import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { CaseService } from './caseService.js'
import type { AddCaseMessageInput, CaseRecord } from './caseTypes.js'

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
    metadata: {},
  })
}

function findSeriesKey(
  snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>,
  metricName: string,
) {
  return Object.keys(snapshot.customCounterSeries).find((key) => key.startsWith(`${metricName}{`))
}

test('CaseService emits inbound and outbound message metrics without sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-service-message-metrics-')
  const tenantId = 11
  const entityId = 'office-case-service-message-metrics-1'
  const professionalId = 'prof-message-1'

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

    const inboundCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'message-metrics-inbound',
      leadProfessionalId: professionalId,
    })
    await service.addMessage({
      tenantId,
      caseId: inboundCase.id,
      body: 'Cliente respondeu pelo portal.',
      direction: 'inbound',
    })

    const outboundCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'message-metrics-outbound',
      leadProfessionalId: professionalId,
    })
    await service.addMessage({
      tenantId,
      caseId: outboundCase.id,
      authorProfessionalId: professionalId,
      body: 'Escritório respondeu ao cliente.',
      direction: 'outbound',
    })

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_message_received_total, 1)
    assert.equal(snapshot.customCounters.legal_message_sent_total, 1)
    assert.equal(snapshot.customCounters.legal_message_failed_total ?? 0, 0)

    const inboundSeries = findSeriesKey(snapshot, 'legal_message_received_total')
    const outboundSeries = findSeriesKey(snapshot, 'legal_message_sent_total')

    assert.equal(
      inboundSeries,
      'legal_message_received_total{entity_id=office-case-service-message-metrics-1,operation=message_received,result=success,source=case_service,tenant_id=11}',
    )
    assert.equal(
      outboundSeries,
      'legal_message_sent_total{entity_id=office-case-service-message-metrics-1,operation=message_sent,result=success,source=professional,tenant_id=11}',
    )

    for (const key of [inboundSeries, outboundSeries]) {
      assert.equal(key?.includes(inboundCase.id), false)
      assert.equal(key?.includes(outboundCase.id), false)
      assert.equal(key?.includes(professionalId), false)
      assert.equal(key?.includes('Cliente respondeu pelo portal.'), false)
      assert.equal(key?.includes('Escritório respondeu ao cliente.'), false)
    }
  } finally {
    await harness.cleanup()
  }
})

test('CaseService emits failed message metric and does not emit success on persistence failure', async () => {
  const observability = createObservabilityService()
  const messageInput: AddCaseMessageInput = {
    tenantId: 22,
    caseId: 'case-failure',
    authorProfessionalId: 'prof-failure',
    body: 'Falha ao persistir.',
    direction: 'outbound',
  }

  const fakeDb = {
    async transaction<T>(callback: (tx: unknown) => Promise<T>) {
      return callback({})
    },
  }

  const fakeRepositoryFactory = () => ({
    async getCaseById() {
      return {
        id: 'case-failure',
        tenantId: 22,
        entityId: 'office-failure',
        status: 'open',
        priority: 'medium',
        title: 'Caso',
        centelhaContext: {},
        metadata: {},
        openedAt: '2026-06-29T10:20:00.000Z',
        createdAt: '2026-06-29T10:20:00.000Z',
        updatedAt: '2026-06-29T10:20:00.000Z',
      } satisfies Partial<CaseRecord> as CaseRecord
    },
    async addMessage() {
      throw new Error('write_failure')
    },
  })

  const service = new CaseService(fakeDb as never, fakeRepositoryFactory as never, observability)

  await assert.rejects(
    () => service.addMessage(messageInput),
    /write_failure/,
  )

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_message_received_total ?? 0, 0)
  assert.equal(snapshot.customCounters.legal_message_sent_total ?? 0, 0)
  assert.equal(snapshot.customCounters.legal_message_failed_total, 1)
  assert.equal(
    snapshot.customCounterSeries['legal_message_failed_total{entity_id=unknown,operation=message_sent,reason=write_failed,result=failed,source=professional,tenant_id=22}'],
    1,
  )
})

test('CaseService addMessage remains compatible without observability', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-service-message-no-observability-')
  const tenantId = 11
  const entityId = 'office-case-service-message-no-observability-1'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, entityId, tenantId)
    const service = new CaseService(harness.db)
    const legalCase = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'message-metrics-no-observability',
    })

    const message = await service.addMessage({
      tenantId,
      caseId: legalCase.id,
      body: 'Mensagem sem observability.',
      direction: 'inbound',
    })

    assert.equal(message.body, 'Mensagem sem observability.')
  } finally {
    await harness.cleanup()
  }
})
