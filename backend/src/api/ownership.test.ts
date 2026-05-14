import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { JobWorker } from '../jobs/index.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityExportRepository } from '../repositories/entityExportRepository.js'
import type { GrowthRepository } from '../repositories/growthRepository.js'
import type { SocialSignalEngine } from '../services/socialSignalEngine.js'
import { buildServer } from '../server.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    entityRepository: EntityRepository
    entityExportRepository: EntityExportRepository
    socialSignalEngine: SocialSignalEngine
    growthRepository: GrowthRepository
    jobWorker: JobWorker
  }
}

async function createAccessToken(userId: number, tenantId: number, privateKeyPem: string, kid: string) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(userId),
    tenant_id: String(tenantId),
    roles: ['owner'],
    ver: 1,
    jti: `ownership-${userId}-${tenantId}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-ownership')
    .setAudience('brandsoul-api-ownership')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-ownership-'))
  const secret = 'ownership-test-secret'
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'ownership-test-kid'
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

  process.env.JWT_SECRET = secret
  process.env.SQLITE_FILE = path.join(workspace, 'ownership.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-ownership'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-ownership'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    secret,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousJwtSecret === 'undefined') {
        delete process.env.JWT_SECRET
      } else {
        process.env.JWT_SECRET = previousJwtSecret
      }

      if (typeof previousSqliteFile === 'undefined') {
        delete process.env.SQLITE_FILE
      } else {
        process.env.SQLITE_FILE = previousSqliteFile
      }

      if (typeof previousAssetStorageDir === 'undefined') {
        delete process.env.ASSET_STORAGE_DIR
      } else {
        process.env.ASSET_STORAGE_DIR = previousAssetStorageDir
      }

      if (typeof previousAuthIssuer === 'undefined') {
        delete process.env.AUTH_ISSUER
      } else {
        process.env.AUTH_ISSUER = previousAuthIssuer
      }

      if (typeof previousAuthAudience === 'undefined') {
        delete process.env.AUTH_AUDIENCE
      } else {
        process.env.AUTH_AUDIENCE = previousAuthAudience
      }

      if (typeof previousAuthKid === 'undefined') {
        delete process.env.AUTH_ACTIVE_KID
      } else {
        process.env.AUTH_ACTIVE_KID = previousAuthKid
      }

      if (typeof previousPrivateKeyRef === 'undefined') {
        delete process.env.AUTH_PRIVATE_KEY_REF
      } else {
        process.env.AUTH_PRIVATE_KEY_REF = previousPrivateKeyRef
      }

      if (typeof previousPublicKeyPath === 'undefined') {
        delete process.env.AUTH_PUBLIC_KEY_PATH
      } else {
        process.env.AUTH_PUBLIC_KEY_PATH = previousPublicKeyPath
      }
    },
  }
}

function createEntityProfileFixture(id: string, overrides?: Record<string, unknown>): EntityProfile {
  return {
    id,
    metadata: {
      createdAt: '2026-04-25T10:00:00.000Z',
      notes: [],
    },
    ...overrides,
  } as unknown as EntityProfile
}

async function seedEntity(
  app: AppWithContext,
  input: Parameters<AppWithContext['backendContext']['entityRepository']['createEntity']>[0],
) {
  return runSeedMutation(
    () => app.backendContext.entityRepository.createEntity(input),
    'backend/src/api/ownership.test.ts#seedEntity',
  )
}

test('canonical ownership overrides matching legacy ownerId during private reads', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-canonical-deny',
      ownerId: 'user:1:tenant:1',
      ownerUserId: 99,
      ownerTenantId: 99,
      entityProfile: createEntityProfileFixture('entity-canonical-deny'),
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/entity/entity-canonical-deny',
      headers: {
        authorization: `Bearer ${await createAccessToken(1, 1, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, 'ENTITY_ACCESS_DENIED')
  } finally {
    await harness.close()
  }
})

