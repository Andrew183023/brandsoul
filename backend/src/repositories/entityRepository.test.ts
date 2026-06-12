import assert from 'node:assert/strict'
import test from 'node:test'

import type { BackendDatabase } from '../db/index.js'
import { createEntityRepository } from './entityRepository.js'

type CapturedQuery = {
  sql: string
  params: unknown[]
}

function createMockDb(rows: Array<{
  id: string
  owner_id: string | null
  owner_user_id: number | null
  owner_tenant_id: number | null
  created_at: string
  updated_at: string
  entity_profile: string
}> = []) {
  const queries: CapturedQuery[] = []

  const db: BackendDatabase = {
    dialect: 'sqlite',
    async run() {
      return {}
    },
    async get() {
      return undefined
    },
    async all(sql: string, ...params: unknown[]) {
      queries.push({ sql, params })
      return rows as never
    },
    async exec() {
      return
    },
    async transaction<T>(callback: (db: BackendDatabase) => Promise<T>) {
      return callback(db)
    },
    async close() {
      return
    },
  }

  return {
    db,
    queries,
  }
}

test('getEntitiesByOwnerUserId without tenant uses owner-only query', async () => {
  const { db, queries } = createMockDb([
    {
      id: 'office-1',
      owner_id: 'user:1:tenant:2',
      owner_user_id: 10,
      owner_tenant_id: 20,
      created_at: '2026-06-12T00:00:00.000Z',
      updated_at: '2026-06-12T00:00:00.000Z',
      entity_profile: '{"metadata":{}}',
    },
  ])
  const repository = createEntityRepository(db)

  const result = await repository.getEntitiesByOwnerUserId(10)

  assert.equal(queries.length, 1)
  assert.deepEqual(queries[0]?.params, [10])
  assert.match(queries[0]?.sql ?? '', /WHERE owner_user_id = \?/)
  assert.doesNotMatch(queries[0]?.sql ?? '', /\(\? IS NULL OR owner_tenant_id = \?\)/)
  assert.doesNotMatch(queries[0]?.sql ?? '', /owner_tenant_id = \?/)
  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, 'office-1')
  assert.equal(result[0]?.ownerUserId, 10)
  assert.equal(result[0]?.ownerTenantId, 20)
})

test('getEntitiesByOwnerUserId with tenant uses owner-and-tenant query', async () => {
  const { db, queries } = createMockDb([
    {
      id: 'office-2',
      owner_id: 'user:1:tenant:2',
      owner_user_id: 10,
      owner_tenant_id: 21,
      created_at: '2026-06-12T00:00:00.000Z',
      updated_at: '2026-06-12T00:00:00.000Z',
      entity_profile: '{"metadata":{}}',
    },
  ])
  const repository = createEntityRepository(db)

  const result = await repository.getEntitiesByOwnerUserId(10, 21)

  assert.equal(queries.length, 1)
  assert.deepEqual(queries[0]?.params, [10, 21])
  assert.match(queries[0]?.sql ?? '', /WHERE owner_user_id = \?/)
  assert.match(queries[0]?.sql ?? '', /AND owner_tenant_id = \?/)
  assert.doesNotMatch(queries[0]?.sql ?? '', /\(\? IS NULL OR owner_tenant_id = \?\)/)
  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, 'office-2')
  assert.equal(result[0]?.ownerUserId, 10)
  assert.equal(result[0]?.ownerTenantId, 21)
})
