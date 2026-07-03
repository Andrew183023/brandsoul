import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPublicTriageIntakeFingerprint,
  PUBLIC_TRIAGE_FINGERPRINT_VERSION,
} from './legalIntakeFingerprint.js'

function buildBaseInput() {
  return {
    tenantId: 11,
    entityId: 'office-real-1',
    practiceArea: 'Direito Trabalhista',
    objective: 'Entender meus direitos e próximos passos.',
    city: 'Belo Horizonte',
    occurredAt: '2026-06-29T10:05:00.000Z',
    contactPreference: 'whatsapp',
    contactValue: '(31) 99999-8888',
  } as const
}

test('same payload generates the same fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint(buildBaseInput())
  const second = buildPublicTriageIntakeFingerprint(buildBaseInput())

  assert.equal(first.fingerprint, second.fingerprint)
  assert.deepEqual(first.components, second.components)
})

test('equivalent phone values generate the same fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'phone',
    contactValue: '(31) 99999-8888',
  })
  const second = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'phone',
    contactValue: '+55 31 99999-8888',
  })

  assert.equal(first.fingerprint, second.fingerprint)
})

test('equivalent whatsapp values generate the same fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'whatsapp',
    contactValue: '031999998888',
  })
  const second = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'whatsapp',
    contactValue: '5531999998888',
  })

  assert.equal(first.fingerprint, second.fingerprint)
})

test('emails with different casing generate the same fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'email',
    contactValue: 'ANA@EXEMPLO.COM',
  })
  const second = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'email',
    contactValue: '  ana@exemplo.com  ',
  })

  assert.equal(first.fingerprint, second.fingerprint)
})

test('changing practice area changes the fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint(buildBaseInput())
  const second = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    practiceArea: 'Direito Previdenciário',
  })

  assert.notEqual(first.fingerprint, second.fingerprint)
})

test('changing the objective meaningfully changes the fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint(buildBaseInput())
  const second = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    objective: 'Agendar atendimento para revisão contratual empresarial.',
  })

  assert.notEqual(first.fingerprint, second.fingerprint)
})

test('same payload in another time bucket changes the fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    occurredAt: '2026-06-29T10:05:00.000Z',
  })
  const second = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    occurredAt: '2026-06-29T10:35:00.000Z',
  })

  assert.notEqual(first.fingerprint, second.fingerprint)
  assert.notEqual(first.components.timeBucket, second.components.timeBucket)
})

test('changing requestId outside the engine keeps the same fingerprint', () => {
  const first = buildPublicTriageIntakeFingerprint(buildBaseInput())
  const second = buildPublicTriageIntakeFingerprint(buildBaseInput())

  assert.equal(first.fingerprint, second.fingerprint)
})

test('fingerprint digest does not contain raw PII', () => {
  const result = buildPublicTriageIntakeFingerprint({
    ...buildBaseInput(),
    contactPreference: 'email',
    contactValue: 'ana@exemplo.com',
  })

  assert.match(result.fingerprint, /^[a-f0-9]{64}$/)
  assert.equal(result.fingerprint.includes('ana@exemplo.com'), false)
  assert.equal(result.fingerprint.includes('5531'), false)
})

test('fingerprint version remains stable', () => {
  const result = buildPublicTriageIntakeFingerprint(buildBaseInput())

  assert.equal(result.fingerprintVersion, PUBLIC_TRIAGE_FINGERPRINT_VERSION)
  assert.equal(result.source, 'public_triage')
})
