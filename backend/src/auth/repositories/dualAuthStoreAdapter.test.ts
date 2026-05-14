import assert from 'node:assert/strict'
import test from 'node:test'

import { getAuthConfig } from '../authConfig.js'
import { AuthService } from '../authService.js'
import { createObservabilityService } from '../../services/observabilityService.js'
import { createDualAuthStoreAdapter } from './dualAuthStoreAdapter.js'
import type {
  AuthIdentityStoreRepository,
  CreateAuthMembershipInput,
  CreateAuthPasswordResetTokenInput,
  CreateAuthTenantInput,
  CreateAuthUserInput,
} from './authIdentityStoreRepository.js'
import type { AuthMembershipRecord, AuthTenantRecord, AuthUserRecord } from '../authTypes.js'
import type {
  AuthMembershipUserRecord,
  AuthPasswordResetTokenRecord,
  AuthTenantMembershipRecord,
} from './legacyAuthStoreRepository.js'

class MemoryLogger {
  entries: Array<{ level: 'info' | 'warn' | 'error'; payload: unknown; message: string }> = []

  private push(level: 'info' | 'warn' | 'error', args: unknown[]) {
    const payload = args[0] ?? null
    const message = typeof args[1] === 'string' ? args[1] : ''
    this.entries.push({ level, payload, message })
  }

  info = (...args: unknown[]) => {
    this.push('info', args)
  }

  warn = (...args: unknown[]) => {
    this.push('warn', args)
  }

  error = (...args: unknown[]) => {
    this.push('error', args)
  }
}

class FakeAuthStore implements AuthIdentityStoreRepository {
  readonly counters = new Map<string, number>()
  private userSeq: number
  private tenantSeq: number
  private membershipSeq: number
  private resetSeq: number
  private readonly users = new Map<number, AuthUserRecord>()
  private readonly userByEmail = new Map<string, number>()
  private readonly tenants = new Map<number, AuthTenantRecord>()
  private readonly tenantBySlug = new Map<string, number>()
  private readonly memberships = new Map<string, AuthMembershipRecord>()
  private readonly resets = new Map<number, AuthPasswordResetTokenRecord>()
  private readonly resetByToken = new Map<string, number>()
  private readonly failures = new Map<string, Error>()
  private usedAtByTokenId = new Map<number, string | undefined>()

  constructor(private readonly idBase: number) {
    this.userSeq = idBase
    this.tenantSeq = idBase
    this.membershipSeq = idBase
    this.resetSeq = idBase
  }

  setFailure(method: string, error: Error) {
    this.failures.set(method, error)
  }

  setPasswordResetUsedAt(tokenId: number, usedAt?: string) {
    this.usedAtByTokenId.set(tokenId, usedAt)
  }

  mutatePasswordResetToken(tokenId: number, mutate: (token: AuthPasswordResetTokenRecord) => AuthPasswordResetTokenRecord) {
    const current = this.resets.get(tokenId)
    if (!current) {
      throw new Error('password reset token not found')
    }

    const updated = mutate(current)
    this.resets.set(tokenId, updated)
  }

  private key(userId: number, tenantId: number) {
    return `${userId}:${tenantId}`
  }

  private hit(method: string) {
    this.counters.set(method, (this.counters.get(method) ?? 0) + 1)
    const failure = this.failures.get(method)
    if (failure) {
      throw failure
    }
  }

  private now() {
    return '2026-05-09T10:00:00.000Z'
  }

