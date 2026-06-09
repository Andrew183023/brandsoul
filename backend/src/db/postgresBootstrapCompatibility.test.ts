import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPostgresBaseSchemaStatements, filterSqliteOnlyDdlForPostgres } from './index.js'

test('postgres bootstrap filters sqlite trigger ddl and preserves base schema tables and indexes', () => {
  const statements = filterSqliteOnlyDdlForPostgres([
    'CREATE TABLE IF NOT EXISTS entity_profile (id TEXT PRIMARY KEY)',
    "CREATE TRIGGER IF NOT EXISTS flowmind_distributed_lineage_no_update BEFORE UPDATE ON flowmind_distributed_lineage BEGIN\n  SELECT RAISE(ABORT, 'flowmind_distributed_lineage is append-only')",
    'END',
    'CREATE INDEX IF NOT EXISTS idx_flowmind_runtime_snapshot_timestamp ON flowmind_runtime_snapshot(snapshot_timestamp)',
  ])

  assert.equal(
    statements.some((statement) => /^CREATE TRIGGER\b/i.test(statement.trim())),
    false,
  )
  assert.equal(
    statements.some((statement) => /^END$/i.test(statement.trim())),
    false,
  )
  assert.equal(
    statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS entity_profile')),
    true,
  )
  assert.equal(
    statements.some((statement) => statement.includes('CREATE INDEX IF NOT EXISTS idx_flowmind_runtime_snapshot_timestamp')),
    true,
  )
})

test('postgres bootstrap statements derived from sqliteSchema keep flowmind tables and remove sqlite trigger fragments', () => {
  const statements = buildPostgresBaseSchemaStatements()

  assert.equal(
    statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS flowmind_distributed_lineage')),
    true,
  )
  assert.equal(
    statements.some((statement) =>
      statement.includes('CREATE TABLE IF NOT EXISTS flowmind_semantic_replay_result')
      && statement.includes('replay_result_id TEXT PRIMARY KEY'),
    ),
    true,
  )
  assert.equal(
    statements.some((statement) => /^CREATE TRIGGER\b/i.test(statement.trim())),
    false,
  )
  assert.equal(
    statements.some((statement) => /^END$/i.test(statement.trim())),
    false,
  )
})
