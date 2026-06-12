import assert from 'node:assert/strict'
import test from 'node:test'

import { AuthError } from './authErrors.js'
import { AuthService } from './authService.js'
import type { AuthTokenBundle, RequestClientContext } from './authTypes.js'
import { installSemanticMutationExecutor } from '../sovereignty/semanticMutationExecutor.js'

type LoggerEvent = {
  level: 'info' | 'warn' | 'error'
  payload: Record<string, unknown>
  message?: string
}

type CapturedRegisterArgs = {
  canonicalReplayShape?: {
    requiredFields?: string[]
    iterableFields?: string[]
    allowNullPayload?: boolean
  }
  canonicalShapeVerifier?: (payload: unknown) => {
    canonicalShapeVerified: boolean
    semanticIntegrity: 'verified' | 'partial' | 'invalid'
    issues: string[]
    normalizedPayload?: unknown
  }
}

const clientContext: RequestClientContext = {
  ip: '127.0.0.1',
  userAgent: 'node:test',
}

function createLogger(events: LoggerEvent[]) {
  return {
    info(payload: Record<string, unknown>, message?: string) {
      events.push({ level: 'info', payload, message })
    },
    warn(payload: Record<string, unknown>, message?: string) {
      events.push({ level: 'warn', payload, message })
    },
    error(payload: Record<string, unknown>, message?: string) {
      events.push({ level: 'error', payload, message })
    },
  }
}

function createValidReplayPayload() {
  return {
    user: {
      id: 1,
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hashed',
      isActive: true,
      createdAt: '2026-06-12T00:00:00.000Z',
      updatedAt: '2026-06-12T00:00:00.000Z',
    },
    tenant: {
      id: 2,
      name: 'BrandSoul Legal',
      slug: 'brandsoul-legal',
      businessModel: 'service' as const,
      plan: 'pro',
      isActive: true,
      createdAt: '2026-06-12T00:00:00.000Z',
      updatedAt: '2026-06-12T00:00:00.000Z',
    },
    membership: {
      id: 3,
      userId: 1,
      tenantId: 2,
      role: 'owner',
      createdAt: '2026-06-12T00:00:00.000Z',
    },
  }
}

function createRegisterHarness(options: {
  replayResult: unknown
  onExecute?: (args: CapturedRegisterArgs) => void
}) {
  const loggerEvents: LoggerEvent[] = []
  const logger = createLogger(loggerEvents)

  installSemanticMutationExecutor({
    async executeSemanticMutation(args: CapturedRegisterArgs) {
      options.onExecute?.(args)
      return { result: options.replayResult }
    },
  } as never)

  const service = new AuthService(
    {} as never,
    { refreshTokenTtlDays: 30 } as never,
    {
      async createUser() { return null },
      async findUserByEmail() { return null },
      async findUserById() { return null },
      async updateUserPassword() { return null },
      async updateUserPasswordHash() { return null },
      async createTenant() { return null },
      async findTenantById() { return null },
      async findTenantBySlug() { return null },
      async createMembership() { return null },
      async findMembershipForUserAndTenant() { return null },
      async listMembershipsForUser() { return [] },
      async listMembershipUsersByTenant() { return [] },
      async createPasswordResetToken() { return null },
      async findPasswordResetTokenByToken() { return null },
      async findLatestPasswordResetTokenForUser() { return null },
      async markPasswordResetTokenUsed() { return null },
    } as never,
    { isConfigured: () => true } as never,
    {} as never,
    { increment() {} } as never,
    {} as never,
    logger as never,
  )

  ;(service as unknown as {
    issueTokenBundle: (principal: unknown, context: RequestClientContext, flow: 'login' | 'refresh') => Promise<AuthTokenBundle>
  }).issueTokenBundle = async (principal) => ({
    tokenType: 'Bearer',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
    token: 'access-token',
    user: {
      id: (principal as { user: { id: number; name: string; email: string } }).user.id,
      name: (principal as { user: { name: string } }).user.name,
      email: (principal as { user: { email: string } }).user.email,
      is_active: true,
      created_at: '2026-06-12T00:00:00.000Z',
      updated_at: '2026-06-12T00:00:00.000Z',
    },
    tenant: {
      id: (principal as { tenant: { id: number; name: string; slug: string } }).tenant.id,
      name: (principal as { tenant: { name: string } }).tenant.name,
      slug: (principal as { tenant: { slug: string } }).tenant.slug,
      business_model: 'service',
      plan: 'pro',
      is_active: true,
      created_at: '2026-06-12T00:00:00.000Z',
      updated_at: '2026-06-12T00:00:00.000Z',
    },
  })

  return { service, loggerEvents }
}