  async createUser(input: CreateAuthUserInput) {
    this.hit('createUser')
    const email = input.email.toLowerCase()
    if (this.userByEmail.has(email)) {
      throw new Error('duplicate user email')
    }

    const user: AuthUserRecord = {
      id: this.userSeq++,
      name: input.name,
      email,
      passwordHash: input.passwordHash,
      isActive: input.isActive !== false,
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    this.users.set(user.id, user)
    this.userByEmail.set(user.email, user.id)
    return user
  }

  async findUserByEmail(email: string) {
    this.hit('findUserByEmail')
    const id = this.userByEmail.get(email.toLowerCase())
    return typeof id === 'number' ? (this.users.get(id) ?? null) : null
  }

  async findUserById(userId: number) {
    this.hit('findUserById')
    return this.users.get(userId) ?? null
  }

  async updateUserPassword(userId: number, passwordHash: string) {
    this.hit('updateUserPassword')
    const user = this.users.get(userId)
    if (!user) {
      return null
    }
    const updated = { ...user, passwordHash, updatedAt: this.now() }
    this.users.set(userId, updated)
    return updated
  }

  async updateUserPasswordHash(userId: number, passwordHash: string) {
    this.hit('updateUserPasswordHash')
    return this.updateUserPassword(userId, passwordHash)
  }

  async createTenant(input: CreateAuthTenantInput) {
    this.hit('createTenant')
    if (this.tenantBySlug.has(input.slug)) {
      throw new Error('duplicate tenant slug')
    }

    const tenant: AuthTenantRecord = {
      id: this.tenantSeq++,
      name: input.name,
      slug: input.slug,
      businessModel: input.businessModel,
      plan: input.plan ?? 'starter',
      isActive: input.isActive !== false,
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    this.tenants.set(tenant.id, tenant)
    this.tenantBySlug.set(tenant.slug, tenant.id)
    return tenant
  }

  async findTenantById(tenantId: number) {
    this.hit('findTenantById')
    return this.tenants.get(tenantId) ?? null
  }

  async findTenantBySlug(slug: string) {
    this.hit('findTenantBySlug')
    const id = this.tenantBySlug.get(slug)
    return typeof id === 'number' ? (this.tenants.get(id) ?? null) : null
  }

  async createMembership(input: CreateAuthMembershipInput) {
    this.hit('createMembership')
    const key = this.key(input.userId, input.tenantId)
    if (this.memberships.has(key)) {
      throw new Error('duplicate membership')
    }

    const membership: AuthMembershipRecord = {
      id: this.membershipSeq++,
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      createdAt: this.now(),
    }
    this.memberships.set(key, membership)
    return membership
  }

  async findMembershipForUserAndTenant(userId: number, tenantId: number) {
    this.hit('findMembershipForUserAndTenant')
    return this.memberships.get(this.key(userId, tenantId)) ?? null
  }

  async listMembershipsForUser(userId: number) {
    this.hit('listMembershipsForUser')
    const entries: AuthTenantMembershipRecord[] = []
    for (const membership of this.memberships.values()) {
      if (membership.userId !== userId) {
        continue
      }
      const tenant = this.tenants.get(membership.tenantId)
      if (!tenant) {
        continue
      }
      entries.push({ membership, tenant })
    }
    return entries.sort((left, right) => left.membership.id - right.membership.id)
  }

  async listMembershipUsersByTenant(tenantId: number) {
    this.hit('listMembershipUsersByTenant')
    const entries: AuthMembershipUserRecord[] = []
    for (const membership of this.memberships.values()) {
      if (membership.tenantId !== tenantId) {
        continue
      }
      const user = this.users.get(membership.userId)
      if (!user) {
        continue
      }
      entries.push({ membership, user })
    }
    return entries.sort((left, right) => left.membership.id - right.membership.id)
  }

  async createPasswordResetToken(input: CreateAuthPasswordResetTokenInput) {
    this.hit('createPasswordResetToken')
    const tokenRecord: AuthPasswordResetTokenRecord = {
      id: this.resetSeq++,
      userId: input.userId,
      token: input.token,
      expiresAt: input.expiresAt,
      createdAt: this.now(),
    }
    this.resets.set(tokenRecord.id, tokenRecord)
    this.resetByToken.set(tokenRecord.token, tokenRecord.id)
    return tokenRecord
  }

  async findPasswordResetTokenByToken(token: string) {
    this.hit('findPasswordResetTokenByToken')
    const id = this.resetByToken.get(token)
    return typeof id === 'number' ? (this.resets.get(id) ?? null) : null
  }

  async findLatestPasswordResetTokenForUser(userId: number) {
    this.hit('findLatestPasswordResetTokenForUser')
    return Array.from(this.resets.values())
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.id - left.id)[0] ?? null
  }

  async markPasswordResetTokenUsed(tokenId: number) {
    this.hit('markPasswordResetTokenUsed')
    const token = this.resets.get(tokenId)
    if (!token) {
      return null
    }
    const configuredUsedAt = this.usedAtByTokenId.has(tokenId)
      ? this.usedAtByTokenId.get(tokenId)
      : '2026-05-09T11:00:00.000Z'
    const updated = configuredUsedAt ? { ...token, usedAt: configuredUsedAt } : { ...token, usedAt: undefined }
    this.resets.set(tokenId, updated)
    return updated
  }
}

function createStores() {
  return {
    legacy: new FakeAuthStore(100),
    native: new FakeAuthStore(200),
    logger: new MemoryLogger(),
    observability: createObservabilityService(),
  }
}

const AUTH_STORE_KEYS = [
  'AUTH_STORE_MODE',
  'AUTH_STORE_NATIVE_READ_CONFIRMED',
  'AUTH_STORE_NATIVE_ONLY_CONFIRMED',
] as const

function resetAuthStoreEnv() {
  for (const key of AUTH_STORE_KEYS) {
    delete process.env[key]
  }
}

test('default mode is legacy_only', { concurrency: false }, () => {
  const previousNodeEnv = process.env.NODE_ENV
  resetAuthStoreEnv()

  try {
    process.env.NODE_ENV = 'test'
    const config = getAuthConfig()
    assert.equal(config.authStoreMode, 'legacy_only')
  } finally {
    resetAuthStoreEnv()
    if (typeof previousNodeEnv === 'undefined') delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('invalid AUTH_STORE_MODE fails validation', { concurrency: false }, () => {
  const previousNodeEnv = process.env.NODE_ENV
  resetAuthStoreEnv()

  try {
    process.env.NODE_ENV = 'test'
    process.env.AUTH_STORE_MODE = 'bad_mode'
    assert.throws(() => getAuthConfig(), /AUTH_STORE_MODE must be one of/)
  } finally {
    resetAuthStoreEnv()
    if (typeof previousNodeEnv === 'undefined') delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('legacy_only reads and writes legacy only', async () => {
  const { legacy, native, logger, observability } = createStores()
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'legacy_only',
    logger,
    observability,
  })

  const created = await adapter.createUser({ name: 'Legacy User', email: 'user@example.com', passwordHash: 'hash-a' })
  const found = await adapter.findUserByEmail('user@example.com')

  assert.equal(created?.id, 100)
  assert.equal(found?.id, 100)
  assert.equal(legacy.counters.get('createUser'), 1)
  assert.equal(native.counters.get('createUser') ?? 0, 0)
  assert.equal(legacy.counters.get('findUserByEmail'), 1)
  assert.equal(native.counters.get('findUserByEmail') ?? 0, 0)
})

test('native_only reads and writes native only', async () => {
  const { legacy, native, logger, observability } = createStores()
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'native_only',
    logger,
    observability,
  })

  const created = await adapter.createTenant({
    name: 'Native Tenant',
    slug: 'native-tenant',
    businessModel: 'service',
  })
  const found = await adapter.findTenantBySlug('native-tenant')

  assert.equal(created?.id, 200)
  assert.equal(found?.id, 200)
  assert.equal(native.counters.get('createTenant'), 1)
  assert.equal(legacy.counters.get('createTenant') ?? 0, 0)
  assert.equal(native.counters.get('findTenantBySlug'), 1)
  assert.equal(legacy.counters.get('findTenantBySlug') ?? 0, 0)
})

test('dual_write_legacy_read writes both and reads legacy', async () => {
  const { legacy, native, logger, observability } = createStores()
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'test',
  })

  await adapter.createUser({ name: 'Dual User', email: 'dual@example.com', passwordHash: 'hash-a' })
  const found = await adapter.findUserByEmail('dual@example.com')

  assert.equal(found?.id, 100)
  assert.equal(legacy.counters.get('createUser'), 1)
  assert.equal(native.counters.get('createUser'), 1)
  assert.equal(legacy.counters.get('findUserByEmail'), 2)
  assert.equal(native.counters.get('findUserByEmail'), 1)
})

test('dual_write_native_read writes both and reads native', async () => {
  const legacy = new FakeAuthStore(100)
  const native = new FakeAuthStore(100)
  const logger = new MemoryLogger()
  const observability = createObservabilityService()
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_native_read',
    logger,
    observability,
    nodeEnv: 'staging',
  })