test('legacy-only ownership is backfilled from authenticated context', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-legacy-backfill',
      ownerId: 'user:7:tenant:11',
      entityProfile: createEntityProfileFixture('entity-legacy-backfill'),
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/entity/entity-legacy-backfill',
      headers: {
        authorization: `Bearer ${await createAccessToken(7, 11, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 200)

    const stored = await harness.app.backendContext.entityRepository.getEntityById('entity-legacy-backfill')
    assert.equal(stored?.ownerUserId, 7)
    assert.equal(stored?.ownerTenantId, 11)
  } finally {
    await harness.close()
  }
})

test('patching an entity ignores client ownership overrides', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-patch-owned',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-patch-owned', {
        ownerId: 'user:5:tenant:8',
        ownerUserId: 5,
        ownerTenantId: 8,
        metadata: {
          createdAt: '2026-04-25T10:00:00.000Z',
          notes: ['before'],
        },
      }),
    })

    const response = await harness.app.inject({
      method: 'PATCH',
      url: '/entity/entity-patch-owned',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
        'content-type': 'application/json',
      },
      payload: {
        entityProfile: {
          id: 'entity-patch-owned',
          ownerId: 'user:999:tenant:999',
          ownerUserId: 999,
          ownerTenantId: 999,
          metadata: {
            createdAt: '2026-04-25T10:00:00.000Z',
            notes: ['after'],
          },
        },
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.ownerUserId, 5)
    assert.equal(body.ownerTenantId, 8)

    const stored = await harness.app.backendContext.entityRepository.getEntityById('entity-patch-owned')
    assert.equal(stored?.ownerId, 'user:5:tenant:8')
    assert.equal(stored?.ownerUserId, 5)
    assert.equal(stored?.ownerTenantId, 8)
    assert.equal((stored?.entityProfile as Record<string, unknown>).ownerId, 'user:5:tenant:8')
    assert.equal((stored?.entityProfile as Record<string, unknown>).ownerUserId, 5)
    assert.equal((stored?.entityProfile as Record<string, unknown>).ownerTenantId, 8)
  } finally {
    await harness.close()
  }
})

test('posting entity events still returns the logged event and records return-visit growth', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-events-owned',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-events-owned'),
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/entity/entity-events-owned/events',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
        'content-type': 'application/json',
      },
      payload: {
        type: 'return.visit',
        payload: {
          summary: 'Viewer returned to the entity.',
        },
      },
    })

    assert.equal(response.statusCode, 201)
    assert.equal(response.json().event.type, 'return.visit')

    const growthEvents = await harness.app.backendContext.growthRepository.getGrowthEvents('entity-events-owned', 10)
    assert.equal(growthEvents.some((event) => event.type === 'return_visit'), true)
  } finally {
    await harness.close()
  }
})

test('public export delivery still records view-side growth through sovereign command', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-export-owned',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-export-owned'),
    })
    await harness.app.backendContext.entityExportRepository.logExport({
      id: 'exp-owned-1',
      entityId: 'entity-export-owned',
      format: 'square',
      fileUrl: 'https://example.com/export.png',
      createdAt: '2026-05-04T10:00:00.000Z',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/entity/entity-export-owned/export/exp-owned-1',
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().export.id, 'exp-owned-1')

    const growthEvents = await harness.app.backendContext.growthRepository.getGrowthEvents('entity-export-owned', 10)
    assert.equal(growthEvents.some((event) => event.type === 'export_viewed'), true)
  } finally {
    await harness.close()
  }
})

test('private monetization rejects foreign entity ownership', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-foreign-monetization',
      ownerId: 'user:21:tenant:34',
      ownerUserId: 21,
      ownerTenantId: 34,
      entityProfile: createEntityProfileFixture('entity-foreign-monetization'),
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/me/monetization?entityId=entity-foreign-monetization',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, 'ENTITY_ACCESS_DENIED')
  } finally {
    await harness.close()
  }
})

test('me entities returns only entities owned by the authenticated user', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await Promise.all([
      seedEntity(harness.app, {
        id: 'entity-owned-a',
        ownerId: 'user:5:tenant:8',
        ownerUserId: 5,
        ownerTenantId: 8,
        entityProfile: createEntityProfileFixture('entity-owned-a'),
      }),
      seedEntity(harness.app, {
        id: 'entity-owned-b',
        ownerId: 'user:5:tenant:8',
        ownerUserId: 5,
        ownerTenantId: 8,
        entityProfile: createEntityProfileFixture('entity-owned-b'),
      }),
      seedEntity(harness.app, {
        id: 'entity-foreign-c',
        ownerId: 'user:21:tenant:34',
        ownerUserId: 21,
        ownerTenantId: 34,
        entityProfile: createEntityProfileFixture('entity-foreign-c'),
      }),
    ])

    const response = await harness.app.inject({
      method: 'GET',
      url: '/me/entities',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as { userId: number; tenantId: number; entities: Array<{ entityId: string }> }
    assert.equal(body.userId, 5)
    assert.equal(body.tenantId, 8)
    assert.deepEqual(body.entities.map((entity) => entity.entityId).sort(), ['entity-owned-a', 'entity-owned-b'])
  } finally {
    await harness.close()
  }
})

test('legacy entities endpoint is still compatible but marked as deprecated', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-legacy-list',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-legacy-list'),
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/entities?ownerId=user:999:tenant:999',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers.deprecation, 'true')
    assert.equal(response.headers.link, '</me/entities>; rel="successor-version"')

    const body = response.json() as { compatibility: { canonicalEndpoint: string; ignoresClientOwnerId: boolean }; entities: Array<{ entityId: string }> }
    assert.equal(body.compatibility.canonicalEndpoint, '/me/entities')
    assert.equal(body.compatibility.ignoresClientOwnerId, true)
    assert.deepEqual(body.entities.map((entity) => entity.entityId), ['entity-legacy-list'])
  } finally {
    await harness.close()
  }
})

test('metrics and job health endpoints require authentication', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const [metricsResponse, healthJobsResponse] = await Promise.all([
      harness.app.inject({
        method: 'GET',
        url: '/metrics',
      }),
      harness.app.inject({
        method: 'GET',
        url: '/health/jobs',
      }),
    ])

    assert.equal(metricsResponse.statusCode, 401)
    assert.equal(healthJobsResponse.statusCode, 401)
  } finally {
    await harness.close()
  }
})

test('job detail is owner-only by associated entity ownership', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-owned-job',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-owned-job'),
    })

    const enqueueResponse = await harness.app.inject({
      method: 'POST',
      url: '/entity/entity-owned-job/exports',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
        'content-type': 'application/json',
      },
      payload: {
        format: 'json',
      },
    })

    assert.equal(enqueueResponse.statusCode, 202)
    const { jobId } = enqueueResponse.json() as { jobId: string }

    const [ownerResponse, foreignResponse] = await Promise.all([
      harness.app.inject({
        method: 'GET',
        url: `/jobs/${jobId}`,
        headers: {
          authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: `/jobs/${jobId}`,
        headers: {
          authorization: `Bearer ${await createAccessToken(21, 34, harness.privateKeyPem, harness.configuredKid)}`,
        },
      }),
    ])

    assert.equal(ownerResponse.statusCode, 200)
    assert.equal(foreignResponse.statusCode, 403)
    assert.equal(foreignResponse.json().error.code, 'JOB_ACCESS_DENIED')
  } finally {
    await harness.close()
  }
})

test('job listing only returns jobs for entities owned by the authenticated user', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await Promise.all([
      seedEntity(harness.app, {
        id: 'entity-owned-list',
        ownerId: 'user:5:tenant:8',
        ownerUserId: 5,
        ownerTenantId: 8,
        entityProfile: createEntityProfileFixture('entity-owned-list'),
      }),
      seedEntity(harness.app, {
        id: 'entity-foreign-list',
        ownerId: 'user:21:tenant:34',
        ownerUserId: 21,
        ownerTenantId: 34,
        entityProfile: createEntityProfileFixture('entity-foreign-list'),
      }),
    ])

    await Promise.all([
      harness.app.inject({
        method: 'POST',
        url: '/entity/entity-owned-list/exports',
        headers: {
          authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
          'content-type': 'application/json',
        },
        payload: {
          format: 'json',
        },
      }),
      harness.app.inject({
        method: 'POST',
        url: '/entity/entity-foreign-list/exports',
        headers: {
          authorization: `Bearer ${await createAccessToken(21, 34, harness.privateKeyPem, harness.configuredKid)}`,
          'content-type': 'application/json',
        },
        payload: {
          format: 'json',
        },
      }),
    ])

    const response = await harness.app.inject({
      method: 'GET',
      url: '/jobs',
      headers: {
        authorization: `Bearer ${await createAccessToken(5, 8, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as { jobs: Array<{ entityId?: string }> }
    assert.ok(body.jobs.length >= 1)
    assert.ok(body.jobs.every((job) => job.entityId === 'entity-owned-list'))
  } finally {
    await harness.close()
  }
})

test('referral acceptance now requires authentication', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/referrals/ref-test/accept',
      headers: {
        'content-type': 'application/json',
      },
      payload: {},
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await harness.close()
  }
})

