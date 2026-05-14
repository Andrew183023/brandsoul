import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { JobWorker } from '../jobs/index.js'
import type { BackendDatabase } from '../db/index.js'
import { CaseService } from '../modules/legalCases/caseService.js'
import { clearLawyerInboxListenersForTesting, getLawyerInboxListenerCountForTesting } from '../modules/legalCases/lawyerInboxEvents.js'
import { clearLawyerInboxEventsTokensForTesting } from '../modules/legalCases/lawyerInboxEventTokens.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { buildServer } from '../server.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    jobWorker: JobWorker
  }
}

type AuthRole = 'client' | 'lawyer' | 'owner' | 'admin' | 'operator'

type Harness = {
  app: AppWithContext
  privateKeyPem: string
  configuredKid: string
  close(): Promise<void>
}

const activeHarnesses = new Set<Harness>()

function getProcessInternals() {
  const processWithInternals = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[]
    _getActiveRequests?: () => unknown[]
  }

  return {
    getActiveHandles: processWithInternals._getActiveHandles?.bind(processWithInternals),
    getActiveRequests: processWithInternals._getActiveRequests?.bind(processWithInternals),
  }
}

function describeHandle(handle: unknown) {
  if (!handle || typeof handle !== 'object') {
    return String(handle)
  }

  const record = handle as Record<string, unknown>
  const name = handle.constructor?.name ?? 'UnknownHandle'
  if (typeof record.fd === 'number') {
    return `${name}(fd=${String(record.fd)})`
  }
  if (typeof record.localPort === 'number' || typeof record.remotePort === 'number') {
    return `${name}(local=${String(record.localPort ?? '')},remote=${String(record.remotePort ?? '')})`
  }
  if (typeof record._idleTimeout === 'number') {
    return `${name}(idleTimeout=${String(record._idleTimeout)})`
  }
  return name
}

function collectOpenHandleDiagnostics() {
  const internals = getProcessInternals()
  const activeHandles = (internals.getActiveHandles?.() ?? [])
    .map((handle) => describeHandle(handle))
    .filter((name) => name !== 'Socket(fd=1)' && name !== 'Socket(fd=2)' && name !== 'WriteStream(fd=1)' && name !== 'WriteStream(fd=2)')
  const activeRequests = (internals.getActiveRequests?.() ?? [])
    .map((request) => describeHandle(request))
    .filter((name) => name !== 'FSReqCallback')

  return {
    handles: activeHandles,
    requests: activeRequests,
    dispatchTimeouts: CaseService.getDispatchTimeoutCountForTesting(),
    lawyerInboxListeners: getLawyerInboxListenerCountForTesting(),
  }
}

function resetLegalCaseTestResources() {
  CaseService.clearAllDispatchTimeoutsForTesting()
  clearLawyerInboxListenersForTesting()
  clearLawyerInboxEventsTokensForTesting()
}

async function closeAllActiveHarnesses() {
  const pendingClosures = Array.from(activeHarnesses).map(async (harness) => {
    await harness.close()
  })
  await Promise.all(pendingClosures)
}

test.after(async () => {
  await closeAllActiveHarnesses()
  resetLegalCaseTestResources()
  const diagnostics = collectOpenHandleDiagnostics()
  if (
    diagnostics.handles.length > 0
    || diagnostics.requests.length > 0
    || diagnostics.dispatchTimeouts > 0
    || diagnostics.lawyerInboxListeners > 0
  ) {
    console.error('OPEN_HANDLES_FOUND', JSON.stringify(diagnostics, null, 2))
  }
})

function createEntityProfileFixture(id: string): EntityProfile {
  return {
    id,
    metadata: {
      createdAt: '2026-04-30T10:00:00.000Z',
      notes: [],
    },
  } as unknown as EntityProfile
}