  await adapter.createTenant({
    name: 'Dual Tenant',
    slug: 'dual-tenant',
    businessModel: 'service',
  })
  const found = await adapter.findTenantBySlug('dual-tenant')

  assert.equal(found?.id, 100)
  assert.equal(native.counters.get('createTenant'), 1)
  assert.equal(legacy.counters.get('createTenant'), 1)
})

test('divergence is detected for user mismatch', async () => {
  const { legacy, native, logger, observability } = createStores()
  await legacy.createUser({ name: 'Owner', email: 'owner@example.com', passwordHash: '$2legacy' })
  await native.createUser({ name: 'Owner', email: 'owner@example.com', passwordHash: 'bcrypt_sha256$mismatch' })

  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'test',
  })

  await adapter.findUserByEmail('owner@example.com')

  assert.equal(logger.entries.some((entry) => JSON.stringify(entry.payload).includes('passwordHashProfile')), true)
  assert.equal(observability.getMetricsSnapshot().customCounters.auth_store_divergence_total, 1)
})

test('divergence is detected for tenant mismatch', async () => {
  const { legacy, native, logger, observability } = createStores()
  await legacy.createTenant({ name: 'Tenant', slug: 'tenant', businessModel: 'service' })
  await native.createTenant({ name: 'Tenant', slug: 'tenant', businessModel: 'professional' })

  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'test',
  })

  await adapter.findTenantBySlug('tenant')

  assert.equal(logger.entries.some((entry) => JSON.stringify(entry.payload).includes('businessModel')), true)
})

