import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'

import type { JobWorker } from '../jobs/index.js'
import { buildServer } from '../server.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    jobWorker: JobWorker
    runtimeGovernance: {
      registerStartupFailure(args: {
        subsystem: string
        criticality: 'critical' | 'degraded-allowed' | 'optional'
        message: string
      }): unknown
    }
    runtimeContinuityAttestationService: {
      getStatus(): {
        replayVerificationState: string
        attestationIntegrity: string
        recoveryRequired: boolean
      }
    }
    auth: {
      authSovereignMutationService: {
        getStatus(): Promise<unknown>
      }
      legacyAuthStoreRepository: {
        findUserByEmail(email: string): Promise<{ id: number; passwordHash: string } | null>
        findUserById(userId: number): Promise<{ id: number } | null>
        findLatestPasswordResetTokenForUser(userId: number): Promise<{ token: string; usedAt?: string; expiresAt: string } | null>
      }
    }
  }
}

type AuthHarness = {
  app: AppWithContext
  privateKeyPem: string
  configuredKid: string
  jwtSecret: string
  backendDbFile: string
  legacyAuthDbFile: string
  asyncClose(): Promise<void>
}

const TEST_EMAIL = 'owner@example.com'
const TEST_PASSWORD = 'correct horse battery staple'
const TEST_KID = 'brandsoul-test-kid-v1'