async function createAccessToken(
  userId: number,
  tenantId: number,
  role: AuthRole,
  privateKeyPem: string,
  kid: string,
) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(userId),
    tenant_id: String(tenantId),
    roles: [role],
    ver: 1,
    jti: `legal-authz-${role}-${userId}-${tenantId}-${randomUUID()}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-legal-authz')
    .setAudience('brandsoul-api-legal-authz')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

function authHeaders(accessToken: string, extraHeaders?: Record<string, string>) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    ...(extraHeaders ?? {}),
  }
}

function jsonHeaders(extraHeaders?: Record<string, string>) {
  return {
    'content-type': 'application/json',
    ...(extraHeaders ?? {}),
  }
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-authz-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-authz-test-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousJwtSecret = process.env.JWT_SECRET
  const previousSqliteFile = process.env.SQLITE_FILE
  const previousAssetStorageDir = process.env.ASSET_STORAGE_DIR
  const previousAuthIssuer = process.env.AUTH_ISSUER
  const previousAuthAudience = process.env.AUTH_AUDIENCE
  const previousAuthKid = process.env.AUTH_ACTIVE_KID
  const previousPrivateKeyRef = process.env.AUTH_PRIVATE_KEY_REF
  const previousPublicKeyPath = process.env.AUTH_PUBLIC_KEY_PATH
  const previousLegalMarketplaceEntityId = process.env.LEGAL_MARKETPLACE_ENTITY_ID
  const previousLegalCaseDispatchTimeoutSeconds = process.env.LEGAL_CASE_DISPATCH_TIMEOUT_SECONDS

  process.env.JWT_SECRET = 'legal-authz-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-authz.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-authz'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-authz'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  let closed = false
  const harness: Harness = {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      if (closed) {
        return
      }

      closed = true
      activeHarnesses.delete(harness)
      resetLegalCaseTestResources()
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousJwtSecret === 'undefined') delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousJwtSecret

      if (typeof previousSqliteFile === 'undefined') delete process.env.SQLITE_FILE
      else process.env.SQLITE_FILE = previousSqliteFile

      if (typeof previousAssetStorageDir === 'undefined') delete process.env.ASSET_STORAGE_DIR
      else process.env.ASSET_STORAGE_DIR = previousAssetStorageDir

      if (typeof previousAuthIssuer === 'undefined') delete process.env.AUTH_ISSUER
      else process.env.AUTH_ISSUER = previousAuthIssuer

      if (typeof previousAuthAudience === 'undefined') delete process.env.AUTH_AUDIENCE
      else process.env.AUTH_AUDIENCE = previousAuthAudience

      if (typeof previousAuthKid === 'undefined') delete process.env.AUTH_ACTIVE_KID
      else process.env.AUTH_ACTIVE_KID = previousAuthKid

      if (typeof previousPrivateKeyRef === 'undefined') delete process.env.AUTH_PRIVATE_KEY_REF
      else process.env.AUTH_PRIVATE_KEY_REF = previousPrivateKeyRef

      if (typeof previousPublicKeyPath === 'undefined') delete process.env.AUTH_PUBLIC_KEY_PATH
      else process.env.AUTH_PUBLIC_KEY_PATH = previousPublicKeyPath

      if (typeof previousLegalMarketplaceEntityId === 'undefined') delete process.env.LEGAL_MARKETPLACE_ENTITY_ID
      else process.env.LEGAL_MARKETPLACE_ENTITY_ID = previousLegalMarketplaceEntityId

      if (typeof previousLegalCaseDispatchTimeoutSeconds === 'undefined') delete process.env.LEGAL_CASE_DISPATCH_TIMEOUT_SECONDS
      else process.env.LEGAL_CASE_DISPATCH_TIMEOUT_SECONDS = previousLegalCaseDispatchTimeoutSeconds
    },
  }

  activeHarnesses.add(harness)
  return harness
}

async function seedLegalActors(harness: Harness) {
  const db = harness.app.backendContext.connection
  const repository = harness.app.backendContext.entityRepository
  const now = '2026-04-30T10:00:00.000Z'

  await runSeedMutation(async () => {
    await repository.createEntity({
      id: 'entity-t1-owned',
      ownerId: 'user:100:tenant:1',
      ownerUserId: 100,
      ownerTenantId: 1,
      entityProfile: createEntityProfileFixture('entity-t1-owned'),
    })

    await repository.createEntity({
      id: 'entity-t2-owned',
      ownerId: 'user:300:tenant:2',
      ownerUserId: 300,
      ownerTenantId: 2,
      entityProfile: createEntityProfileFixture('entity-t2-owned'),
    })

    await repository.createEntity({
      id: 'entity-marketplace-legal',
      ownerId: 'user:100:tenant:1',
      ownerUserId: 100,
      ownerTenantId: 1,
      entityProfile: createEntityProfileFixture('entity-marketplace-legal'),
    })
  }, 'backend/src/api/legalCaseAuthorization.test.ts#seedLegalActors')

  await db.run(
    `
      INSERT INTO professionals (
        id, tenant_id, user_id, external_ref, kind, status, display_name, primary_email, primary_phone, metadata, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'prof-assigned',
    1,
    201,
    null,
    'human',
    'active',
    'Assigned Lawyer',
    null,
    null,
    '{}',
    now,
    now,
    'prof-other',
    1,
    202,
    null,
    'human',
    'active',
    'Other Lawyer',
    null,
    null,
    '{}',
    now,
    now,
    'prof-t2',
    2,
    401,
    null,
    'human',
    'active',
    'Tenant2 Lawyer',
    null,
    null,
    '{}',
    now,
    now,
  )
}

