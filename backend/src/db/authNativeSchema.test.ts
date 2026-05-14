import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from './index.js'

async function createTempSqliteDb(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  return {
    db,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

async function getTableColumns(db: Awaited<ReturnType<typeof createDatabaseConnection>>, tableName: string) {
  return db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`)
}

async function getIndexNames(db: Awaited<ReturnType<typeof createDatabaseConnection>>, tableName: string) {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA index_list(${tableName})`)
  return rows.map((row) => row.name)
}

test('initializeDatabase creates backend-native auth identity tables and legacy mapping columns', async () => {
  const harness = await createTempSqliteDb('flowmind-auth-native-schema-')

  try {
    await initializeDatabase(harness.db)

    const tables = await harness.db.all<Array<{ name: string }>>(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'flow_auth_user',
            'flow_auth_tenant',
            'flow_auth_membership',
            'flow_auth_password_reset_token',
            'flow_auth_audit_event',
            'auth_refresh_session'
          )
        ORDER BY name
      `,
    )

    assert.deepEqual(
      tables.map((row) => row.name),
      [
        'auth_refresh_session',
        'flow_auth_audit_event',
        'flow_auth_membership',
        'flow_auth_password_reset_token',
        'flow_auth_tenant',
        'flow_auth_user',
      ],
    )

    const userColumns = await getTableColumns(harness.db, 'flow_auth_user')
    const tenantColumns = await getTableColumns(harness.db, 'flow_auth_tenant')
    const membershipColumns = await getTableColumns(harness.db, 'flow_auth_membership')
    const resetColumns = await getTableColumns(harness.db, 'flow_auth_password_reset_token')

    assert.deepEqual(
      userColumns.map((column) => column.name),
      ['id', 'legacy_source', 'legacy_id', 'name', 'email', 'password_hash', 'is_active', 'created_at', 'updated_at'],
    )
    assert.deepEqual(
      tenantColumns.map((column) => column.name),
      ['id', 'legacy_source', 'legacy_id', 'name', 'slug', 'business_model', 'plan', 'is_active', 'created_at', 'updated_at'],
    )
    assert.deepEqual(
      membershipColumns.map((column) => column.name),
      ['id', 'legacy_source', 'legacy_id', 'user_id', 'tenant_id', 'role', 'is_active', 'created_at', 'updated_at'],
    )
    assert.deepEqual(
      resetColumns.map((column) => column.name),
      ['id', 'legacy_source', 'legacy_id', 'user_id', 'token', 'expires_at', 'used_at', 'created_at'],
    )
  } finally {
    await harness.cleanup()
  }
})

test('initializeDatabase creates required backend-native auth indexes', async () => {
  const harness = await createTempSqliteDb('flowmind-auth-native-indexes-')

  try {
    await initializeDatabase(harness.db)

    const userIndexes = await getIndexNames(harness.db, 'flow_auth_user')
    const tenantIndexes = await getIndexNames(harness.db, 'flow_auth_tenant')
    const membershipIndexes = await getIndexNames(harness.db, 'flow_auth_membership')
    const resetIndexes = await getIndexNames(harness.db, 'flow_auth_password_reset_token')
    const auditIndexes = await getIndexNames(harness.db, 'flow_auth_audit_event')

    assert.ok(userIndexes.includes('idx_flow_auth_user_email'))
    assert.ok(userIndexes.includes('idx_flow_auth_user_legacy_mapping'))
    assert.ok(tenantIndexes.includes('idx_flow_auth_tenant_slug'))
    assert.ok(tenantIndexes.includes('idx_flow_auth_tenant_legacy_mapping'))
    assert.ok(membershipIndexes.includes('idx_flow_auth_membership_user_tenant'))
    assert.ok(membershipIndexes.includes('idx_flow_auth_membership_user_id'))
    assert.ok(membershipIndexes.includes('idx_flow_auth_membership_tenant_id'))
    assert.ok(resetIndexes.includes('idx_flow_auth_password_reset_token_user_id'))
    assert.ok(resetIndexes.includes('idx_flow_auth_password_reset_token_expires_at'))
    assert.ok(auditIndexes.includes('idx_flow_auth_audit_event_event_type'))
    assert.ok(auditIndexes.includes('idx_flow_auth_audit_event_user_id'))
    assert.ok(auditIndexes.includes('idx_flow_auth_audit_event_tenant_id'))
    assert.ok(auditIndexes.includes('idx_flow_auth_audit_event_created_at'))
  } finally {
    await harness.cleanup()
  }
})

test('flow_auth_user enforces unique email', async () => {
  const harness = await createTempSqliteDb('flowmind-auth-native-user-')
  const now = new Date().toISOString()

  try {
    await initializeDatabase(harness.db)

    await harness.db.run(
      `
        INSERT INTO flow_auth_user (
          legacy_source,
          legacy_id,
          name,
          email,
          password_hash,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'brandsoul',
      1,
      'Owner One',
      'owner@example.com',
      'hash-1',
      1,
      now,
      now,
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO flow_auth_user (
            legacy_source,
            legacy_id,
            name,
            email,
            password_hash,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'brandsoul',
        2,
        'Owner Two',
        'owner@example.com',
        'hash-2',
        1,
        now,
        now,
      ),
    )
  } finally {
    await harness.cleanup()
  }
})

test('flow_auth_tenant enforces unique slug', async () => {
  const harness = await createTempSqliteDb('flowmind-auth-native-tenant-')
  const now = new Date().toISOString()

  try {
    await initializeDatabase(harness.db)

    await harness.db.run(
      `
        INSERT INTO flow_auth_tenant (
          legacy_source,
          legacy_id,
          name,
          slug,
          business_model,
          plan,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'brandsoul',
      10,
      'Tenant One',
      'tenant-one',
      'service',
      'pro',
      1,
      now,
      now,
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO flow_auth_tenant (
            legacy_source,
            legacy_id,
            name,
            slug,
            business_model,
            plan,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'brandsoul',
        11,
        'Tenant Two',
        'tenant-one',
        'service',
        'starter',
        1,
        now,
        now,
      ),
    )
  } finally {
    await harness.cleanup()
  }
})

test('flow_auth_membership enforces unique user_id and tenant_id pairs', async () => {
  const harness = await createTempSqliteDb('flowmind-auth-native-membership-')
  const now = new Date().toISOString()

  try {
    await initializeDatabase(harness.db)

    await harness.db.run(
      `
        INSERT INTO flow_auth_user (name, email, password_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      'Owner One',
      'owner@example.com',
      'hash-1',
      1,
      now,
      now,
    )
    await harness.db.run(
      `
        INSERT INTO flow_auth_tenant (name, slug, business_model, plan, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      'Tenant One',
      'tenant-one',
      'service',
      'pro',
      1,
      now,
      now,
    )

    await harness.db.run(
      `
        INSERT INTO flow_auth_membership (
          legacy_source,
          legacy_id,
          user_id,
          tenant_id,
          role,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'brandsoul',
      100,
      1,
      1,
      'owner',
      1,
      now,
      now,
    )

    await assert.rejects(
      harness.db.run(
        `
          INSERT INTO flow_auth_membership (
            legacy_source,
            legacy_id,
            user_id,
            tenant_id,
            role,
            is_active,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        'brandsoul',
        101,
        1,
        1,
        'admin',
        1,
        now,
        now,
      ),
    )
  } finally {
    await harness.cleanup()
  }
})