async function createLegacyAuthStore(filePath: string) {
  const db = await open({
    filename: filePath,
    driver: sqlite3.Database,
  })

  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE tenants (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      business_model TEXT NOT NULL,
      plan TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE memberships (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE password_reset_tokens (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT NULL,
      created_at TEXT NOT NULL
    );
  `)

  const now = new Date().toISOString()
  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10)
  await db.run(
    `INSERT INTO users (id, name, email, password_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    1,
    'Owner User',
    TEST_EMAIL,
    passwordHash,
    1,
    now,
    now,
  )
  await db.run(
    `INSERT INTO tenants (id, name, slug, business_model, plan, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    1,
    'BrandSoul Test Tenant',
    'brandsoul-test',
    'service',
    'pro',
    1,
    now,
    now,
  )
  await db.run(
    `INSERT INTO memberships (id, user_id, tenant_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    1,
    1,
    1,
    'owner',
    now,
  )

  await db.close()
}

async function withLegacyAuthDb<T>(filePath: string, callback: (db: Awaited<ReturnType<typeof open>>) => Promise<T>) {
  const db = await open({
    filename: filePath,
    driver: sqlite3.Database,
  })

  try {
    return await callback(db)
  } finally {
    await db.close()
  }
}

async function insertTenant(filePath: string, args: {
  id: number
  name: string
  slug: string
  businessModel?: 'product' | 'service' | 'hybrid' | 'professional'
  plan?: string
  isActive?: number
}) {
  const now = new Date().toISOString()
  await withLegacyAuthDb(filePath, async (db) => {
    await db.run(
      `INSERT INTO tenants (id, name, slug, business_model, plan, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args.id,
      args.name,
      args.slug,
      args.businessModel ?? 'service',
      args.plan ?? 'pro',
      args.isActive ?? 1,
      now,
      now,
    )
  })
}

async function insertMembership(filePath: string, args: {
  id: number
  userId: number
  tenantId: number
  role: string
}) {
  const now = new Date().toISOString()
  await withLegacyAuthDb(filePath, async (db) => {
    await db.run(
      `INSERT INTO memberships (id, user_id, tenant_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
      args.id,
      args.userId,
      args.tenantId,
      args.role,
      now,
    )
  })
}

async function deleteMembershipForUserAndTenant(filePath: string, userId: number, tenantId: number) {
  await withLegacyAuthDb(filePath, async (db) => {
    await db.run(
      `DELETE FROM memberships WHERE user_id = ? AND tenant_id = ?`,
      userId,
      tenantId,
    )
  })
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf-8').toString('base64url')
}

function createLegacyAccessToken(userId: number, tenantId: number, secret: string) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = encodeBase64Url(JSON.stringify({
    sub: String(userId),
    tenant_id: String(tenantId),
    roles: ['owner'],
    iss: 'legacy-hs256',
    aud: 'brandsoul-api-test',
    ver: 0,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    jti: 'legacy-jti-test',
  }))
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`, 'utf-8')
    .digest('base64url')

  return `${header}.${payload}.${signature}`
}

async function createAuthHarness(): Promise<AuthHarness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-auth-authority-'))
  const backendDbFile = path.join(workspace, 'backend.sqlite')
  const legacyAuthDbFile = path.join(workspace, 'legacy-auth.sqlite')
  const assetsDir = path.join(workspace, 'assets')
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')
  await createLegacyAuthStore(legacyAuthDbFile)

  const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    SQLITE_FILE: process.env.SQLITE_FILE,
    ASSET_STORAGE_DIR: process.env.ASSET_STORAGE_DIR,
    BRANDSOUL_DB_PATH: process.env.BRANDSOUL_DB_PATH,
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    AUTH_REFRESH_TOKEN_TTL_DAYS: process.env.AUTH_REFRESH_TOKEN_TTL_DAYS,
    AUTH_CLOCK_TOLERANCE_SECONDS: process.env.AUTH_CLOCK_TOLERANCE_SECONDS,
    AUTH_ACTIVE_KID: process.env.AUTH_ACTIVE_KID,
    AUTH_PRIVATE_KEY_REF: process.env.AUTH_PRIVATE_KEY_REF,
    AUTH_PUBLIC_KEY_PATH: process.env.AUTH_PUBLIC_KEY_PATH,
    PASSWORD_RESET_URL_BASE: process.env.PASSWORD_RESET_URL_BASE,
    PASSWORD_RESET_EXPIRE_MINUTES: process.env.PASSWORD_RESET_EXPIRE_MINUTES,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  }

  process.env.JWT_SECRET = 'legacy-auth-test-secret'
  process.env.SQLITE_FILE = backendDbFile
  process.env.ASSET_STORAGE_DIR = assetsDir
  process.env.BRANDSOUL_DB_PATH = legacyAuthDbFile
  process.env.AUTH_ISSUER = 'brandsoul-auth-test'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-test'
  process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '600'
  process.env.AUTH_REFRESH_TOKEN_TTL_DAYS = '14'
  process.env.AUTH_CLOCK_TOLERANCE_SECONDS = '5'
  process.env.AUTH_ACTIVE_KID = TEST_KID
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.PASSWORD_RESET_URL_BASE = 'http://localhost:5173/reset-password'
  delete process.env.PASSWORD_RESET_EXPIRE_MINUTES
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    privateKeyPem: privateKey,
    configuredKid: TEST_KID,
    jwtSecret: process.env.JWT_SECRET,
    backendDbFile,
    legacyAuthDbFile: legacyAuthDbFile,
    async asyncClose() {
      await app.close()
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

async function withBackendDb<T>(filePath: string, callback: (db: Awaited<ReturnType<typeof open>>) => Promise<T>) {
  const db = await open({
    filename: filePath,
    driver: sqlite3.Database,
  })

  try {
    return await callback(db)
  } finally {
    await db.close()
  }
}

async function login(app: FastifyInstance, overrides?: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      ...(overrides ?? {}),
    },
  })

  return response
}

function assertSuccessfulLogin(response: Awaited<ReturnType<typeof login>>) {
  assert.equal(response.statusCode, 200)
  return response.json() as {
    accessToken: string
    refreshToken: string
    expiresIn: number
    user: { email: string }
    tenant: { slug: string, id: number }
  }
}

async function createConfiguredAccessToken(args: {
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
    jti: `configured-${args.userId}-${args.tenantId}-${args.roles.join('-')}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer('brandsoul-auth-test')
    .setAudience('brandsoul-api-test')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey)
}

test('auth authority login emits RS256 token, exposes JWKS, and resolves /auth/me', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const loginResponse = assertSuccessfulLogin(await login(harness.app))
    const jwtSegments = loginResponse.accessToken.split('.')
    assert.equal(jwtSegments.length, 3)

    const header = JSON.parse(Buffer.from(jwtSegments[0], 'base64url').toString('utf-8')) as { alg: string; kid: string }
    assert.equal(header.alg, 'RS256')
    assert.equal(header.kid, harness.configuredKid)
    assert.equal(loginResponse.user.email, TEST_EMAIL)
    assert.equal(loginResponse.tenant.slug, 'brandsoul-test')

    const jwksResponse = await harness.app.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    })

    assert.equal(jwksResponse.statusCode, 200)
    const jwks = jwksResponse.json() as { keys: Array<{ kid: string; alg: string }> }
    assert.equal(jwks.keys.some((key) => key.kid === harness.configuredKid && key.alg === 'RS256'), true)

    const meResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${loginResponse.accessToken}`,
      },
    })

    assert.equal(meResponse.statusCode, 200)
    assert.equal(meResponse.json().email, TEST_EMAIL)
  } finally {
    await harness.asyncClose()
  }
})

test('refresh rotates tokens and detects refresh token reuse', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const loginResponse = assertSuccessfulLogin(await login(harness.app))
    const refreshResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: loginResponse.refreshToken,
      },
    })

    assert.equal(refreshResponse.statusCode, 200)
    const rotated = refreshResponse.json() as { refreshToken: string; accessToken: string }
    assert.notEqual(rotated.refreshToken, loginResponse.refreshToken)
    assert.notEqual(rotated.accessToken, loginResponse.accessToken)

    const reuseResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: loginResponse.refreshToken,
      },
    })

    assert.equal(reuseResponse.statusCode, 401)
    assert.equal(reuseResponse.json().error.code, 'refresh_reuse_detected')
  } finally {
    await harness.asyncClose()
  }
})

test('logout revokes the refresh token and logout-all revokes sibling sessions', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const firstSession = assertSuccessfulLogin(await login(harness.app))

    const logoutResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: {
        refreshToken: firstSession.refreshToken,
      },
    })

    assert.equal(logoutResponse.statusCode, 200)

    const revokedRefreshResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: firstSession.refreshToken,
      },
    })

    assert.equal(revokedRefreshResponse.statusCode, 401)
    assert.equal(revokedRefreshResponse.json().error.code, 'session_revoked')

    const activeSession = assertSuccessfulLogin(await login(harness.app))
    const siblingSession = assertSuccessfulLogin(await login(harness.app))
    const logoutAllResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
      },
    })

    assert.equal(logoutAllResponse.statusCode, 200)

    const siblingRefreshResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: siblingSession.refreshToken,
      },
    })

    assert.equal(siblingRefreshResponse.statusCode, 401)
    assert.equal(siblingRefreshResponse.json().error.code, 'session_revoked')
  } finally {
    await harness.asyncClose()
  }
})

test('middleware rejects tokens with invalid audience even when signed by the configured key', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const privateKey = await importPKCS8(harness.privateKeyPem, 'RS256')
    const invalidAudienceToken = await new SignJWT({
      sub: '1',
      tenant_id: '1',
      roles: ['owner'],
      ver: 1,
      jti: 'invalid-audience-test',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: harness.configuredKid })
      .setIssuer('brandsoul-auth-test')
      .setAudience('wrong-audience')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey)

    const response = await harness.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${invalidAudienceToken}`,
      },
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, 'invalid_token')
  } finally {
    await harness.asyncClose()
  }
})

