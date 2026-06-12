import assert from 'node:assert/strict'
import test from 'node:test'

import { AuthError } from './authErrors.js'
import { AuthService } from './authService.js'

type LoggerEvent = {
  level: 'warn'
  payload: Record<string, unknown>
  message?: string
}

function createServiceHarness() {
  const loggerEvents: LoggerEvent[] = []
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
    {
      warn(payload: Record<string, unknown>, message?: string) {
        loggerEvents.push({ level: 'warn', payload, message })
      },
    } as never,
  )

  return {
    service: service as never as {
      createRegistrationPrincipal(value: unknown): {
        user: { id: number; name: string; email: string }
        tenant: { id: number; slug: string }
        membership: { role: string }
        roles: string[]
      }
    },
    loggerEvents,
  }
}

test('registration replay contract rejects empty object with controlled AuthError', () => {
  const { service, loggerEvents } = createServiceHarness()

  assert.throws(
    () => service.createRegistrationPrincipal({}),
    (error: unknown) => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.code, 'invalid_registration')
      assert.match(error.message, /Registration replay result is missing required user, tenant, or membership data\./)
      return true
    },
  )

  assert.equal(loggerEvents.length, 1)
  assert.equal(loggerEvents[0]?.payload.event, 'auth-register.invalid-replay-shape')
  assert.equal(loggerEvents[0]?.payload.hasMembership, false)
})

test('registration replay contract accepts user tenant membership shape and normalizes role', () => {
  const { service, loggerEvents } = createServiceHarness()

  const principal = service.createRegistrationPrincipal({
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
      businessModel: 'service',
      plan: 'pro',
      isActive: true,
      createdAt: '2026-06-12T00:00:00.000Z',
      updatedAt: '2026-06-12T00:00:00.000Z',
    },
    membership: {
      id: 3,
      userId: 1,
      tenantId: 2,
      role: ' Owner ',
      createdAt: '2026-06-12T00:00:00.000Z',
    },
  })

  assert.equal(principal.membership.role, ' Owner ')
  assert.deepEqual(principal.roles, ['owner'])
  assert.equal(loggerEvents.length, 0)
})

test('registration replay contract rejects membership without role string', () => {
  const { service, loggerEvents } = createServiceHarness()

  assert.throws(
    () => service.createRegistrationPrincipal({
      user: {
        id: 1,
        name: 'Owner User',
        email: 'owner@example.com',
      },
      tenant: {
        id: 2,
        slug: 'brandsoul-legal',
      },
      membership: {
        id: 3,
        userId: 1,
        tenantId: 2,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.code, 'invalid_registration')
      return true
    },
  )

  assert.equal(loggerEvents.length, 1)
  assert.equal(loggerEvents[0]?.payload.event, 'auth-register.invalid-replay-shape')
  assert.equal(loggerEvents[0]?.payload.hasMembership, true)
  assert.equal(loggerEvents[0]?.payload.membershipType, 'object')
})