test('divergence is detected for membership mismatch', async () => {
  const { legacy, native, logger, observability } = createStores()
  const legacyUser = await legacy.createUser({ name: 'User', email: 'user@example.com', passwordHash: 'hash-a' })
  const nativeUser = await native.createUser({ name: 'User', email: 'user@example.com', passwordHash: 'hash-a' })
  const legacyTenant = await legacy.createTenant({ name: 'Tenant', slug: 'tenant', businessModel: 'service' })
  const nativeTenant = await native.createTenant({ name: 'Tenant', slug: 'tenant', businessModel: 'service' })
  await legacy.createMembership({ userId: legacyUser!.id, tenantId: legacyTenant!.id, role: 'owner' })
  await native.createMembership({ userId: nativeUser!.id, tenantId: nativeTenant!.id, role: 'admin' })

  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'test',
  })

  await adapter.findMembershipForUserAndTenant(legacyUser!.id, legacyTenant!.id)
  assert.equal(logger.entries.some((entry) => JSON.stringify(entry.payload).includes('role')), true)
})

test('critical divergence fails closed in native-read mode', async () => {
  const { legacy, native, logger, observability } = createStores()
  await legacy.createUser({ name: 'Owner', email: 'owner@example.com', passwordHash: 'hash-a' })
  await native.createUser({ name: 'Owner', email: 'owner@example.com', passwordHash: '$2native' })

  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_native_read',
    logger,
    observability,
    nodeEnv: 'staging',
  })

  await assert.rejects(
    adapter.findUserByEmail('owner@example.com'),
    /AUTH_STORE_DIVERGENCE:user:findUserByEmail/,
  )
})

test('password reset works in each mode', async () => {
  for (const mode of ['legacy_only', 'native_only', 'dual_write_legacy_read', 'dual_write_native_read'] as const) {
    const { legacy, native, logger, observability } = createStores()
    const store = mode === 'native_only' || mode === 'dual_write_native_read' ? native : legacy
    const user = await store.createUser({ name: 'Owner', email: `${mode}@example.com`, passwordHash: 'hash-a' })
    const adapter = createDualAuthStoreAdapter(legacy, native, {
      mode,
      logger,
      observability,
      nodeEnv: 'staging',
    })

    const created = await adapter.createPasswordResetToken({
      userId: user!.id,
      token: `${mode}-token`,
      expiresAt: '2026-05-09T12:00:00.000Z',
    })
    const found = await adapter.findPasswordResetTokenByToken(`${mode}-token`)
    const latest = await adapter.findLatestPasswordResetTokenForUser(user!.id)
    const used = await adapter.markPasswordResetTokenUsed(created!.id)

    assert.equal(found?.token, `${mode}-token`)
    assert.equal(latest?.token, `${mode}-token`)
    assert.ok(used?.usedAt)
  }
})

