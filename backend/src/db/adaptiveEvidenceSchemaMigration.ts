import { ensureColumn, type BackendDatabase } from './dbClient.js'

const SCHEMA_MIGRATIONS_TABLE = 'flowmind_schema_migrations'

export const ADAPTIVE_EVIDENCE_HEATMAP_SCHEMA_MIGRATION_KEY =
  '2026-05-09-adaptive-equilibrium-evidence-heatmap-snapshot-json'
export const ADAPTIVE_EVIDENCE_CONTRACT_VERSIONING_MIGRATION_KEY =
  '2026-05-09-adaptive-equilibrium-evidence-contract-versioning'

const adaptiveEquilibriumEvidenceColumns = [
  ['evidence_id', 'TEXT'],
  ['evidence_type', 'TEXT'],
  ['replay_consistency_equilibrium', 'REAL'],
  ['reinforcement_escalation_persistence', 'REAL'],
  ['saturation_equilibrium', 'REAL'],
  ['oscillation_damping', 'REAL'],
  ['projection_stability_convergence', 'REAL'],
  ['ranking_diversity_preservation', 'REAL'],
  ['entropy_evolution', 'REAL'],
  ['projection_lock_in_persistence', 'REAL'],
  ['low_confidence_amplification_persistence', 'REAL'],
  ['replay_degradation_persistence', 'REAL'],
  ['governance_classification', 'TEXT'],
  ['recommendation', 'TEXT'],
  ['sustained_equilibrium_evidence', 'INTEGER NOT NULL DEFAULT 0'],
  ['replay_fingerprint', 'TEXT'],
  ['heatmap_snapshot_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['evidence_contract_version', "TEXT NOT NULL DEFAULT 'legacy-unversioned'"],
  ['semantic_version_metadata_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['reducer_semantic_metadata_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['evidence_generation_metadata_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['generated_at', 'TEXT'],
  ['recorded_at', 'TEXT'],
] as const

type SchemaMigrationRow = {
  migration_key: string
  applied_at: string
  details_json: string
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

async function listTableColumns(db: BackendDatabase, tableName: string): Promise<string[]> {
  if (db.dialect === 'postgres') {
    const rows = await db.all<Array<{ column_name: string }>>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ?
        ORDER BY ordinal_position ASC
      `,
      tableName,
    )

    return rows.map((row) => row.column_name)
  }

  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
  return rows.map((row) => row.name)
}

async function ensureSchemaMigrationTracking(db: BackendDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      migration_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    )
  `)
}

async function recordSchemaMigration(db: BackendDatabase, migrationKey: string, details: Record<string, unknown>) {
  await db.run(
    `
      INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (
        migration_key,
        applied_at,
        details_json
      )
      VALUES (?, ?, ?)
      ON CONFLICT(migration_key) DO UPDATE SET
        applied_at = excluded.applied_at,
        details_json = excluded.details_json
    `,
    migrationKey,
    new Date().toISOString(),
    JSON.stringify(details),
  )
}

export async function getSchemaMigrationRecord(db: BackendDatabase, migrationKey: string): Promise<SchemaMigrationRow | null> {
  await ensureSchemaMigrationTracking(db)
  const row = await db.get<SchemaMigrationRow>(
    `
      SELECT migration_key, applied_at, details_json
      FROM ${SCHEMA_MIGRATIONS_TABLE}
      WHERE migration_key = ?
      LIMIT 1
    `,
    migrationKey,
  )

  return row ?? null
}

export async function migrateAdaptiveEquilibriumEvidenceSchema(db: BackendDatabase) {
  await ensureSchemaMigrationTracking(db)

  const beforeColumns = new Set(await listTableColumns(db, 'flowmind_adaptive_equilibrium_evidence'))

  for (const [columnName, definition] of adaptiveEquilibriumEvidenceColumns) {
    await ensureColumn(db, 'flowmind_adaptive_equilibrium_evidence', columnName, definition)
  }

  const afterColumns = await listTableColumns(db, 'flowmind_adaptive_equilibrium_evidence')
  const addedColumns = afterColumns.filter((columnName) => !beforeColumns.has(columnName))
  const existingMigration = await getSchemaMigrationRecord(db, ADAPTIVE_EVIDENCE_HEATMAP_SCHEMA_MIGRATION_KEY)

  if (addedColumns.length > 0 || !existingMigration) {
    await recordSchemaMigration(db, ADAPTIVE_EVIDENCE_HEATMAP_SCHEMA_MIGRATION_KEY, {
      table: 'flowmind_adaptive_equilibrium_evidence',
      addedColumns,
      expectedColumns: adaptiveEquilibriumEvidenceColumns.map(([columnName]) => columnName),
      additiveOnly: true,
      replayIdentityMutation: false,
      appendOnlyEvidencePreserved: true,
    })
  }

  const contractMigration = await getSchemaMigrationRecord(db, ADAPTIVE_EVIDENCE_CONTRACT_VERSIONING_MIGRATION_KEY)
  const contractColumns = [
    'evidence_contract_version',
    'semantic_version_metadata_json',
    'reducer_semantic_metadata_json',
    'evidence_generation_metadata_json',
  ]
  const addedContractColumns = contractColumns.filter((columnName) => addedColumns.includes(columnName))
  if (addedContractColumns.length > 0 || !contractMigration) {
    await recordSchemaMigration(db, ADAPTIVE_EVIDENCE_CONTRACT_VERSIONING_MIGRATION_KEY, {
      table: 'flowmind_adaptive_equilibrium_evidence',
      addedColumns: addedContractColumns,
      additiveOnly: true,
      replayIdentityMutation: false,
      historicalEvidenceImmutable: true,
      compatibilityAppliedAtReadTime: true,
    })
  }
}

export async function validateAdaptiveEquilibriumEvidenceSchema(db: BackendDatabase) {
  const columns = new Set(await listTableColumns(db, 'flowmind_adaptive_equilibrium_evidence'))
  const missingColumns = adaptiveEquilibriumEvidenceColumns
    .map(([columnName]) => columnName)
    .filter((columnName) => !columns.has(columnName))

  if (missingColumns.length > 0) {
    throw new Error(
      `FLOWMIND_SCHEMA_DRIFT: flowmind_adaptive_equilibrium_evidence missing columns: ${missingColumns.join(', ')}`,
    )
  }
}
