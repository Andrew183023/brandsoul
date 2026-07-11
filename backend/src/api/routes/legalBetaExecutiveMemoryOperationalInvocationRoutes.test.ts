import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { AuthIdentityStoreRepository } from '../../auth/repositories/authIdentityStoreRepository.js'
import type { BackendDatabase } from '../../db/index.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import {
  CryptoExecutiveMemoryCaptureCycleIdSource,
  EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX,
  ExecutiveMemoryCaptureTriggerService,
  ExecutiveMemoryOperationalInvocationAdapter,
} from '../../modules/executive/index.js'
import { buildLegalBetaServer } from '../../server.legal-beta.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    observability: ObservabilityService
    auth: {
      authIdentityStoreRepository: AuthIdentityStoreRepository
    }
  }
}

type Harness = {
  app: AppWithContext
  privateKeyPem: string
  configuredKid: string
  close(): Promise<void>
}

type PrincipalIdentity = {
  userId: number
  tenantId: number
  role: string
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-executive-memory-http-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-executive-memory-http-kid'
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
  process.env.JWT_SECRET = 'legal-beta-executive-memory-http-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-executive-memory-http.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-executive-memory-http'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-executive-memory-http'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildLegalBetaServer() as AppWithContext

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

async function createAccessToken(args: {
  userId: number
  tenantId: number
  roles: string[]
  privateKeyPem: string
  kid: string
}) {
  const privateKey = await importPKCS8(args.privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(args.userId),
    tenant_id: String(args.tenantId),
    roles: args.roles,
    ver: 1,
    jti: `executive-memory-http-${args.userId}-${args.tenantId}-${args.roles.join('-')}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer('brandsoul-auth-legal-beta-executive-memory-http')
    .setAudience('brandsoul-api-legal-beta-executive-memory-http')
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

function readCount(row: unknown): number {
  if (!row || typeof row !== 'object') {
    return 0
  }

  const count = Reflect.get(row, 'count')
  if (typeof count === 'number') {
    return count
  }

  if (typeof count === 'string') {
    const parsed = Number(count)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

async function readTableCount(db: BackendDatabase, tableName: string) {
  const row = await db.get(`SELECT COUNT(*) AS count FROM ${tableName}`)
  return readCount(row)
}

async function seedPrincipal(harness: Harness, args: {
  name: string
  email: string
  slug: string
  role: string
}) {
  const repository = harness.app.backendContext.auth.authIdentityStoreRepository
  const user = await repository.createUser({
    name: args.name,
    email: args.email,
    passwordHash: 'hash',
    isActive: true,
  })
  const tenant = await repository.createTenant({
    name: `${args.name} Tenant`,
    slug: args.slug,
    businessModel: 'professional',
    isActive: true,
  })

  assert.ok(user)
  assert.ok(tenant)

  await repository.createMembership({
    userId: user.id,
    tenantId: tenant.id,
    role: args.role,
    isActive: true,
  })

  return {
    userId: user.id,
    tenantId: tenant.id,
    role: args.role,
  } satisfies PrincipalIdentity
}

async function seedEligibleOffice(harness: Harness, suffix: string) {
  const owner = await seedPrincipal(harness, {
    name: `Office Owner ${suffix}`,
    email: `office-owner-${suffix}@example.com`,
    slug: `office-owner-${suffix}`,
    role: 'owner',
  })

  await harness.app.backendContext.entityRepository.createEntity({
    id: `office-executive-memory-${suffix}`,
    ownerId: `user:${owner.userId}:tenant:${owner.tenantId}`,
    ownerUserId: owner.userId,
    ownerTenantId: owner.tenantId,
    entityProfile: {
      metadata: {
        businessConfig: {
          businessType: 'legal',
        },
        lifecycle: {
          status: 'active',
        },
      },
    },
  })
}

test('executive memory invocation route registers passively and bootstrap stays non-operational', { concurrency: false }, async () => {
  let adapterInvokeCalls = 0
  let triggerRunCalls = 0
  let captureCycleIdCalls = 0

  const originalInvoke = ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke
  const originalRun = ExecutiveMemoryCaptureTriggerService.prototype.run
  const originalNextCaptureCycleId = CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId

  ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = async function patchedInvoke(...args) {
    adapterInvokeCalls += 1
    return originalInvoke.apply(this, args)
  }
  ExecutiveMemoryCaptureTriggerService.prototype.run = async function patchedRun(...args) {
    triggerRunCalls += 1
    return originalRun.apply(this, args)
  }
  CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = function patchedNextCaptureCycleId(...args) {
    captureCycleIdCalls += 1
    return originalNextCaptureCycleId.apply(this, args)
  }

  const harness = await createHarness()

  try {
    assert.equal(adapterInvokeCalls, 0)
    assert.equal(triggerRunCalls, 0)
    assert.equal(captureCycleIdCalls, 0)
    assert.equal(
      await readTableCount(harness.app.backendContext.connection, 'executive_memory_snapshots'),
      0,
    )
    assert.equal(
      await readTableCount(harness.app.backendContext.connection, 'executive_memory_observations'),
      0,
    )

    const routes = harness.app.printRoutes()
    assert.equal(routes.includes('/admin/executive-memory/run'), true)
  } finally {
    ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = originalInvoke
    ExecutiveMemoryCaptureTriggerService.prototype.run = originalRun
    CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = originalNextCaptureCycleId
    await harness.close()
  }
})

test('POST /admin/executive-memory/run returns 401 without authentication', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      payload: {},
    })

    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), {
      status: 'failed',
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      },
    })
  } finally {
    await harness.close()
  }
})

test('POST /admin/executive-memory/run rejects invalid body and forbidden fields before adapter invocation', { concurrency: false }, async () => {
  let adapterInvokeCalls = 0
  const originalInvoke = ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke
  ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = async function patchedInvoke(...args) {
    adapterInvokeCalls += 1
    return originalInvoke.apply(this, args)
  }

  const harness = await createHarness()

  try {
    const admin = await seedPrincipal(harness, {
      name: 'Admin Invalid Body',
      email: 'admin-invalid-body@example.com',
      slug: 'admin-invalid-body',
      role: 'admin',
    })
    const accessToken = await createAccessToken({
      ...admin,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(accessToken),
      payload: {
        maxBatches: '1',
        actor: {
          actorId: 'evil',
        },
      },
    })

    assert.equal(response.statusCode, 400)
    const body = response.json() as {
      status: string
      error: {
        code: string
      }
    }
    assert.equal(body.status, 'failed')
    assert.equal(body.error.code, 'INVALID_EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_REQUEST')
    assert.equal(adapterInvokeCalls, 0)
  } finally {
    ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = originalInvoke
    await harness.close()
  }
})

test('POST /admin/executive-memory/run delegates to the adapter exactly once and preserves the sanitized response', { concurrency: false }, async () => {
  const invokeInputs: Array<{
    principal: {
      userId: number
      tenantId: number
      roles: string[]
    }
    maxBatches?: number
    limit?: number
  }> = []
  const originalInvoke = ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke
  ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = async function patchedInvoke(input) {
    invokeInputs.push({
      principal: {
        userId: input.principal.userId,
        tenantId: input.principal.tenantId,
        roles: [...input.principal.roles],
      },
      maxBatches: input.maxBatches,
      limit: input.limit,
    })

    return {
      status: 'batch_limit_reached',
      batchesExecuted: 2,
      captureCycleId: `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:adapter-route`,
      cursor: 'cursor-route',
      totals: {
        processed: 6,
        captured: 4,
        created: 4,
        failed: 1,
      },
    }
  }

  const harness = await createHarness()

  try {
    const admin = await seedPrincipal(harness, {
      name: 'Admin Delegation',
      email: 'admin-delegation@example.com',
      slug: 'admin-delegation',
      role: 'admin',
    })
    const accessToken = await createAccessToken({
      ...admin,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(accessToken),
      payload: {
        maxBatches: 3,
        limit: 7,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(invokeInputs, [{
      principal: {
        userId: admin.userId,
        tenantId: admin.tenantId,
        roles: ['admin'],
      },
      maxBatches: 3,
      limit: 7,
    }])
    assert.deepEqual(response.json(), {
      status: 'batch_limit_reached',
      batchesExecuted: 2,
      captureCycleId: `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:adapter-route`,
      cursor: 'cursor-route',
      totals: {
        processed: 6,
        captured: 4,
        created: 4,
        failed: 1,
      },
    })
    assert.equal('executionState' in response.json(), false)
  } finally {
    ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = originalInvoke
    await harness.close()
  }
})

for (const role of ['admin', 'owner', 'operator'] as const) {
  test(`POST /admin/executive-memory/run allows ${role} and preserves the sanitized productive result`, { concurrency: false }, async () => {
    let triggerRunCalls = 0
    let captureCycleIdCalls = 0
    const originalRun = ExecutiveMemoryCaptureTriggerService.prototype.run
    const originalNextCaptureCycleId = CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId

    ExecutiveMemoryCaptureTriggerService.prototype.run = async function patchedRun(...args) {
      triggerRunCalls += 1
      return originalRun.apply(this, args)
    }
    CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = function patchedNextCaptureCycleId(...args) {
      captureCycleIdCalls += 1
      return originalNextCaptureCycleId.apply(this, args)
    }

    const harness = await createHarness()

    try {
      await seedEligibleOffice(harness, `allowed-${role}`)
      const principal = await seedPrincipal(harness, {
        name: `Allowed ${role}`,
        email: `allowed-${role}@example.com`,
        slug: `allowed-${role}`,
        role,
      })
      const accessToken = await createAccessToken({
        ...principal,
        roles: [role],
        privateKeyPem: harness.privateKeyPem,
        kid: harness.configuredKid,
      })

      assert.equal(await readTableCount(harness.app.backendContext.connection, 'executive_memory_snapshots'), 0)
      assert.equal(await readTableCount(harness.app.backendContext.connection, 'executive_memory_observations'), 0)

      const response = await harness.app.inject({
        method: 'POST',
        url: '/admin/executive-memory/run',
        headers: authHeaders(accessToken),
        payload: {
          maxBatches: 1,
          limit: 5,
        },
      })

      assert.equal(response.statusCode, 200)
      const body = response.json()
      assert.equal(body.status, 'completed')
      assert.equal(typeof body.captureCycleId, 'string')
      assert.equal(body.captureCycleId.startsWith(`${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:`), true)
      assert.equal(body.batchesExecuted, 1)
      assert.deepEqual(body.totals, {
        processed: 1,
        captured: 1,
        created: 1,
        failed: 0,
      })
      assert.equal('executionState' in body, false)
      assert.equal(triggerRunCalls, 1)
      assert.equal(captureCycleIdCalls, 1)
      assert.equal(await readTableCount(harness.app.backendContext.connection, 'executive_memory_snapshots'), 1)
      assert.equal(await readTableCount(harness.app.backendContext.connection, 'executive_memory_observations'), 1)
    } finally {
      ExecutiveMemoryCaptureTriggerService.prototype.run = originalRun
      CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = originalNextCaptureCycleId
      await harness.close()
    }
  })
}

test('POST /admin/executive-memory/run denies client actors without executing or consuming capture cycle ids', { concurrency: false }, async () => {
  let triggerRunCalls = 0
  let captureCycleIdCalls = 0
  const originalRun = ExecutiveMemoryCaptureTriggerService.prototype.run
  const originalNextCaptureCycleId = CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId

  ExecutiveMemoryCaptureTriggerService.prototype.run = async function patchedRun(...args) {
    triggerRunCalls += 1
    return originalRun.apply(this, args)
  }
  CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = function patchedNextCaptureCycleId(...args) {
    captureCycleIdCalls += 1
    return originalNextCaptureCycleId.apply(this, args)
  }

  const harness = await createHarness()

  try {
    await seedEligibleOffice(harness, 'denied-client')
    const client = await seedPrincipal(harness, {
      name: 'Denied Client',
      email: 'denied-client@example.com',
      slug: 'denied-client',
      role: 'client',
    })
    const accessToken = await createAccessToken({
      ...client,
      roles: ['client'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(accessToken),
      payload: {},
    })

    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      status: 'failed',
      error: {
        code: 'EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_FORBIDDEN',
        message: 'role_not_allowed',
      },
    })
    assert.equal(triggerRunCalls, 0)
    assert.equal(captureCycleIdCalls, 0)
    assert.equal(await readTableCount(harness.app.backendContext.connection, 'executive_memory_snapshots'), 0)
    assert.equal(await readTableCount(harness.app.backendContext.connection, 'executive_memory_observations'), 0)
  } finally {
    ExecutiveMemoryCaptureTriggerService.prototype.run = originalRun
    CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = originalNextCaptureCycleId
    await harness.close()
  }
})

test('POST /admin/executive-memory/run denies unknown roles and malformed auth context without body-based privilege escalation', { concurrency: false }, async () => {
  let captureCycleIdCalls = 0
  const originalNextCaptureCycleId = CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId
  CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = function patchedNextCaptureCycleId(...args) {
    captureCycleIdCalls += 1
    return originalNextCaptureCycleId.apply(this, args)
  }

  const harness = await createHarness()

  try {
    const unknown = await seedPrincipal(harness, {
      name: 'Unknown Role',
      email: 'unknown-role@example.com',
      slug: 'unknown-role',
      role: 'reviewer',
    })
    const unknownToken = await createAccessToken({
      ...unknown,
      roles: ['reviewer'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const unknownResponse = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(unknownToken),
      payload: {},
    })

    assert.equal(unknownResponse.statusCode, 403)
    assert.equal(unknownResponse.json().error.code, 'EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_FORBIDDEN')
    assert.equal(captureCycleIdCalls, 0)

    const admin = await seedPrincipal(harness, {
      name: 'Admin Body Override',
      email: 'admin-body-override@example.com',
      slug: 'admin-body-override',
      role: 'admin',
    })
    const adminToken = await createAccessToken({
      ...admin,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const fabricatedBodyResponse = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(adminToken),
      payload: {
        tenantId: 999,
        roles: ['admin'],
        actorId: 'evil',
      },
    })

    assert.equal(fabricatedBodyResponse.statusCode, 400)
    assert.equal(fabricatedBodyResponse.json().error.code, 'INVALID_EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_REQUEST')
    assert.equal(captureCycleIdCalls, 0)

    const invalidTenantToken = await createAccessToken({
      userId: 9991,
      tenantId: 9992,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const invalidTenantResponse = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(invalidTenantToken),
      payload: {},
    })

    assert.equal(invalidTenantResponse.statusCode, 401)
    assert.equal(invalidTenantResponse.json().error.code, 'invalid_token')
  } finally {
    CryptoExecutiveMemoryCaptureCycleIdSource.prototype.nextCaptureCycleId = originalNextCaptureCycleId
    await harness.close()
  }
})

test('POST /admin/executive-memory/run preserves unexpected adapter failures using the backend error flow', { concurrency: false }, async () => {
  const originalInvoke = ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke
  ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = async function patchedInvoke() {
    throw new Error('adapter exploded')
  }

  const harness = await createHarness()

  try {
    const admin = await seedPrincipal(harness, {
      name: 'Admin Failure',
      email: 'admin-failure@example.com',
      slug: 'admin-failure',
      role: 'admin',
    })
    const accessToken = await createAccessToken({
      ...admin,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(accessToken),
      payload: {},
    })

    assert.equal(response.statusCode, 500)
  } finally {
    ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = originalInvoke
    await harness.close()
  }
})

test('POST /admin/executive-memory/run keeps sequential and concurrent requests independent', { concurrency: false }, async () => {
  let sequence = 0
  let releaseFirst: (() => void) | null = null
  let resolveFirstConcurrentEntered: (() => void) | null = null
  const firstConcurrentEntered = new Promise<void>((resolve) => {
    resolveFirstConcurrentEntered = resolve
  })
  let resolveSecondConcurrentEntered: (() => void) | null = null
  const secondConcurrentEntered = new Promise<void>((resolve) => {
    resolveSecondConcurrentEntered = resolve
  })
  let concurrentCalls = 0
  const originalInvoke = ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke
  ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = async function patchedInvoke() {
    sequence += 1
    if (sequence <= 2) {
      return {
        status: 'completed',
        batchesExecuted: 1,
        captureCycleId: `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:sequential-${sequence}`,
        cursor: undefined,
        totals: {
          processed: 1,
          captured: 1,
          created: 1,
          failed: 0,
        },
      }
    }

    concurrentCalls += 1
    if (concurrentCalls === 1) {
      resolveFirstConcurrentEntered?.()
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      return {
        status: 'completed',
        batchesExecuted: 1,
        captureCycleId: `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:concurrent-first`,
        cursor: undefined,
        totals: {
          processed: 1,
          captured: 1,
          created: 1,
          failed: 0,
        },
      }
    }

    resolveSecondConcurrentEntered?.()

    return {
      status: 'already_running',
      batchesExecuted: 0,
      captureCycleId: `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:concurrent-second`,
      cursor: 'cursor-second',
      totals: {
        processed: 0,
        captured: 0,
        created: 0,
        failed: 0,
      },
    }
  }

  const harness = await createHarness()

  try {
    const admin = await seedPrincipal(harness, {
      name: 'Admin Sequential Concurrent',
      email: 'admin-sequential-concurrent@example.com',
      slug: 'admin-sequential-concurrent',
      role: 'admin',
    })
    const owner = await seedPrincipal(harness, {
      name: 'Owner Sequential Concurrent',
      email: 'owner-sequential-concurrent@example.com',
      slug: 'owner-sequential-concurrent',
      role: 'owner',
    })

    const adminToken = await createAccessToken({
      ...admin,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const ownerToken = await createAccessToken({
      ...owner,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const firstSequential = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(adminToken),
      payload: {},
    })
    const secondSequential = await harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(ownerToken),
      payload: {},
    })

    assert.equal(firstSequential.statusCode, 200)
    assert.equal(secondSequential.statusCode, 200)
    assert.notEqual(firstSequential.json().captureCycleId, secondSequential.json().captureCycleId)

    const firstConcurrent = harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(adminToken),
      payload: {},
    })

    await firstConcurrentEntered

    const secondConcurrent = harness.app.inject({
      method: 'POST',
      url: '/admin/executive-memory/run',
      headers: authHeaders(ownerToken),
      payload: {},
    })

    await secondConcurrentEntered
    releaseFirst?.()

    const [firstResponse, secondResponse] = await Promise.all([firstConcurrent, secondConcurrent])

    assert.equal(firstResponse.statusCode, 200)
    assert.equal(secondResponse.statusCode, 200)

    const firstBody = firstResponse.json()
    const secondBody = secondResponse.json()
    assert.equal(typeof firstBody.captureCycleId, 'string')
    assert.equal(typeof secondBody.captureCycleId, 'string')
    assert.notEqual(firstBody.captureCycleId, secondBody.captureCycleId)
    assert.deepEqual(
      [firstBody.status, secondBody.status].sort(),
      ['already_running', 'completed'],
    )
  } finally {
    ExecutiveMemoryOperationalInvocationAdapter.prototype.invoke = originalInvoke
    await harness.close()
  }
})

test('executive memory invocation route source stays bounded to the adapter boundary', { concurrency: false }, async () => {
  const source = await readFile(path.join(
    process.cwd(),
    'backend/src/api/routes/legalBetaExecutiveMemoryOperationalInvocationRoutes.ts',
  ), 'utf-8')

  assert.equal(source.includes('createExecution('), false)
  assert.equal(source.includes('createExecutionService('), false)
  assert.equal(source.includes('OperationalRunService'), false)
  assert.equal(source.includes('OperationalRunCoordinator'), false)
  assert.equal(source.includes('OperationalRunner'), false)
  assert.equal(source.includes('CaptureExecutionService'), false)
  assert.equal(source.includes('TriggerService'), false)
  assert.equal(source.includes('Orchestrator'), false)
  assert.equal(source.includes('AtomicCapture'), false)
  assert.equal(source.includes('retry('), false)
  assert.equal(source.includes('continueExecution('), false)
  assert.equal(source.includes('.start('), false)
  assert.equal(source.includes('randomUUID'), false)
  assert.equal(source.includes('Date.now'), false)
  assert.equal(source.includes('Math.random'), false)
  assert.equal(source.includes('setInterval('), false)
  assert.equal(source.includes('setTimeout('), false)
  assert.equal(source.includes('scheduler'), false)
  assert.equal(source.includes('cron'), false)
  assert.equal(source.includes('job'), false)
  assert.equal(source.includes('worker'), false)
})