test('bounded usedAt delta is classified as WRITE_ORDERING_DRIFT and is not critical', async () => {
  const { legacy, native, logger, observability } = createStores()
  const user = await legacy.createUser({ name: 'Owner', email: 'drift@example.com', passwordHash: 'hash-a' })
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'staging',
    passwordResetUsedAtDriftToleranceMs: 1000,
  })

  const created = await adapter.createPasswordResetToken({
    userId: user!.id,
    token: 'drift-token',
    expiresAt: '2026-05-09T12:00:00.000Z',
  })
  const nativeToken = await native.findPasswordResetTokenByToken('drift-token')

  legacy.setPasswordResetUsedAt(created!.id, '2026-05-09T11:00:00.000Z')
  native.setPasswordResetUsedAt(nativeToken!.id, '2026-05-09T11:00:00.005Z')

  await adapter.markPasswordResetTokenUsed(created!.id)

  const entry = logger.entries.find((item) => JSON.stringify(item.payload).includes('WRITE_ORDERING_DRIFT'))
  assert.ok(entry)
  const payload = entry?.payload as { classification?: string; severity?: string; usedAtDeltaMs?: number; semanticDanger?: boolean }
  assert.equal(payload.classification, 'WRITE_ORDERING_DRIFT')
  assert.equal(payload.severity, 'warning')
  assert.equal(payload.usedAtDeltaMs, 5)
  assert.equal(payload.semanticDanger, false)
})

test('one-side-null usedAt is logical divergence', async () => {
  const { legacy, native, logger, observability } = createStores()
  const user = await legacy.createUser({ name: 'Owner', email: 'null-usedat@example.com', passwordHash: 'hash-a' })
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'staging',
  })

  const created = await adapter.createPasswordResetToken({
    userId: user!.id,
    token: 'null-usedat-token',
    expiresAt: '2026-05-09T12:00:00.000Z',
  })
  const nativeToken = await native.findPasswordResetTokenByToken('null-usedat-token')

  legacy.setPasswordResetUsedAt(created!.id, '2026-05-09T11:00:00.000Z')
  native.setPasswordResetUsedAt(nativeToken!.id, undefined)

  await adapter.markPasswordResetTokenUsed(created!.id)

  const entry = logger.entries.find((item) => JSON.stringify(item.payload).includes('REAL_LOGICAL_DIVERGENCE'))
  const payload = entry?.payload as { classification?: string; semanticDanger?: boolean; mismatchFields?: string[] }
  assert.equal(payload.classification, 'REAL_LOGICAL_DIVERGENCE')
  assert.equal(payload.semanticDanger, true)
  assert.equal(payload.mismatchFields?.includes('usedAt'), true)
})

test('large usedAt delta escalates', async () => {
  const { legacy, native, logger, observability } = createStores()
  const user = await legacy.createUser({ name: 'Owner', email: 'large-delta@example.com', passwordHash: 'hash-a' })
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'staging',
    passwordResetUsedAtDriftToleranceMs: 1000,
  })

  const created = await adapter.createPasswordResetToken({
    userId: user!.id,
    token: 'large-delta-token',
    expiresAt: '2026-05-09T12:00:00.000Z',
  })
  const nativeToken = await native.findPasswordResetTokenByToken('large-delta-token')

  legacy.setPasswordResetUsedAt(created!.id, '2026-05-09T11:00:00.000Z')
  native.setPasswordResetUsedAt(nativeToken!.id, '2026-05-09T11:00:02.500Z')

  await adapter.markPasswordResetTokenUsed(created!.id)

  const entry = logger.entries.find((item) => JSON.stringify(item.payload).includes('REAL_LOGICAL_DIVERGENCE'))
  const payload = entry?.payload as { severity?: string; usedAtDeltaMs?: number; semanticDanger?: boolean }
  assert.equal(payload.severity, 'critical')
  assert.equal(payload.usedAtDeltaMs, 2500)
  assert.equal(payload.semanticDanger, true)
})