test('auth middleware rejects deprecated HS256 tokens', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const legacyToken = createLegacyAccessToken(1, 1, harness.jwtSecret)
    const response = await harness.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${legacyToken}`,
      },
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, 'invalid_token')
  } finally {
    await harness.asyncClose()
  }
})

test('register creates the shared account records and returns an official TypeScript session bundle', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'New Owner',
        email: 'new-owner@example.com',
        password: 'new-owner-secret',
        tenant_name: 'Nova Marca',
        business_model: 'professional',
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as {
      accessToken: string
      refreshToken: string
      user: { email: string }
      tenant: { slug: string; business_model: string }
    }
    assert.equal(body.user.email, 'new-owner@example.com')
    assert.equal(body.tenant.business_model, 'professional')
    assert.match(body.tenant.slug, /^nova-marca(?:-\d+)?$/)
    assert.ok(body.accessToken)
    assert.ok(body.refreshToken)

    const storedUser = await harness.app.backendContext.auth.legacyAuthStoreRepository.findUserByEmail('new-owner@example.com')
    assert.ok(storedUser)
    assert.equal(Boolean(storedUser?.passwordHash.startsWith('$2')), true)
  } finally {
    await harness.asyncClose()
  }
})

test('forgot-password keeps the same response for existing and missing emails and stores reset tokens in the shared auth DB', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const existingResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: TEST_EMAIL,
      },
    })
    const missingResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: 'missing@example.com',
      },
    })

    assert.equal(existingResponse.statusCode, 200)
    assert.equal(missingResponse.statusCode, 200)
    assert.deepEqual(existingResponse.json(), missingResponse.json())

    const existingUser = await harness.app.backendContext.auth.legacyAuthStoreRepository.findUserByEmail(TEST_EMAIL)
    assert.ok(existingUser)
    const latestResetToken = await harness.app.backendContext.auth.legacyAuthStoreRepository.findLatestPasswordResetTokenForUser(existingUser!.id)
    assert.ok(latestResetToken)
  } finally {
    await harness.asyncClose()
  }
})

test('reset-password accepts a valid token and rejects token reuse', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    await harness.app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: TEST_EMAIL,
      },
    })

    const existingUser = await harness.app.backendContext.auth.legacyAuthStoreRepository.findUserByEmail(TEST_EMAIL)
    assert.ok(existingUser)
    const latestResetToken = await harness.app.backendContext.auth.legacyAuthStoreRepository.findLatestPasswordResetTokenForUser(existingUser!.id)
    assert.ok(latestResetToken)

    const resetResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token: latestResetToken!.token,
        new_password: 'rotated-password-123',
      },
    })

    assert.equal(resetResponse.statusCode, 200)

    const reusedResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token: latestResetToken!.token,
        new_password: 'rotated-password-456',
      },
    })

    assert.equal(reusedResponse.statusCode, 400)
    assert.equal(reusedResponse.json().error.code, 'invalid_reset_token')

    const loginResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_EMAIL,
        password: 'rotated-password-123',
      },
    })
    assert.equal(loginResponse.statusCode, 200)
  } finally {
    await harness.asyncClose()
  }
})

test('multi-tenant login requires explicit tenant selection and never falls back to the first membership', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    await insertTenant(harness.legacyAuthDbFile, {
      id: 2,
      name: 'Second Tenant',
      slug: 'second-tenant',
    })
    await insertMembership(harness.legacyAuthDbFile, {
      id: 2,
      userId: 1,
      tenantId: 2,
      role: 'admin',
    })

    const missingSelectionResponse = await login(harness.app)
    assert.equal(missingSelectionResponse.statusCode, 409)
    assert.equal(missingSelectionResponse.json().error.code, 'tenant_selection_required')

    const selectedBySlug = assertSuccessfulLogin(await login(harness.app, {
      tenant_slug: 'second-tenant',
    }))
    assert.equal(selectedBySlug.tenant.slug, 'second-tenant')

    const selectedById = assertSuccessfulLogin(await login(harness.app, {
      tenant_id: 1,
    }))
    assert.equal(selectedById.tenant.slug, 'brandsoul-test')
  } finally {
    await harness.asyncClose()
  }
})

test('refresh validates tenant membership before reissuing tokens', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const loginResponse = assertSuccessfulLogin(await login(harness.app))
    await deleteMembershipForUserAndTenant(harness.legacyAuthDbFile, 1, 1)

    const refreshResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: loginResponse.refreshToken,
      },
    })

    assert.equal(refreshResponse.statusCode, 401)
    assert.equal(refreshResponse.json().error.code, 'session_revoked')
  } finally {
    await harness.asyncClose()
  }
})

test('/tenant/me rechecks membership existence against the token tenant', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const loginResponse = assertSuccessfulLogin(await login(harness.app))
    await deleteMembershipForUserAndTenant(harness.legacyAuthDbFile, 1, 1)

    const tenantResponse = await harness.app.inject({
      method: 'GET',
      url: '/tenant/me',
      headers: {
        authorization: `Bearer ${loginResponse.accessToken}`,
      },
    })

    assert.equal(tenantResponse.statusCode, 401)
    assert.equal(tenantResponse.json().error.code, 'invalid_token')
  } finally {
    await harness.asyncClose()
  }
})

test('tenant-scoped token validation blocks cross-tenant token spoofing', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    await insertTenant(harness.legacyAuthDbFile, {
      id: 2,
      name: 'Second Tenant',
      slug: 'second-tenant',
    })

    const spoofedToken = await createConfiguredAccessToken({
      userId: 1,
      tenantId: 2,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const meResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${spoofedToken}`,
      },
    })

    assert.equal(meResponse.statusCode, 401)
    assert.equal(meResponse.json().error.code, 'invalid_token')
  } finally {
    await harness.asyncClose()
  }
})

