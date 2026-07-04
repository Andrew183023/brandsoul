import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCaseCreatedSignals, sanitizeSignalPayload } from './signalBuilders.js'
import { createLegalSignalsEngine } from './signalEngine.js'
import { createInMemoryLegalSignalRepository } from './signalRepository.js'

test('created case generates NEW_DEMAND', () => {
  const engine = createLegalSignalsEngine()

  const signals = engine.build({
    eventType: 'case_created',
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-1',
    occurredAt: '2026-07-03T10:00:00.000Z',
    practiceArea: 'family_law',
    regionCode: 'br-mg',
    specialtyCode: 'divorce',
  })

  assert.equal(signals.length, 1)
  assert.equal(signals[0]?.signalType, 'NEW_DEMAND')
  assert.equal(signals[0]?.source, 'CASE_CREATED')
  assert.equal(signals[0]?.payload.practiceArea, 'family_law')
})

test('assignment generates CASE_ASSIGNED and WORKLOAD_CHANGED', () => {
  const engine = createLegalSignalsEngine()

  const signals = engine.build({
    eventType: 'case_assigned',
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-2',
    occurredAt: '2026-07-03T11:00:00.000Z',
    assignedProfessionalId: 'prof-1',
    workloadSize: 9,
  })

  assert.deepEqual(
    signals.map((signal) => signal.signalType),
    ['CASE_ASSIGNED', 'WORKLOAD_CHANGED'],
  )
})

test('reassignment generates CASE_REASSIGNED and WORKLOAD_CHANGED', () => {
  const engine = createLegalSignalsEngine()

  const signals = engine.build({
    eventType: 'case_reassigned',
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-3',
    occurredAt: '2026-07-03T12:00:00.000Z',
    previousProfessionalId: 'prof-1',
    assignedProfessionalId: 'prof-2',
    workloadSize: 7,
    reassignmentReason: 'capacity',
  })

  assert.deepEqual(
    signals.map((signal) => signal.signalType),
    ['CASE_REASSIGNED', 'WORKLOAD_CHANGED'],
  )
})

test('closed case generates CASE_CLOSED and BACKLOG_CHANGED', () => {
  const engine = createLegalSignalsEngine()

  const signals = engine.build({
    eventType: 'case_closed',
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-4',
    occurredAt: '2026-07-03T13:00:00.000Z',
    backlogSize: 14,
    closureReason: 'resolved',
  })

  assert.deepEqual(
    signals.map((signal) => signal.signalType),
    ['CASE_CLOSED', 'BACKLOG_CHANGED'],
  )
})

test('duplicate signals are not inserted twice', () => {
  const repository = createInMemoryLegalSignalRepository()
  const [signal] = buildCaseCreatedSignals({
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-5',
    occurredAt: '2026-07-03T14:00:00.000Z',
    practiceArea: 'labor_law',
  })

  const first = repository.upsert(signal)
  const second = repository.upsert(signal)

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(repository.size(), 1)
})

test('payload does not leak PII', () => {
  const engine = createLegalSignalsEngine()
  const sanitized = sanitizeSignalPayload({
    practiceArea: 'consumer_law',
    clientName: 'Ana',
    email: 'ana@example.com',
    phone: '5531999999999',
    nested: {
      endereco: 'Rua X',
      document: '12345678900',
      safe: 'ok',
    },
  })

  assert.deepEqual(sanitized, {
    practiceArea: 'consumer_law',
    nested: {
      safe: 'ok',
    },
  })

  const [signal] = engine.build({
    eventType: 'case_created',
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-7',
    occurredAt: '2026-07-03T16:00:00.000Z',
    practiceArea: 'consumer_law',
    payload: {
      clientName: 'Ana',
      telefone: '5531999999999',
      nested: {
        cpf: '12345678900',
        safe: 'ok',
      },
    },
  })

  assert.deepEqual(signal?.payload, {
    practiceArea: 'consumer_law',
    origin: 'operational',
    regionCode: null,
    specialtyCode: null,
    backlogSize: null,
    nested: {
      safe: 'ok',
    },
  })
})

test('engine does not depend on UI/browser APIs', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const engine = createLegalSignalsEngine()
  const signals = engine.build({
    eventType: 'first_professional_response',
    tenantId: 7,
    entityId: 'office-1',
    caseId: 'case-6',
    occurredAt: '2026-07-03T15:00:00.000Z',
    professionalId: 'prof-3',
    channel: 'portal',
    responseTimeMinutes: 18,
  })

  assert.equal(signals.length, 1)
  assert.equal(signals[0]?.signalType, 'FIRST_RESPONSE')
})
