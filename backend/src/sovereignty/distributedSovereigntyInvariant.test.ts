import assert from 'node:assert/strict'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createDistributedSovereigntyService } from './distributedSovereigntyService.js'

async function createHarness() {
  const db = await createDatabaseConnection({ provider: 'sqlite', sqliteFile: ':memory:' })
  await initializeDatabase(db)

  const service = createDistributedSovereigntyService({
    db,
    now: () => '2026-05-14T20:00:00.000Z',
    defaultNodeIdentity: {
      institutionalPlaneId: 'institutional-plane:test',
      lineagePlaneId: 'lineage-plane:test',
      replayPlaneId: 'replay-plane:test',
      authorityPlaneId: 'authority-plane:writer-a',
      persistencePlaneId: 'persistence-plane:writer-a',
    },
  })

  return {
    db,
    service,
    async close() {
      await db.close()
    },
  }
}

test('distributed sovereignty invariant detects duplicate planes non-monotonic lineage replay corruption and attestation loss', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await harness.db.run(
      `
        INSERT INTO flowmind_sovereign_node (
          node_id, node_class, institutional_plane_id, lineage_plane_id, replay_plane_id,
          authority_plane_id, persistence_plane_id, node_epoch, startup_attestation_hash, registered_at, updated_at
        )
        VALUES
          ('node:a', 'primary', 'institutional-plane:test', 'lineage-plane:test', 'replay-plane:a', 'authority-plane:duplicate', 'persistence-plane:a', 'epoch:a', 'hash:a', '2026-05-14T20:00:00.000Z', '2026-05-14T20:00:00.000Z'),
          ('node:b', 'secondary', 'institutional-plane:test', 'lineage-plane:test', 'replay-plane:b', 'authority-plane:duplicate', 'persistence-plane:b', 'epoch:b', 'hash:b', '2026-05-14T20:00:01.000Z', '2026-05-14T20:00:01.000Z')
      `,
    )
    await harness.db.run(
      `
        INSERT INTO flowmind_distributed_lineage (
          lineage_id, originating_node_id, continuity_epoch, replay_fingerprint, mutation_lineage_hash,
          semantic_lineage_hash, attestation_lineage_hash, distributed_sequence, distributed_clock_hash, created_at
        )
        VALUES
          ('lineage:3', 'node:a', 'continuity:a', 'replay:a', 'mutation:a', 'semantic:a', 'attestation:a', 3, 'clock:3', '2026-05-14T20:00:02.000Z'),
          ('lineage:1', 'node:a', 'continuity:a', 'replay:a', 'mutation:b', 'semantic:b', 'attestation:b', 1, 'clock:1', '2026-05-14T20:00:01.000Z')
      `,
    )
    await harness.db.run(
      `
        INSERT INTO flowmind_distributed_attestation (
          attestation_id, node_id, attestation_plane, lineage_hash, continuity_epoch, distributed_clock_hash, attested_at
        )
        VALUES ('attestation:missing', 'node:a', 'continuity', 'missing-lineage-hash', 'continuity:a', 'clock:attestation', '2026-05-14T20:00:03.000Z')
      `,
    )
    await harness.db.run(
      `
        INSERT INTO flowmind_replay_federation_state (
          federation_event_id, node_id, source_node_id, event_type, continuity_epoch, replay_fingerprint,
          lineage_ids_json, plane_sync_metadata_json, continuity_verified, distributed_clock_hash, created_at
        )
        VALUES ('federation:broken', 'node:b', 'node:a', 'import', 'continuity:a', 'replay:a', '["lineage:unknown"]', '{"lineageIntegrityHash":"broken"}', 0, 'clock:federation', '2026-05-14T20:00:04.000Z')
      `,
    )
    await harness.db.run(
      `
        INSERT INTO flowmind_sovereign_quorum (
          quorum_id, participating_nodes_json, active_nodes_json, quorum_health,
          quorum_continuity_state, consensus_mode, created_at, updated_at
        )
        VALUES ('distributed-foundation-quorum', '["node:a"]', '["node:a","node:b"]', 'split_brain_risk', 'unsafe', 'single_writer', '2026-05-14T20:00:00.000Z', '2026-05-14T20:00:04.000Z')
      `,
    )

    const violations = await harness.service.getInvariantViolations()
    assert.deepEqual(violations.sort(), [
      'distributed attestation loses continuity lineage',
      'distributed lineage non-monotonic',
      'duplicate authority plane detected',
      'quorum active nodes inconsistent',
      'replay federation corrupts lineage',
    ])
  } finally {
    await harness.close()
  }
})
