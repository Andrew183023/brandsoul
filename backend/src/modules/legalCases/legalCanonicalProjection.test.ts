import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCanonicalCaseProjection,
  buildCanonicalOfficeProjection,
} from './legalCanonicalProjection.js'
import type {
  LegalCaseIdentity,
  LegalOfficeIdentity,
} from './legalCanonicalTypes.js'

test('buildCanonicalOfficeProjection returns the complete office projection', () => {
  const identity: LegalOfficeIdentity = {
    officeId: 'office-1',
    tenantId: 77,
    name: 'Rocha Lima Advocacia',
    logoUrl: 'https://cdn.example.com/logo.png',
    description: 'Atuação estratégica em direito do trabalho.',
    areas: ['Trabalhista', 'Empresarial'],
    oab: 'OAB/SP 123456',
    cities: ['São Paulo', 'Campinas'],
    coverage: 'Atendimento remoto e presencial',
    businessHours: 'Segunda a sexta, 9h às 18h',
    contacts: {
      phone: '1133334444',
      whatsapp: '5511999998888',
      email: 'contato@rochalima.legal',
      website: 'https://rochalima.legal',
      instagram: '@rochalima.legal',
    },
    responsibleProfessional: {
      id: 'prof-1',
      displayName: 'Dra. Ana Rocha',
      oabCredential: 'OAB/SP 123456',
      email: 'ana@rochalima.legal',
      phone: '5511999990000',
      photoUrl: 'https://cdn.example.com/ana.png',
      specialty: 'Trabalhista',
      specialties: ['Trabalhista'],
      isResponsible: true,
      isPublic: true,
      status: 'active',
    },
    professionals: [
      {
        id: 'prof-1',
        displayName: 'Dra. Ana Rocha',
        oabCredential: 'OAB/SP 123456',
        email: 'ana@rochalima.legal',
        phone: '5511999990000',
        photoUrl: 'https://cdn.example.com/ana.png',
        specialty: 'Trabalhista',
        specialties: ['Trabalhista'],
        isResponsible: true,
        isPublic: true,
        status: 'active',
      },
      {
        id: 'prof-2',
        displayName: 'Dr. Bruno Lima',
        specialties: ['Empresarial'],
        isResponsible: false,
        isPublic: true,
        status: 'active',
      },
    ],
  }

  const projection = buildCanonicalOfficeProjection(identity)

  assert.deepEqual(projection, {
    office: {
      officeId: 'office-1',
      tenantId: 77,
      name: 'Rocha Lima Advocacia',
      logoUrl: 'https://cdn.example.com/logo.png',
      description: 'Atuação estratégica em direito do trabalho.',
      areas: ['Trabalhista', 'Empresarial'],
      oab: 'OAB/SP 123456',
      cities: ['São Paulo', 'Campinas'],
      coverage: 'Atendimento remoto e presencial',
      businessHours: 'Segunda a sexta, 9h às 18h',
      contacts: {
        phone: '1133334444',
        whatsapp: '5511999998888',
        email: 'contato@rochalima.legal',
        website: 'https://rochalima.legal',
        instagram: '@rochalima.legal',
      },
      responsibleProfessional: {
        id: 'prof-1',
        displayName: 'Dra. Ana Rocha',
        oabCredential: 'OAB/SP 123456',
        email: 'ana@rochalima.legal',
        phone: '5511999990000',
        photoUrl: 'https://cdn.example.com/ana.png',
        specialty: 'Trabalhista',
        specialties: ['Trabalhista'],
        isResponsible: true,
        isPublic: true,
        status: 'active',
      },
      professionals: [
        {
          id: 'prof-1',
          displayName: 'Dra. Ana Rocha',
          oabCredential: 'OAB/SP 123456',
          email: 'ana@rochalima.legal',
          phone: '5511999990000',
          photoUrl: 'https://cdn.example.com/ana.png',
          specialty: 'Trabalhista',
          specialties: ['Trabalhista'],
          isResponsible: true,
          isPublic: true,
          status: 'active',
        },
        {
          id: 'prof-2',
          displayName: 'Dr. Bruno Lima',
          specialties: ['Empresarial'],
          isResponsible: false,
          isPublic: true,
          status: 'active',
        },
      ],
    },
  })
})

