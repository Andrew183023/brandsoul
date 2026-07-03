import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { createLegalBetaCaseService } from './legalBetaCaseService.js'
import { createLegalCanonicalCaseReadService } from './legalCanonicalCaseReadService.js'

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
  userId?: number
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
    args.userId ?? 100,
    null,
    'human',
    'active',
    'Dra. Ana Rocha',
    'ana@exemplo.com',
    '31999990000',
    JSON.stringify({
      officeId: args.officeId,
      isResponsible: true,
      isPublic: true,
    }),
    now,
    now,
  )

  await args.db.run(
    `
      INSERT INTO professional_profiles (
        id,
        tenant_id,
        professional_id,
        headline,
        bio,
        specialties,
        credentials,
        languages,
        availability,
        settings,
        metadata,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    `profile-${args.professionalId}`,
    args.tenantId,
    args.professionalId,
    'Advogada Trabalhista',
    'Atendimento inicial',
    JSON.stringify(['Direito Trabalhista']),
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify({}),
    JSON.stringify({}),
    JSON.stringify({
      oabCredential: 'OAB/MG 12345',
      photoUrl: '/assets/foto-ana.jpg',
      isResponsible: true,
    }),
    now,
    now,
  )
}

function createSovereignStub() {
  return {
    executeSemanticMutation: async () => {
      throw new Error('executeSemanticMutation should not be called in read tests')
    },
  } as never
}

test('legal beta case service keeps admin canonical projection aligned with the canonical read facade', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-case-service-admin-')
  const tenantId = 11
  const officeId = 'office-canonical-read-1'
  const professionalId = 'prof-canonical-read-1'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, officeId, tenantId)
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId,
      professionalId,
    })

    const repository = createCaseRepository(harness.db)
    const created = await repository.createCase({
      tenantId,
      entityId: officeId,
      requestId: 'canonical-read-request-1',
      title: 'Caso trabalhista',
      description: 'Descrição inicial',
      status: 'open',
      priority: 'high',
      practiceArea: 'Direito Trabalhista',
      source: 'public-interaction',
      leadProfessionalId: professionalId,
      openedAt: '2026-06-29T10:20:00.000Z',
      metadata: {
        publicTriage: {
          requestId: 'canonical-read-request-1',
          clientName: 'João Silva',
          contactValue: '31999998888',
          contactPreference: 'WhatsApp',
          city: 'Belo Horizonte',
        },
      },
    })

    await repository.addMessage({
      tenantId,
      caseId: created.id,
      authorProfessionalId: professionalId,
      body: 'Mensagem inicial do caso',
      direction: 'outbound',
      messageType: 'note',
      messageStatus: 'sent',
      sentAt: '2026-06-29T10:21:00.000Z',
    })

    await repository.addTimelineEvent({
      tenantId,
      caseId: created.id,
      eventType: 'created',
      actorProfessionalId: professionalId,
      payload: {
        requestId: 'canonical-read-request-1',
      },
    })

    const service = createLegalBetaCaseService(harness.db, createSovereignStub())
    const canonicalReadService = createLegalCanonicalCaseReadService(harness.db)
    const expectedCanonical = await canonicalReadService.getCanonicalCase({
      tenantId,
      caseId: created.id,
    })

    const detail = await service.getCaseById(tenantId, created.id)
    assert.ok(detail)
    assert.deepEqual(detail.canonical, expectedCanonical)

    const list = await service.listCasesByEntity(tenantId, officeId)
    assert.equal(list.length, 1)
    assert.deepEqual(list[0]?.canonical, expectedCanonical)
  } finally {
    await harness.cleanup()
  }
})

test('legal beta case service keeps portal canonical messages and timeline compatible with the canonical read facade', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-case-service-portal-')
  const tenantId = 11
  const officeId = 'office-canonical-read-2'
  const professionalId = 'prof-canonical-read-2'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, officeId, tenantId)
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId,
      professionalId,
    })

    const repository = createCaseRepository(harness.db)
    const created = await repository.createCase({
      tenantId,
      entityId: officeId,
      requestId: 'canonical-read-request-2',
      title: 'Caso previdenciário',
      description: 'Descrição inicial',
      status: 'open',
      priority: 'medium',
      practiceArea: 'Direito Previdenciário',
      source: 'public-interaction',
      leadProfessionalId: professionalId,
      openedAt: '2026-06-29T10:30:00.000Z',
      metadata: {
        publicTriage: {
          requestId: 'canonical-read-request-2',
          clientName: 'Maria Souza',
          contactValue: 'maria@exemplo.com',
          contactPreference: 'Email',
          city: 'São Paulo',
        },
      },
    })

    await repository.addMessage({
      tenantId,
      caseId: created.id,
      authorProfessionalId: professionalId,
      body: 'Primeira resposta do escritório',
      direction: 'outbound',
      messageType: 'note',
      messageStatus: 'sent',
      sentAt: '2026-06-29T10:31:00.000Z',
    })

    await repository.addTimelineEvent({
      tenantId,
      caseId: created.id,
      eventType: 'created',
      actorProfessionalId: professionalId,
      payload: {
        requestId: 'canonical-read-request-2',
      },
    })

    const service = createLegalBetaCaseService(harness.db, createSovereignStub())
    const canonicalReadService = createLegalCanonicalCaseReadService(harness.db)
    const expectedCanonical = await canonicalReadService.getCanonicalCase({
      tenantId,
      caseId: created.id,
    })

    const portalCase = await service.getClientPortalCase({
      tenantId,
      caseId: created.id,
    })

    assert.ok(portalCase)
    assert.deepEqual(portalCase._messages, expectedCanonical?.case.messages ?? [])
    assert.deepEqual(portalCase.canonical.case.messages, expectedCanonical?.case.messages ?? [])
    assert.equal(portalCase.canonical.case.responsibleProfessional?.id, expectedCanonical?.case.responsibleProfessional?.id)
    assert.equal(portalCase.timeline.length, expectedCanonical?.case.timeline.length ?? 0)
  } finally {
    await harness.cleanup()
  }
})

test('legal beta case service emits assignment created and reassigned metrics without sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-case-service-assignment-metrics-')
  const tenantId = 11
  const officeId = 'office-assignment-metrics-1'
  const firstProfessionalId = 'prof-assignment-1'
  const secondProfessionalId = 'prof-assignment-2'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, officeId, tenantId)
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId,
      professionalId: firstProfessionalId,
      userId: 100,
    })
    await seedProfessional({
      db: harness.db,
      tenantId,
      officeId,
      professionalId: secondProfessionalId,
      userId: 101,
    })

    const repository = createCaseRepository(harness.db)
    const created = await repository.createCase({
      tenantId,
      entityId: officeId,
      requestId: 'assignment-metrics-request-1',
      title: 'Caso administrativo',
      description: 'Descrição inicial',
      status: 'open',
      priority: 'medium',
      practiceArea: 'Direito Administrativo',
      source: 'public-interaction',
      openedAt: '2026-06-29T11:00:00.000Z',
      metadata: {},
    })

    const observability = createObservabilityService()
    const service = createLegalBetaCaseService(harness.db, createSovereignStub(), {
      observability,
    })

    const assigned = await service.assign({
      tenantId,
      caseId: created.id,
      professionalId: firstProfessionalId,
      assignedByProfessionalId: firstProfessionalId,
    })
    assert.equal(assigned.status, 'assigned')

    const reassigned = await service.assign({
      tenantId,
      caseId: created.id,
      professionalId: secondProfessionalId,
      assignedByProfessionalId: firstProfessionalId,
    })
    assert.equal(reassigned.status, 'assigned')

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_assignment_created_total, 1)
    assert.equal(snapshot.customCounters.legal_assignment_reassigned_total, 1)

    const createdSeries = Object.keys(snapshot.customCounterSeries)
      .find((key) => key.startsWith('legal_assignment_created_total{'))
    const reassignedSeries = Object.keys(snapshot.customCounterSeries)
      .find((key) => key.startsWith('legal_assignment_reassigned_total{'))

    assert.equal(
      createdSeries,
      'legal_assignment_created_total{entity_id=office-assignment-metrics-1,operation=assign,result=success,source=legal_beta_case_service,tenant_id=11}',
    )
    assert.equal(
      reassignedSeries,
      'legal_assignment_reassigned_total{entity_id=office-assignment-metrics-1,operation=reassign,result=success,source=legal_beta_case_service,tenant_id=11}',
    )
    assert.equal(createdSeries?.includes(created.id), false)
    assert.equal(reassignedSeries?.includes(firstProfessionalId), false)
    assert.equal(reassignedSeries?.includes(secondProfessionalId), false)
  } finally {
    await harness.cleanup()
  }
})

test('legal beta case service emits client portal inbound message metric without sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-case-service-message-metrics-')
  const tenantId = 11
  const officeId = 'office-message-metrics-1'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, officeId, tenantId)

    const repository = createCaseRepository(harness.db)
    const created = await repository.createCase({
      tenantId,
      entityId: officeId,
      requestId: 'beta-message-metrics-request-1',
      title: 'Caso portal',
      description: 'Descrição inicial',
      status: 'open',
      priority: 'medium',
      practiceArea: 'Direito Civil',
      source: 'public-interaction',
      openedAt: '2026-06-29T11:20:00.000Z',
      metadata: {},
    })

    const observability = createObservabilityService()
    const service = createLegalBetaCaseService(harness.db, createSovereignStub(), {
      observability,
    })

    const result = await service.addMessage({
      tenantId,
      caseId: created.id,
      body: 'Cliente respondeu pelo portal beta.',
      direction: 'inbound',
    })

    assert.equal(result.status, 'ready')
    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_message_received_total, 1)
    const seriesKey = Object.keys(snapshot.customCounterSeries)
      .find((key) => key.startsWith('legal_message_received_total{'))

    assert.equal(
      seriesKey,
      'legal_message_received_total{entity_id=office-message-metrics-1,operation=message_received,result=success,source=client_portal,tenant_id=11}',
    )
    assert.equal(seriesKey?.includes(created.id), false)
    assert.equal(seriesKey?.includes('Cliente respondeu pelo portal beta.'), false)
  } finally {
    await harness.cleanup()
  }
})
