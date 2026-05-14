import assert from 'node:assert/strict'
import test from 'node:test'

import type { InstitutionalContinuityCapability } from './institutionalContinuityGovernanceService.js'
import { createInstitutionalRecoveryHarness } from './institutionalRecoveryTestHarness.js'

const BLOCKED_CAPABILITIES: InstitutionalContinuityCapability[] = ['sovereign.mutation']

function baseTrigger() {
  return {
    replayIdentityOperationalFreezeStatus: {
      freezeStatus: 'frozen' as const,
      currentManifestHash: 'manifest',
      expectedManifestHash: 'manifest',
      identityFields: ['mode'],
      operationalCouplingFields: [],
      prohibitedFields: [],
      driftDetected: false,
      driftWarnings: [],
      observationModeLocked: true,
    },
    shutdownIntegrityState: 'shutdown_completed' as const,
    startupValidation: {
      continuityMode: 'recovery_required' as const,
      persistenceTruthfulness: 'untrusted' as const,
      recoveryRequired: true,
      unsafeShutdownDetected: true,
      replayContinuityState: 'validated' as const,
      restartIntegrityState: 'unsafe_shutdown_detected' as const,
      blockedCapabilities: BLOCKED_CAPABILITIES,
      failStartup: false,
      reasons: ['lineage reconciliation required'],
    },
  }
}

test('lineage reconciliation restores continuity after reconstructing a missing shutdown marker', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.connection.run(
      `
        INSERT INTO flowmind_runtime_continuity_attestation (
          attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
          checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, reconstructed_on_recovery, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'att-runtime',
      'governance-runtime-plane',
      'continuity:2026-05-12T10:00:00.000Z',
      'lineage-a',
      'replay-a',
      'queue-a',
      'checkpoint-a',
      'runtime_flush',
      'attested',
      0,
      0,
      '2026-05-12T10:00:00.000Z',
    )

    const status = await harness.recoveryGovernance.initializeRecovery({
      ...baseTrigger(),
      runtimeAttestationValidation: {
        attestationIntegrity: 'broken' as const,
        replayVerificationState: 'verified' as const,
        queueContinuityState: 'verified' as const,
        checkpointAttestationState: 'verified' as const,
        lineageContinuityState: 'broken' as const,
        recoveryVerificationState: 'recovery_required' as const,
        brokenAttestationChains: ['missing shutdown_complete attestation for latest continuity epoch continuity:2026-05-12T10:00:00.000Z'],
        blockedCapabilities: BLOCKED_CAPABILITIES,
        shouldFailStartup: false,
        recoveryRequired: true,
      },
    })

    assert.equal(status.lineageReconciliationState, 'verified')
    assert.equal(status.continuityRestorationState, 'verified')
    assert.equal(status.institutionalUnlockAllowed, true)
  } finally {
    await harness.close()
  }
})

test('cold-start bootstrap reconstructs lineage and can unlock when verification passes', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    const status = await harness.recoveryGovernance.initializeRecovery({
      ...baseTrigger(),
      runtimeAttestationValidation: {
        attestationIntegrity: 'broken' as const,
        replayVerificationState: 'verified' as const,
        queueContinuityState: 'fork_detected' as const,
        checkpointAttestationState: 'orphan_detected' as const,
        lineageContinuityState: 'broken' as const,
        recoveryVerificationState: 'recovery_required' as const,
        brokenAttestationChains: ['orphan checkpoint attestation detected'],
        blockedCapabilities: BLOCKED_CAPABILITIES,
        shouldFailStartup: false,
        recoveryRequired: true,
      },
    })

    assert.equal(status.lineageReconciliationState, 'verified')
    assert.equal(status.institutionalUnlockAllowed, true)
  } finally {
    await harness.close()
  }
})