test('buildCanonicalCaseProjection returns the complete case projection', () => {
  const identity: LegalCaseIdentity & {
    checklist: Array<{ id: string; label: string; done: boolean }>
    timeline: Array<{ id: string; label: string }>
    messages: Array<{ id: string; role: string; text: string }>
  } = {
    caseId: 'case-1',
    caseNumber: 'CASO-2026-0001',
    tenantId: 77,
    entityId: 'office-1',
    client: {
      name: 'João Silva',
      contact: '5511999999999',
      contactPreference: 'WhatsApp',
      city: 'Belo Horizonte',
      contactIdentity: {
        displayName: 'João Silva',
        canonicalName: 'João Silva',
        displayPhone: undefined,
        canonicalPhone: undefined,
        displayWhatsapp: '5511999999999',
        canonicalWhatsapp: '5511999999999',
        displayEmail: undefined,
        canonicalEmail: undefined,
        displayCity: 'Belo Horizonte',
        canonicalCity: 'Belo Horizonte',
        searchKey: 'joão silva|5511999999999|belo horizonte',
      },
    },
    practiceArea: 'Direito Trabalhista',
    city: 'Belo Horizonte',
    responsibleProfessional: {
      id: 'prof-1',
      displayName: 'Dra. Ana Rocha',
      oabCredential: 'OAB/SP 123456',
      specialty: 'Trabalhista',
      specialties: ['Trabalhista'],
      isResponsible: true,
      isPublic: true,
      status: 'active',
    },
    priority: 'urgent',
    status: 'in_progress',
    openedAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T12:00:00.000Z',
    lastInteractionAt: '2026-06-27T12:15:00.000Z',
    sla: {
      state: 'at_risk',
      remainingMinutes: 25,
      dueAt: '2026-06-27T12:40:00.000Z',
    },
    checklist: [
      { id: 'check-1', label: 'Documentos iniciais', done: false },
    ],
    timeline: [
      { id: 'event-1', label: 'Triagem recebida' },
    ],
    messages: [
      { id: 'message-1', role: 'user', text: 'Preciso de ajuda.' },
    ],
  }

  const projection = buildCanonicalCaseProjection(identity)

  assert.deepEqual(projection, {
    case: {
      caseNumber: 'CASO-2026-0001',
      caseId: 'case-1',
      entityId: 'office-1',
      clientName: 'João Silva',
      contact: '5511999999999',
      contactIdentity: {
        displayName: 'João Silva',
        canonicalName: 'João Silva',
        displayPhone: undefined,
        canonicalPhone: undefined,
        displayWhatsapp: '5511999999999',
        canonicalWhatsapp: '5511999999999',
        displayEmail: undefined,
        canonicalEmail: undefined,
        displayCity: 'Belo Horizonte',
        canonicalCity: 'Belo Horizonte',
        searchKey: 'joão silva|5511999999999|belo horizonte',
      },
      practiceArea: 'Direito Trabalhista',
      city: 'Belo Horizonte',
      priority: 'urgent',
      status: 'in_progress',
      sla: {
        state: 'at_risk',
        remainingMinutes: 25,
        dueAt: '2026-06-27T12:40:00.000Z',
      },
      openedAt: '2026-06-27T10:00:00.000Z',
      lastInteractionAt: '2026-06-27T12:15:00.000Z',
      responsibleProfessional: {
        id: 'prof-1',
        displayName: 'Dra. Ana Rocha',
        oabCredential: 'OAB/SP 123456',
        specialty: 'Trabalhista',
        specialties: ['Trabalhista'],
        isResponsible: true,
        isPublic: true,
        status: 'active',
      },
      checklist: [
        { id: 'check-1', label: 'Documentos iniciais', done: false },
      ],
      timeline: [
        { id: 'event-1', label: 'Triagem recebida' },
      ],
      messages: [
        { id: 'message-1', role: 'user', text: 'Preciso de ajuda.' },
      ],
    },
  })
})

