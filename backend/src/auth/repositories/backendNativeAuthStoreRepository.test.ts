import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { initializeDatabase, createDatabaseConnection } from '../../db/index.js'
import { createBackendNativeAuthStoreRepository } from './backendNativeAuthStoreRepository.js'

async function createHarness(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  const timestamps = [
    '2026-05-09T10:00:00.000Z',
    '2026-05-09T10:00:01.000Z',
    '2026-05-09T10:00:02.000Z',
    '2026-05-09T10:00:03.000Z',
    '2026-05-09T10:00:04.000Z',
    '2026-05-09T10:00:05.000Z',
    '2026-05-09T10:00:06.000Z',
    '2026-05-09T10:00:07.000Z',
    '2026-05-09T10:00:08.000Z',
    '2026-05-09T10:00:09.000Z',
    '2026-05-09T10:00:10.000Z',
  ]
  let index = 0

  const repository = createBackendNativeAuthStoreRepository(db, {
    now: () => timestamps[Math.min(index++, timestamps.length - 1)],
  })

  return {
    db,
    repository,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

async function seedUserTenantMembership(harness: Awaited<ReturnType<typeof createHarness>>) {
  const user = await harness.repository.createUser({
    name: 'Owner User',
    email: 'owner@example.com',
    passwordHash: 'hash-1',
  })
  const tenant = await harness.repository.createTenant({
    name: 'Tenant One',
    slug: 'tenant-one',
    businessModel: 'service',
    plan: 'pro',
  })
  const membership = await harness.repository.createMembership({
    userId: user!.id,
    tenantId: tenant!.id,
    role: 'owner',
  })

  return { user, tenant, membership }
}

test('createUser + findUserByEmail', async () => {
  const harness = await createHarness('backend-native-auth-user-email-')

  try {
    await harness.repository.createUser({
      name: 'Owner User',
      email: 'OWNER@example.com',
      passwordHash: 'hash-1',
    })

    const user = await harness.repository.findUserByEmail('owner@example.com')
    assert.equal(user?.name, 'Owner User')
    assert.equal(user?.email, 'owner@example.com')
    assert.equal(user?.passwordHash, 'hash-1')
    assert.equal(user?.isActive, true)
  } finally {
    await harness.cleanup()
  }
})

test('createUser + findUserById', async () => {
  const harness = await createHarness('backend-native-auth-user-id-')

  try {
    const created = await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
    })

    const user = await harness.repository.findUserById(created!.id)
    assert.equal(user?.id, created?.id)
    assert.equal(user?.email, 'owner@example.com')
  } finally {
    await harness.cleanup()
  }
})

test('duplicate email fails', async () => {
  const harness = await createHarness('backend-native-auth-dup-email-')

  try {
    await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
    })

    await assert.rejects(
      harness.repository.createUser({
        name: 'Owner User Two',
        email: 'owner@example.com',
        passwordHash: 'hash-2',
      }),
    )
  } finally {
    await harness.cleanup()
  }
})

test('createTenant + findTenantBySlug', async () => {
  const harness = await createHarness('backend-native-auth-tenant-slug-')

  try {
    await harness.repository.createTenant({
      name: 'Tenant One',
      slug: 'tenant-one',
      businessModel: 'service',
      plan: 'pro',
    })

    const tenant = await harness.repository.findTenantBySlug('tenant-one')
    assert.equal(tenant?.name, 'Tenant One')
    assert.equal(tenant?.businessModel, 'service')
    assert.equal(tenant?.isActive, true)
  } finally {
    await harness.cleanup()
  }
})

test('duplicate slug fails', async () => {
  const harness = await createHarness('backend-native-auth-dup-slug-')

  try {
    await harness.repository.createTenant({
      name: 'Tenant One',
      slug: 'tenant-one',
      businessModel: 'service',
      plan: 'pro',
    })

    await assert.rejects(
      harness.repository.createTenant({
        name: 'Tenant Two',
        slug: 'tenant-one',
        businessModel: 'professional',
        plan: 'starter',
      }),
    )
  } finally {
    await harness.cleanup()
  }
})

test('createMembership + findMembershipForUserAndTenant', async () => {
  const harness = await createHarness('backend-native-auth-membership-')

  try {
    const { user, tenant, membership } = await seedUserTenantMembership(harness)
    const found = await harness.repository.findMembershipForUserAndTenant(user!.id, tenant!.id)

    assert.equal(found?.id, membership?.id)
    assert.equal(found?.role, 'owner')
  } finally {
    await harness.cleanup()
  }
})

