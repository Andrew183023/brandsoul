import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createCaseRepository } from '../modules/legalCases/caseRepository.js'
import {
  backfillCaseStructuredContactIdentity,
  createDatabaseConnection,
  initializeDatabase,
} from './index.js'

async function createTempSqliteDb(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  return {
    db,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

async function seedEntity(db: Awaited<ReturnType<typeof createDatabaseConnection>>, entityId: string, tenantId: number) {
  const now = '2026-06-28T10:00:00.000Z'
  await db.run(
    `
      INSERT INTO entity_profile (
        id,
        owner_id,
        owner_user_id,
        owner_tenant_id,
        created_at,
        updated_at,
        entity_profile
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    entityId,
    `user:100:tenant:${tenantId}`,
    100,
    tenantId,
    now,
    now,
    JSON.stringify({
      id: entityId,
      metadata: {
        businessConfig: {
          businessType: 'legal',
          officeName: 'Ana Rocha Advocacia',
        },
      },
    }),
  )
}

async function insertLegacyCase(args: {
  db: Awaited<ReturnType<typeof createDatabaseConnection>>
  id: string
  tenantId: number
  entityId: string
  metadata: Record<string, unknown>
  clientDisplayName?: string | null
  clientCanonicalName?: string | null
  clientDisplayPhone?: string | null
  clientCanonicalPhone?: string | null
  clientDisplayWhatsapp?: string | null
  clientCanonicalWhatsapp?: string | null
  clientDisplayEmail?: string | null
  clientCanonicalEmail?: string | null
  clientDisplayCity?: string | null
  clientCanonicalCity?: string | null
  clientSearchKey?: string | null
}) {
  const now = '2026-06-29T10:00:00.000Z'

  await args.db.run(
    `
      INSERT INTO cases (
        id,
        tenant_id,
        request_id,
        entity_id,
        title,
        description,
        status,
        priority,
        practice_area,
        source,
        opened_at,
        client_display_name,
        client_canonical_name,
        client_display_phone,
        client_canonical_phone,
        client_display_whatsapp,
        client_canonical_whatsapp,
        client_display_email,
        client_canonical_email,
        client_display_city,
        client_canonical_city,
        client_search_key,
        centelha_context,
        metadata,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args.id,
    args.tenantId,
    `${args.id}-request`,
    args.entityId,
    `Caso ${args.id}`,
    'Descrição legado',
    'open',
    'normal',
    'Trabalhista',
    'public-interaction',
    now,
    args.clientDisplayName ?? null,
    args.clientCanonicalName ?? null,
    args.clientDisplayPhone ?? null,
    args.clientCanonicalPhone ?? null,
    args.clientDisplayWhatsapp ?? null,
    args.clientCanonicalWhatsapp ?? null,
    args.clientDisplayEmail ?? null,
    args.clientCanonicalEmail ?? null,
    args.clientDisplayCity ?? null,
    args.clientCanonicalCity ?? null,
    args.clientSearchKey ?? null,
    '{}',
    JSON.stringify(args.metadata),
    now,
    now,
  )
}

test('initializeDatabase creates legal integrity indexes for public triage replay and message sequencing', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-integrity-indexes-')

  try {
    await initializeDatabase(harness.db)

    const caseColumns = await harness.db.all<Array<{ name: string }>>(`PRAGMA table_info(cases)`)
    const caseIndexes = await harness.db.all<Array<{ name: string; unique: number }>>(`PRAGMA index_list(cases)`)
    const caseMessageIndexes = await harness.db.all<Array<{ name: string; unique: number }>>(`PRAGMA index_list(case_messages)`)
    const fingerprintColumns = await harness.db.all<Array<{ name: string }>>(`PRAGMA table_info(public_triage_fingerprints)`)
    const fingerprintIndexes = await harness.db.all<Array<{ name: string; unique: number }>>(`PRAGMA index_list(public_triage_fingerprints)`)
    const signalIndexes = await harness.db.all<Array<{ name: string }>>(`PRAGMA index_list(entity_portfolio_lead_signal)`)
    const leadIndexes = await harness.db.all<Array<{ name: string }>>(`PRAGMA index_list(entity_portfolio_lead)`)
    const intakeIndexes = await harness.db.all<Array<{ name: string }>>(`PRAGMA index_list(entity_portfolio_lead_intake)`)

    assert.ok(caseColumns.some((row) => row.name === 'client_display_name'))
    assert.ok(caseColumns.some((row) => row.name === 'client_canonical_phone'))
    assert.ok(caseColumns.some((row) => row.name === 'client_canonical_whatsapp'))
    assert.ok(caseColumns.some((row) => row.name === 'client_canonical_email'))
    assert.ok(caseColumns.some((row) => row.name === 'client_search_key'))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_tenant_entity_request'))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_public_request_unique' && row.unique === 1))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_tenant_client_canonical_phone'))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_tenant_client_canonical_whatsapp'))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_tenant_client_canonical_email'))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_tenant_client_search_key'))
    assert.ok(caseIndexes.some((row) => row.name === 'idx_cases_tenant_client_canonical_city'))
    assert.ok(fingerprintColumns.some((row) => row.name === 'fingerprint'))
    assert.ok(fingerprintColumns.some((row) => row.name === 'case_id'))
    assert.ok(fingerprintColumns.some((row) => row.name === 'expires_at'))
    assert.ok(fingerprintIndexes.some((row) => row.name === 'idx_public_triage_fingerprints_lookup'))
    assert.ok(fingerprintIndexes.some((row) => row.name === 'idx_public_triage_fingerprints_lookup_expiry'))
    assert.ok(fingerprintIndexes.some((row) => row.name === 'idx_public_triage_fingerprints_case'))
    assert.ok(fingerprintIndexes.some((row) => row.name === 'idx_public_triage_fingerprints_request'))
    assert.ok(fingerprintIndexes.some((row) => row.name === 'idx_public_triage_fingerprints_active_unique' && row.unique === 1))
    assert.ok(caseMessageIndexes.some((row) => row.name === 'idx_case_messages_case_sequence' && row.unique === 1))
    assert.ok(caseMessageIndexes.some((row) => row.name === 'idx_case_messages_public_triage_request_unique' && row.unique === 1))
    assert.ok(signalIndexes.some((row) => row.name === 'idx_entity_portfolio_lead_signal_entity_request'))
    assert.ok(leadIndexes.some((row) => row.name === 'idx_entity_portfolio_lead_entity_request'))
    assert.ok(intakeIndexes.some((row) => row.name === 'idx_entity_portfolio_lead_intake_entity_request'))
  } finally {
    await harness.cleanup()
  }
})

