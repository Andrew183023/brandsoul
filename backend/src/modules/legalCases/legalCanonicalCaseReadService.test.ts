import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { buildLegalCaseIdentity } from './legalCanonicalIdentity.js'
import { buildCanonicalCaseProjection } from './legalCanonicalProjection.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import {
  createLegalCanonicalCaseReadService,
  type AdminCanonicalCaseProjection,
} from './legalCanonicalCaseReadService.js'

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
    100,
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

async function buildDirectProjection(args: {
  tenantId: number
  caseId: string
  db: Awaited<ReturnType<typeof createDatabaseConnection>>
}) {
  const repository = createCaseRepository(args.db)
  const caseRecord = await repository.getCaseById(args.tenantId, args.caseId)
  assert.ok(caseRecord)
  const [messages, timeline, professionals] = await Promise.all([
    repository.listMessages(args.tenantId, args.caseId),
    repository.listTimelineEvents(args.tenantId, args.caseId),
    repository.listDetailedProfessionalsForTenant(args.tenantId),
  ])
  const responsibleProfessional = professionals.find((professional) => professional.id === caseRecord.leadProfessionalId) ?? null
  const lastInteractionAt = messages[messages.length - 1]?.createdAt
    ?? timeline[timeline.length - 1]?.occurredAt
    ?? caseRecord.updatedAt

  return buildCanonicalCaseProjection({
    ...buildLegalCaseIdentity({
      caseRecord,
      responsibleProfessional,
      lastInteractionAt,
    }),
    timeline,
    messages,
  })
}

function createFailingDb() {
  return {
    async get() {
      throw new Error('unexpected_db_failure')
    },
    async all() {
      throw new Error('unexpected_db_failure')
    },
    async run() {
      throw new Error('unexpected_db_failure')
    },
  }
}

test('canonical case read facade returns null for a missing case', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-case-read-missing-')

  try {
    await initializeDatabase(harness.db)
    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const service = createLegalCanonicalCaseReadService(harness.db, recorder)
    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: 'missing-case',
    })

    assert.equal(projection, null)
    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_canonical_read_total, 2)
    assert.equal(
      snapshot.customCounterSeries['legal_canonical_read_total{entity_id=unknown,pipeline=canonical_case_read,reason=case_not_found,result=not_found,stage=complete,tenant_id=11}'],
      1,
    )
    assert.equal(
      snapshot.customCounterSeries['legal_canonical_read_total{entity_id=unknown,pipeline=canonical_case_read,result=started,stage=start,tenant_id=11}'],
      1,
    )
    assert.ok(snapshot.customTimings['legal_canonical_read_duration_ms{entity_id=unknown,pipeline=canonical_case_read,result=not_found,tenant_id=11}'])
  } finally {
    await harness.cleanup()
  }
})

test('canonical case read facade returns the current canonical projection with messages, timeline and responsible professional preserved', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-case-read-existing-')
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

    const message = await repository.addMessage({
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

    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const service = createLegalCanonicalCaseReadService(harness.db, recorder)
    const projection = await service.getCanonicalCase({
      tenantId,
      caseId: created.id,
      entity: null,
    })

    assert.ok(projection)
    assert.equal(projection.case.caseId, created.id)
    assert.equal(projection.case.messages.length, 1)
    assert.equal(projection.case.messages[0]?.id, message.id)
    assert.equal(projection.case.timeline.length, 1)
    assert.equal(projection.case.timeline[0]?.eventType, 'created')
    assert.equal(projection.case.responsibleProfessional?.id, professionalId)
    assert.equal(projection.case.responsibleProfessional?.displayName, 'Dra. Ana Rocha')

    const directProjection = await buildDirectProjection({
      tenantId,
      caseId: created.id,
      db: harness.db,
    })

    assert.deepEqual(projection as AdminCanonicalCaseProjection, directProjection)

    const messages = await service.getCanonicalMessages({
      tenantId,
      caseId: created.id,
    })
    const timeline = await service.getCanonicalTimeline({
      tenantId,
      caseId: created.id,
    })

    assert.equal(messages.length, 1)
    assert.equal(timeline.length, 1)

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_canonical_read_total, 2)
    assert.equal(snapshot.customCounters.legal_canonical_read_failed_total ?? 0, 0)
    assert.equal(
      snapshot.customCounterSeries['legal_canonical_read_total{entity_id=office-canonical-read-1,pipeline=canonical_case_read,result=success,stage=complete,tenant_id=11}'],
      1,
    )
    assert.equal(
      snapshot.customCounterSeries['legal_canonical_read_total{entity_id=unknown,pipeline=canonical_case_read,result=started,stage=start,tenant_id=11}'],
      1,
    )
    assert.ok(snapshot.customTimings['legal_canonical_read_duration_ms{entity_id=office-canonical-read-1,pipeline=canonical_case_read,result=success,tenant_id=11}'])
  } finally {
    await harness.cleanup()
  }
})

test('canonical case read facade records failed reads and timing while preserving the thrown error', async () => {
  const observability = createObservabilityService()
  const recorder = new LegalMetricsRecorder(observability)
  const service = createLegalCanonicalCaseReadService(createFailingDb() as never, recorder)

  await assert.rejects(
    () => service.getCanonicalCase({
      tenantId: 55,
      caseId: 'case-failing',
    }),
    /unexpected_db_failure/,
  )

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_canonical_read_total, 1)
  assert.equal(snapshot.customCounters.legal_canonical_read_failed_total, 1)
  assert.equal(
    snapshot.customCounterSeries['legal_canonical_read_total{entity_id=unknown,pipeline=canonical_case_read,result=started,stage=start,tenant_id=55}'],
    1,
  )
  assert.equal(
    snapshot.customCounterSeries['legal_canonical_read_failed_total{entity_id=unknown,pipeline=canonical_case_read,reason=exception,result=failed,stage=failed,tenant_id=55}'],
    1,
  )
  assert.ok(snapshot.customTimings['legal_canonical_read_duration_ms{entity_id=unknown,pipeline=canonical_case_read,result=failed,tenant_id=55}'])
})

test('canonical case read facade remains compatible without recorder', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-case-read-no-recorder-')

  try {
    await initializeDatabase(harness.db)
    const service = createLegalCanonicalCaseReadService(harness.db)
    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: 'missing-case',
    })

    assert.equal(projection, null)
  } finally {
    await harness.cleanup()
  }
})
