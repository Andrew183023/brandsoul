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
  assert.deepEqual(identity.client.contactIdentity, {
    displayName: 'João Silva',
    canonicalName: 'João Silva',
    displayPhone: undefined,
    canonicalPhone: undefined,
    displayWhatsapp: '559988776655',
    canonicalWhatsapp: '559988776655',
    displayEmail: undefined,
    canonicalEmail: undefined,
    displayCity: 'Belo Horizonte',
    canonicalCity: 'Belo Horizonte',
    searchKey: 'joão silva|559988776655|belo horizonte',
  })
  assert.equal(identity.city, 'Belo Horizonte')
  assert.equal(identity.responsibleProfessional?.displayName, 'Ana Rocha')
  assert.equal(identity.lastInteractionAt, '2026-06-27T11:30:00.000Z')
})

test('buildLegalCaseIdentity uses canonicalCaseInput as compatibility fallback when structured fields are absent', () => {
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
        contactIdentity: {
          displayName: 'Mariana Souza',
          canonicalName: 'mariana souza',
          displayWhatsapp: '5511999999999',
          canonicalWhatsapp: '5511999999999',
          displayCity: 'Belo Horizonte',
          canonicalCity: 'belo horizonte',
          searchKey: 'placeholder',
        },
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
  assert.deepEqual(identity.client.contactIdentity, {
    displayName: 'Mariana Souza',
    canonicalName: 'mariana souza',
    displayWhatsapp: '5511999999999',
    canonicalWhatsapp: '5511999999999',
    displayCity: 'Belo Horizonte',
    canonicalCity: 'belo horizonte',
    searchKey: 'placeholder',
  })
  assert.equal(identity.city, 'Belo Horizonte')
  assert.equal(identity.lastInteractionAt, '2026-06-27T12:00:00.000Z')
})

test('buildLegalCaseIdentity prioritizes structured case contact columns when available', () => {
  const caseRecord: CaseRecord = {
    id: 'case-structured-12345678',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-structured',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'high',
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    openedAt: '2026-06-27T10:00:00.000Z',
    closedAt: undefined,
    archivedAt: undefined,
    resolutionReason: undefined,
    caseNumber: undefined,
    createdByUserId: undefined,
    leadProfessionalId: undefined,
    clientDisplayName: 'Ana Souza',
    clientCanonicalName: 'Ana Souza',
    clientDisplayPhone: undefined,
    clientCanonicalPhone: undefined,
    clientDisplayWhatsapp: '(31) 99999-8888',
    clientCanonicalWhatsapp: '5531999998888',
    clientDisplayEmail: undefined,
    clientCanonicalEmail: undefined,
    clientDisplayCity: 'Belo Horizonte',
    clientCanonicalCity: 'Belo Horizonte',
    clientSearchKey: 'ana souza|5531999998888|belo horizonte',
    centelhaContext: {},
    metadata: {},
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T11:00:00.000Z',
  }

  const identity = buildLegalCaseIdentity({
    caseRecord,
    lastInteractionAt: '2026-06-27T12:00:00.000Z',
  })

  assert.equal(identity.client.name, 'Ana Souza')
  assert.equal(identity.client.contact, '5531999998888')
  assert.equal(identity.client.contactPreference, 'WhatsApp')
  assert.equal(identity.client.city, 'Belo Horizonte')
  assert.deepEqual(identity.client.contactIdentity, {
    displayName: 'Ana Souza',
    canonicalName: 'Ana Souza',
    displayPhone: undefined,
    canonicalPhone: undefined,
    displayWhatsapp: '(31) 99999-8888',
    canonicalWhatsapp: '5531999998888',
    displayEmail: undefined,
    canonicalEmail: undefined,
    displayCity: 'Belo Horizonte',
    canonicalCity: 'Belo Horizonte',
    searchKey: 'ana souza|5531999998888|belo horizonte',
  })
})