test('database integrity accepts portal access timeline event types', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-db-integrity-portal-timeline-')

  try {
    await initializeDatabase(harness.db)
    const now = '2026-06-30T12:00:00.000Z'

    await harness.db.run(
      `
        INSERT INTO cases (
          id,
          tenant_id,
          entity_id,
          title,
          status,
          priority,
          opened_at,
          centelha_context,
          metadata,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'case-portal-timeline-1',
      11,
      'office-portal-timeline-1',
      'Caso portal timeline',
      'open',
      'normal',
      now,
      '{}',
      '{}',
      now,
      now,
    )

    await harness.db.run(
      `
        INSERT INTO case_timeline (
          id,
          tenant_id,
          case_id,
          event_type,
          occurred_at,
          payload,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'portal-created-event',
      11,
      'case-portal-timeline-1',
      'portal_access_created',
      now,
      JSON.stringify({
        tokenId: 'token-1',
        expiresAt: '2026-07-30T12:00:00.000Z',
      }),
      now,
      now,
    )

    await harness.db.run(
      `
        INSERT INTO case_timeline (
          id,
          tenant_id,
          case_id,
          event_type,
          occurred_at,
          payload,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'portal-used-event',
      11,
      'case-portal-timeline-1',
      'portal_access_used',
      now,
      JSON.stringify({
        tokenId: 'token-1',
        usedAt: now,
      }),
      now,
      now,
    )
  } finally {
    await harness.cleanup()
  }
})

test('createCase persists structured canonical contact columns while preserving legacy metadata', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-contact-columns-')
  const now = '2026-06-29T10:00:00.000Z'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, 'office-db-contact-1', 11)
    const repository = createCaseRepository(harness.db)

    const created = await repository.createCase({
      tenantId: 11,
      entityId: 'office-db-contact-1',
      requestId: 'request-contact-1',
      title: 'Caso com contato canônico',
      description: 'Descrição',
      status: 'open',
      priority: 'normal',
      practiceArea: 'Trabalhista',
      source: 'public-interaction',
      openedAt: now,
      metadata: {
        publicTriage: {
          requestId: 'request-contact-1',
          contactValue: '(31) 99999-9999',
        },
      },
      contactIdentity: {
        displayName: 'João da Silva',
        canonicalName: 'João da Silva',
        displayPhone: undefined,
        canonicalPhone: undefined,
        displayWhatsapp: '(31) 99999-9999',
        canonicalWhatsapp: '5531999999999',
        displayEmail: undefined,
        canonicalEmail: undefined,
        displayCity: 'Belo Horizonte',
        canonicalCity: 'Belo Horizonte',
        searchKey: 'joão da silva|5531999999999|belo horizonte',
      },
    })

    assert.equal(created.clientCanonicalWhatsapp, '5531999999999')
    assert.equal(created.clientSearchKey, 'joão da silva|5531999999999|belo horizonte')
    assert.equal(created.metadata.publicTriage?.requestId, 'request-contact-1')

    const raw = await harness.db.get<{
      client_canonical_phone: string | null
      client_canonical_whatsapp: string | null
      client_canonical_email: string | null
      client_search_key: string | null
      metadata: string
    }>(
      `
        SELECT
          client_canonical_phone,
          client_canonical_whatsapp,
          client_canonical_email,
          client_search_key,
          metadata
        FROM cases
        WHERE id = ?
      `,
      created.id,
    )

    assert.equal(raw?.client_canonical_phone ?? null, null)
    assert.equal(raw?.client_canonical_whatsapp, '5531999999999')
    assert.equal(raw?.client_canonical_email ?? null, null)
    assert.equal(raw?.client_search_key, 'joão da silva|5531999999999|belo horizonte')
    assert.equal(JSON.parse(raw?.metadata ?? '{}').publicTriage?.requestId, 'request-contact-1')

    const phoneCase = await repository.createCase({
      tenantId: 11,
      entityId: 'office-db-contact-1',
      requestId: 'request-contact-2',
      title: 'Caso com telefone canônico',
      status: 'open',
      priority: 'normal',
      source: 'public-interaction',
      openedAt: now,
      contactIdentity: {
        displayName: 'Maria Souza',
        canonicalName: 'Maria Souza',
        displayPhone: '+55 31 98888-7777',
        canonicalPhone: '5531988887777',
        displayWhatsapp: undefined,
        canonicalWhatsapp: undefined,
        displayEmail: undefined,
        canonicalEmail: undefined,
        displayCity: 'São Paulo',
        canonicalCity: 'São Paulo',
        searchKey: 'maria souza|5531988887777|são paulo',
      },
    })

    const emailCase = await repository.createCase({
      tenantId: 11,
      entityId: 'office-db-contact-1',
      requestId: 'request-contact-3',
      title: 'Caso com email canônico',
      status: 'open',
      priority: 'normal',
      source: 'public-interaction',
      openedAt: now,
      contactIdentity: {
        displayName: 'Ana Rocha',
        canonicalName: 'Ana Rocha',
        displayPhone: undefined,
        canonicalPhone: undefined,
        displayWhatsapp: undefined,
        canonicalWhatsapp: undefined,
        displayEmail: 'ANA@EXEMPLO.COM',
        canonicalEmail: 'ana@exemplo.com',
        displayCity: 'Curitiba',
        canonicalCity: 'Curitiba',
        searchKey: 'ana rocha|ana@exemplo.com|curitiba',
      },
    })

    const contactRows = await harness.db.all<Array<{
      id: string
      client_canonical_phone: string | null
      client_canonical_whatsapp: string | null
      client_canonical_email: string | null
      client_search_key: string | null
    }>>(
      `
        SELECT
          id,
          client_canonical_phone,
          client_canonical_whatsapp,
          client_canonical_email,
          client_search_key
        FROM cases
        WHERE id IN (?, ?)
        ORDER BY id ASC
      `,
      phoneCase.id,
      emailCase.id,
    )

    const phoneRow = contactRows.find((row) => row.id === phoneCase.id)
    const emailRow = contactRows.find((row) => row.id === emailCase.id)
    assert.equal(phoneRow?.client_canonical_phone, '5531988887777')
    assert.equal(phoneRow?.client_canonical_whatsapp ?? null, null)
    assert.equal(phoneRow?.client_search_key, 'maria souza|5531988887777|são paulo')
    assert.equal(emailRow?.client_canonical_email, 'ana@exemplo.com')
    assert.equal(emailRow?.client_canonical_phone ?? null, null)
    assert.equal(emailRow?.client_search_key, 'ana rocha|ana@exemplo.com|curitiba')
  } finally {
    await harness.cleanup()
  }
})

test('backfillCaseStructuredContactIdentity fills structured case columns from legacy metadata sources without overwriting populated values', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-contact-backfill-')

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, 'office-db-contact-backfill-1', 11)

    await insertLegacyCase({
      db: harness.db,
      id: 'case-from-contact-identity',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {
        canonicalCaseInput: {
          contactIdentity: {
            displayName: 'Mariana Souza',
            displayWhatsapp: '(31) 99999-8888',
            canonicalWhatsapp: '5531999998888',
            displayCity: 'Belo Horizonte',
          },
        },
      },
    })

    await insertLegacyCase({
      db: harness.db,
      id: 'case-from-canonical-contact',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {
        canonicalCaseInput: {
          clientName: 'Ana Rocha',
          contact: '+55 31 98888-7777',
          contactPreference: 'Telefone',
          city: 'São Paulo',
        },
      },
    })

    await insertLegacyCase({
      db: harness.db,
      id: 'case-from-public-triage',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {
        publicTriage: {
          clientName: 'Bruno Lima',
          contactPreference: 'email',
          contactValue: ' BRUNO@EMAIL.COM ',
          city: 'Curitiba',
        },
      },
    })

    await insertLegacyCase({
      db: harness.db,
      id: 'case-from-legacy-metadata',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {
        clientName: 'Carlos Dias',
        contactPreference: 'whatsapp',
        contact: '031999998888',
        city: 'Recife',
      },
    })

    await insertLegacyCase({
      db: harness.db,
      id: 'case-prepopulated',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {
        canonicalCaseInput: {
          clientName: 'Pessoa Nova',
          contact: '(31) 90000-0000',
          contactPreference: 'whatsapp',
          city: 'Vitória',
        },
      },
      clientDisplayName: 'Pessoa Existente',
      clientCanonicalName: 'Pessoa Existente',
      clientDisplayWhatsapp: '(31) 91111-1111',
      clientCanonicalWhatsapp: '5531911111111',
      clientDisplayCity: 'Salvador',
      clientCanonicalCity: 'Salvador',
      clientSearchKey: 'pessoa existente|5531911111111|salvador',
    })

    await insertLegacyCase({
      db: harness.db,
      id: 'case-invalid-contact',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {
        clientName: 'Contato Inválido',
        contactPreference: 'email',
        contact: 'nao-e-email',
        city: 'Fortaleza',
      },
    })

    await insertLegacyCase({
      db: harness.db,
      id: 'case-no-contact',
      tenantId: 11,
      entityId: 'office-db-contact-backfill-1',
      metadata: {},
    })

    await backfillCaseStructuredContactIdentity(harness.db)
    await backfillCaseStructuredContactIdentity(harness.db)

    const rows = await harness.db.all<Array<{
      id: string
      client_display_name: string | null
      client_canonical_name: string | null
      client_display_phone: string | null
      client_canonical_phone: string | null
      client_display_whatsapp: string | null
      client_canonical_whatsapp: string | null
      client_display_email: string | null
      client_canonical_email: string | null
      client_display_city: string | null
      client_canonical_city: string | null
      client_search_key: string | null
    }>>(
      `
        SELECT
          id,
          client_display_name,
          client_canonical_name,
          client_display_phone,
          client_canonical_phone,
          client_display_whatsapp,
          client_canonical_whatsapp,
          client_display_email,
          client_canonical_email,
          client_display_city,
          client_canonical_city,
          client_search_key
        FROM cases
        WHERE tenant_id = ?
        ORDER BY id ASC
      `,
      11,
    )

    const fromIdentity = rows.find((row) => row.id === 'case-from-contact-identity')
    const fromCanonicalContact = rows.find((row) => row.id === 'case-from-canonical-contact')
    const fromPublicTriage = rows.find((row) => row.id === 'case-from-public-triage')
    const fromLegacyMetadata = rows.find((row) => row.id === 'case-from-legacy-metadata')
    const prepopulated = rows.find((row) => row.id === 'case-prepopulated')
    const invalidContact = rows.find((row) => row.id === 'case-invalid-contact')
    const noContact = rows.find((row) => row.id === 'case-no-contact')

    assert.equal(fromIdentity?.client_display_name, 'Mariana Souza')
    assert.equal(fromIdentity?.client_canonical_whatsapp, '5531999998888')
    assert.equal(fromIdentity?.client_search_key, 'mariana souza|5531999998888|belo horizonte')

    assert.equal(fromCanonicalContact?.client_canonical_phone, '5531988887777')
    assert.equal(fromCanonicalContact?.client_display_phone, '+55 31 98888-7777')
    assert.equal(fromCanonicalContact?.client_search_key, 'ana rocha|5531988887777|são paulo')

    assert.equal(fromPublicTriage?.client_canonical_email, 'bruno@email.com')
    assert.equal(fromPublicTriage?.client_display_email, 'BRUNO@EMAIL.COM')
    assert.equal(fromPublicTriage?.client_search_key, 'bruno lima|bruno@email.com|curitiba')

    assert.equal(fromLegacyMetadata?.client_canonical_whatsapp, '5531999998888')
    assert.equal(fromLegacyMetadata?.client_display_name, 'Carlos Dias')

    assert.equal(prepopulated?.client_display_name, 'Pessoa Existente')
    assert.equal(prepopulated?.client_canonical_whatsapp, '5531911111111')
    assert.equal(prepopulated?.client_search_key, 'pessoa existente|5531911111111|salvador')

    assert.equal(invalidContact?.client_display_name, 'Contato Inválido')
    assert.equal(invalidContact?.client_canonical_email ?? null, null)
    assert.equal(invalidContact?.client_display_city, 'Fortaleza')

    assert.equal(noContact?.client_display_name ?? null, null)
    assert.equal(noContact?.client_search_key ?? null, null)
  } finally {
    await harness.cleanup()
  }
})

test('database blocks duplicate public case request ids and orphan case-linked records', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-integrity-constraints-')
  const now = '2026-06-28T10:00:00.000Z'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, 'office-db-integrity-1', 11)

    await harness.db.run(
      `
        INSERT INTO cases (
          id,
          tenant_id,
          case_number,
          request_id,
          entity_id,
          title,
          description,
          status,
          priority,
          practice_area,
          source,
          opened_at,
          centelha_context,
          metadata,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'case-1',
      11,
      'CASE-1',
      'request-1',
      'office-db-integrity-1',
      'Caso 1',
      'Descrição 1',
      'open',
      'normal',
      'Trabalhista',
      'public-interaction',
      now,
      '{}',
      JSON.stringify({
        publicTriage: {
          requestId: 'request-1',
        },
      }),
      now,
      now,
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO cases (
            id,
            tenant_id,
            case_number,
            request_id,
            entity_id,
            title,
            description,
            status,
            priority,
            practice_area,
            source,
            opened_at,
            centelha_context,
            metadata,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'case-2',
        11,
        'CASE-2',
        'request-1',
        'office-db-integrity-1',
        'Caso 2',
        'Descrição 2',
        'open',
        'normal',
        'Trabalhista',
        'public-interaction',
        now,
        '{}',
        JSON.stringify({
          publicTriage: {
            requestId: 'request-1',
          },
        }),
        now,
        now,
      ),
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO case_messages (
            id,
            tenant_id,
            case_id,
            message_type,
            message_status,
            direction,
            body,
            content,
            attachments,
            sequence_no,
            sent_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'orphan-message',
        11,
        'missing-case',
        'note',
        'sent',
        'inbound',
        'Mensagem órfã',
        '{}',
        '[]',
        1,
        now,
        now,
        now,
      ),
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO case_timeline (
            id,
            tenant_id,
            case_id,
            event_type,
            occurred_at,
            payload,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'orphan-timeline',
        11,
        'missing-case',
        'created',
        now,
        '{}',
        now,
        now,
      ),
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO case_portal_access_tokens (
            id,
            tenant_id,
            case_id,
            token_hash,
            status,
            issued_at,
            expires_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'orphan-token',
        11,
        'missing-case',
        'hash-1',
        'active',
        now,
        '2026-07-28T10:00:00.000Z',
        now,
        now,
      ),
    )
  } finally {
    await harness.cleanup()
  }
})

test('database enforces unique message sequence and unique public triage initial message request per case', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-case-integrity-messages-')
  const now = '2026-06-28T10:00:00.000Z'

  try {
    await initializeDatabase(harness.db)
    await seedEntity(harness.db, 'office-db-integrity-2', 11)

    await harness.db.run(
      `
        INSERT INTO cases (
          id,
          tenant_id,
          case_number,
          request_id,
          entity_id,
          title,
          description,
          status,
          priority,
          practice_area,
          source,
          opened_at,
          centelha_context,
          metadata,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'case-seq-1',
      11,
      'CASE-SEQ-1',
      'request-seq-1',
      'office-db-integrity-2',
      'Caso sequência',
      'Descrição sequência',
      'open',
      'normal',
      'Trabalhista',
      'public-interaction',
      now,
      '{}',
      JSON.stringify({}),
      now,
      now,
    )

    await harness.db.run(
      `
        INSERT INTO case_messages (
          id,
          tenant_id,
          case_id,
          message_type,
          message_status,
          direction,
          channel,
          body,
          content,
          attachments,
          sequence_no,
          sent_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'message-1',
      11,
      'case-seq-1',
      'note',
      'sent',
      'inbound',
      'public_triage',
      'Mensagem inicial',
      JSON.stringify({
        source: 'public_triage',
        requestId: 'triage-request-1',
      }),
      '[]',
      1,
      now,
      now,
      now,
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO case_messages (
            id,
            tenant_id,
            case_id,
            message_type,
            message_status,
            direction,
            channel,
            body,
            content,
            attachments,
            sequence_no,
            sent_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'message-2',
        11,
        'case-seq-1',
        'note',
        'sent',
        'outbound',
        'email',
        'Mensagem duplicada de sequência',
        '{}',
        '[]',
        1,
        now,
        now,
        now,
      ),
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO case_messages (
            id,
            tenant_id,
            case_id,
            message_type,
            message_status,
            direction,
            channel,
            body,
            content,
            attachments,
            sequence_no,
            sent_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'message-3',
        11,
        'case-seq-1',
        'note',
        'sent',
        'inbound',
        'public_triage',
        'Mensagem inicial duplicada',
        JSON.stringify({
          source: 'public_triage',
          requestId: 'triage-request-1',
        }),
        '[]',
        2,
        now,
        now,
        now,
      ),
    )
  } finally {
    await harness.cleanup()
  }
})
