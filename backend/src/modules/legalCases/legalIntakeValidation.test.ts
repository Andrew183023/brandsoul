import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePublicLegalIntakePayload } from './legalIntakeValidation.js'

function buildValidPayload() {
  return {
    userMessage: 'Fui demitido sem receber verbas rescisórias.',
    triage: {
      clientName: 'João da Silva',
      preferredName: 'João',
      city: 'Belo Horizonte',
      practiceArea: 'Direito Trabalhista',
      context: 'Fui demitido sem receber verbas rescisórias.',
      urgency: 'planned',
      objective: 'Entender meus direitos e próximos passos.',
      contactPreference: 'WhatsApp',
      contactValue: '31999998888',
    },
  }
}

test('validatePublicLegalIntakePayload rejects empty payload', () => {
  const result = validatePublicLegalIntakePayload({})
  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected validation failure.')
  }
  assert.ok(result.errors.some((error) => error.field === 'userMessage'))
  assert.ok(result.errors.some((error) => error.field === 'clientName'))
  assert.ok(result.errors.some((error) => error.field === 'contactValue'))
})

test('validatePublicLegalIntakePayload rejects invalid enums and giant strings', () => {
  const result = validatePublicLegalIntakePayload({
    userMessage: 'x'.repeat(3001),
    triage: {
      clientName: 'Jo',
      city: 'A',
      practiceArea: 'T',
      objective: 'curto',
      urgency: 'panic',
      contactPreference: 'telegram',
      contactValue: '1234',
    },
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected validation failure.')
  }

  assert.ok(result.errors.some((error) => error.field === 'userMessage' && error.code === 'too_long'))
  assert.ok(result.errors.some((error) => error.field === 'clientName' && error.code === 'too_short'))
  assert.ok(result.errors.some((error) => error.field === 'urgency' && error.code === 'invalid_enum'))
  assert.ok(result.errors.some((error) => error.field === 'contactPreference' && error.code === 'invalid_enum'))
})

test('validatePublicLegalIntakePayload sanitizes and normalizes a valid payload', () => {
  const result = validatePublicLegalIntakePayload({
    userMessage: '  Fui demitido sem receber verbas rescisórias.  ',
    triage: {
      clientName: '  João   da   Silva  ',
      preferredName: '  João  ',
      city: '  Belo   Horizonte ',
      legalArea: ' Direito Trabalhista ',
      context: '  Fui demitido sem receber verbas rescisórias. ',
      urgency: 'priority',
      objective: '  Entender meus direitos e próximos passos.  ',
      contactPreference: 'Telefone',
      contactValue: ' 31 99999-8888 ',
    },
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    throw new Error('Expected validation success.')
  }

  assert.equal(result.value.userMessage, 'Fui demitido sem receber verbas rescisórias.')
  assert.equal(result.value.triage.clientName, 'João da Silva')
  assert.equal(result.value.triage.legalArea, 'Direito Trabalhista')
  assert.equal(result.value.triage.urgency, 'high')
  assert.equal(result.value.triage.contactPreference, 'phone')
  assert.equal(result.value.compatibility.urgency, 'priority')
  assert.equal(result.value.compatibility.contactPreference, 'telefone')
})

test('validatePublicLegalIntakePayload accepts current frontend payload aliases', () => {
  const result = validatePublicLegalIntakePayload(buildValidPayload())
  assert.equal(result.ok, true)
  if (!result.ok) {
    throw new Error('Expected validation success.')
  }

  assert.equal(result.value.triage.contactPreference, 'whatsapp')
  assert.equal(result.value.triage.urgency, 'medium')
  assert.equal(result.value.compatibility.practiceArea, 'Direito Trabalhista')
})

test('validatePublicLegalIntakePayload rejects invalid email for email contact preference', () => {
  const result = validatePublicLegalIntakePayload({
    ...buildValidPayload(),
    triage: {
      ...buildValidPayload().triage,
      contactPreference: 'email',
      contactValue: '31999998888',
    },
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected validation failure.')
  }

  assert.ok(result.errors.some((error) => error.field === 'contactValue' && error.code === 'invalid_contact'))
})

test('validatePublicLegalIntakePayload rejects invalid whatsapp for whatsapp contact preference', () => {
  const result = validatePublicLegalIntakePayload({
    ...buildValidPayload(),
    triage: {
      ...buildValidPayload().triage,
      contactPreference: 'whatsapp',
      contactValue: 'ana@email.com',
    },
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected validation failure.')
  }

  assert.ok(result.errors.some((error) => error.field === 'contactValue' && error.code === 'invalid_contact'))
})

test('validatePublicLegalIntakePayload rejects invalid phone for phone contact preference', () => {
  const result = validatePublicLegalIntakePayload({
    ...buildValidPayload(),
    triage: {
      ...buildValidPayload().triage,
      contactPreference: 'phone',
      contactValue: 'abc',
    },
  })

  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected validation failure.')
  }

  assert.ok(result.errors.some((error) => error.field === 'contactValue' && error.code === 'invalid_contact'))
})

test('validatePublicLegalIntakePayload accepts canonicalizable email and phone values', () => {
  const emailResult = validatePublicLegalIntakePayload({
    ...buildValidPayload(),
    triage: {
      ...buildValidPayload().triage,
      contactPreference: 'email',
      contactValue: '  ANA@EXEMPLO.COM  ',
    },
  })
  const phoneResult = validatePublicLegalIntakePayload({
    ...buildValidPayload(),
    triage: {
      ...buildValidPayload().triage,
      contactPreference: 'phone',
      contactValue: '+55 31 99999-8888',
    },
  })

  assert.equal(emailResult.ok, true)
  assert.equal(phoneResult.ok, true)
})
