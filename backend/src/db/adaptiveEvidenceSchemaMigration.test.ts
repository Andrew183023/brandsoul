import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { createDatabaseConnection, initializeDatabase } from './index.js'
import {
  ADAPTIVE_EVIDENCE_CONTRACT_VERSIONING_MIGRATION_KEY,
  ADAPTIVE_EVIDENCE_HEATMAP_SCHEMA_MIGRATION_KEY,
  getSchemaMigrationRecord,
  validateAdaptiveEquilibriumEvidenceSchema,
} from './adaptiveEvidenceSchemaMigration.js'
import { createAdaptiveEquilibriumEvidenceRepository } from '../learning/persistence/adaptiveEquilibriumEvidenceRepository.js'
import { LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION } from '../learning/persistence/adaptiveEvidenceContract.js'

async function createTempSqliteDb(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  return {
    db,
    sqliteFile,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('adaptive evidence migration upgrades old schema additively and preserves replay identity', async () => {
  const harness = await createTempSqliteDb('flowmind-adaptive-schema-')

  try {
    await harness.db.exec(`
      CREATE TABLE flowmind_adaptive_equilibrium_evidence (
        evidence_id TEXT PRIMARY KEY,
        evidence_type TEXT NOT NULL,
        replay_consistency_equilibrium REAL NOT NULL,
        reinforcement_escalation_persistence REAL NOT NULL,
        saturation_equilibrium REAL NOT NULL,
        oscillation_damping REAL NOT NULL,
        projection_stability_convergence REAL NOT NULL,
        ranking_diversity_preservation REAL NOT NULL,
        entropy_evolution REAL NOT NULL,
        projection_lock_in_persistence REAL NOT NULL,
        low_confidence_amplification_persistence REAL NOT NULL,
        replay_degradation_persistence REAL NOT NULL,
        governance_classification TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        sustained_equilibrium_evidence INTEGER NOT NULL,
        replay_fingerprint TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `)

    await harness.db.run(
      `
        INSERT INTO flowmind_adaptive_equilibrium_evidence (
          evidence_id,
          evidence_type,
          replay_consistency_equilibrium,
          reinforcement_escalation_persistence,
          saturation_equilibrium,
          oscillation_damping,
          projection_stability_convergence,
          ranking_diversity_preservation,
          entropy_evolution,
          projection_lock_in_persistence,
          low_confidence_amplification_persistence,
          replay_degradation_persistence,
          governance_classification,
          recommendation,
          sustained_equilibrium_evidence,
          replay_fingerprint,
          generated_at,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'adaptive-equilibrium-evidence:legacy',
      'adaptive_equilibrium_evidence',
      0.92,
      0.18,
      0.11,
      0.86,
      0.77,
      0.64,
      0.55,
      0.21,
      0.09,
      0.08,
      'SAFE',
      'do_not_rollout',
      1,
      'replay-fingerprint-legacy',
      '2026-05-09T10:00:00.000Z',
      '2026-05-09T10:00:01.000Z',
    )

    await initializeDatabase(harness.db)

    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.db)
    const migrated = await repository.getEvidenceById('adaptive-equilibrium-evidence:legacy')
    const migrationRecord = await getSchemaMigrationRecord(harness.db, ADAPTIVE_EVIDENCE_HEATMAP_SCHEMA_MIGRATION_KEY)
    const contractMigrationRecord = await getSchemaMigrationRecord(
      harness.db,
      ADAPTIVE_EVIDENCE_CONTRACT_VERSIONING_MIGRATION_KEY,
    )
    const rawColumn = await harness.db.get<{
      heatmap_snapshot_json: string
      evidence_contract_version: string
      semantic_version_metadata_json: string
      reducer_semantic_metadata_json: string
      evidence_generation_metadata_json: string
    }>(
      `
        SELECT
          heatmap_snapshot_json,
          evidence_contract_version,
          semantic_version_metadata_json,
          reducer_semantic_metadata_json,
          evidence_generation_metadata_json
        FROM flowmind_adaptive_equilibrium_evidence
        WHERE evidence_id = ?
      `,
      'adaptive-equilibrium-evidence:legacy',
    )

    assert.ok(migrationRecord)
    assert.ok(contractMigrationRecord)
    assert.equal(rawColumn?.heatmap_snapshot_json, '{}')
    assert.equal(rawColumn?.evidence_contract_version, LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION)
    assert.equal(rawColumn?.semantic_version_metadata_json, '{}')
    assert.equal(rawColumn?.reducer_semantic_metadata_json, '{}')
    assert.equal(rawColumn?.evidence_generation_metadata_json, '{}')
    assert.equal(migrated?.evidenceId, 'adaptive-equilibrium-evidence:legacy')
    assert.equal(migrated?.replayFingerprint, 'replay-fingerprint-legacy')
    assert.equal(migrated?.generatedAt, '2026-05-09T10:00:00.000Z')
    assert.equal(migrated?.heatmapSnapshot ?? null, null)
    assert.equal(migrated?.evidenceContractVersion, LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION)
    assert.equal(migrated?.semanticVersionMetadata.contractSchemaVersion, 0)
    assert.equal(migrated?.reducerSemanticMetadata.reducerSetVersion, 'legacy-unversioned')
    assert.equal(migrated?.evidenceGenerationMetadata.runtimeSemanticsVersion, 'legacy-unversioned')
  } finally {
    await harness.cleanup()
  }
})

test('adaptive evidence startup validation detects schema drift before runtime reads', async () => {
  const harness = await createTempSqliteDb('flowmind-adaptive-drift-')

  try {
    await harness.db.exec(`
      CREATE TABLE flowmind_adaptive_equilibrium_evidence (
        evidence_id TEXT PRIMARY KEY,
        evidence_type TEXT NOT NULL
      )
    `)

    await assert.rejects(
      validateAdaptiveEquilibriumEvidenceSchema(harness.db),
      /FLOWMIND_SCHEMA_DRIFT/,
    )
  } finally {
    await harness.cleanup()
  }
})

test('adaptive evidence migration preserves append-only history and supports new evidence append', async () => {
  const harness = await createTempSqliteDb('flowmind-adaptive-append-')

  try {
    await harness.db.exec(`
      CREATE TABLE flowmind_adaptive_equilibrium_evidence (
        evidence_id TEXT PRIMARY KEY,
        evidence_type TEXT NOT NULL,
        replay_consistency_equilibrium REAL NOT NULL,
        reinforcement_escalation_persistence REAL NOT NULL,
        saturation_equilibrium REAL NOT NULL,
        oscillation_damping REAL NOT NULL,
        projection_stability_convergence REAL NOT NULL,
        ranking_diversity_preservation REAL NOT NULL,
        entropy_evolution REAL NOT NULL,
        projection_lock_in_persistence REAL NOT NULL,
        low_confidence_amplification_persistence REAL NOT NULL,
        replay_degradation_persistence REAL NOT NULL,
        governance_classification TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        sustained_equilibrium_evidence INTEGER NOT NULL,
        replay_fingerprint TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `)

    await harness.db.run(
      `
        INSERT INTO flowmind_adaptive_equilibrium_evidence (
          evidence_id,
          evidence_type,
          replay_consistency_equilibrium,
          reinforcement_escalation_persistence,
          saturation_equilibrium,
          oscillation_damping,
          projection_stability_convergence,
          ranking_diversity_preservation,
          entropy_evolution,
          projection_lock_in_persistence,
          low_confidence_amplification_persistence,
          replay_degradation_persistence,
          governance_classification,
          recommendation,
          sustained_equilibrium_evidence,
          replay_fingerprint,
          generated_at,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'adaptive-equilibrium-evidence:before-upgrade',
      'adaptive_equilibrium_evidence',
      0.82,
      0.22,
      0.19,
      0.73,
      0.68,
      0.59,
      0.49,
      0.27,
      0.14,
      0.12,
      'CAUTION',
      'do_not_rollout',
      0,
      'replay-fingerprint-before-upgrade',
      '2026-05-09T08:00:00.000Z',
      '2026-05-09T08:00:01.000Z',
    )

    await initializeDatabase(harness.db)

    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.db)
    const beforeCount = await repository.countEvidence()

    const appendResult = await repository.appendEvidence({
      replayConsistencyEquilibrium: 0.95,
      reinforcementEscalationPersistence: 0.12,
      saturationEquilibrium: 0.08,
      oscillationDamping: 0.91,
      projectionStabilityConvergence: 0.88,
      rankingDiversityPreservation: 0.79,
      entropyEvolution: 0.61,
      projectionLockInPersistence: 0.17,
      lowConfidenceAmplificationPersistence: 0.11,
      replayDegradationPersistence: 0.07,
      governanceClassification: 'SAFE',
      recommendation: 'do_not_rollout',
      sustainedEquilibriumEvidence: true,
      replayFingerprint: 'replay-fingerprint-after-upgrade',
      generatedAt: '2026-05-09T12:00:00.000Z',
      heatmapSnapshot: null,
    })

    const afterCount = await repository.countEvidence()
    const legacy = await repository.getEvidenceById('adaptive-equilibrium-evidence:before-upgrade')

    assert.equal(beforeCount, 1)
    assert.equal(afterCount, 2)
    assert.equal(appendResult.inserted, true)
    assert.equal(legacy?.replayFingerprint, 'replay-fingerprint-before-upgrade')
  } finally {
    await harness.cleanup()
  }
})
