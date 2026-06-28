import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCanonicalCaseInputFromPublicTriage,
  readCanonicalCaseInput,
} from './legalCanonicalCaseInput.js'

test('buildCanonicalCaseInputFromPublicTriage consolidates structured public triage fields', () => {
  const input = buildCanonicalCaseInputFromPublicTriage({
    requestId: 'triage-1',
    userMessage: 'Fui demitido e não recebi verbas.',
    leadId: 'lead-1',
    intakeId: 'intake-1',
    openedAt: '2026-06-28T10:00:00.000Z',
    attribution: {
      utmSource: 'google',
    },
    businessContext: {
      officeName: 'Rocha Lima Advocacia',
    },
    triage: {
      context: 'Demissão sem verbas rescisórias',
      urgency: 'critical',
      objective: 'Entender próximos passos',
      contactPreference: 'WhatsApp',
      contactValue: '5511999999999',
      practiceArea: 'Trabalhista',
      city: 'Belo Horizonte',
    },
  })

  assert.equal(input.contact, '5511999999999')
  assert.equal(input.contactPreference, 'WhatsApp')
  assert.equal(input.city, 'Belo Horizonte')
  assert.equal(input.practiceArea, 'Trabalhista')
  assert.equal(input.priority, 'urgent')
  assert.equal(input.status, 'open')
  assert.equal(input.openedAt, '2026-06-28T10:00:00.000Z')
  assert.equal(input.lastInteractionAt, '2026-06-28T10:00:00.000Z')
  assert.equal(input.summary, 'Demissão sem verbas rescisórias')
  assert.equal(input.initialMessage.body, 'Fui demitido e não recebi verbas.')

  const restored = readCanonicalCaseInput(input.metadata.canonicalCaseInput)

  assert.deepEqual(restored, {
    ...input,
    metadata: {
      source: 'public-triage',
      leadId: 'lead-1',
      intakeId: 'intake-1',
      city: 'Belo Horizonte',
      contact: '5511999999999',
      publicTriage: input.metadata.publicTriage,
    },
  })
})
