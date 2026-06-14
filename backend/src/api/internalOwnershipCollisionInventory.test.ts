import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { JobWorker } from '../jobs/index.js'
import { buildServer } from '../server.js'
import type { BackendDatabase } from '../db/index.js'
import { acquireProcessEnvTestLock } from '../test/processEnvTestLock.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    jobWorker: JobWorker
  }
}

async function createTestApp() {
  const releaseProcessEnvLock = await acquireProcessEnvTestLock('brandsoul-build-server-env-lock')
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-ownership-collision-inventory-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    jwtSecret: process.env.JWT_SECRET,
    sqliteFile: process.env.SQLITE_FILE,
    assetStorageDir: process.env.ASSET_STORAGE_DIR,
    authIssuer: process.env.AUTH_ISSUER,
    authAudience: process.env.AUTH_AUDIENCE,
    authKid: process.env.AUTH_ACTIVE_KID,
    authPrivateKeyRef: process.env.AUTH_PRIVATE_KEY_REF,
    authPublicKeyPath: process.env.AUTH_PUBLIC_KEY_PATH,
    internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN,
  }

  process.env.JWT_SECRET = 'ownership-collision-inventory-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'ownership-collision-inventory.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-collision-inventory'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-collision-inventory'
  process.env.AUTH_ACTIVE_KID = 'collision-inventory-test-kid'
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.INTERNAL_ADMIN_TOKEN = 'internal-admin-token-test'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN,
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousEnv.jwtSecret === 'undefined') delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousEnv.jwtSecret
      if (typeof previousEnv.sqliteFile === 'undefined') delete process.env.SQLITE_FILE
      else process.env.SQLITE_FILE = previousEnv.sqliteFile
      if (typeof previousEnv.assetStorageDir === 'undefined') delete process.env.ASSET_STORAGE_DIR
      else process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      if (typeof previousEnv.authIssuer === 'undefined') delete process.env.AUTH_ISSUER
      else process.env.AUTH_ISSUER = previousEnv.authIssuer
      if (typeof previousEnv.authAudience === 'undefined') delete process.env.AUTH_AUDIENCE
      else process.env.AUTH_AUDIENCE = previousEnv.authAudience
      if (typeof previousEnv.authKid === 'undefined') delete process.env.AUTH_ACTIVE_KID
      else process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      if (typeof previousEnv.authPrivateKeyRef === 'undefined') delete process.env.AUTH_PRIVATE_KEY_REF
      else process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      if (typeof previousEnv.authPublicKeyPath === 'undefined') delete process.env.AUTH_PUBLIC_KEY_PATH
      else process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
      if (typeof previousEnv.internalAdminToken === 'undefined') delete process.env.INTERNAL_ADMIN_TOKEN
      else process.env.INTERNAL_ADMIN_TOKEN = previousEnv.internalAdminToken

      await releaseProcessEnvLock()
    },
  }
}

async function seedNativeAuthOwner(app: AppWithContext, args: {
  userId: number
  tenantId: number
  role: string
  createdAt: string
}) {
  const db = app.backendContext.connection
  await db.run(
    `
      INSERT INTO flow_auth_user (id, legacy_source, legacy_id, name, email, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args.userId,
    'brandsoul',
    args.userId,
    `User ${args.userId}`,
    `user${args.userId}@example.com`,
    `test-password-hash-${args.userId}`,
    1,
    args.createdAt,
    args.createdAt,
  )

  await db.run(
    `
      INSERT INTO flow_auth_tenant (id, legacy_source, legacy_id, name, slug, business_model, plan, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args.tenantId,
    'brandsoul',
    args.tenantId,
    `Tenant ${args.tenantId}`,
    `tenant-${args.tenantId}`,
    'service',
    'pro',
    1,
    args.createdAt,
    args.createdAt,
  )

  await db.run(
    `
      INSERT INTO flow_auth_membership (id, legacy_source, legacy_id, user_id, tenant_id, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    (args.tenantId * 10_000) + args.userId,
    'brandsoul',
    (args.tenantId * 10_000) + args.userId,
    args.userId,
    args.tenantId,
    args.role,
    1,
    args.createdAt,
    args.createdAt,
  )
}

async function seedLegacyTables(app: AppWithContext) {
  const db = app.backendContext.connection
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      business_model TEXT NOT NULL,
      plan TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  await db.run(
    `
      INSERT INTO users (id, name, email, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    4,
    'Legacy User 4',
    'legacy4@example.com',
    'legacy-password-hash-4',
    1,
    '2026-06-13T18:10:01.911Z',
    '2026-06-13T18:10:01.911Z',
  )

  await db.run(
    `
      INSERT INTO tenants (id, name, slug, business_model, plan, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    4,
    'Legacy Tenant 4',
    'legacy-tenant-4',
    'service',
    'pro',
    1,
    '2026-06-13T18:10:01.911Z',
    '2026-06-13T18:10:01.911Z',
  )

  await db.run(
    `
      INSERT INTO memberships (id, user_id, tenant_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    40004,
    4,
    4,
    'owner',
    '2026-06-13T18:10:01.911Z',
  )
}

async function seedEntity(app: AppWithContext, args: {
  id: string
  ownerUserId: number
  ownerTenantId: number
  createdAt: string
}) {
  await runSeedMutation(
    () => app.backendContext.entityRepository.createEntity({
      id: args.id,
      ownerId: `user:${args.ownerUserId}:tenant:${args.ownerTenantId}`,
      ownerUserId: args.ownerUserId,
      ownerTenantId: args.ownerTenantId,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
      entityProfile: {
        id: args.id,
        metadata: {
          createdAt: args.createdAt,
          notes: [],
        },
      } as never,
    }),
    'backend/src/api/internalOwnershipCollisionInventory.test.ts#seedEntity',
  )
}

test('internal ownership collision inventory rejects missing token', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/internal/admin/ownership/collision-inventory?ownerIds=4,5',
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, 'INTERNAL_ADMIN_UNAUTHORIZED')
  } finally {
    await harness.close()
  }
})

