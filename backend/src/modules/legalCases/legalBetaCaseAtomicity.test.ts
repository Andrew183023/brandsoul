import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { buildLegalBetaServer } from '../../server.legal-beta.js'
import { runSeedMutation } from '../../sovereignty/sovereignTestMutationHarness.js'

import { LegalBetaCaseService } from './legalBetaCaseService.js'
import type { CaseRepository } from './caseRepository.js'
import type { CreateCaseInput } from './caseTypes.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    sovereignMutationCommandService: SovereignMutationCommandService
    observability: {
      getMetricsSnapshot(): {
        customCounters: Record<string, number>
        customCounterSeries: Record<string, number>
      }
    }
  }
}

type Harness = {
  app: AppWithContext
  privateKeyPem: string
  configuredKid: string
  close(): Promise<void>
}

function createEntityProfileFixture(id: string): EntityProfile {
  return {
    id,
    social: {
      publicName: 'Ana Rocha Advocacia',
    },
    metadata: {
      createdAt: '2026-06-28T10:00:00.000Z',
      notes: [],
      businessConfig: {
        businessType: 'legal',
        officeName: 'Ana Rocha Advocacia',
      },
    },
  } as unknown as EntityProfile
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-case-atomicity-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-case-atomicity-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    SQLITE_FILE: process.env.SQLITE_FILE,
    ASSET_STORAGE_DIR: process.env.ASSET_STORAGE_DIR,
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
    AUTH_ACTIVE_KID: process.env.AUTH_ACTIVE_KID,
    AUTH_PRIVATE_KEY_REF: process.env.AUTH_PRIVATE_KEY_REF,
    AUTH_PUBLIC_KEY_PATH: process.env.AUTH_PUBLIC_KEY_PATH,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  }

  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'legal-beta-case-atomicity-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-case-atomicity.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-case-atomicity'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-case-atomicity'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildLegalBetaServer() as AppWithContext

  await runSeedMutation(async () => {
    await app.backendContext.entityRepository.createEntity({
      id: 'office-atomicity-1',
      ownerId: 'user:100:tenant:11',
      ownerUserId: 100,
      ownerTenantId: 11,
      entityProfile: createEntityProfileFixture('office-atomicity-1'),
    })
  }, 'backend/src/modules/legalCases/legalBetaCaseAtomicity.test.ts#createHarness')

  return {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      await app.close()
      await app.backendContext.connection.close()
      await rm(workspace, { recursive: true, force: true })
      for (const [key, value] of Object.entries(previousEnv)) {
        if (typeof value === 'undefined') {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    },
  }
}

async function createAccessToken(
  userId: number,
  tenantId: number,
  role: 'owner' | 'admin' | 'lawyer' | 'client',
  privateKeyPem: string,
  kid: string,
) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(userId),
    tenant_id: String(tenantId),
    roles: [role],
    ver: 1,
    jti: `legal-beta-case-atomicity-${role}-${userId}-${tenantId}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-legal-beta-case-atomicity')
    .setAudience('brandsoul-api-legal-beta-case-atomicity')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function countRows(db: BackendDatabase, table: string) {
  const row = await db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`)
  return Number(row?.total ?? 0)
}

async function assertSingleOperationalDossier(db: BackendDatabase) {
  assert.equal(await countRows(db, 'entity_portfolio_lead_signal'), 1)
  assert.equal(await countRows(db, 'entity_portfolio_lead'), 1)
  assert.equal(await countRows(db, 'entity_portfolio_lead_intake'), 1)
  assert.equal(await countRows(db, 'cases'), 1)
  assert.equal(await countRows(db, 'case_messages'), 1)
  assert.equal(await countRows(db, 'public_triage_fingerprints'), 1)
}

function buildValidArgs(requestId: string) {
  return {
    entityId: 'office-atomicity-1',
    requestId,
    userMessage: 'Fui demitido sem receber verbas rescisórias.',
    businessContext: {
      officeName: 'Ana Rocha Advocacia',
    },
    triage: {
      clientName: 'João da Silva',
      city: 'Belo Horizonte',
      practiceArea: 'Direito Trabalhista',
      context: 'Fui demitido sem receber verbas rescisórias.',
      urgency: 'planned' as const,
      objective: 'Entender meus direitos e próximos passos.',
      contactPreference: 'WhatsApp',
      contactValue: '31999998888',
    },
  }
}