test('duplicate user/tenant membership fails', async () => {
  const harness = await createHarness('backend-native-auth-dup-membership-')

  try {
    const { user, tenant } = await seedUserTenantMembership(harness)

    await assert.rejects(
      harness.repository.createMembership({
        userId: user!.id,
        tenantId: tenant!.id,
        role: 'admin',
      }),
    )
  } finally {
    await harness.cleanup()
  }
})

test('listMembershipsForUser returns all active tenant memberships', async () => {
  const harness = await createHarness('backend-native-auth-list-memberships-')

  try {
    const user = await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
    })
    const tenantOne = await harness.repository.createTenant({
      name: 'Tenant One',
      slug: 'tenant-one',
      businessModel: 'service',
    })
    const tenantTwo = await harness.repository.createTenant({
      name: 'Tenant Two',
      slug: 'tenant-two',
      businessModel: 'professional',
    })

    await harness.repository.createMembership({
      userId: user!.id,
      tenantId: tenantOne!.id,
      role: 'owner',
    })
    await harness.repository.createMembership({
      userId: user!.id,
      tenantId: tenantTwo!.id,
      role: 'admin',
    })

    const memberships = await harness.repository.listMembershipsForUser(user!.id)
    assert.equal(memberships.length, 2)
    assert.deepEqual(
      memberships.map((entry) => ({ slug: entry.tenant.slug, role: entry.membership.role })),
      [
        { slug: 'tenant-one', role: 'owner' },
        { slug: 'tenant-two', role: 'admin' },
      ],
    )
  } finally {
    await harness.cleanup()
  }
})

test('no first-membership fallback exists', async () => {
  const harness = await createHarness('backend-native-auth-no-fallback-')

  try {
    assert.equal('findMembershipForUser' in harness.repository, false)
  } finally {
    await harness.cleanup()
  }
})

test('inactive tenant, user, and membership handling is preserved', async () => {
  const harness = await createHarness('backend-native-auth-inactive-')

  try {
    const { user, tenant } = await seedUserTenantMembership(harness)

    await harness.repository.deactivateMembership(user!.id, tenant!.id)
    assert.equal(await harness.repository.findMembershipForUserAndTenant(user!.id, tenant!.id), null)
    assert.deepEqual(await harness.repository.listMembershipsForUser(user!.id), [])

    await harness.db.run(
      `
        UPDATE flow_auth_membership
        SET is_active = 1, updated_at = ?
        WHERE user_id = ?
          AND tenant_id = ?
      `,
      '2026-05-09T10:30:00.000Z',
      user!.id,
      tenant!.id,
    )
    await harness.repository.updateTenant(tenant!.id, { isActive: false })
    const inactiveTenant = await harness.repository.findTenantById(tenant!.id)
    assert.equal(inactiveTenant?.isActive, false)
    assert.deepEqual(await harness.repository.listMembershipsForUser(user!.id), [])

    await harness.repository.deactivateUser(user!.id)
    const inactiveUser = await harness.repository.findUserById(user!.id)
    assert.equal(inactiveUser?.isActive, false)
    assert.equal(await harness.repository.findMembershipForUserAndTenant(user!.id, tenant!.id), null)
  } finally {
    await harness.cleanup()
  }
})

test('password reset token create/find/latest/consume works', async () => {
  const harness = await createHarness('backend-native-auth-reset-token-')

  try {
    const user = await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
    })

    const first = await harness.repository.createPasswordResetToken({
      userId: user!.id,
      token: 'token-1',
      expiresAt: '2026-05-09T11:00:00.000Z',
    })
    await harness.repository.createPasswordResetToken({
      userId: user!.id,
      token: 'token-2',
      expiresAt: '2026-05-09T12:00:00.000Z',
    })

    const found = await harness.repository.findPasswordResetTokenByToken('token-1')
    const latest = await harness.repository.findLatestPasswordResetTokenForUser(user!.id)
    const consumed = await harness.repository.markPasswordResetTokenUsed(first!.id)

    assert.equal(found?.token, 'token-1')
    assert.equal(latest?.token, 'token-2')
    assert.ok(consumed?.usedAt)
  } finally {
    await harness.cleanup()
  }
})

test('updateUserPasswordHash works', async () => {
  const harness = await createHarness('backend-native-auth-password-update-')

  try {
    const user = await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
    })

    const updated = await harness.repository.updateUserPasswordHash(user!.id, 'hash-2')
    assert.equal(updated?.passwordHash, 'hash-2')
  } finally {
    await harness.cleanup()
  }
})

