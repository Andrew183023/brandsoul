import assert from 'node:assert/strict'
import test from 'node:test'

import { caseHasRequiredMatchData } from './caseRoutes.js'

test('caseHasRequiredMatchData prioritizes legalCase.practiceArea over metadata.practiceArea', () => {
  const ready = caseHasRequiredMatchData({
    practiceArea: 'Direito Trabalhista',
    metadata: {
      practiceArea: 'Direito Civil',
      city: 'Contagem',
      state: 'MG',
    },
  })

  assert.equal(ready, true)
})

test('caseHasRequiredMatchData prioritizes structured city over metadata city', () => {
  const ready = caseHasRequiredMatchData({
    practiceArea: 'Direito Trabalhista',
    clientCanonicalCity: 'Belo Horizonte',
    metadata: {
      city: 'Contagem',
      state: 'MG',
    },
  })

  assert.equal(ready, true)
})

test('caseHasRequiredMatchData keeps metadata as fallback when structured fields are absent', () => {
  const ready = caseHasRequiredMatchData({
    metadata: {
      practiceArea: 'Direito do Consumidor',
      city: 'Contagem',
      state: 'MG',
    },
  })

  assert.equal(ready, true)
})

test('caseHasRequiredMatchData keeps centelhaContext as final fallback', () => {
  const ready = caseHasRequiredMatchData({
    centelhaContext: {
      practiceArea: 'Direito Tributario',
      city: 'Uberlandia',
      state: 'MG',
    },
  })

  assert.equal(ready, true)
})

test('caseHasRequiredMatchData returns false when area city or state are missing', () => {
  assert.equal(caseHasRequiredMatchData({}), false)
  assert.equal(caseHasRequiredMatchData({
    practiceArea: 'Direito Trabalhista',
    clientCanonicalCity: 'Belo Horizonte',
  }), false)
  assert.equal(caseHasRequiredMatchData({
    metadata: {
      city: 'Contagem',
      state: 'MG',
    },
  }), false)
})
