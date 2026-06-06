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
    jti: `canonical-case-surface-${role}-${userId}-${tenantId}-${randomUUID()}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-canonical-case-surface')
    .setAudience('brandsoul-api-canonical-case-surface')
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-canonical-case-surface-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'canonical-case-surface-test-kid'
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

  process.env.JWT_SECRET = 'canonical-case-surface-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'canonical-case-surface.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-canonical-case-surface'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-canonical-case-surface'
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
    },
  }
}

async function seedCanonicalCaseData(harness: Harness) {
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
  }, 'backend/src/api/canonicalCaseRouteSurface.test.ts#seedCanonicalCaseData')

  await db.run(
    `
      INSERT INTO flow_auth_user (
        id, legacy_source, legacy_id, name, email, password_hash, is_active, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    100,
    'test',
    100,
    'Owner User',
    'owner@brandsoul.local',
    'not-used-in-tests',
    1,
    now,
    now,
    101,
    'test',
    101,
    'Client User',
    'client@brandsoul.local',
    'not-used-in-tests',
    1,
    now,
    now,
    201,
    'test',
    201,
    'Assigned Lawyer',
    'lawyer@brandsoul.local',
    'not-used-in-tests',
    1,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO flow_auth_tenant (
        id, legacy_source, legacy_id, name, slug, business_model, plan, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    1,
    'test',
    1,
    'Canonical Case Surface Tenant',
    'canonical-case-surface',
    'hybrid',
    'starter',
    1,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO flow_auth_membership (
        id, legacy_source, legacy_id, user_id, tenant_id, role, is_active, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    1100,
    'test',
    1100,
    100,
    1,
    'owner',
    1,
    now,
    now,
    1101,
    'test',
    1101,
    101,
    1,
    'client',
    1,
    now,
    now,
    1201,
    'test',
    1201,
    201,
    1,
    'lawyer',
    1,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO professionals (
        id, tenant_id, user_id, external_ref, kind, status, display_name, primary_email, primary_phone, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  )

  await db.run(
    `
      INSERT INTO cases (
        id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority, practice_area, source,
        opened_at, closed_at, archived_at, resolution_reason, lead_professional_id, centelha_context, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'case-client1-t1',
    1,
    null,
    'entity-t1-owned',
    101,
    'Caso Canonico',
    'Descricao canonica',
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
  )

  await db.run(
    `
      INSERT INTO case_assignments (
        id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id, assigned_at, unassigned_at, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

test('canonical case route surface stays published from entity.ts only', { concurrency: false }, async (t) => {
  const harness = await createHarness()

  try {
    await seedCanonicalCaseData(harness)

    const ownerT1 = await createAccessToken(100, 1, 'owner', harness.privateKeyPem, harness.configuredKid)
    const clientT1 = await createAccessToken(101, 1, 'client', harness.privateKeyPem, harness.configuredKid)
    const lawyerAssigned = await createAccessToken(201, 1, 'lawyer', harness.privateKeyPem, harness.configuredKid)

    await t.test('official GET /cases requires auth', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases?entityId=entity-t1-owned',
      })
      assert.equal(response.statusCode, 401)
    })

    await t.test('official GET /cases/:id requires auth', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/cases/case-client1-t1',
      })
      assert.equal(response.statusCode, 401)
    })

    await t.test('official POST /cases/:id/messages requires auth', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/messages',
        payload: {
          role: 'user',
          text: 'Tentativa anonima',
        },
      })
      assert.equal(response.statusCode, 401)
    })

    await t.test('official POST /cases remains available on canonical surface', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/cases',
        headers: authHeaders(clientT1),
        payload: {
          entityId: 'entity-t1-owned',
          title: 'Caso criado na superficie canonica',
          description: 'Fluxo de intake canonico.',
          priority: 'high',
          practiceArea: 'labor',
        },
      })

      assert.equal(response.statusCode, 201)
      assert.ok(response.json().case?.id)
    })

    await t.test('status hardening remains active on canonical surface', async () => {
      const denied = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/status',
        headers: authHeaders(clientT1),
        payload: {
          status: 'on_hold',
          reason: 'Cliente tentando mutar lifecycle',
        },
      })
      assert.equal(denied.statusCode, 403)

      const allowed = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/status',
        headers: authHeaders(ownerT1),
        payload: {
          status: 'on_hold',
          reason: 'Owner mutando lifecycle',
        },
      })
      assert.equal(allowed.statusCode, 200)
    })

    await t.test('close hardening remains active on canonical surface', async () => {
      const lawyerDenied = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(lawyerAssigned),
        payload: {
          rating: 4,
          feedback: 'Advogado tentando fechar',
          closedBy: 'lawyer',
        },
      })
      assert.equal(lawyerDenied.statusCode, 403)

      const ownerAllowed = await harness.app.inject({
        method: 'POST',
        url: '/cases/case-client1-t1/close',
        headers: authHeaders(ownerT1),
        payload: {
          rating: 5,
          feedback: 'Owner encerrando',
          closedBy: 'owner',
        },
      })
      assert.equal(ownerAllowed.statusCode, 200)
    })
  } finally {
    await harness.close()
  }
})