test('anonymous public social actions are limited to viewed only', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-public-signal-lockdown',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-public-signal-lockdown'),
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/entity/entity-public-signal-lockdown/signals',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        type: 'followed',
        actorId: 'spoofed-anonymous-actor',
        weight: 1,
      },
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, 'AUTH_REQUIRED_FOR_SIGNAL')
  } finally {
    await harness.close()
  }
})

test('authenticated public social actions ignore spoofed client actorId', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-public-auth-signal',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-public-auth-signal'),
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/entity/entity-public-auth-signal/signals',
      headers: {
        authorization: `Bearer ${await createAccessToken(21, 34, harness.privateKeyPem, harness.configuredKid)}`,
        'content-type': 'application/json',
      },
      payload: {
        type: 'followed',
        actorId: 'spoofed-client-actor',
        weight: 1,
      },
    })

    assert.equal(response.statusCode, 202)
    const body = response.json() as { job: { payload: { actorId: string; weight: number; metadata: Record<string, unknown> } } }
    assert.equal(body.job.payload.actorId, 'user:21:tenant:34:signal:followed')
    assert.equal(body.job.payload.weight, 0.78)
    assert.equal(body.job.payload.metadata._signalTrust, 'authenticated')
  } finally {
    await harness.close()
  }
})

test('viewer state is resolved from authenticated user instead of query actorId', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-viewer-state-auth',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-viewer-state-auth'),
    })

    await harness.app.backendContext.socialSignalEngine.registerSignal({
      entityId: 'entity-viewer-state-auth',
      ownerId: 'user:5:tenant:8',
      type: 'followed',
      actorId: 'user:21:tenant:34',
      metadata: {
        _signalTrust: 'authenticated',
      },
    })

    const [anonymousResponse, authenticatedResponse] = await Promise.all([
      harness.app.inject({
        method: 'GET',
        url: '/entity/entity-viewer-state-auth/signals?actorId=spoofed-query-actor',
      }),
      harness.app.inject({
        method: 'GET',
        url: '/entity/entity-viewer-state-auth/signals?actorId=spoofed-query-actor',
        headers: {
          authorization: `Bearer ${await createAccessToken(21, 34, harness.privateKeyPem, harness.configuredKid)}`,
        },
      }),
    ])

    assert.equal(anonymousResponse.statusCode, 200)
    assert.equal(authenticatedResponse.statusCode, 200)
    assert.equal(anonymousResponse.json().viewerState.followed, false)
    assert.equal(authenticatedResponse.json().viewerState.followed, true)
  } finally {
    await harness.close()
  }
})