async function seedLegalData(harness: Harness) {
  const db = harness.app.backendContext.connection
  const now = '2026-04-30T10:00:00.000Z'

  await seedLegalActors(harness)

  await db.run(
    `
      INSERT INTO cases (
        id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority, practice_area, source,
        opened_at, closed_at, archived_at, resolution_reason, lead_professional_id, centelha_context, metadata, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'case-client1-t1',
    1,
    null,
    'entity-t1-owned',
    101,
    'Caso Cliente 1',
    'Descricao cliente 1',
    'open',
    'normal',
    'consumer',
    'public-intake',
    now,
    null,
    null,
    null,
    'prof-assigned',
    '{}',
    '{"location":{"city":"Sao Paulo","state":"SP"}}',
    now,
    now,
    'case-client2-t1',
    1,
    null,
    'entity-t1-owned',
    102,
    'Caso Cliente 2',
    'Descricao cliente 2',
    'open',
    'high',
    'labor',
    'public-intake',
    now,
    null,
    null,
    null,
    null,
    '{}',
    '{"location":{"city":"Campinas","state":"SP"}}',
    now,
    now,
    'case-client1-t2',
    2,
    null,
    'entity-t2-owned',
    301,
    'Caso Cliente T2',
    'Descricao cliente t2',
    'open',
    'normal',
    'consumer',
    'public-intake',
    now,
    null,
    null,
    null,
    'prof-t2',
    '{}',
    '{"location":{"city":"Curitiba","state":"PR"}}',
    now,
    now,
    'case-marketplace-t1',
    1,
    null,
    'entity-marketplace-legal',
    103,
    'Caso Marketplace T1',
    'Descricao marketplace t1',
    'open',
    'urgent',
    'consumer',
    'public-intake',
    now,
    null,
    null,
    null,
    null,
    '{}',
    '{"location":{"city":"Sao Paulo","state":"SP"}}',
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO case_messages (
        id, tenant_id, case_id, author_professional_id, message_type, message_status, direction, channel, subject, body,
        content, attachments, sequence_no, sent_at, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'msg-case-client1-t1-1',
    1,
    'case-client1-t1',
    'prof-assigned',
    'chat',
    'sent',
    'outbound',
    null,
    null,
    'Primeira resposta do advogado',
    '{}',
    '[]',
    1,
    now,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO case_timeline (
        id, tenant_id, case_id, event_type, actor_professional_id, actor_user_id, occurred_at, payload, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'tl-case-client1-t1-created',
    1,
    'case-client1-t1',
    'created',
    null,
    101,
    now,
    '{}',
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO case_assignments (
        id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id, assigned_at, unassigned_at, metadata, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'asgmt-case-client1-t1-assigned',
    1,
    'case-client1-t1',
    'prof-assigned',
    'responsible',
    'active',
    null,
    now,
    null,
    '{}',
    now,
    now,
  )
}

test('legal cases routes enforce authorization and tenant isolation across client/lawyer/owner actors', { concurrency: false }, async (t) => {
  const harness = await createHarness()

  try {
    await seedLegalData(harness)

    const ownerT1 = await createAccessToken(100, 1, 'owner', harness.privateKeyPem, harness.configuredKid)
    const ownerT2 = await createAccessToken(300, 2, 'owner', harness.privateKeyPem, harness.configuredKid)
    const clientT1 = await createAccessToken(101, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const clientT1Other = await createAccessToken(102, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const clientT1Marketplace = await createAccessToken(103, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const clientT2 = await createAccessToken(301, 2, 'client', harness.privateKeyPem, harness.configuredKid)
    const lawyerAssigned = await createAccessToken(201, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)
    const lawyerNotAssigned = await createAccessToken(202, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)
    const adminT1 = await createAccessToken(150, 1, 'admin', harness.privateKeyPem, harness.configuredKid)

    await t.test('CLIENT ACCESS: own case returns 200', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1',
        headers: authHeaders(clientT1),
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('CLIENT ACCESS: another client case returns 403', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client2-t1',
        headers: authHeaders(clientT1),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('CLIENT ACCESS: cross-tenant case returns 403', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t2',
        headers: authHeaders(clientT1),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('LAWYER ACCESS: assigned lawyer can access case (200)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1',
        headers: authHeaders(lawyerAssigned),
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('LAWYER ACCESS: non-assigned lawyer cannot access case (403)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1',
        headers: authHeaders(lawyerNotAssigned),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('LAWYER ACCESS: non-assigned lawyer cannot send lawyer message (403)', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/messages',
        headers: authHeaders(lawyerNotAssigned),
        payload: {
          role: 'lawyer',
          text: 'Tentando responder sem atribuicao',
        },
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('OWNER ACCESS: owner lists own entity cases (200)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases?entityId=entity-t1-owned',
        headers: authHeaders(ownerT1),
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('OWNER ACCESS: foreign owner cannot list entity cases (403)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases?entityId=entity-t1-owned',
        headers: authHeaders(ownerT2),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('OWNER ACCESS: same-tenant unrelated user cannot list entity cases (403)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases?entityId=entity-marketplace-legal',
        headers: authHeaders(clientT1Marketplace),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('OWNER ACCESS: owner cannot accept case (403)', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/accept',
        headers: authHeaders(ownerT1),
        payload: {},
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('LAWYER ACCESS: lawyer cannot match case (403)', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client2-t1/match',
        headers: authHeaders(lawyerAssigned),
        payload: {},
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('MARKETPLACE ACCESS: marketplace admin can list marketplace legal cases (200)', async () => {
      const previousMarketplaceEntityId = process.env.LEGAL_MARKETPLACE_ENTITY_ID

      try {
        process.env.LEGAL_MARKETPLACE_ENTITY_ID = 'entity-marketplace-legal'

        const response = await harness.app.inject({
          method: 'GET',
          url: '/marketplace/legal/cases',
          headers: authHeaders(adminT1),
        })
        assert.equal(response.statusCode, 200)

        const payload = response.json() as { entityId: string; cases: Array<{ id: string }> }
        assert.equal(payload.entityId, 'entity-marketplace-legal')
        assert.deepEqual(payload.cases.map((item) => item.id), ['case-marketplace-t1'])
      } finally {
        if (typeof previousMarketplaceEntityId === 'undefined') {
          delete process.env.LEGAL_MARKETPLACE_ENTITY_ID
        } else {
          process.env.LEGAL_MARKETPLACE_ENTITY_ID = previousMarketplaceEntityId
        }
      }
    })

    await t.test('LAWYER INBOX EVENTS TOKEN: requires auth (401)', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/lawyer/inbox/events-token',
        payload: {},
      })
      assert.equal(response.statusCode, 401)
    })

    await t.test('LAWYER INBOX EVENTS TOKEN: non-professional cannot create token (404)', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/lawyer/inbox/events-token',
        headers: authHeaders(clientT1),
        payload: {},
      })
      assert.equal(response.statusCode, 404)
    })

    await t.test('LAWYER INBOX EVENTS STREAM: invalid token rejected (401)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/lawyer/inbox/events?token=invalid-token',
      })
      assert.equal(response.statusCode, 401)
    })

    await t.test('ANONYMOUS ACCESS: protected case route returns 401', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1',
      })
      assert.equal(response.statusCode, 401)
    })

    await t.test('TENANT ISOLATION: cross-tenant message list is forbidden (403)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t2/messages',
        headers: authHeaders(clientT1),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('TENANT ISOLATION: same-tenant unrelated client message list is forbidden (403)', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1/messages',
        headers: authHeaders(clientT1Other),
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('GET /cases/:id/messages for participant returns 200', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1/messages',
        headers: authHeaders(clientT1),
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('POST /cases/:id/messages for participant returns 200', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/messages',
        headers: authHeaders(clientT1),
        payload: {
          role: 'user',
          text: 'Mensagem do cliente participante',
        },
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('POST /cases/:id/close for participant returns 200', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(clientT1),
        payload: {
          rating: 5,
          feedback: 'Encerrado',
          closedBy: 'cliente',
        },
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('POST /cases/:id/match owner-only and tenant-isolated', async () => {
      const ok = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client2-t1/match',
        headers: authHeaders(ownerT1),
        payload: {},
      })
      assert.equal(ok.statusCode, 200)

      const forbidden = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client2-t1/match',
        headers: authHeaders(clientT1Other),
        payload: {},
      })
      assert.equal(forbidden.statusCode, 403)

      const crossTenant = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t2/match',
        headers: authHeaders(ownerT1),
        payload: {},
      })
      assert.equal(crossTenant.statusCode, 403)
    })

    await t.test('POST /cases/:id/dispatch owner-only and tenant-isolated', async () => {
      const ok = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client2-t1/dispatch',
        headers: authHeaders(ownerT1),
        payload: {
          professionalId: 'prof-other',
        },
      })
      assert.equal(ok.statusCode, 201)

      const forbidden = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client2-t1/dispatch',
        headers: authHeaders(clientT1Other),
        payload: {
          professionalId: 'prof-other',
        },
      })
      assert.equal(forbidden.statusCode, 403)

      const crossTenant = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t2/dispatch',
        headers: authHeaders(ownerT1),
        payload: {
          professionalId: 'prof-other',
        },
      })
      assert.equal(crossTenant.statusCode, 403)
    })

    await t.test('MATCH FLOW: owner match plus dispatch keeps case in dispatched', async () => {
      const createResponse = await harness.app.inject({
        method: 'POST',
        url: '/cases',
        headers: authHeaders(clientT1),
        payload: {
          entityId: 'entity-t1-owned',
          title: 'Caso para redistribuicao',
          description: 'Caso para validar redistribuicao do owner.',
          priority: 'high',
          practiceArea: 'labor',
          metadata: {
            location: {
              city: 'Sao Paulo',
              state: 'SP',
            },
          },
        },
      })
      assert.equal(createResponse.statusCode, 201)
      const createdCaseId = createResponse.json().case.id as string

      const matchResponse = await harness.app.inject({
        method: 'POST',
        url: `/cases/${createdCaseId}/match`,
        headers: authHeaders(ownerT1),
        payload: {},
      })
      assert.equal(matchResponse.statusCode, 200)
      const topCandidate = (matchResponse.json().candidates as Array<{ professionalId: string }>)[0]
      assert.ok(topCandidate)

      const dispatchResponse = await harness.app.inject({
        method: 'POST',
        url: `/cases/${createdCaseId}/dispatch`,
        headers: authHeaders(ownerT1),
        payload: {
          professionalId: topCandidate.professionalId,
        },
      })
      assert.equal(dispatchResponse.statusCode, 201)

      const storedDispatchedCase = await harness.app.backendContext.connection.get<{ status: string }>(
        'SELECT status FROM cases WHERE id = ?',
        createdCaseId,
      )
      assert.equal(storedDispatchedCase?.status, 'dispatched')
    })

    await t.test('ACCEPT FLOW: lawyer accept moves case to in_progress', async () => {
      const createResponse = await harness.app.inject({
        method: 'POST',
        url: '/cases',
        headers: authHeaders(clientT1),
        payload: {
          entityId: 'entity-t1-owned',
          title: 'Caso para aceite',
          description: 'Caso para validar aceite do advogado.',
          priority: 'urgent',
          practiceArea: 'labor',
          metadata: {
            location: {
              city: 'Sao Paulo',
              state: 'SP',
            },
          },
        },
      })
      assert.equal(createResponse.statusCode, 201)
      const createdCaseId = createResponse.json().case.id as string

      const dispatchResponse = await harness.app.inject({
        method: 'POST',
        url: `/cases/${createdCaseId}/dispatch`,
        headers: authHeaders(ownerT1),
        payload: {
          professionalId: 'prof-other',
        },
      })
      assert.equal(dispatchResponse.statusCode, 201)

      const acceptResponse = await harness.app.inject({
        method: 'POST',
        url: `/cases/${createdCaseId}/accept`,
        headers: authHeaders(lawyerNotAssigned),
        payload: {},
      })
      assert.equal(acceptResponse.statusCode, 200)
      assert.equal(acceptResponse.json().case.status, 'in_progress')

      const storedAcceptedCase = await harness.app.backendContext.connection.get<{ status: string }>(
        'SELECT status FROM cases WHERE id = ?',
        createdCaseId,
      )
      assert.equal(storedAcceptedCase?.status, 'in_progress')
    })

    await t.test('POST /assignments/:id/respond only assignment professional', async () => {
      const ok = await harness.app.inject({
        method: 'POST',
        url: '/assignments/asgmt-case-client1-t1-assigned/respond',
        headers: authHeaders(lawyerAssigned),
        payload: {
          status: 'accepted',
        },
      })
      assert.equal(ok.statusCode, 200)

      await harness.app.backendContext.connection.run(
        `
          INSERT INTO case_assignments (
            id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id, assigned_at, unassigned_at, metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'asgmt-case-client2-t1-other',
        1,
        'case-client2-t1',
        'prof-assigned',
        'responsible',
        'active',
        null,
        '2026-04-30T10:00:00.000Z',
        null,
        '{}',
        '2026-04-30T10:00:00.000Z',
        '2026-04-30T10:00:00.000Z',
      )

      const forbidden = await harness.app.inject({
        method: 'POST',
        url: '/assignments/asgmt-case-client2-t1-other/respond',
        headers: authHeaders(lawyerNotAssigned),
        payload: {
          status: 'accepted',
        },
      })
      assert.equal(forbidden.statusCode, 403)
    })

    await t.test('cross-tenant client cannot close case (403)', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(clientT2),
        payload: {
          rating: 4,
          feedback: 'Nao deveria fechar',
          closedBy: 'cliente',
        },
      })
      assert.equal(response.statusCode, 403)
    })
  } finally {
    await harness.close()
  }
})

