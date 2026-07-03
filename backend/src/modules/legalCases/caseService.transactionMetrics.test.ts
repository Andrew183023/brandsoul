import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { CaseService } from './caseService.js'

test('CaseService createCase emits transaction failure and rollback metrics on persistence exception', async () => {
  const observability = createObservabilityService()
  const db = {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
  }
  const repositoryFactory = () => ({
    db,
    createCase: async () => {
      throw new Error('create failed')
    },
  })
  const service = new CaseService(db as never, repositoryFactory as never, observability)

  await assert.rejects(
    () => service.createCase({
      tenantId: 11,
      entityId: 'office-transaction-metrics-1',
      requestId: 'transaction-create-case-failure',
      title: 'Caso com falha',
      description: 'Descrição',
      status: 'open',
      priority: 'medium',
      practiceArea: 'Direito Civil',
      source: 'public-interaction',
      openedAt: '2026-07-02T10:00:00.000Z',
      metadata: {},
    }),
  )

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_transaction_failures_total, 1)
  assert.equal(snapshot.customCounters.legal_transaction_rollbacks_total, 1)
  assert.equal(
    snapshot.customCounterSeries['legal_transaction_failures_total{entity_id=office-transaction-metrics-1,operation=create_case,reason=exception,result=failed,source=case_service,stage=transaction,tenant_id=11}'],
    1,
  )
  assert.equal(
    snapshot.customCounterSeries['legal_transaction_rollbacks_total{entity_id=office-transaction-metrics-1,operation=create_case,reason=exception,result=failed,source=case_service,stage=rollback,tenant_id=11}'],
    1,
  )
})

test('CaseService addMessage emits transaction failure and rollback metrics on persistence exception', async () => {
  const observability = createObservabilityService()
  const db = {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
  }
  const repositoryFactory = () => ({
    getCaseById: async () => ({
      id: 'case-1',
      tenantId: 11,
      entityId: 'office-transaction-metrics-1',
      leadProfessionalId: null,
      status: 'open',
    }),
    addMessage: async () => {
      throw new Error('message failed')
    },
  })
  const service = new CaseService(db as never, repositoryFactory as never, observability)

  await assert.rejects(
    () => service.addMessage({
      tenantId: 11,
      caseId: 'case-1',
      body: 'Mensagem com falha',
      direction: 'inbound',
    } as never),
  )

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_transaction_failures_total, 1)
  assert.equal(snapshot.customCounters.legal_transaction_rollbacks_total, 1)
  assert.equal(
    snapshot.customCounterSeries['legal_transaction_failures_total{entity_id=unknown,operation=add_message,reason=exception,result=failed,source=case_service,stage=transaction,tenant_id=11}'],
    1,
  )
  assert.equal(
    snapshot.customCounterSeries['legal_transaction_rollbacks_total{entity_id=unknown,operation=add_message,reason=exception,result=failed,source=case_service,stage=rollback,tenant_id=11}'],
    1,
  )
})

test('CaseService addMessage does not emit transaction metrics for operational not_found', async () => {
  const observability = createObservabilityService()
  const db = {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
  }
  const repositoryFactory = () => ({
    getCaseById: async () => null,
  })
  const service = new CaseService(db as never, repositoryFactory as never, observability)

  await assert.rejects(
    () => service.addMessage({
      tenantId: 11,
      caseId: 'missing-case',
      body: 'Mensagem inexistente',
      direction: 'inbound',
    } as never),
  )

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_transaction_failures_total ?? 0, 0)
  assert.equal(snapshot.customCounters.legal_transaction_rollbacks_total ?? 0, 0)
})