test('token, userId, or expiresAt mismatch remains critical for password reset consume divergence', async () => {
  const { legacy, native, logger, observability } = createStores()
  const user = await legacy.createUser({ name: 'Owner', email: 'reset-mismatch@example.com', passwordHash: 'hash-a' })
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'staging',
  })

  const created = await adapter.createPasswordResetToken({
    userId: user!.id,
    token: 'reset-mismatch-token',
    expiresAt: '2026-05-09T12:00:00.000Z',
  })

  const nativeToken = await native.findPasswordResetTokenByToken('reset-mismatch-token')
  native.mutatePasswordResetToken(nativeToken!.id, (token) => ({
    ...token,
    userId: token.userId + 1,
  }))

  await adapter.markPasswordResetTokenUsed(created!.id)

  const entry = logger.entries.find((item) => JSON.stringify(item.payload).includes('REAL_LOGICAL_DIVERGENCE'))
  const payload = entry?.payload as { severity?: string; mismatchFields?: string[] }
  assert.equal(payload.severity, 'critical')
  assert.equal(payload.mismatchFields?.includes('userId'), true)
})

test('no first-membership fallback exists', async () => {
  const { legacy, native, logger, observability } = createStores()
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'legacy_only',
    logger,
    observability,
  })

  assert.equal('findMembershipForUser' in adapter, false)
})

test('production native read requires confirmation flag', { concurrency: false }, () => {
  const previousNodeEnv = process.env.NODE_ENV
  resetAuthStoreEnv()

  try {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_STORE_MODE = 'dual_write_native_read'
    assert.throws(
      () => getAuthConfig(),
      /AUTH_STORE_MODE=dual_write_native_read requires AUTH_STORE_NATIVE_READ_CONFIRMED=true in production/,
    )

    process.env.AUTH_STORE_NATIVE_READ_CONFIRMED = 'true'
    assert.equal(getAuthConfig().authStoreMode, 'dual_write_native_read')

    process.env.AUTH_STORE_MODE = 'native_only'
    delete process.env.AUTH_STORE_NATIVE_ONLY_CONFIRMED
    assert.throws(
      () => getAuthConfig(),
      /AUTH_STORE_MODE=native_only requires AUTH_STORE_NATIVE_ONLY_CONFIRMED=true in production/,
    )

    process.env.AUTH_STORE_NATIVE_ONLY_CONFIRMED = 'true'
    assert.equal(getAuthConfig().authStoreMode, 'native_only')
  } finally {
    resetAuthStoreEnv()
    if (typeof previousNodeEnv === 'undefined') delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('logs do not include password hashes or tokens', async () => {
  const { legacy, native, logger, observability } = createStores()
  await legacy.createUser({ name: 'Owner', email: 'owner@example.com', passwordHash: 'super-secret-hash' })
  await native.createUser({ name: 'Owner', email: 'owner@example.com', passwordHash: 'another-secret-hash' })

  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'dual_write_legacy_read',
    logger,
    observability,
    nodeEnv: 'test',
  })

  await adapter.findUserByEmail('owner@example.com')

  const serialized = JSON.stringify(logger.entries)
  assert.equal(serialized.includes('super-secret-hash'), false)
  assert.equal(serialized.includes('another-secret-hash'), false)
  assert.equal(serialized.includes('owner@example.com'), false)
  assert.equal(serialized.includes('token'), false)
})

test('AuthService can depend on the shared interface without runtime behavior change in legacy_only', async () => {
  const { legacy, native, logger, observability } = createStores()
  const adapter = createDualAuthStoreAdapter(legacy, native, {
    mode: 'legacy_only',
    logger,
    observability,
  })

  const acceptsStore = (_store: ConstructorParameters<typeof AuthService>[2]) => true
  assert.equal(acceptsStore(adapter), true)
})