test('legal emergency marketplace flow enforces creator isolation, claim-token single claim, inbox visibility, and acceptance race protection', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await seedLegalActors(harness)

    const ownerT1 = await createAccessToken(100, 1, 'owner', harness.privateKeyPem, harness.configuredKid)
    const clientA = await createAccessToken(101, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const clientB = await createAccessToken(102, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const lawyerAssigned = await createAccessToken(201, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)
    const lawyerOther = await createAccessToken(202, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)

    const createEmergencyCase = await harness.app.inject({
      method: 'POST',
      url: '/cases',
      headers: authHeaders(clientA),
      payload: {
        entityId: 'entity-t1-owned',
        title: 'Emergency legal intake',
        description: 'Urgent labor dispute in Sao Paulo requiring immediate counsel.',
        priority: 'urgent',
        practiceArea: 'labor',
        metadata: {
          city: 'Sao Paulo',
          state: 'SP',
        },
        initialMessage: {
          body: 'I need legal help now with my employer in Sao Paulo.',
        },
      },
    })

    assert.equal(createEmergencyCase.statusCode, 201)
    const createdCase = createEmergencyCase.json().case as { id: string }
    const createdCaseId = createdCase.id

    const dispatchAssigned = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/dispatch`,
      headers: authHeaders(ownerT1),
      payload: {
        professionalId: 'prof-assigned',
      },
    })
    assert.equal(dispatchAssigned.statusCode, 201)

    const dispatchOther = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/dispatch`,
      headers: authHeaders(ownerT1),
      payload: {
        professionalId: 'prof-other',
      },
    })
    assert.equal(dispatchOther.statusCode, 201)

    const clientCase = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(clientA),
    })
    assert.equal(clientCase.statusCode, 200)

    const clientMessages = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(clientA),
    })
    assert.equal(clientMessages.statusCode, 200)

    const sameTenantClientCase = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(clientB),
    })
    assert.equal(sameTenantClientCase.statusCode, 403)

    const sameTenantClientMessages = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(clientB),
    })
    assert.equal(sameTenantClientMessages.statusCode, 403)

    const sameTenantClientPostMessage = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(clientB),
      payload: {
        role: 'user',
        text: 'I should not be able to post here.',
      },
    })
    assert.equal(sameTenantClientPostMessage.statusCode, 403)

    const ownerCase = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(ownerT1),
    })
    assert.equal(ownerCase.statusCode, 200)

    const ownerMessages = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(ownerT1),
    })
    assert.equal(ownerMessages.statusCode, 200)

    const assignedInboxBeforeAccept = await harness.app.inject({
      method: 'GET',
      url: '/lawyer/inbox',
      headers: authHeaders(lawyerAssigned),
    })
    assert.equal(assignedInboxBeforeAccept.statusCode, 200)
    assert.equal(assignedInboxBeforeAccept.json().some((item: { caseId: string }) => item.caseId === createdCaseId), true)

    const otherInboxBeforeAccept = await harness.app.inject({
      method: 'GET',
      url: '/lawyer/inbox',
      headers: authHeaders(lawyerOther),
    })
    assert.equal(otherInboxBeforeAccept.statusCode, 200)
    assert.equal(otherInboxBeforeAccept.json().some((item: { caseId: string }) => item.caseId === createdCaseId), true)

    const acceptAssigned = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/accept`,
      headers: authHeaders(lawyerAssigned, {
        'idempotency-key': 'accept-created-case-assigned',
      }),
      payload: {},
    })
    assert.equal(acceptAssigned.statusCode, 200)
    assert.equal(acceptAssigned.json().case.status, 'in_progress')
    assert.equal(acceptAssigned.json().case.leadProfessionalId, 'prof-assigned')

    const assignedLawyerCase = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(lawyerAssigned),
    })
    assert.equal(assignedLawyerCase.statusCode, 200)

    const assignedLawyerMessages = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(lawyerAssigned),
    })
    assert.equal(assignedLawyerMessages.statusCode, 200)

    const assignedLawyerPostMessage = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(lawyerAssigned),
      payload: {
        role: 'lawyer',
        text: 'Assigned counsel responding on the case.',
      },
    })
    assert.equal(assignedLawyerPostMessage.statusCode, 200)

    const clientCaseAfterAccept = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(clientA),
    })
    assert.equal(clientCaseAfterAccept.statusCode, 200)
    assert.match(String(clientCaseAfterAccept.json().case.status ?? ''), /assigned|in_progress/)
    assert.equal(clientCaseAfterAccept.json().case.assignedLawyerId, 'prof-assigned')

    const clientMessagesAfterLawyerReply = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(clientA),
    })
    assert.equal(clientMessagesAfterLawyerReply.statusCode, 200)
    assert.equal(
      clientMessagesAfterLawyerReply.json().messages.some((message: { role: string; text: string }) => (
        message.role === 'lawyer' && message.text === 'Assigned counsel responding on the case.'
      )),
      true,
    )

    const clientReply = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(clientA),
      payload: {
        role: 'user',
        text: 'Client confirming they can see the assigned lawyer response.',
      },
    })
    assert.equal(clientReply.statusCode, 200)

    const ownerCasesAfterAccept = await harness.app.inject({
      method: 'GET',
      url: '/cases?entityId=entity-t1-owned',
      headers: authHeaders(ownerT1),
    })
    assert.equal(ownerCasesAfterAccept.statusCode, 200)
    assert.equal(
      ownerCasesAfterAccept.json().cases.some((legalCase: { id: string; status: string }) => (
        legalCase.id === createdCaseId && /assigned|in_progress/.test(String(legalCase.status ?? ''))
      )),
      true,
    )

    const ownerAcceptedCase = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(ownerT1),
    })
    assert.equal(ownerAcceptedCase.statusCode, 200)
    assert.match(String(ownerAcceptedCase.json().case.status ?? ''), /assigned|in_progress/)
    assert.equal(ownerAcceptedCase.json().case.assignedLawyerId, 'prof-assigned')

    const otherLawyerCase = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}`,
      headers: authHeaders(lawyerOther),
    })
    assert.equal(otherLawyerCase.statusCode, 403)

    const otherLawyerMessages = await harness.app.inject({
      method: 'GET',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(lawyerOther),
    })
    assert.equal(otherLawyerMessages.statusCode, 403)

    const otherLawyerPostMessage = await harness.app.inject({
      method: 'POST',
      url: `/cases/${createdCaseId}/messages`,
      headers: authHeaders(lawyerOther),
      payload: {
        role: 'lawyer',
        text: 'Unassigned lawyer trying to answer.',
      },
    })
    assert.equal(otherLawyerPostMessage.statusCode, 403)

    const otherInboxAfterAccept = await harness.app.inject({
      method: 'GET',
      url: '/lawyer/inbox',
      headers: authHeaders(lawyerOther),
    })
    assert.equal(otherInboxAfterAccept.statusCode, 200)
    assert.equal(otherInboxAfterAccept.json().some((item: { caseId: string }) => item.caseId === createdCaseId), false)

    const storedAcceptedCase = await harness.app.backendContext.connection.get<{
      status: string
      lead_professional_id: string | null
    }>(
      'SELECT status, lead_professional_id FROM cases WHERE id = ?',
      createdCaseId,
    )
    assert.equal(storedAcceptedCase?.status, 'in_progress')
    assert.equal(storedAcceptedCase?.lead_professional_id, 'prof-assigned')

    const claimToken = 'claim-token-creator-once'
    const createClaimableCase = await harness.app.inject({
      method: 'POST',
      url: '/cases',
      headers: jsonHeaders({
        'x-case-claim-token': claimToken,
      }),
      payload: {
        entityId: 'entity-t1-owned',
        title: 'Claim token emergency case',
        description: 'Public intake case waiting for the first authenticated claimant.',
        priority: 'urgent',
        practiceArea: 'consumer',
        metadata: {
          city: 'Sao Paulo',
          state: 'SP',
        },
        initialMessage: {
          body: 'This public intake should be claimable exactly once.',
        },
      },
    })
    assert.equal(createClaimableCase.statusCode, 201)
    const claimableCaseId = (createClaimableCase.json().case as { id: string }).id

    const firstClaimRead = await harness.app.inject({
      method: 'GET',
      url: `/cases/${claimableCaseId}`,
      headers: authHeaders(clientA, {
        'x-case-claim-token': claimToken,
      }),
    })
    assert.equal(firstClaimRead.statusCode, 200)

    const claimedOwner = await harness.app.backendContext.connection.get<{ created_by_user_id: number | null }>(
      'SELECT created_by_user_id FROM cases WHERE id = ?',
      claimableCaseId,
    )
    assert.equal(claimedOwner?.created_by_user_id, 101)

    const secondClaimRead = await harness.app.inject({
      method: 'GET',
      url: `/cases/${claimableCaseId}`,
      headers: authHeaders(clientB, {
        'x-case-claim-token': claimToken,
      }),
    })
    assert.equal(secondClaimRead.statusCode, 403)

    const claimedOwnerAfterReplay = await harness.app.backendContext.connection.get<{ created_by_user_id: number | null }>(
      'SELECT created_by_user_id FROM cases WHERE id = ?',
      claimableCaseId,
    )
    assert.equal(claimedOwnerAfterReplay?.created_by_user_id, 101)

    const createRaceCase = await harness.app.inject({
      method: 'POST',
      url: '/cases',
      headers: authHeaders(clientA),
      payload: {
        entityId: 'entity-t1-owned',
        title: 'Race condition acceptance case',
        description: 'Two lawyers attempt to accept the same emergency matter.',
        priority: 'urgent',
        practiceArea: 'labor',
        metadata: {
          city: 'Sao Paulo',
          state: 'SP',
        },
        initialMessage: {
          body: 'Simulate two lawyers accepting this case at the same time.',
        },
      },
    })
    assert.equal(createRaceCase.statusCode, 201)
    const raceCaseId = (createRaceCase.json().case as { id: string }).id

    const raceDispatchAssigned = await harness.app.inject({
      method: 'POST',
      url: `/cases/${raceCaseId}/dispatch`,
      headers: authHeaders(ownerT1),
      payload: {
        professionalId: 'prof-assigned',
      },
    })
    assert.equal(raceDispatchAssigned.statusCode, 201)

    const raceDispatchOther = await harness.app.inject({
      method: 'POST',
      url: `/cases/${raceCaseId}/dispatch`,
      headers: authHeaders(ownerT1),
      payload: {
        professionalId: 'prof-other',
      },
    })
    assert.equal(raceDispatchOther.statusCode, 201)

    const raceResponses = await Promise.all([
      harness.app.inject({
        method: 'POST',
        url: `/cases/${raceCaseId}/accept`,
        headers: authHeaders(lawyerAssigned, {
          'idempotency-key': 'race-case-assigned',
        }),
        payload: {},
      }),
      harness.app.inject({
        method: 'POST',
        url: `/cases/${raceCaseId}/accept`,
        headers: authHeaders(lawyerOther, {
          'idempotency-key': 'race-case-other',
        }),
        payload: {},
      }),
    ])

    const raceStatusCodes = raceResponses.map((response) => response.statusCode).sort((left, right) => left - right)
    assert.deepEqual(raceStatusCodes, [200, 409])

    const losingResponse = raceResponses.find((response) => response.statusCode === 409)
    assert.ok(losingResponse)
    assert.match(
      String(losingResponse?.json().error?.code ?? ''),
      /CASE_ALREADY_ACCEPTED|ASSIGNMENT_INVALID_STATE|CASE_ACCEPT_CONFLICT/,
    )

    const raceCaseRow = await harness.app.backendContext.connection.get<{
      lead_professional_id: string | null
      status: string
    }>(
      'SELECT lead_professional_id, status FROM cases WHERE id = ?',
      raceCaseId,
    )
    assert.ok(raceCaseRow?.lead_professional_id === 'prof-assigned' || raceCaseRow?.lead_professional_id === 'prof-other')
    assert.equal(raceCaseRow?.status, 'in_progress')

    const raceLeadCount = await harness.app.backendContext.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM cases WHERE id = ? AND lead_professional_id IS NOT NULL',
      raceCaseId,
    )
    assert.equal(raceLeadCount?.count, 1)
  } finally {
    await harness.close()
  }
})