test('createPublicTriageCase persists signal, lead, intake, case and portal token atomically on success', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new LegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )
    const result = await service.createPublicTriageCase(buildValidArgs('triage-atomicity-success'))

    assert.ok(result)
    assert.ok(result.caseRecord)
    assert.equal(result.caseRecord.clientCanonicalWhatsapp, '5531999998888')
    assert.equal(result.caseRecord.clientSearchKey, 'joão da silva|5531999998888|belo horizonte')
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_signal'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_intake'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 1)

    const messages = await service.getCaseMessages(11, result.caseRecord.id)
    assert.equal(messages.length, 1)
    assert.equal(messages[0]?.body, 'Fui demitido sem receber verbas rescisórias.')
    assert.equal(messages[0]?.direction, 'inbound')
    assert.equal(messages[0]?.channel, 'public_triage')
    assert.equal(messages[0]?.content?.source, 'public_triage')
    assert.equal(messages[0]?.content?.requestId, 'triage-atomicity-success')
    assert.equal(messages[0]?.content?.leadId, result.leadRecord.leadId)
    assert.equal(messages[0]?.content?.intakeId, result.intakeRecord.intakeId)

    const rawCase = await harness.app.backendContext.connection.get<{
      client_display_whatsapp: string | null
      client_canonical_whatsapp: string | null
      client_search_key: string | null
      metadata: string
    }>(
      `
        SELECT
          client_display_whatsapp,
          client_canonical_whatsapp,
          client_search_key,
          metadata
        FROM cases
        WHERE tenant_id = ? AND id = ?
      `,
      11,
      result.caseRecord.id,
    )
    assert.equal(rawCase?.client_display_whatsapp, '31999998888')
    assert.equal(rawCase?.client_canonical_whatsapp, '5531999998888')
    assert.equal(rawCase?.client_search_key, 'joão da silva|5531999998888|belo horizonte')
    assert.equal(JSON.parse(rawCase?.metadata ?? '{}').canonicalCaseInput?.contactIdentity?.canonicalWhatsapp, '5531999998888')

    await harness.app.backendContext.connection.run(
      `
        UPDATE cases
        SET metadata = ?,
            updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      JSON.stringify({
        ...JSON.parse(rawCase?.metadata ?? '{}'),
        canonicalCaseInput: {
          snapshotVersion: 'historical-only',
          contactIdentity: {
            canonicalWhatsapp: '5555555555555',
          },
        },
      }),
      '2026-06-29T10:30:00.000Z',
      11,
      result.caseRecord.id,
    )

    const timeline = await harness.app.backendContext.connection.all<Array<{
      event_type: string
    }>>(
      `
        SELECT event_type
        FROM case_timeline
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY occurred_at ASC, created_at ASC, id ASC
      `,
      11,
      result.caseRecord.id,
    )
    assert.deepEqual(timeline.map((entry) => entry.event_type), ['created', 'message_added'])

    const replayed = await service.createPublicTriageCase(buildValidArgs('triage-atomicity-success'))
    assert.ok(replayed)
    assert.equal(replayed.caseRecord.id, result.caseRecord.id)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 2)
    const replayMetrics = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal((replayMetrics.customCounters.public_triage_request_replays_total ?? 0) >= 1, true)
    assert.equal((replayMetrics.customCounters.public_triage_duplicate_prevented_total ?? 0) >= 1, true)

    const replayMessages = await service.getCaseMessages(11, result.caseRecord.id)
    assert.equal(replayMessages.length, 1)

    const replayRawCase = await harness.app.backendContext.connection.get<{
      metadata: string
    }>(
      `
        SELECT metadata
        FROM cases
        WHERE tenant_id = ? AND id = ?
      `,
      11,
      result.caseRecord.id,
    )
    const replayMetadata = JSON.parse(replayRawCase?.metadata ?? '{}') as Record<string, unknown>
    assert.deepEqual(replayMetadata.canonicalCaseInput, {
      snapshotVersion: 'historical-only',
      contactIdentity: {
        canonicalWhatsapp: '5555555555555',
      },
    })
    assert.equal(
      (replayed.caseRecord.metadata.canonicalCaseInput as { contactIdentity?: { canonicalWhatsapp?: string } } | undefined)
        ?.contactIdentity?.canonicalWhatsapp,
      '5555555555555',
    )
    assert.equal(replayed.caseRecord.clientCanonicalWhatsapp, '5531999998888')

    const replayTimeline = await harness.app.backendContext.connection.all<Array<{
      event_type: string
    }>>(
      `
        SELECT event_type
        FROM case_timeline
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY occurred_at ASC, created_at ASC, id ASC
      `,
      11,
      result.caseRecord.id,
    )
    assert.deepEqual(replayTimeline.map((entry) => entry.event_type), ['created', 'message_added'])

    const portalMessagesResponse = await harness.app.inject({
      method: 'GET',
      url: `/client/portal/${result.caseRecord.id}/${result.portalAccess.rawToken}/messages`,
    })
    assert.equal(portalMessagesResponse.statusCode, 200)
    const portalMessagesBody = portalMessagesResponse.json() as {
      status: string
      messages: Array<{ text: string }>
    }
    assert.equal(portalMessagesBody.status, 'ready')
    assert.equal(portalMessagesBody.messages.length, 1)
    assert.equal(portalMessagesBody.messages[0]?.text, 'Fui demitido sem receber verbas rescisórias.')

    const ownerToken = await createAccessToken(100, 11, 'owner', harness.privateKeyPem, harness.configuredKid)
    const adminMessagesResponse = await harness.app.inject({
      method: 'GET',
      url: `/cases/${result.caseRecord.id}/messages`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    })
    assert.equal(adminMessagesResponse.statusCode, 200)
    const adminMessagesBody = adminMessagesResponse.json() as {
      status: string
      messages: Array<{ text: string }>
    }
    assert.equal(adminMessagesBody.status, 'ready')
    assert.equal(adminMessagesBody.messages.length, 1)
    assert.equal(adminMessagesBody.messages[0]?.text, 'Fui demitido sem receber verbas rescisórias.')
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase reuses the same case for equivalent fingerprint hits with a new requestId', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new LegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const first = await service.createPublicTriageCase(buildValidArgs('triage-fingerprint-first'))
    assert.ok(first)

    await harness.app.backendContext.connection.run(
      `
        UPDATE cases
        SET metadata = ?,
            updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      JSON.stringify({
        ...first.caseRecord.metadata,
        canonicalCaseInput: {
          snapshotVersion: 'fingerprint-historical-only',
          contactIdentity: {
            canonicalWhatsapp: '5444444444444',
          },
        },
      }),
      '2026-06-29T11:00:00.000Z',
      11,
      first.caseRecord.id,
    )

    const second = await service.createPublicTriageCase(buildValidArgs('triage-fingerprint-second'))
    assert.ok(second)
    assert.equal(second.caseRecord.id, first.caseRecord.id)
    assert.notEqual(second.portalAccess.rawToken, first.portalAccess.rawToken)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_signal'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_intake'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'public_triage_fingerprints'), 1)

    const fingerprintRecord = await harness.app.backendContext.connection.get<{
      status: string
      case_id: string | null
      metadata: string
    }>(
      `
        SELECT status, case_id, metadata
        FROM public_triage_fingerprints
        WHERE tenant_id = ? AND entity_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      11,
      'office-atomicity-1',
    )
    assert.equal(fingerprintRecord?.case_id, first.caseRecord.id)
    assert.equal(fingerprintRecord?.status, 'reused')
    const fingerprintMetadata = JSON.parse(fingerprintRecord?.metadata ?? '{}') as Record<string, unknown>
    assert.equal(fingerprintMetadata.hasCanonicalContact, true)
    assert.equal(typeof fingerprintMetadata.practiceArea, 'string')
    assert.equal('canonicalContact' in fingerprintMetadata, false)

    const firstCaseBeforeReuse = await harness.app.backendContext.connection.get<{ metadata: string }>(
      `
        SELECT metadata
        FROM cases
        WHERE tenant_id = ? AND id = ?
      `,
      11,
      first.caseRecord.id,
    )
    const firstCaseBeforeReuseMetadata = JSON.parse(firstCaseBeforeReuse?.metadata ?? '{}') as Record<string, unknown>
    assert.deepEqual(firstCaseBeforeReuseMetadata.canonicalCaseInput, {
      snapshotVersion: 'fingerprint-historical-only',
      contactIdentity: {
        canonicalWhatsapp: '5444444444444',
      },
    })
    assert.equal(
      (second.caseRecord.metadata.canonicalCaseInput as { contactIdentity?: { canonicalWhatsapp?: string } } | undefined)
        ?.contactIdentity?.canonicalWhatsapp,
      '5444444444444',
    )
    assert.equal(second.caseRecord.clientCanonicalWhatsapp, '5531999998888')
    const metrics = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.public_triage_fingerprint_hits_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounters.public_triage_case_reused_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounterSeries['public_triage_fingerprint_hits_total{entity_id=office-atomicity-1,reason=pre_lookup_hit,source=public_triage}'] ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase keeps one operational dossier across five equivalent requestIds', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new LegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const results = [] as Array<Awaited<ReturnType<typeof service.createPublicTriageCase>>>
    for (let index = 0; index < 5; index += 1) {
      results.push(await service.createPublicTriageCase(buildValidArgs(`triage-five-requests-${index}`)))
    }

    const caseIds = new Set(results.map((result) => result?.caseRecord.id))
    assert.equal(caseIds.size, 1)
    await assertSingleOperationalDossier(harness.app.backendContext.connection)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 5)

    const timeline = await harness.app.backendContext.connection.all<Array<{ event_type: string }>>(
      `
        SELECT event_type
        FROM case_timeline
        ORDER BY occurred_at ASC, created_at ASC, id ASC
      `,
    )
    assert.deepEqual(timeline.map((entry) => entry.event_type), ['created', 'message_added'])
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase allows a new case after the fingerprint window expires', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new LegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const first = await service.createPublicTriageCase(buildValidArgs('triage-fingerprint-expiry-a'))
    assert.ok(first)

    await harness.app.backendContext.connection.run(
      `
        UPDATE public_triage_fingerprints
        SET expires_at = ?, status = 'expired', updated_at = ?
      `,
      '2000-01-01T00:00:00.000Z',
      new Date().toISOString(),
    )

    const second = await service.createPublicTriageCase(buildValidArgs('triage-fingerprint-expiry-b'))
    assert.ok(second)
    assert.notEqual(second.caseRecord.id, first.caseRecord.id)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_signal'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_intake'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'public_triage_fingerprints'), 2)
  } finally {
    await harness.close()
  }
})

class SlowPersistLegalBetaCaseService extends LegalBetaCaseService {
  protected override async persistCaseWithInitialHistory(repository: CaseRepository, input: CreateCaseInput) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return super.persistCaseWithInitialHistory(repository, input)
  }
}

test('createPublicTriageCase concurrency guard reuses one case for simultaneous equivalent requests', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new SlowPersistLegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const firstPromise = service.createPublicTriageCase(buildValidArgs('triage-concurrency-a'))
    await new Promise((resolve) => setTimeout(resolve, 25))
    const secondPromise = service.createPublicTriageCase(buildValidArgs('triage-concurrency-b'))

    const [first, second] = await Promise.all([firstPromise, secondPromise])

    assert.ok(first)
    assert.ok(second)
    assert.equal(first.caseRecord.id, second.caseRecord.id)
    assert.notEqual(first.portalAccess.rawToken, second.portalAccess.rawToken)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_signal'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_intake'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 1)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'public_triage_fingerprints'), 1)

    const fingerprintRows = await harness.app.backendContext.connection.all<Array<{
      request_id: string
      status: string
      case_id: string | null
    }>>(
      `
        SELECT request_id, status, case_id
        FROM public_triage_fingerprints
      `,
    )
    assert.equal(fingerprintRows.length, 1)
    assert.equal(fingerprintRows[0]?.case_id, first.caseRecord.id)
    assert.ok(['case_created', 'reused'].includes(fingerprintRows[0]?.status ?? ''))
    const metrics = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.public_triage_concurrency_pending_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounters.public_triage_duplicate_prevented_total ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase concurrency guard keeps one dossier across ten simultaneous equivalent requests', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new SlowPersistLegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const promises = Array.from({ length: 10 }, (_, index) => service.createPublicTriageCase(buildValidArgs(`triage-concurrency-ten-${index}`)))
    const results = await Promise.all(promises)
    const caseIds = new Set(results.map((result) => result.caseRecord.id))
    assert.equal(caseIds.size, 1)

    await assertSingleOperationalDossier(harness.app.backendContext.connection)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 10)

    const timeline = await harness.app.backendContext.connection.all<Array<{ event_type: string }>>(
      `
        SELECT event_type
        FROM case_timeline
        ORDER BY occurred_at ASC, created_at ASC, id ASC
      `,
    )
    assert.deepEqual(timeline.map((entry) => entry.event_type), ['created', 'message_added'])
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase allows a new attempt when the previous fingerprint is marked as failed', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new LegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const first = await service.createPublicTriageCase(buildValidArgs('triage-fingerprint-failed-a'))
    assert.ok(first)

    await harness.app.backendContext.connection.run(
      `
        UPDATE public_triage_fingerprints
        SET status = 'failed', updated_at = ?
      `,
      new Date().toISOString(),
    )

    const second = await service.createPublicTriageCase(buildValidArgs('triage-fingerprint-failed-b'))
    assert.ok(second)
    assert.notEqual(second.caseRecord.id, first.caseRecord.id)
    assert.equal(await countRows(harness.app.backendContext.connection, 'public_triage_fingerprints'), 2)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 2)
  } finally {
    await harness.close()
  }
})

class PendingTimeoutLegalBetaCaseService extends SlowPersistLegalBetaCaseService {
  protected override async waitForFingerprintCaseCreated() {
    return null
  }
}

test('createPublicTriageCase surfaces a safe pending error when concurrent creation does not resolve in time', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const service = new PendingTimeoutLegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    const firstPromise = service.createPublicTriageCase(buildValidArgs('triage-pending-timeout-a'))
    await new Promise((resolve) => setTimeout(resolve, 25))

    await assert.rejects(
      () => service.createPublicTriageCase(buildValidArgs('triage-pending-timeout-b')),
      /Public triage case creation is still pending/,
    )

    const first = await firstPromise
    assert.ok(first)
    await assertSingleOperationalDossier(harness.app.backendContext.connection)
    const metrics = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.public_triage_creation_pending_total ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase rolls back signal, lead, intake and case when portal token issuance fails', { concurrency: false }, async () => {
  const harness = await createHarness()

  class FailingPortalTokenCaseService extends LegalBetaCaseService {
    protected override async issuePortalAccessToken(_args: {
      db: BackendDatabase
      tenantId: number
      caseId: string
    }) {
      throw new Error('simulated portal token failure')
    }
  }

  try {
    const service = new FailingPortalTokenCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    await assert.rejects(
      () => service.createPublicTriageCase(buildValidArgs('triage-atomicity-failure')),
      /simulated portal token failure/,
    )

    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_signal'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_intake'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'public_triage_fingerprints'), 0)
  } finally {
    await harness.close()
  }
})

test('createPublicTriageCase rolls back all records when initial message persistence fails', { concurrency: false }, async () => {
  const harness = await createHarness()

  class FailingInitialMessageCaseService extends LegalBetaCaseService {
    protected override async persistCaseWithInitialHistory(repository: CaseRepository, input: CreateCaseInput) {
      await repository.createCase(input)
      throw new Error('simulated initial message failure')
    }
  }

  try {
    const service = new FailingInitialMessageCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
    )

    await assert.rejects(
      () => service.createPublicTriageCase(buildValidArgs('triage-initial-message-failure')),
      /simulated initial message failure/,
    )

    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_signal'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'entity_portfolio_lead_intake'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'cases'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_messages'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_timeline'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'case_portal_access_tokens'), 0)
    assert.equal(await countRows(harness.app.backendContext.connection, 'public_triage_fingerprints'), 0)
  } finally {
    await harness.close()
  }
})

test('public triage observability does not leak PII in metrics labels or structured logs', { concurrency: false }, async () => {
  const harness = await createHarness()
  const logEntries: Array<{ level: 'info' | 'warn'; payload: unknown; message?: string }> = []
  const fakeLogger = {
    info(payload: unknown, message?: string) {
      logEntries.push({ level: 'info', payload, message })
    },
    warn(payload: unknown, message?: string) {
      logEntries.push({ level: 'warn', payload, message })
    },
  }

  try {
    const service = new LegalBetaCaseService(
      harness.app.backendContext.connection,
      harness.app.backendContext.sovereignMutationCommandService,
      harness.app.backendContext.observability as never,
      fakeLogger,
    )

    await service.createPublicTriageCase(buildValidArgs('triage-observability-a'))
    await service.createPublicTriageCase(buildValidArgs('triage-observability-b'))

    const metrics = harness.app.backendContext.observability.getMetricsSnapshot()
    const customSeries = JSON.stringify(metrics.customCounterSeries)
    assert.equal(customSeries.includes('5531999998888'), false)
    assert.equal(customSeries.includes('31999998888'), false)
    assert.equal(customSeries.includes('João da Silva'), false)
    assert.equal(customSeries.includes('joão da silva'), false)
    assert.equal(customSeries.includes('Entender meus direitos'), false)

    const logsPayload = JSON.stringify(logEntries)
    assert.equal(logsPayload.includes('5531999998888'), false)
    assert.equal(logsPayload.includes('31999998888'), false)
    assert.equal(logsPayload.includes('João da Silva'), false)
    assert.equal(logsPayload.includes('Entender meus direitos'), false)
  } finally {
    await harness.close()
  }
})
