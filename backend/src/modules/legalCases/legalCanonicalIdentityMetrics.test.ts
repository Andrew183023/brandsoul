import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import { createLegalCanonicalCaseReadService } from './legalCanonicalCaseReadService.js'

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

async function seedCase(args: {
  db: Awaited<ReturnType<typeof createDatabaseConnection>>
  tenantId: number
  requestId: string
  entityId: string
  contactIdentity?: {
    displayName?: string
    canonicalName?: string
    displayPhone?: string
    canonicalPhone?: string
    displayWhatsapp?: string
    canonicalWhatsapp?: string
    displayEmail?: string
    canonicalEmail?: string
    displayCity?: string
    canonicalCity?: string
    searchKey?: string
  }
  metadata?: Record<string, unknown>
}) {
  const repository = createCaseRepository(args.db)
  return repository.createCase({
    tenantId: args.tenantId,
    entityId: args.entityId,
    requestId: args.requestId,
    title: 'Caso jurídico',
    description: 'Descrição inicial',
    status: 'open',
    priority: 'normal',
    practiceArea: 'Direito Trabalhista',
    source: 'public-interaction',
    openedAt: '2026-06-29T10:20:00.000Z',
    contactIdentity: args.contactIdentity,
    metadata: args.metadata ?? {},
  })
}

test('canonical identity metrics record structured source when structured columns are available', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-identity-structured-')

  try {
    await initializeDatabase(harness.db)
    const created = await seedCase({
      db: harness.db,
      tenantId: 11,
      requestId: 'structured-request',
      entityId: 'office-structured',
      contactIdentity: {
        displayName: 'João da Silva',
        canonicalName: 'joão da silva',
        displayWhatsapp: '31999998888',
        canonicalWhatsapp: '5531999998888',
        displayCity: 'Belo Horizonte',
        canonicalCity: 'belo horizonte',
        searchKey: 'joão da silva|5531999998888|belo horizonte',
      },
      metadata: {
        canonicalCaseInput: {
          clientName: 'Snapshot Divergente',
          contactPreference: 'Email',
          city: 'Cidade Snapshot',
        },
      },
    })

    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const service = createLegalCanonicalCaseReadService(harness.db, recorder)

    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: created.id,
    })

    assert.ok(projection)

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_structured_identity_used_total, 1)
    assert.equal(snapshot.customCounters.legal_identity_fallback_used_total ?? 0, 0)
    assert.equal(
      snapshot.customCounterSeries['legal_structured_identity_used_total{entity_id=office-structured,result=used,source=structured_columns,tenant_id=11}'],
      1,
    )
  } finally {
    await harness.cleanup()
  }
})

test('canonical identity metrics record canonicalCaseInput fallback when structured columns are absent', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-identity-snapshot-')

  try {
    await initializeDatabase(harness.db)
    const created = await seedCase({
      db: harness.db,
      tenantId: 11,
      requestId: 'snapshot-request',
      entityId: 'office-snapshot',
      metadata: {
        canonicalCaseInput: {
          clientName: 'Mariana Souza',
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
            searchKey: 'mariana souza|5511999999999|belo horizonte',
          },
          metadata: {},
          initialMessage: {
            body: 'Mensagem inicial',
            direction: 'inbound',
            messageType: 'note',
            messageStatus: 'sent',
          },
        },
      },
    })

    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const service = createLegalCanonicalCaseReadService(harness.db, recorder)

    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: created.id,
    })

    assert.ok(projection)

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_structured_identity_used_total ?? 0, 0)
    assert.equal(snapshot.customCounters.legal_identity_fallback_used_total, 1)
    assert.equal(
      snapshot.customCounterSeries['legal_identity_fallback_used_total{entity_id=office-snapshot,reason=structured_missing,result=fallback,source=canonical_case_input,tenant_id=11}'],
      1,
    )
  } finally {
    await harness.cleanup()
  }
})

