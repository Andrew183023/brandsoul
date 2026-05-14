import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createAdaptiveEquilibriumEvidenceRepository } from '../learning/persistence/adaptiveEquilibriumEvidenceRepository.js'
import { appendAdaptiveEvidenceWithSovereignAuthority } from '../learning/persistence/sovereignAdaptiveAppend.js'
import { createInstitutionalContinuityGovernanceService } from '../services/institutionalContinuityGovernanceService.js'
import { createObservabilityService } from '../services/observabilityService.js'
import { createRuntimeContinuityAttestationService } from '../services/runtimeContinuityAttestationService.js'
import { createRuntimeGovernanceService } from '../services/runtimeGovernanceService.js'
import { createInstitutionalSovereignMutationGate, installInstitutionalSovereignMutationGate } from './institutionalSovereignMutationGate.js'
import { createSemanticMutationExecutor, installSemanticMutationExecutor } from './semanticMutationExecutor.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'semantic-replay-invariant-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  const observability = createObservabilityService()
  const runtimeGovernance = createRuntimeGovernanceService({ observability })
  const continuityGovernance = createInstitutionalContinuityGovernanceService({
    db: connection,
    observability,
  })
  await continuityGovernance.initialize()

  const runtimeContinuityAttestationService = createRuntimeContinuityAttestationService({
    db: connection,
    observability,
  })

  ;(runtimeContinuityAttestationService as unknown as {
    getStatus(): Record<string, unknown>
  }).getStatus = () => ({
    attestationIntegrity: 'verified',
    replayVerificationState: 'verified',
    recoveryRequired: false,
    brokenAttestationChains: [],
  })

  installInstitutionalSovereignMutationGate(createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
  }))

  installSemanticMutationExecutor(createSemanticMutationExecutor({
    db: connection,
    observability,
  }))

  return {
    connection,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function buildAdaptiveInput() {
  return {
    replayConsistencyEquilibrium: 0.91,
    reinforcementEscalationPersistence: 0.27,
    saturationEquilibrium: 0.18,
    oscillationDamping: 0.85,
    projectionStabilityConvergence: 0.84,
    rankingDiversityPreservation: 0.72,
    entropyEvolution: 0.44,
    projectionLockInPersistence: 0.11,
    lowConfidenceAmplificationPersistence: 0.08,
    replayDegradationPersistence: 0.09,
    governanceClassification: 'CAUTION' as const,
    recommendation: 'do_not_rollout' as const,
    sustainedEquilibriumEvidence: false,
    replayFingerprint: 'adaptive-equilibrium:test-invariant-fingerprint',
    generatedAt: '2026-05-13T11:00:00.000Z',
    heatmapSnapshot: null,
  }
}

test('semanticReplayHydrationInvariant enforces non-null replay payload and adaptive evidence integrity', async () => {
  const harness = await createHarness()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.connection)
    const first = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveInput(),
      authority: {
        source: 'test.semanticReplayHydrationInvariant',
      },
    })
    const replayed = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveInput(),
      authority: {
        source: 'test.semanticReplayHydrationInvariant',
      },
    })

    assert(first.evidence)
    assert(replayed.evidence)
    assert.equal(typeof replayed.evidence.evidenceId, 'string')
    assert.equal(replayed.evidence.evidenceId.length > 0, true)
    assert.equal(replayed.replayMetadata.canonicalShapeVerified, true)

    const replayRows = await harness.connection.all<Array<{
      replay_result_state: string
      semantic_integrity: string
      payload_snapshot: string
    }>>(
      `
        SELECT replay_result_state, semantic_integrity, payload_snapshot
        FROM flowmind_semantic_replay_result
      `,
    )

    assert.equal(replayRows.length > 0, true)
    for (const row of replayRows) {
      assert.notEqual(row.payload_snapshot, 'null')
      assert.equal(row.replay_result_state !== 'invalid', true)
      assert.equal(row.semantic_integrity !== 'invalid', true)
    }
  } finally {
    await harness.close()
  }
})
