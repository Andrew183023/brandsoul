import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../db/index.js'
import type { JobWorker } from '../jobs/index.js'
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

type AuthRole = 'client' | 'lawyer' | 'owner'

type Harness = {
  app: AppWithContext
  privateKeyPem: string
  configuredKid: string
  close(): Promise<void>
}

function createEntityProfileFixture(id: string): EntityProfile {
  return {
    id,
    metadata: {
      createdAt: '2026-04-30T10:00:00.000Z',
      notes: [],
    },
  } as unknown as EntityProfile
}

function createLegacyCaseNote(caseRecord: Record<string, unknown>) {
  return `legal:case:${JSON.stringify(caseRecord)}`
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
    jti: `case-lifecycle-authz-${role}-${userId}-${tenantId}-${randomUUID()}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-case-lifecycle-authz')
    .setAudience('brandsoul-api-case-lifecycle-authz')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  }
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-case-lifecycle-authz-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'case-lifecycle-authz-test-kid'
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

  process.env.JWT_SECRET = 'case-lifecycle-authz-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'case-lifecycle-authz.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-case-lifecycle-authz'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-case-lifecycle-authz'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  let closed = false
  return {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      if (closed) {
        return
      }

      closed = true
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
      id: 'entity-t1-legacy',
      ownerId: 'user:100:tenant:1',
      ownerUserId: 100,
      ownerTenantId: 1,
      entityProfile: {
        ...createEntityProfileFixture('entity-t1-legacy'),
        metadata: {
          ...createEntityProfileFixture('entity-t1-legacy').metadata,
          notes: [
            createLegacyCaseNote({
              id: 'case-legacy-client1-t1',
              tenantId: 1,
              entityId: 'entity-t1-legacy',
              status: 'open',
              createdAt: now,
              updatedAt: now,
              creatorUserId: 101,
              creatorTenantId: 1,
              assignedLawyerId: 'prof-assigned',
              assignmentState: 'active',
              responseState: 'active',
              isAssigned: true,
              description: 'Caso legado para validar fallback de close.',
              practiceArea: 'consumer',
              source: 'public-interaction',
              messages: [],
              timeline: [],
            }),
          ],
        },
      } as EntityProfile,
    })
  }, 'backend/src/api/caseLifecycleAuthorization.test.ts#seedLegalActors')

  await db.run(
    `
      INSERT INTO professionals (
        id, tenant_id, user_id, external_ref, kind, status, display_name, primary_email, primary_phone, metadata, created_at, updated_at
      ) VALUES
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

test('case lifecycle mutations are restricted to operational roles', { concurrency: false }, async (t) => {
  const harness = await createHarness()

  try {
    await seedLegalData(harness)

    const ownerT1 = await createAccessToken(100, 1, 'owner', harness.privateKeyPem, harness.configuredKid)
    const clientT1 = await createAccessToken(101, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const lawyerAssigned = await createAccessToken(201, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)
    const ownerT2 = await createAccessToken(300, 2, 'owner', harness.privateKeyPem, harness.configuredKid)

    await t.test('read access still works for authorized participant', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1',
        headers: authHeaders(clientT1),
      })

      assert.equal(response.statusCode, 200)
    })

    await t.test('client creator cannot update case status', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/status',
        headers: authHeaders(clientT1),
        payload: {
          status: 'on_hold',
          reason: 'Tentativa do cliente',
        },
      })

      assert.equal(response.statusCode, 403)
    })

    await t.test('client creator cannot close case', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(clientT1),
        payload: {
          rating: 5,
          feedback: 'Cliente tentando fechar',
          closedBy: 'cliente',
        },
      })

      assert.equal(response.statusCode, 403)
    })

    await t.test('owner can update case status', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/status',
        headers: authHeaders(ownerT1),
        payload: {
          status: 'on_hold',
          reason: 'Owner colocou em espera',
        },
      })

      assert.equal(response.statusCode, 200)
    })

    await t.test('assigned lawyer can update case status', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/status',
        headers: authHeaders(lawyerAssigned),
        payload: {
          status: 'in_progress',
          reason: 'Advogado assumiu a execução',
        },
      })

      assert.equal(response.statusCode, 200)
    })

    await t.test('assigned lawyer cannot close case', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(lawyerAssigned),
        payload: {
          rating: 4,
          feedback: 'Advogado tentando encerrar',
          closedBy: 'lawyer',
        },
      })

      assert.equal(response.statusCode, 403)
    })

    await t.test('legacy fallback denies client close mutation', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-legacy-client1-t1/close',
        headers: authHeaders(clientT1),
        payload: {
          rating: 3,
          feedback: 'Cliente tentando fechar caso legado',
          closedBy: 'cliente',
        },
      })

      assert.equal(response.statusCode, 403)
    })

    await t.test('legacy fallback allows owner close mutation', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-legacy-client1-t1/close',
        headers: authHeaders(ownerT1),
        payload: {
          rating: 5,
          feedback: 'Owner encerrou caso legado',
          closedBy: 'owner',
        },
      })

      assert.equal(response.statusCode, 200)
    })

    await t.test('owner can close case', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(ownerT1),
        payload: {
          rating: 5,
          feedback: 'Owner encerrou o caso',
          closedBy: 'owner',
        },
      })

      assert.equal(response.statusCode, 200)
    })

    await t.test('cross-tenant owner gets generic not found on status mutation', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/status',
        headers: authHeaders(ownerT2),
        payload: {
          status: 'on_hold',
          reason: 'Cross tenant probe',
        },
      })

      assert.equal(response.statusCode, 404)
    })

    await t.test('cross-tenant owner gets generic not found on close mutation', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(ownerT2),
        payload: {
          rating: 1,
          feedback: 'Cross tenant probe',
          closedBy: 'owner',
        },
      })

      assert.equal(response.statusCode, 404)
    })

    await t.test('legacy fallback returns generic not found for cross-tenant close mutation', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-legacy-client1-t1/close',
        headers: authHeaders(ownerT2),
        payload: {
          rating: 1,
          feedback: 'Cross tenant legacy probe',
          closedBy: 'owner',
        },
      })

      assert.equal(response.statusCode, 404)
    })
  } finally {
    await harness.close()
  }
})