test('marketplace debug exposes configured tenant context and auto-dispatch ignores non-login-capable professionals', { concurrency: false }, async () => {
  process.env.LEGAL_MARKETPLACE_ENTITY_ID = 'entity-t1-owned'
  process.env.LEGAL_CASE_DISPATCH_TIMEOUT_SECONDS = '120'

  const harness = await createHarness()

  try {
    await seedLegalActors(harness)

    const db = harness.app.backendContext.connection
    const now = '2026-04-30T10:00:00.000Z'

    await db.run(
      `
        INSERT INTO professionals (
          id, tenant_id, user_id, external_ref, kind, status, display_name, primary_email, primary_phone, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'prof-fake-marketplace',
      1,
      2002,
      null,
      'human',
      'active',
      'Sandbox Lawyer',
      null,
      null,
      JSON.stringify({ loginCapable: false, sandboxOnly: true, location: { city: 'sao paulo', state: 'sp' } }),
      now,
      now,
    )

    await db.run(
      `
        INSERT INTO professional_profiles (
          id, tenant_id, professional_id, specialties, availability, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'profile-fake-marketplace',
      1,
      'prof-fake-marketplace',
      JSON.stringify(['labor']),
      JSON.stringify({ available: true, city: 'sao paulo', state: 'sp' }),
      '{}',
      now,
      now,
    )

    const clientT1 = await createAccessToken(101, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const lawyerAssigned = await createAccessToken(201, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)
    const fakeLawyer = await createAccessToken(2002, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)
    const lawyerT2 = await createAccessToken(401, 2, 'lawyer', harness.privateKeyPem, harness.configuredKid)

    const createMarketplaceCase = await harness.app.inject({
      method: 'POST',
      url: '/cases',
      headers: authHeaders(clientT1),
      payload: {
        entityId: 'entity-t1-owned',
        title: 'Marketplace emergency intake',
        description: 'Urgent labor dispute for marketplace routing validation.',
        priority: 'urgent',
        practiceArea: 'labor',
        metadata: {
          category: 'labor',
          location: {
            city: 'Sao Paulo',
            state: 'SP',
          },
          emergencyFlow: true,
          source: 'legal-emergency',
        },
        initialMessage: {
          body: 'Need labor counsel immediately.',
        },
      },
    })

    assert.equal(createMarketplaceCase.statusCode, 201)
    const createdCaseId = createMarketplaceCase.json().case.id as string

    const storedCase = await db.get<{ metadata: string }>(
      'SELECT metadata FROM cases WHERE id = ?',
      createdCaseId,
    )
    assert.ok(storedCase)
    const storedMetadata = JSON.parse(storedCase.metadata)
    assert.equal(storedMetadata.autoDispatch.timeoutMs, 120000)
    assert.equal(storedMetadata.autoDispatch.attemptedCandidateIds.includes('prof-fake-marketplace'), false)
    assert.equal(storedMetadata.autoDispatch.attemptedCandidateIds.includes('prof-assigned'), true)

    const fakeDispatch = await db.get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM case_dispatches WHERE case_id = ? AND professional_id = ?',
      createdCaseId,
      'prof-fake-marketplace',
    )
    assert.equal(fakeDispatch?.total, 0)

    const lawyerDebug = await harness.app.inject({
      method: 'GET',
      url: '/lawyer/assignments/debug',
      headers: authHeaders(lawyerAssigned),
    })
    assert.equal(lawyerDebug.statusCode, 200)
    assert.deepEqual(lawyerDebug.json(), {
      userId: 201,
      tenantId: 1,
      professionalFound: true,
      professionalId: 'prof-assigned',
      activeAssignmentsCount: 1,
      marketplaceEntityId: process.env.LEGAL_MARKETPLACE_ENTITY_ID,
      marketplaceTenantId: 1,
      authTenantMatchesMarketplaceTenant: true,
    })

    const fakeLawyerInbox = await harness.app.inject({
      method: 'GET',
      url: '/lawyer/inbox',
      headers: authHeaders(fakeLawyer),
    })
    assert.equal(fakeLawyerInbox.statusCode, 200)
    assert.equal(fakeLawyerInbox.json().some((item: { caseId: string }) => item.caseId === createdCaseId), false)

    const crossTenantInbox = await harness.app.inject({
      method: 'GET',
      url: '/lawyer/inbox',
      headers: authHeaders(lawyerT2),
    })
    assert.equal(crossTenantInbox.statusCode, 200)
    assert.equal(crossTenantInbox.json().some((item: { caseId: string }) => item.caseId === createdCaseId), false)
  } finally {
    await harness.close()
  }
})