test('internal ownership collision inventory rejects wrong token', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/internal/admin/ownership/collision-inventory?ownerIds=4,5',
      headers: {
        'x-internal-admin-token': 'wrong-token',
      },
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, 'INTERNAL_ADMIN_UNAUTHORIZED')
  } finally {
    await harness.close()
  }
})

test('internal ownership collision inventory returns safe fields and classifications', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedNativeAuthOwner(harness.app, {
      userId: 4,
      tenantId: 4,
      role: 'owner',
      createdAt: '2026-06-13T18:10:01.911Z',
    })
    await seedLegacyTables(harness.app)
    await seedEntity(harness.app, {
      id: 'office-temporal-collision',
      ownerUserId: 4,
      ownerTenantId: 4,
      createdAt: '2026-06-12T18:37:58.198Z',
    })
    await seedEntity(harness.app, {
      id: 'office-orphan-owner',
      ownerUserId: 5,
      ownerTenantId: 5,
      createdAt: '2026-06-14T10:00:00.000Z',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/internal/admin/ownership/collision-inventory?ownerIds=4,5&includeNativeAuth=true&includeLegacyAuth=true',
      headers: {
        'x-internal-admin-token': harness.internalAdminToken,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as {
      ownerIds: number[]
      entityProfileRows: Array<{ id: string; classification: string }>
      nativeAuth: {
        users: Array<{ id: number; emailHash: string; email?: string }>
      }
      legacyAuth: {
        available: boolean
        users: Array<{ id: number; emailHash: string; email?: string }>
      }
      summary: {
        temporalImpossibleRows: number
        recycledIdCollisionRows: number
        orphanOwnerRows: number
        manualReviewRows: number
      }
    }

    assert.deepEqual(body.ownerIds, [4, 5])
    assert.equal(body.legacyAuth.available, true)
    assert.equal(body.nativeAuth.users.some((user) => 'email' in user), false)
    assert.equal(body.legacyAuth.users.some((user) => 'email' in user), false)
    assert.equal(JSON.stringify(body).includes('user4@example.com'), false)
    assert.equal(JSON.stringify(body).includes('legacy4@example.com'), false)

    const temporalRow = body.entityProfileRows.find((row) => row.id === 'office-temporal-collision')
    const orphanRow = body.entityProfileRows.find((row) => row.id === 'office-orphan-owner')
    assert.equal(temporalRow?.classification, 'TEMPORAL_IMPOSSIBLE_OWNERSHIP')
    assert.equal(orphanRow?.classification, 'ORPHAN_OWNER')
    assert.equal(body.summary.temporalImpossibleRows, 1)
    assert.equal(body.summary.recycledIdCollisionRows, 1)
    assert.equal(body.summary.orphanOwnerRows, 1)
    assert.equal(body.summary.manualReviewRows, 0)
  } finally {
    await harness.close()
  }
})

test('internal ownership collision inventory supports all=true totals and top orphan offices', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedNativeAuthOwner(harness.app, {
      userId: 4,
      tenantId: 4,
      role: 'owner',
      createdAt: '2026-06-13T18:10:01.911Z',
    })
    await seedEntity(harness.app, {
      id: 'office-valid-owner',
      ownerUserId: 4,
      ownerTenantId: 4,
      createdAt: '2026-06-14T10:00:00.000Z',
    })
    await seedEntity(harness.app, {
      id: 'office-orphan-owner-a',
      ownerUserId: 5,
      ownerTenantId: 5,
      createdAt: '2026-06-14T11:00:00.000Z',
    })
    await seedEntity(harness.app, {
      id: 'office-orphan-owner-b',
      ownerUserId: 6,
      ownerTenantId: 6,
      createdAt: '2026-06-14T12:00:00.000Z',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/internal/admin/ownership/collision-inventory?all=true&includeNativeAuth=true&includeLegacyAuth=true',
      headers: {
        'x-internal-admin-token': harness.internalAdminToken,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as {
      all: boolean
      ownerIds: number[]
      totalEntities: number
      validOwners: number
      orphanOwners: number
      temporalImpossibleOwners: number
      topOrphanOffices: Array<{
        officeId: string
        ownerUserId: number | null
        ownerTenantId: number | null
        createdAt: string | null
        classification: string
      }>
    }

    assert.equal(body.all, true)
    assert.equal(body.totalEntities, 3)
    assert.equal(body.validOwners, 1)
    assert.equal(body.orphanOwners, 2)
    assert.equal(body.temporalImpossibleOwners, 0)
    assert.deepEqual(body.ownerIds, [4, 5, 6])
    assert.deepEqual(
      body.topOrphanOffices.map((office) => office.officeId),
      ['office-orphan-owner-a', 'office-orphan-owner-b'],
    )
    assert.equal(
      body.topOrphanOffices.every((office) => office.classification === 'ORPHAN_OWNER'),
      true,
    )
  } finally {
    await harness.close()
  }
})
