import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCanonicalContactIdentity,
  normalizeCanonicalCity,
  normalizeCanonicalEmail,
  normalizeCanonicalPersonName,
  normalizeCanonicalPhone,
  normalizeCanonicalWhatsapp,
} from './legalContactNormalization.js'

test('normalizeCanonicalPhone normalizes masked phone numbers', () => {
  assert.equal(normalizeCanonicalPhone('(31) 99999-9999'), '5531999999999')
})

test('normalizeCanonicalPhone normalizes phone numbers with +55', () => {
  assert.equal(normalizeCanonicalPhone('+55 31 99999-9999'), '5531999999999')
})

test('normalizeCanonicalPhone removes local leading zero', () => {
  assert.equal(normalizeCanonicalPhone('031999999999'), '5531999999999')
})

test('normalizeCanonicalPhone keeps canonical brazilian numbers stable', () => {
  assert.equal(normalizeCanonicalPhone('5531999999999'), '5531999999999')
})

test('normalizeCanonicalWhatsapp follows the same canonicalization as phone', () => {
  assert.equal(normalizeCanonicalWhatsapp('(31) 99999-9999'), '5531999999999')
})

test('normalizeCanonicalEmail trims and lowercases the address', () => {
  assert.equal(normalizeCanonicalEmail('  ANA@EXEMPLO.COM  '), 'ana@exemplo.com')
})

test('normalizeCanonicalEmail rejects invalid addresses', () => {
  assert.equal(normalizeCanonicalEmail('ana@@exemplo'), undefined)
})

test('normalizeCanonicalPersonName collapses duplicate spaces', () => {
  assert.equal(normalizeCanonicalPersonName('  João   da   Silva  '), 'João da Silva')
})

test('normalizeCanonicalCity collapses duplicate spaces', () => {
  assert.equal(normalizeCanonicalCity('  Belo   Horizonte  '), 'Belo Horizonte')
})

test('normalizers remove invisible characters', () => {
  assert.equal(normalizeCanonicalPersonName('Jo\u200Bão   da\uFEFF Silva'), 'João da Silva')
})

test('buildCanonicalContactIdentity builds a canonical phone identity', () => {
  assert.deepEqual(buildCanonicalContactIdentity({
    name: '  João   da   Silva ',
    phone: '(31) 99999-9999',
    city: ' Belo   Horizonte ',
  }), {
    displayName: 'João da Silva',
    canonicalName: 'João da Silva',
    displayPhone: '(31) 99999-9999',
    canonicalPhone: '5531999999999',
    displayWhatsapp: undefined,
    canonicalWhatsapp: undefined,
    displayEmail: undefined,
    canonicalEmail: undefined,
    displayCity: 'Belo Horizonte',
    canonicalCity: 'Belo Horizonte',
    searchKey: 'joão da silva|5531999999999|belo horizonte',
  })
})

test('buildCanonicalContactIdentity builds a canonical whatsapp identity', () => {
  assert.deepEqual(buildCanonicalContactIdentity({
    name: 'Maria Clara',
    whatsapp: '+55 31 99999-9999',
    city: 'Belo Horizonte',
  }), {
    displayName: 'Maria Clara',
    canonicalName: 'Maria Clara',
    displayPhone: undefined,
    canonicalPhone: undefined,
    displayWhatsapp: '+55 31 99999-9999',
    canonicalWhatsapp: '5531999999999',
    displayEmail: undefined,
    canonicalEmail: undefined,
    displayCity: 'Belo Horizonte',
    canonicalCity: 'Belo Horizonte',
    searchKey: 'maria clara|5531999999999|belo horizonte',
  })
})

test('buildCanonicalContactIdentity builds a canonical email identity', () => {
  assert.deepEqual(buildCanonicalContactIdentity({
    name: 'Ana Souza',
    email: '  ANA@EXEMPLO.COM  ',
    city: 'São Paulo',
  }), {
    displayName: 'Ana Souza',
    canonicalName: 'Ana Souza',
    displayPhone: undefined,
    canonicalPhone: undefined,
    displayWhatsapp: undefined,
    canonicalWhatsapp: undefined,
    displayEmail: 'ANA@EXEMPLO.COM',
    canonicalEmail: 'ana@exemplo.com',
    displayCity: 'São Paulo',
    canonicalCity: 'São Paulo',
    searchKey: 'ana souza|ana@exemplo.com|são paulo',
  })
})

test('buildCanonicalContactIdentity produces a stable search key', () => {
  const first = buildCanonicalContactIdentity({
    name: 'João da Silva',
    whatsapp: '+55 31 99999-9999',
    email: 'JOAO@EMAIL.COM',
    city: 'Belo Horizonte',
  })

  const second = buildCanonicalContactIdentity({
    name: ' João   da Silva ',
    whatsapp: '031999999999',
    email: '  joao@email.com  ',
    city: ' Belo   Horizonte ',
  })

  assert.equal(first?.searchKey, 'joão da silva|5531999999999|joao@email.com|belo horizonte')
  assert.equal(second?.searchKey, 'joão da silva|5531999999999|joao@email.com|belo horizonte')
})