test('legacy_source + legacy_id are persisted', async () => {
  const harness = await createHarness('backend-native-auth-legacy-mapping-')

  try {
    const user = await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
      legacySource: 'brandsoul',
      legacyId: 1,
    })
    const tenant = await harness.repository.createTenant({
      name: 'Tenant One',
      slug: 'tenant-one',
      businessModel: 'service',
      legacySource: 'brandsoul',
      legacyId: 2,
    })
    await harness.repository.createMembership({
      userId: user!.id,
      tenantId: tenant!.id,
      role: 'owner',
      legacySource: 'brandsoul',
      legacyId: 3,
    })
    await harness.repository.createPasswordResetToken({
      userId: user!.id,
      token: 'token-1',
      expiresAt: '2026-05-09T11:00:00.000Z',
      legacySource: 'brandsoul',
      legacyId: 4,
    })

    const row = await harness.db.get<{
      user_legacy_source: string
      user_legacy_id: number
      tenant_legacy_source: string
      tenant_legacy_id: number
      membership_legacy_source: string
      membership_legacy_id: number
      token_legacy_source: string
      token_legacy_id: number
    }>(
      `
        SELECT
          (SELECT legacy_source FROM flow_auth_user WHERE id = ?) AS user_legacy_source,
          (SELECT legacy_id FROM flow_auth_user WHERE id = ?) AS user_legacy_id,
          (SELECT legacy_source FROM flow_auth_tenant WHERE id = ?) AS tenant_legacy_source,
          (SELECT legacy_id FROM flow_auth_tenant WHERE id = ?) AS tenant_legacy_id,
          (SELECT legacy_source FROM flow_auth_membership WHERE user_id = ? AND tenant_id = ?) AS membership_legacy_source,
          (SELECT legacy_id FROM flow_auth_membership WHERE user_id = ? AND tenant_id = ?) AS membership_legacy_id,
          (SELECT legacy_source FROM flow_auth_password_reset_token WHERE token = ?) AS token_legacy_source,
          (SELECT legacy_id FROM flow_auth_password_reset_token WHERE token = ?) AS token_legacy_id
      `,
      user!.id,
      user!.id,
      tenant!.id,
      tenant!.id,
      user!.id,
      tenant!.id,
      user!.id,
      tenant!.id,
      'token-1',
      'token-1',
    )

    assert.deepEqual(row, {
      user_legacy_source: 'brandsoul',
      user_legacy_id: 1,
      tenant_legacy_source: 'brandsoul',
      tenant_legacy_id: 2,
      membership_legacy_source: 'brandsoul',
      membership_legacy_id: 3,
      token_legacy_source: 'brandsoul',
      token_legacy_id: 4,
    })
  } finally {
    await harness.cleanup()
  }
})

test('listMembershipUsersByTenant works', async () => {
  const harness = await createHarness('backend-native-auth-membership-users-')

  try {
    const userOne = await harness.repository.createUser({
      name: 'Owner User',
      email: 'owner@example.com',
      passwordHash: 'hash-1',
    })
    const userTwo = await harness.repository.createUser({
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: 'hash-2',
    })
    const tenant = await harness.repository.createTenant({
      name: 'Tenant One',
      slug: 'tenant-one',
      businessModel: 'service',
    })

    await harness.repository.createMembership({
      userId: userOne!.id,
      tenantId: tenant!.id,
      role: 'owner',
    })
    await harness.repository.createMembership({
      userId: userTwo!.id,
      tenantId: tenant!.id,
      role: 'admin',
    })

    const users = await harness.repository.listMembershipUsersByTenant(tenant!.id)
    assert.deepEqual(
      users.map((entry) => ({ email: entry.user.email, role: entry.membership.role })),
      [
        { email: 'owner@example.com', role: 'owner' },
        { email: 'admin@example.com', role: 'admin' },
      ],
    )
  } finally {
    await harness.cleanup()
  }
})

test('repository works after initializeDatabase and can append auth audit events', async () => {
  const harness = await createHarness('backend-native-auth-init-smoke-')

  try {
    const { user, tenant } = await seedUserTenantMembership(harness)
    await harness.repository.appendAuthAuditEvent({
      id: 'audit-1',
      eventType: 'native_repository_smoke',
      userId: user!.id,
      tenantId: tenant!.id,
      actorUserId: user!.id,
      actorTenantId: tenant!.id,
      outcome: 'ok',
      metadataJson: '{"source":"test"}',
    })

    const row = await harness.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM flow_auth_audit_event WHERE id = ?`,
      'audit-1',
    )
    assert.equal(row?.count, 1)
  } finally {
    await harness.cleanup()
  }
})