test('public export views are deduplicated per actor fingerprint window', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app, {
      id: 'entity-public-export-dedupe',
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: createEntityProfileFixture('entity-public-export-dedupe'),
    })

    await harness.app.backendContext.entityExportRepository.logExport({
      id: 'exp-public-dedupe',
      entityId: 'entity-public-export-dedupe',
      format: 'story',
      metadata: {},
      fileUrl: 'https://example.com/export.png',
    })

    const headers = {
      'user-agent': 'BrandSoul Security Test Agent',
      'accept-language': 'pt-BR',
    }

    const firstResponse = await harness.app.inject({
      method: 'GET',
      url: '/entity/entity-public-export-dedupe/export/exp-public-dedupe',
      headers,
    })
    const secondResponse = await harness.app.inject({
      method: 'GET',
      url: '/entity/entity-public-export-dedupe/export/exp-public-dedupe',
      headers,
    })

    assert.equal(firstResponse.statusCode, 200)
    assert.equal(secondResponse.statusCode, 200)

    const aggregate = await harness.app.backendContext.socialSignalEngine.aggregateSignals('entity-public-export-dedupe', 20)
    const growthEvents = await harness.app.backendContext.growthRepository.getGrowthEvents('entity-public-export-dedupe', 20)

    assert.equal(aggregate.counts.viewed, 1)
    assert.equal(growthEvents.filter((event) => event.type === 'export_viewed').length, 1)
  } finally {
    await harness.close()
  }
})