test('revoked membership invalidates existing access tokens', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const loginResponse = assertSuccessfulLogin(await login(harness.app))
    await deleteMembershipForUserAndTenant(harness.legacyAuthDbFile, 1, 1)

    const meResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${loginResponse.accessToken}`,
      },
    })

    assert.equal(meResponse.statusCode, 401)
    assert.equal(meResponse.json().error.code, 'invalid_token')
  } finally {
    await harness.asyncClose()
  }
})

test('auth session creation requires sovereign gate and is blocked in degraded mode', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    harness.app.backendContext.runtimeGovernance.registerStartupFailure({
      subsystem: 'adaptive-influence-gate-runtime',
      criticality: 'degraded-allowed',
      message: 'test degraded mode',
    })

    const response = await login(harness.app)

    assert.equal(response.statusCode, 503)
    assert.equal(response.json().error.code, 'INSTITUTIONAL_SOVEREIGN_MUTATION_BLOCKED')
  } finally {
    await harness.asyncClose()
  }
})

test('auth issuance is blocked when replay verification fails', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    ;(harness.app.backendContext.runtimeContinuityAttestationService as unknown as {
      getStatus(): Record<string, unknown>
    }).getStatus = () => ({
      attestationIntegrity: 'verified',
      replayVerificationState: 'failed',
      recoveryRequired: true,
      brokenAttestationChains: ['test replay failure'],
    })

    const response = await login(harness.app)

    assert.equal(response.statusCode, 503)
    assert.equal(response.json().error.code, 'INSTITUTIONAL_SOVEREIGN_MUTATION_BLOCKED')
    assert.equal(response.json().attestation.replayVerificationState, 'failed')
  } finally {
    await harness.asyncClose()
  }
})

test('auth mutation attestation persists for session creation and admin status exposes auth graph', { concurrency: false }, async () => {
  const harness = await createAuthHarness()

  try {
    const loginResponse = assertSuccessfulLogin(await login(harness.app))

    await withBackendDb(harness.backendDbFile, async (db) => {
      const attestationRow = await db.get<{ auth_scope: string, executed: number, lineage_hash: string }>(
        `
          SELECT auth_scope, executed, lineage_hash
          FROM flowmind_auth_sovereign_attestation
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        `,
      )

      assert.equal(attestationRow?.auth_scope, 'auth.session.create')
      assert.equal(attestationRow?.executed, 1)
      assert.equal(typeof attestationRow?.lineage_hash, 'string')
      assert.ok((attestationRow?.lineage_hash?.length ?? 0) > 0)
    })

    const status = await harness.app.backendContext.auth.authSovereignMutationService.getStatus() as {
      authAuthorityGraph: unknown[]
    }
    assert.equal(Array.isArray(status.authAuthorityGraph), true)
  } finally {
    await harness.asyncClose()
  }
})