test('buildCanonical projections preserve empty arrays', () => {
  const officeProjection = buildCanonicalOfficeProjection({
    officeId: 'office-empty',
    tenantId: 1,
    name: 'Office Empty',
    areas: [],
    cities: [],
    contacts: {},
    responsibleProfessional: null,
    professionals: [],
  })

  const caseProjection = buildCanonicalCaseProjection({
    caseId: 'case-empty',
    caseNumber: 'CASO-EMPTY',
    tenantId: 1,
    entityId: 'office-empty',
    client: {},
    priority: 'normal',
    status: 'open',
    openedAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:00:00.000Z',
    checklist: [],
    timeline: [],
    messages: [],
  })

  assert.deepEqual(officeProjection.office.areas, [])
  assert.deepEqual(officeProjection.office.cities, [])
  assert.deepEqual(officeProjection.office.professionals, [])
  assert.deepEqual(caseProjection.case.checklist, [])
  assert.deepEqual(caseProjection.case.timeline, [])
  assert.deepEqual(caseProjection.case.messages, [])
})

test('buildCanonical projections preserve optional fields', () => {
  const officeProjection = buildCanonicalOfficeProjection({
    officeId: 'office-optional',
    tenantId: 4,
    name: 'Office Optional',
    areas: [],
    cities: [],
    contacts: {},
    professionals: [],
  })

  const caseProjection = buildCanonicalCaseProjection({
    caseId: 'case-optional',
    caseNumber: 'CASO-OPTION',
    tenantId: 4,
    entityId: 'office-optional',
    client: {},
    priority: 'normal',
    status: 'open',
    openedAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:00:00.000Z',
  })

  assert.equal(officeProjection.office.logoUrl, undefined)
  assert.equal(officeProjection.office.description, undefined)
  assert.equal(officeProjection.office.oab, undefined)
  assert.equal(officeProjection.office.coverage, undefined)
  assert.equal(officeProjection.office.businessHours, undefined)
  assert.equal(officeProjection.office.responsibleProfessional, undefined)

  assert.equal(caseProjection.case.clientName, undefined)
  assert.equal(caseProjection.case.contact, undefined)
  assert.equal(caseProjection.case.contactIdentity, undefined)
  assert.equal(caseProjection.case.practiceArea, undefined)
  assert.equal(caseProjection.case.city, undefined)
  assert.equal(caseProjection.case.sla, undefined)
  assert.equal(caseProjection.case.lastInteractionAt, undefined)
  assert.equal(caseProjection.case.responsibleProfessional, undefined)
  assert.deepEqual(caseProjection.case.checklist, [])
  assert.deepEqual(caseProjection.case.timeline, [])
  assert.deepEqual(caseProjection.case.messages, [])
})

test('buildCanonical projections are deterministic for the same input', () => {
  const officeIdentity: LegalOfficeIdentity = {
    officeId: 'office-deterministic',
    tenantId: 9,
    name: 'Deterministic Office',
    areas: ['Civil'],
    cities: ['Curitiba'],
    contacts: {
      email: 'contato@example.com',
    },
    professionals: [],
  }

  const caseIdentity: LegalCaseIdentity & {
    checklist: string[]
    timeline: string[]
    messages: string[]
  } = {
    caseId: 'case-deterministic',
    caseNumber: 'CASO-DETER',
    tenantId: 9,
    entityId: 'office-deterministic',
    client: {
      name: 'Cliente',
      contact: '5511999999999',
    },
    priority: 'high',
    status: 'accepted',
    openedAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:05:00.000Z',
    checklist: ['a'],
    timeline: ['b'],
    messages: ['c'],
  }

  assert.deepEqual(
    buildCanonicalOfficeProjection(officeIdentity),
    buildCanonicalOfficeProjection(officeIdentity),
  )

  assert.deepEqual(
    buildCanonicalCaseProjection(caseIdentity),
    buildCanonicalCaseProjection(caseIdentity),
  )
})