test('register declares canonical replay contract and accepts valid bootstrap payload', async () => {
  let capturedArgs: CapturedRegisterArgs | null = null
  const validPayload = createValidReplayPayload()
  const { service, loggerEvents } = createRegisterHarness({
    replayResult: validPayload,
    onExecute: (args) => {
      capturedArgs = args
    },
  })

  const bundle = await service.register({
    name: 'Owner User',
    email: 'owner@example.com',
    password: 'correct horse battery staple',
    tenantName: 'BrandSoul Legal',
    businessModel: 'service',
  }, clientContext)

  assert.equal(bundle.tokenType, 'Bearer')
  assert.ok(capturedArgs)
  assert.deepEqual(capturedArgs?.canonicalReplayShape?.requiredFields, ['user', 'tenant', 'membership', 'membership.role'])

  const verifier = capturedArgs?.canonicalShapeVerifier
  assert.equal(typeof verifier, 'function')
  assert.equal(verifier?.({}).canonicalShapeVerified, false)
  assert.deepEqual(verifier?.({}).issues, [
    'missing_required_field:user',
    'missing_required_field:tenant',
    'missing_required_field:membership',
    'missing_required_field:membership.role',
  ])
  assert.equal(verifier?.(validPayload).canonicalShapeVerified, true)
  assert.ok(loggerEvents.some((event) => event.payload.event === 'auth-register.replay-shape'))
})

test('register does not accept empty replay object as success', async () => {
  let capturedArgs: CapturedRegisterArgs | null = null
  const { service, loggerEvents } = createRegisterHarness({
    replayResult: {},
    onExecute: (args) => {
      capturedArgs = args
    },
  })

  await assert.rejects(
    () => service.register({
      name: 'Owner User',
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      tenantName: 'BrandSoul Legal',
      businessModel: 'service',
    }, clientContext),
    (error: unknown) => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.code, 'invalid_registration')
      assert.match(error.message, /Registration replay result is missing required user, tenant, or membership data\./)
      return true
    },
  )

  assert.ok(capturedArgs?.canonicalShapeVerifier)
  assert.equal(capturedArgs.canonicalShapeVerifier?.({}).canonicalShapeVerified, false)
  assert.ok(loggerEvents.some((event) => event.payload.event === 'auth-register.invalid-replay-shape'))
  assert.ok(loggerEvents.some((event) => event.payload.event === 'auth-register.failure'))
})

test('register rejects replay payload when membership.role is missing', async () => {
  let capturedArgs: CapturedRegisterArgs | null = null
  const invalidPayload = {
    ...createValidReplayPayload(),
    membership: {
      id: 3,
      userId: 1,
      tenantId: 2,
      createdAt: '2026-06-12T00:00:00.000Z',
    },
  }
  const { service, loggerEvents } = createRegisterHarness({
    replayResult: invalidPayload,
    onExecute: (args) => {
      capturedArgs = args
    },
  })

  await assert.rejects(
    () => service.register({
      name: 'Owner User',
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      tenantName: 'BrandSoul Legal',
      businessModel: 'service',
    }, clientContext),
    (error: unknown) => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.code, 'invalid_registration')
      return true
    },
  )

  assert.ok(capturedArgs?.canonicalShapeVerifier)
  const verification = capturedArgs.canonicalShapeVerifier?.(invalidPayload)
  assert.equal(verification?.canonicalShapeVerified, false)
  assert.ok(verification?.issues.includes('missing_required_field:membership.role'))
  assert.ok(loggerEvents.some((event) => event.payload.event === 'auth-register.invalid-replay-shape'))
})