test('canonical identity metrics record publicTriage fallback when structured columns and snapshot are absent', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-identity-public-triage-')

  try {
    await initializeDatabase(harness.db)
    const created = await seedCase({
      db: harness.db,
      tenantId: 11,
      requestId: 'public-triage-request',
      entityId: 'office-public-triage',
      metadata: {
        publicTriage: {
          clientName: 'Cliente Público',
          contactValue: '5511988887777',
          contactPreference: 'WhatsApp',
          city: 'Recife',
        },
      },
    })

    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const service = createLegalCanonicalCaseReadService(harness.db, recorder)

    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: created.id,
    })

    assert.ok(projection)

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_identity_fallback_used_total, 1)
    assert.equal(
      snapshot.customCounterSeries['legal_identity_fallback_used_total{entity_id=office-public-triage,reason=structured_and_snapshot_missing,result=fallback,source=public_triage,tenant_id=11}'],
      1,
    )
  } finally {
    await harness.cleanup()
  }
})

test('canonical identity metrics record metadata fallback when only direct metadata remains', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-identity-metadata-')

  try {
    await initializeDatabase(harness.db)
    const created = await seedCase({
      db: harness.db,
      tenantId: 11,
      requestId: 'metadata-request',
      entityId: 'office-metadata',
      metadata: {
        clientName: 'Cliente Legado',
        contact: '5511977776666',
        contactPreference: 'Telefone',
        city: 'Salvador',
      },
    })

    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const service = createLegalCanonicalCaseReadService(harness.db, recorder)

    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: created.id,
    })

    assert.ok(projection)

    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_identity_fallback_used_total, 1)
    assert.equal(
      snapshot.customCounterSeries['legal_identity_fallback_used_total{entity_id=office-metadata,reason=structured_snapshot_and_public_triage_missing,result=fallback,source=metadata,tenant_id=11}'],
      1,
    )

    const serializedSeries = JSON.stringify(snapshot.customCounterSeries)
    assert.equal(serializedSeries.includes('Cliente Legado'), false)
    assert.equal(serializedSeries.includes('5511977776666'), false)
    assert.equal(serializedSeries.includes('Salvador'), false)
    assert.equal(serializedSeries.includes(created.id), false)
    assert.equal(serializedSeries.includes('metadata-request'), false)
  } finally {
    await harness.cleanup()
  }
})

test('canonical identity metrics remain compatible when read service has no recorder', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-identity-no-recorder-')

  try {
    await initializeDatabase(harness.db)
    const created = await seedCase({
      db: harness.db,
      tenantId: 11,
      requestId: 'no-recorder-request',
      entityId: 'office-no-recorder',
      metadata: {
        publicTriage: {
          clientName: 'Cliente Público',
          contactValue: '5511988887777',
          contactPreference: 'WhatsApp',
          city: 'Recife',
        },
      },
    })

    const service = createLegalCanonicalCaseReadService(harness.db)
    const projection = await service.getCanonicalCase({
      tenantId: 11,
      caseId: created.id,
    })

    assert.ok(projection)
  } finally {
    await harness.cleanup()
  }
})

test('resolveLegalIdentitySource stays aligned with precedence', async () => {
  const { resolveLegalIdentitySource } = await import('./legalCanonicalIdentity.js')

  assert.deepEqual(
    resolveLegalIdentitySource({
      id: 'case-a',
      tenantId: 11,
      requestId: 'req-a',
      title: 'Caso',
      status: 'open',
      priority: 'normal',
      source: 'public-interaction',
      openedAt: '2026-06-29T10:20:00.000Z',
      centelhaContext: {},
      metadata: {
        canonicalCaseInput: {
          clientName: 'Snapshot',
        },
      },
      clientDisplayName: 'Structured',
      createdAt: '2026-06-29T10:20:00.000Z',
      updatedAt: '2026-06-29T10:20:00.000Z',
    }),
    {
      source: 'structured_columns',
      reason: 'structured_available',
    },
  )

  assert.deepEqual(
    resolveLegalIdentitySource({
      id: 'case-b',
      tenantId: 11,
      requestId: 'req-b',
      title: 'Caso',
      status: 'open',
      priority: 'normal',
      source: 'public-interaction',
      openedAt: '2026-06-29T10:20:00.000Z',
      centelhaContext: {},
      metadata: {
        canonicalCaseInput: {
          clientName: 'Snapshot',
        },
      },
      createdAt: '2026-06-29T10:20:00.000Z',
      updatedAt: '2026-06-29T10:20:00.000Z',
    }),
    {
      source: 'canonical_case_input',
      reason: 'structured_missing',
    },
  )
})
