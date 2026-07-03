import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { createLegalBetaCaseService } from './legalBetaCaseService.js'
import type { CaseRecord } from './caseTypes.js'

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
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    leadProfessionalId: args.leadProfessionalId,
    openedAt: '2026-06-29T10:20:00.000Z',
    metadata: {},
  })
}

function createSovereignStub() {
  let sequence = 0

  return {
    async submitPortfolioPublicTriageCaptureInTransaction() {
      sequence += 1
      return {
        signalId: `signal-${sequence}`,
        leadId: `lead-${sequence}`,
        intakeId: `intake-${sequence}`,
      }
    },
  } as never
}

function buildPublicTriageArgs(requestId: string) {
  return {
    entityId: 'office-legal-beta-lifecycle-1',
    requestId,
    userMessage: 'Fui demitido sem receber verbas rescisórias.',
    businessContext: {
      officeName: 'Ana Rocha Advocacia',
    },
    triage: {
      clientName: 'João da Silva',
      city: 'Belo Horizonte',
      practiceArea: 'Direito Trabalhista',
      context: 'Fui demitido sem receber verbas rescisórias.',
      urgency: 'planned' as const,
      objective: 'Entender meus direitos e próximos passos.',
      contactPreference: 'WhatsApp',
      contactValue: '31999998888',
    },
  }
}

test('LegalBetaCaseService emits created and reused lifecycle metrics for public triage without sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-lifecycle-public-')
  const tenantId = 11
  const entityId = 'office-legal-beta-lifecycle-1'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, entityId, tenantId)

    const observability = createObservabilityService()
    const service = createLegalBetaCaseService(harness.db, createSovereignStub(), {
      observability,
    })

    const created = await service.createPublicTriageCase(buildPublicTriageArgs('public-lifecycle-a'))
    const replayed = await service.createPublicTriageCase(buildPublicTriageArgs('public-lifecycle-a'))
    const reused = await service.createPublicTriageCase(buildPublicTriageArgs('public-lifecycle-b'))

    assert.ok(created)
    assert.ok(replayed)
    assert.ok(reused)
    const createdCaseId = created.caseRecord.id

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_case_created_total, 1)
    assert.equal(snapshot.customCounters.legal_case_reused_total, 2)

    const lifecycleSeries = Object.keys(snapshot.customCounterSeries).filter((key) => key.startsWith('legal_case_'))
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_created_total{entity_id=office-legal-beta-lifecycle-1,operation=case_created,result=success,source=public_triage,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_reused_total{entity_id=office-legal-beta-lifecycle-1,operation=case_reused,reason=request_replay,result=success,source=public_triage,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_reused_total{entity_id=office-legal-beta-lifecycle-1,operation=case_reused,reason=fingerprint_hit,result=success,source=public_triage,tenant_id=11}',
      ),
      true,
    )

    for (const key of lifecycleSeries) {
      assert.equal(key.includes(createdCaseId), false)
      assert.equal(key.includes('public-lifecycle-a'), false)
      assert.equal(key.includes('public-lifecycle-b'), false)
      assert.equal(key.includes('João da Silva'), false)
      assert.equal(key.includes('31999998888'), false)
    }
  } finally {
    await harness.cleanup()
  }
})

test('LegalBetaCaseService emits status changed and closed lifecycle metrics for administrative flow', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-lifecycle-admin-')
  const tenantId = 11
  const entityId = 'office-legal-beta-lifecycle-2'
  const professionalId = 'prof-legal-beta-lifecycle-1'

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
    const service = createLegalBetaCaseService(harness.db, createSovereignStub(), {
      observability,
    })
    const caseRecord = await seedCase({
      db: harness.db,
      tenantId,
      entityId,
      requestId: 'admin-lifecycle-a',
      status: 'open',
    })

    const assigned = await service.assign({
      tenantId,
      caseId: caseRecord.id,
      professionalId,
      assignedByProfessionalId: professionalId,
    })
    assert.equal(assigned.status, 'assigned')

    const accepted = await service.updateStatus({
      tenantId,
      caseId: caseRecord.id,
      status: 'accepted',
      reason: 'manual',
    })
    assert.equal(accepted.status, 'ready')

    const inProgress = await service.updateStatus({
      tenantId,
      caseId: caseRecord.id,
      status: 'in_progress',
      reason: 'manual',
    })
    assert.equal(inProgress.status, 'ready')

    const resolved = await service.updateStatus({
      tenantId,
      caseId: caseRecord.id,
      status: 'resolved',
      reason: 'manual',
    })
    assert.equal(resolved.status, 'ready')

    const closed = await service.close({
      tenantId,
      caseId: caseRecord.id,
      rating: 5,
      feedback: 'Tudo resolvido.',
      closedBy: professionalId,
    })
    assert.equal(closed.status, 'closed')

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_case_status_changed_total, 5)
    assert.equal(snapshot.customCounters.legal_case_closed_total, 1)

    const lifecycleSeries = Object.keys(snapshot.customCounterSeries).filter((key) => key.startsWith('legal_case_'))
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-legal-beta-lifecycle-2,operation=status_changed,reason=assignment,result=success,source=legal_beta_case_service,status=dispatched,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-legal-beta-lifecycle-2,operation=status_changed,reason=manual,result=success,source=legal_beta_case_service,status=accepted,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-legal-beta-lifecycle-2,operation=status_changed,reason=manual,result=success,source=legal_beta_case_service,status=in_progress,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-legal-beta-lifecycle-2,operation=status_changed,reason=manual,result=success,source=legal_beta_case_service,status=resolved,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_status_changed_total{entity_id=office-legal-beta-lifecycle-2,operation=status_changed,reason=close,result=success,source=legal_beta_case_service,status=closed,tenant_id=11}',
      ),
      true,
    )
    assert.equal(
      lifecycleSeries.includes(
        'legal_case_closed_total{entity_id=office-legal-beta-lifecycle-2,operation=case_closed,reason=resolution,result=success,source=legal_beta_case_service,status=closed,tenant_id=11}',
      ),
      true,
    )

    for (const key of lifecycleSeries) {
      assert.equal(key.includes(caseRecord.id), false)
      assert.equal(key.includes(professionalId), false)
      assert.equal(key.includes('Tudo resolvido.'), false)
    }
  } finally {
    await harness.cleanup()
  }
})
