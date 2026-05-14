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
      reasons: ['replay restoration required'],
    },
  }
}

test('replay restoration is deterministic and recovery lineage hash is stable', async () => {
  const harnessA = await createInstitutionalRecoveryHarness()
  const harnessB = await createInstitutionalRecoveryHarness()

  try {
    const trigger = {
      ...baseTrigger(),
      runtimeAttestationValidation: {
        attestationIntegrity: 'verified' as const,
        replayVerificationState: 'verified' as const,
        queueContinuityState: 'verified' as const,
        checkpointAttestationState: 'verified' as const,
        lineageContinuityState: 'verified' as const,
        recoveryVerificationState: 'verified' as const,
        brokenAttestationChains: [],
        blockedCapabilities: BLOCKED_CAPABILITIES,
        shouldFailStartup: false,
        recoveryRequired: true,
      },
    }

    const first = await harnessA.recoveryGovernance.initializeRecovery(trigger)
    const second = await harnessB.recoveryGovernance.initializeRecovery(trigger)

    assert.equal(first.recoveryAttestation?.recoveryLineageHash, second.recoveryAttestation?.recoveryLineageHash)
  } finally {
    await harnessA.close()
    await harnessB.close()
  }
})

test('cold-start bootstrap can restore replay continuity under frozen replay identity', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    const status = await harness.recoveryGovernance.initializeRecovery({
      ...baseTrigger(),
      replayIdentityOperationalFreezeStatus: {
        ...baseTrigger().replayIdentityOperationalFreezeStatus,
        driftDetected: false,
      },
      runtimeAttestationValidation: {
        attestationIntegrity: 'broken' as const,
        replayVerificationState: 'failed' as const,
        queueContinuityState: 'verified' as const,
        checkpointAttestationState: 'verified' as const,
        lineageContinuityState: 'broken' as const,
        recoveryVerificationState: 'recovery_required' as const,
        brokenAttestationChains: ['replay corruption isolated'],
        blockedCapabilities: BLOCKED_CAPABILITIES,
        shouldFailStartup: false,
        recoveryRequired: true,
      },
    })

    assert.equal(status.recoveryState, 'recovery_complete')
    assert.equal(status.replayDriftClassification, 'replay_corruption_isolated')
    assert.equal(status.institutionalUnlockAllowed, true)
  } finally {
    await harness.close()
  }
})
