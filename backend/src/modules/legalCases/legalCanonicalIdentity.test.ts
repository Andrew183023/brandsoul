import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLegalCaseIdentity,
  buildLegalCaseNumber,
  buildLegalOfficeIdentity,
} from './legalCanonicalIdentity.js'
import type { CaseRecord } from './caseTypes.js'

test('buildLegalCaseNumber prefers explicit case number', () => {
  assert.equal(buildLegalCaseNumber('123e4567-e89b', 'CASO-2026-0001'), 'CASO-2026-0001')
})

test('buildLegalCaseNumber derives stable fallback from case id', () => {
  assert.equal(buildLegalCaseNumber('123e4567-e89b-12d3-a456-426614174000'), 'CASO-123E4567')
})

test('buildLegalOfficeIdentity consolidates business config and responsible professional', () => {
  const identity = buildLegalOfficeIdentity({
    office: {
      id: 'office-1',
      ownerTenantId: 77,
      entityProfile: {
        metadata: {
          businessConfig: {
            officeName: 'Rocha Lima Advocacia',
            legalAreas: ['trabalhista', 'empresarial', 'trabalhista'],
            servedCities: ['São Paulo', 'Campinas', 'São Paulo'],
            whatsapp: '5599999999999',
          },
        },
      },
    },
    professionals: [
      {
        id: 'prof-1',
        displayName: 'Ana Rocha',
        oabCredential: 'OAB/SP 123456',
        specialties: ['Trabalhista'],
        isResponsible: true,
        isPublic: true,
        status: 'active',
      },
    ],
  })

  assert.equal(identity.officeId, 'office-1')
  assert.equal(identity.tenantId, 77)
  assert.equal(identity.name, 'Rocha Lima Advocacia')
  assert.deepEqual(identity.areas, ['trabalhista', 'empresarial'])
  assert.deepEqual(identity.cities, ['São Paulo', 'Campinas'])
  assert.equal(identity.contacts.whatsapp, '5599999999999')
  assert.equal(identity.responsibleProfessional?.displayName, 'Ana Rocha')
})

test('buildLegalCaseIdentity consolidates client data from public triage metadata', () => {
  const caseRecord: CaseRecord = {
    id: 'case-abc-12345678',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-1',
    title: 'Triagem pública',
    description: 'Cliente informou problema trabalhista.',
    status: 'open',
    priority: 'urgent',
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    openedAt: '2026-06-27T10:00:00.000Z',
    closedAt: undefined,
    archivedAt: undefined,
    resolutionReason: undefined,
    caseNumber: undefined,
    createdByUserId: undefined,
    leadProfessionalId: undefined,
    centelhaContext: {},
    metadata: {
      publicTriage: {
        clientName: 'João Silva',
        contactPreference: 'WhatsApp',
        contactValue: '559988776655',
        city: 'Belo Horizonte',
      },
    },
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T11:00:00.000Z',
  }

  const identity = buildLegalCaseIdentity({
    caseRecord,
    responsibleProfessional: {
      id: 'prof-1',
      displayName: 'Ana Rocha',
      oabCredential: 'OAB/SP 123456',
      specialties: ['Trabalhista'],
      isResponsible: true,
      isPublic: true,
      status: 'active',
    },
    lastInteractionAt: '2026-06-27T11:30:00.000Z',
  })

  assert.equal(identity.caseNumber, 'CASO-CASEABC1')
  assert.equal(identity.client.name, 'João Silva')
  assert.equal(identity.client.contactPreference, 'WhatsApp')
  assert.equal(identity.client.contact, '559988776655')
  assert.equal(identity.client.city, 'Belo Horizonte')
  assert.equal(identity.city, 'Belo Horizonte')
  assert.equal(identity.responsibleProfessional?.displayName, 'Ana Rocha')
  assert.equal(identity.lastInteractionAt, '2026-06-27T11:30:00.000Z')
})

test('buildLegalCaseIdentity prioritizes persisted canonicalCaseInput for structured client fields', () => {
  const caseRecord: CaseRecord = {
    id: 'case-canonical-12345678',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-2',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'urgent',
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    openedAt: '2026-06-27T10:00:00.000Z',
    closedAt: undefined,
    archivedAt: undefined,
    resolutionReason: undefined,
    caseNumber: undefined,
    createdByUserId: undefined,
    leadProfessionalId: undefined,
    centelhaContext: {},
    metadata: {
      contact: 'legacy-contact',
      city: 'Legacy City',
      publicTriage: {
        clientName: 'Legacy Client',
        contactPreference: 'Legacy',
        contactValue: 'legacy-contact',
        city: 'Legacy City',
      },
      canonicalCaseInput: {
        contact: '5511999999999',
        contactPreference: 'WhatsApp',
        city: 'Belo Horizonte',
        practiceArea: 'Direito Trabalhista',
        priority: 'urgent',
        status: 'open',
        openedAt: '2026-06-27T10:00:00.000Z',
        lastInteractionAt: '2026-06-27T11:30:00.000Z',
        checklist: [],
        summary: 'Demissão sem verbas',
        metadata: {},
        initialMessage: {
          body: 'Mensagem inicial',
          direction: 'inbound',
          messageType: 'note',
          messageStatus: 'sent',
        },
      },
    },
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T11:00:00.000Z',
  }

  const identity = buildLegalCaseIdentity({
    caseRecord,
    lastInteractionAt: '2026-06-27T12:00:00.000Z',
  })

  assert.equal(identity.client.name, 'Legacy Client')
  assert.equal(identity.client.contact, '5511999999999')
  assert.equal(identity.client.contactPreference, 'WhatsApp')
  assert.equal(identity.client.city, 'Belo Horizonte')
  assert.equal(identity.city, 'Belo Horizonte')
  assert.equal(identity.lastInteractionAt, '2026-06-27T12:00:00.000Z')
})
