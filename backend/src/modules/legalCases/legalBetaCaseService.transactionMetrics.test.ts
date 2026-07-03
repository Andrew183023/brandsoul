import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { createLegalBetaCaseService, LegalBetaCaseService } from './legalBetaCaseService.js'

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
  const now = '2026-07-02T10:00:00.000Z'
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

function createSovereignFailureStub() {
  return {
    async submitPortfolioPublicTriageCaptureInTransaction() {
      throw new Error('public triage capture failed')
    },
  } as never
}

function buildPublicTriageArgs(requestId: string) {
  return {
    entityId: 'office-transaction-public-triage-1',
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

test('LegalBetaCaseService addMessage emits transaction failure and rollback metrics on persistence exception', async () => {
  const observability = createObservabilityService()
  const fakeTx = {
    dialect: 'sqlite',
    get: async (sql: string) => {
      if (sql.includes('FROM cases')) {
        return {
          id: 'case-1',
          tenant_id: 11,
          entity_id: 'office-transaction-legal-beta-1',
          status: 'open',
          lead_professional_id: null,
          metadata: '{}',
          created_at: '2026-07-02T10:00:00.000Z',
          updated_at: '2026-07-02T10:00:00.000Z',
          title: 'Caso',
          description: 'Descrição',
          priority: 'medium',
          practice_area: 'Direito Civil',
          source: 'public-interaction',
          request_id: 'request-1',
          opened_at: '2026-07-02T10:00:00.000Z',
        }
      }
      return null
    },
    all: async () => [],
    run: async (sql: string) => {
      if (sql.includes('INSERT INTO case_messages')) {
        throw new Error('message insert failed')
      }
      return { changes: 1, lastID: 1 }
    },
  }
  const db = {
    dialect: 'sqlite',
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(fakeTx),
  }
  const service = new LegalBetaCaseService(
    db as never,
    createSovereignFailureStub(),
    observability,
  )

  await assert.rejects(
    () => service.addMessage({
      tenantId: 11,
      caseId: 'case-1',
      body: 'Mensagem com falha',
      direction: 'inbound',
    }),
  )

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_transaction_failures_total, 1)
  assert.equal(snapshot.customCounters.legal_transaction_rollbacks_total, 1)
  assert.equal(
    snapshot.customCounterSeries['legal_transaction_failures_total{entity_id=unknown,operation=add_message,reason=exception,result=failed,source=legal_beta_case_service,stage=transaction,tenant_id=11}'],
    1,
  )
  assert.equal(
    snapshot.customCounterSeries['legal_transaction_rollbacks_total{entity_id=unknown,operation=add_message,reason=exception,result=failed,source=legal_beta_case_service,stage=rollback,tenant_id=11}'],
    1,
  )
})

test('LegalBetaCaseService createPublicTriageCase emits transaction failure and rollback metrics on transactional exception', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-transaction-public-triage-')

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, 'office-transaction-public-triage-1', 11)

    const observability = createObservabilityService()
    const service = createLegalBetaCaseService(harness.db, createSovereignFailureStub(), {
      observability,
    })

    await assert.rejects(
      () => service.createPublicTriageCase(buildPublicTriageArgs('public-triage-transaction-failure')),
    )

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_transaction_failures_total, 1)
    assert.equal(snapshot.customCounters.legal_transaction_rollbacks_total, 1)
    assert.equal(
      snapshot.customCounterSeries['legal_transaction_failures_total{entity_id=office-transaction-public-triage-1,operation=public_triage,reason=exception,result=failed,source=public_triage,stage=transaction,tenant_id=11}'],
      1,
    )
    assert.equal(
      snapshot.customCounterSeries['legal_transaction_rollbacks_total{entity_id=office-transaction-public-triage-1,operation=public_triage,reason=exception,result=failed,source=public_triage,stage=rollback,tenant_id=11}'],
      1,
    )
  } finally {
    await harness.cleanup()
  }
})

test('LegalBetaCaseService addMessage closed path does not emit transaction metrics', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-beta-transaction-closed-')

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, 'office-transaction-public-triage-1', 11)
    const repository = createCaseRepository(harness.db)
    const caseRecord = await repository.createCase({
      tenantId: 11,
      entityId: 'office-transaction-public-triage-1',
      requestId: 'closed-case-message',
      title: 'Caso fechado',
      description: 'Descrição',
      status: 'closed',
      priority: 'medium',
      practiceArea: 'Direito Civil',
      source: 'public-interaction',
      openedAt: '2026-07-02T10:00:00.000Z',
      metadata: {},
    })

    const observability = createObservabilityService()
    const service = createLegalBetaCaseService(harness.db, createSovereignFailureStub(), {
      observability,
    })

    const result = await service.addMessage({
      tenantId: 11,
      caseId: caseRecord.id,
      body: 'Mensagem bloqueada',
      direction: 'inbound',
    })

    assert.equal(result.status, 'closed')
    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_transaction_failures_total ?? 0, 0)
    assert.equal(snapshot.customCounters.legal_transaction_rollbacks_total ?? 0, 0)
  } finally {
    await harness.cleanup()
  }
})