test('buildLegalCaseIdentity prioritizes structured identity over canonicalCaseInput historical snapshot', () => {
  const caseRecord: CaseRecord = {
    id: 'case-structured-priority-12345678',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-structured-priority',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'high',
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    openedAt: '2026-06-27T10:00:00.000Z',
    closedAt: undefined,
    archivedAt: undefined,
    resolutionReason: undefined,
    caseNumber: undefined,
    createdByUserId: undefined,
    leadProfessionalId: undefined,
    clientDisplayName: 'Ana Souza',
    clientCanonicalName: 'Ana Souza',
    clientDisplayPhone: undefined,
    clientCanonicalPhone: undefined,
    clientDisplayWhatsapp: '(31) 99999-8888',
    clientCanonicalWhatsapp: '5531999998888',
    clientDisplayEmail: undefined,
    clientCanonicalEmail: undefined,
    clientDisplayCity: 'Belo Horizonte',
    clientCanonicalCity: 'Belo Horizonte',
    clientSearchKey: 'ana souza|5531999998888|belo horizonte',
    centelhaContext: {},
    metadata: {
      contact: 'legacy-contact',
      city: 'Legacy City',
      publicTriage: {
        clientName: 'Legacy Client',
        contactPreference: 'Email',
        contactValue: 'legacy@contato.com',
        city: 'Legacy City',
      },
      canonicalCaseInput: {
        clientName: 'Snapshot Client',
        contact: '5555555555555',
        contactPreference: 'WhatsApp',
        city: 'Snapshot City',
        contactIdentity: {
          displayName: 'Snapshot Client',
          canonicalName: 'snapshot client',
          displayWhatsapp: '5555555555555',
          canonicalWhatsapp: '5555555555555',
          displayCity: 'Snapshot City',
          canonicalCity: 'snapshot city',
          searchKey: 'snapshot client|5555555555555|snapshot city',
        },
        practiceArea: 'Direito Trabalhista',
        priority: 'high',
        status: 'open',
        openedAt: '2026-06-27T10:00:00.000Z',
        lastInteractionAt: '2026-06-27T11:30:00.000Z',
        checklist: [],
        summary: 'Resumo snapshot',
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

  assert.equal(identity.client.name, 'Ana Souza')
  assert.equal(identity.client.contact, '5531999998888')
  assert.equal(identity.client.contactPreference, 'WhatsApp')
  assert.equal(identity.client.city, 'Belo Horizonte')
  assert.equal(identity.client.contactIdentity?.canonicalWhatsapp, '5531999998888')
  assert.equal(identity.client.contactIdentity?.searchKey, 'ana souza|5531999998888|belo horizonte')
})

test('buildLegalCaseIdentity falls back to publicTriage before direct metadata when structured and canonicalCaseInput are absent', () => {
  const caseRecord: CaseRecord = {
    id: 'case-public-triage-fallback-12345678',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-public-triage-fallback',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'normal',
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
      clientName: 'Metadata Client',
      contact: 'metadata-contact',
      contactPreference: 'Email',
      city: 'Metadata City',
      publicTriage: {
        clientName: 'Public Triage Client',
        contactPreference: 'WhatsApp',
        contactValue: '5531999998888',
        city: 'Belo Horizonte',
      },
    },
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T11:00:00.000Z',
  }

  const identity = buildLegalCaseIdentity({
    caseRecord,
    lastInteractionAt: '2026-06-27T12:00:00.000Z',
  })

  assert.equal(identity.client.name, 'Public Triage Client')
  assert.equal(identity.client.contact, '5531999998888')
  assert.equal(identity.client.contactPreference, 'WhatsApp')
  assert.equal(identity.client.city, 'Belo Horizonte')
})

test('buildLegalCaseIdentity prioritizes canonicalCaseInput contactPreference over publicTriage when structured identity is absent', () => {
  const caseRecord: CaseRecord = {
    id: 'case-contact-pref-snapshot-first',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-contact-pref-snapshot-first',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'normal',
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
        contactPreference: 'WhatsApp',
      },
      canonicalCaseInput: {
        contactPreference: 'Email',
        priority: 'normal',
        status: 'open',
        checklist: [],
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

  const identity = buildLegalCaseIdentity({ caseRecord })
  assert.equal(identity.client.contactPreference, 'Email')
})

test('buildLegalCaseIdentity keeps structured contactPreference above canonicalCaseInput and publicTriage', () => {
  const caseRecord: CaseRecord = {
    id: 'case-contact-pref-structured-first',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-contact-pref-structured-first',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'normal',
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    openedAt: '2026-06-27T10:00:00.000Z',
    closedAt: undefined,
    archivedAt: undefined,
    resolutionReason: undefined,
    caseNumber: undefined,
    createdByUserId: undefined,
    leadProfessionalId: undefined,
    clientDisplayName: 'Ana Souza',
    clientCanonicalName: 'Ana Souza',
    clientDisplayPhone: undefined,
    clientCanonicalPhone: undefined,
    clientDisplayWhatsapp: '(31) 99999-8888',
    clientCanonicalWhatsapp: '5531999998888',
    clientDisplayEmail: undefined,
    clientCanonicalEmail: undefined,
    clientDisplayCity: 'Belo Horizonte',
    clientCanonicalCity: 'Belo Horizonte',
    clientSearchKey: 'ana souza|5531999998888|belo horizonte',
    centelhaContext: {},
    metadata: {
      publicTriage: {
        contactPreference: 'Telefone',
      },
      canonicalCaseInput: {
        contactPreference: 'Email',
        priority: 'normal',
        status: 'open',
        checklist: [],
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

  const identity = buildLegalCaseIdentity({ caseRecord })
  assert.equal(identity.client.contactPreference, 'WhatsApp')
})

test('buildLegalCaseIdentity uses publicTriage contactPreference when structured and canonicalCaseInput are absent', () => {
  const caseRecord: CaseRecord = {
    id: 'case-contact-pref-public-triage',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-contact-pref-public-triage',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'normal',
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
        contactPreference: 'Telefone',
      },
    },
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T11:00:00.000Z',
  }

  const identity = buildLegalCaseIdentity({ caseRecord })
  assert.equal(identity.client.contactPreference, 'Telefone')
})

test('buildLegalCaseIdentity uses metadata contactPreference only as final fallback', () => {
  const caseRecord: CaseRecord = {
    id: 'case-contact-pref-metadata-last',
    tenantId: 77,
    entityId: 'office-1',
    requestId: 'request-contact-pref-metadata-last',
    title: 'Triagem pública',
    description: 'Resumo legado.',
    status: 'open',
    priority: 'normal',
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
      contactPreference: 'Email',
    },
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T11:00:00.000Z',
  }

  const identity = buildLegalCaseIdentity({ caseRecord })
  assert.equal(identity.client.contactPreference, 'Email')
})
