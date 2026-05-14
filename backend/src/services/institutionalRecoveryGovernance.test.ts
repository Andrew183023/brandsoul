import assert from 'node:assert/strict'
import test from 'node:test'

import type { InstitutionalContinuityCapability } from './institutionalContinuityGovernanceService.js'
import { createInstitutionalRecoveryHarness } from './institutionalRecoveryTestHarness.js'

const BLOCKED_CAPABILITIES: InstitutionalContinuityCapability[] = ['sovereign.mutation', 'governance.approval']

function buildStartupValidation(overrides: Partial<{
  recoveryRequired: boolean
  failStartup: boolean
  reasons: string[]
}> = {}) {
  return {
    continuityMode: 'recovery_required' as const,
    persistenceTruthfulness: 'untrusted' as const,
    recoveryRequired: overrides.recoveryRequired ?? true,
    unsafeShutdownDetected: true,
    replayContinuityState: 'validated' as const,
    restartIntegrityState: 'unsafe_shutdown_detected' as const,
    blockedCapabilities: BLOCKED_CAPABILITIES,
    failStartup: overrides.failStartup ?? false,
    reasons: overrides.reasons ?? ['governed recovery required'],
  }
}

function buildAttestationValidation(overrides: Partial<{
  recoveryRequired: boolean
  replayVerificationState: 'verified' | 'failed' | 'missing'
  queueContinuityState: 'verified' | 'fork_detected' | 'interrupted_drain' | 'missing'
  checkpointAttestationState: 'verified' | 'orphan_detected' | 'failed' | 'missing'
  lineageContinuityState: 'verified' | 'broken' | 'missing'
  brokenAttestationChains: string[]
}> = {}) {
  return {
    attestationIntegrity: overrides.recoveryRequired === false ? 'verified' as const : 'broken' as const,
    replayVerificationState: overrides.replayVerificationState ?? 'verified',
    queueContinuityState: overrides.queueContinuityState ?? 'verified',
    checkpointAttestationState: overrides.checkpointAttestationState ?? 'verified',
    lineageContinuityState: overrides.lineageContinuityState ?? 'verified',
    recoveryVerificationState: overrides.recoveryRequired === false ? 'verified' as const : 'recovery_required' as const,
    brokenAttestationChains: overrides.brokenAttestationChains ?? ['missing shutdown completion attestation'],
    blockedCapabilities: BLOCKED_CAPABILITIES,
    shouldFailStartup: false,
    recoveryRequired: overrides.recoveryRequired ?? true,
  }
}

async function seedRecoverableEpoch(connection: Awaited<ReturnType<typeof createInstitutionalRecoveryHarness>>['connection']) {
  const epoch = 'continuity:2026-05-12T10:00:00.000Z'
  await connection.run(
    `
      INSERT INTO flowmind_runtime_continuity_attestation (
        attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
        checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, reconstructed_on_recovery, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'att-runtime',
    'governance-runtime-plane',
    epoch,
    'lineage-1',
    'replay-1',
    'queue-1',
    'checkpoint-1',
    'runtime_flush',
    'attested',
    0,
    0,
    '2026-05-12T10:00:00.000Z',
  )
  await connection.run(
    `
      INSERT INTO flowmind_runtime_continuity_attestation (
        attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
        checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, reconstructed_on_recovery, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'att-replay',
    'replay-runtime-plane',
    epoch,
    'lineage-2',
    'replay-1',
    'queue-1',
    'checkpoint-1',
    'replay_flush',
    'attested',
    0,
    0,
    '2026-05-12T10:00:01.000Z',
  )
  await connection.run(
    `
      INSERT INTO flowmind_runtime_continuity_attestation (
        attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
        checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, reconstructed_on_recovery, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'att-queue',
    'mutation-queue',
    epoch,
    'lineage-3',
    'replay-1',
    'queue-1',
    'checkpoint-1',
    'queue_drain',
    'attested',
    0,
    0,
    '2026-05-12T10:00:02.000Z',
  )
  await connection.run(
    `
      INSERT INTO flowmind_runtime_continuity_attestation (
        attestation_id, runtime_id, continuity_epoch, lineage_hash, replay_fingerprint, queue_fingerprint,
        checkpoint_fingerprint, shutdown_phase, attestation_status, verified_on_recovery, reconstructed_on_recovery, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'att-checkpoint',
    'checkpoint-store',
    epoch,
    'lineage-4',
    'replay-1',
    'queue-1',
    'checkpoint-1',
    'checkpoint_flush',
    'attested',
    0,
    0,
    '2026-05-12T10:00:03.000Z',
  )
}

function buildFreezeStatus(overrides: Partial<{
  freezeStatus: 'frozen' | 'drift_detected' | 'override_active'
  driftDetected: boolean
}> = {}) {
  return {
    freezeStatus: overrides.freezeStatus ?? 'frozen',
    currentManifestHash: 'manifest',
    expectedManifestHash: 'manifest',
    identityFields: ['mode'],
    operationalCouplingFields: [],
    prohibitedFields: [],
    driftDetected: overrides.driftDetected ?? false,
    driftWarnings: [],
    observationModeLocked: true,
  }
}

function buildColdStartAttestationValidation() {
  return buildAttestationValidation({
    replayVerificationState: 'missing',
    queueContinuityState: 'missing',
    checkpointAttestationState: 'missing',
    lineageContinuityState: 'missing',
    brokenAttestationChains: ['missing runtime continuity attestation chain'],
  })
}

test('recovery_required enters governed workflow and persists recovery attestation', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await seedRecoverableEpoch(harness.connection)

    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: {
        freezeStatus: 'frozen',
        currentManifestHash: 'manifest',
        expectedManifestHash: 'manifest',
        identityFields: ['mode'],
        operationalCouplingFields: [],
        prohibitedFields: [],
        driftDetected: false,
        driftWarnings: [],
        observationModeLocked: true,
      },
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation(),
      runtimeAttestationValidation: buildAttestationValidation(),
    })

    assert.equal(status.recoveryState, 'recovery_complete')
    assert.equal(status.institutionalUnlockAllowed, true)

    const row = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_recovery_attestation',
    )
    assert.equal(row?.count, 1)
  } finally {
    await harness.close()
  }
})

test('recovery lockdown blocks mutations until institutional unlock is granted', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: {
        freezeStatus: 'drift_detected',
        currentManifestHash: 'manifest-a',
        expectedManifestHash: 'manifest-b',
        identityFields: ['mode'],
        operationalCouplingFields: [],
        prohibitedFields: [],
        driftDetected: true,
        driftWarnings: [{
          code: 'manifest_hash_mismatch',
          message: 'drift',
        }],
        observationModeLocked: true,
      },
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation({
        reasons: ['replay drift requires recovery'],
      }),
      runtimeAttestationValidation: buildAttestationValidation({
        replayVerificationState: 'failed',
        lineageContinuityState: 'broken',
        brokenAttestationChains: ['replay drift'],
      }),
    })

    await assert.rejects(() => harness.gate.evaluateAndExecute({
      authoritySource: 'test.recovery.lockdown',
      context: {
        mutationType: 'test.recovery.mutation',
        mutationScope: 'entity',
        requestedCapability: 'sovereign.mutation',
        runtimeMode: 'normal',
        continuityMode: 'institutional_safe',
        replayVerificationState: 'verified',
        attestationIntegrity: 'verified',
        recoveryRequired: false,
        actor: 'admin',
        traceId: 'trace:recovery:block',
      },
      work: async () => 'blocked',
    }))
  } finally {
    await harness.close()
  }
})

test('semantic continuity mismatch blocks institutional unlock', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.connection.run(
      `
        INSERT INTO flowmind_semantic_mutation_attestation (
          intent_id, effect_id, domain, intent_type, semantic_purpose, institutional_meaning, risk_level,
          replay_relevant, continuity_relevant, auth_relevant, before_fingerprint, after_fingerprint,
          replay_fingerprint, continuity_lineage_hash, mutation_lineage_hash, verified, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'intent-a',
      'effect-a',
      'governance',
      'timeline.append',
      'record meaning',
      'meaning-a',
      'high',
      1,
      1,
      0,
      'before',
      'after',
      'replay-a',
      'lineage-a',
      'shared-lineage',
      1,
      '2026-05-13T00:00:00.000Z',
    )
    await harness.connection.run(
      `
        INSERT INTO flowmind_semantic_mutation_attestation (
          intent_id, effect_id, domain, intent_type, semantic_purpose, institutional_meaning, risk_level,
          replay_relevant, continuity_relevant, auth_relevant, before_fingerprint, after_fingerprint,
          replay_fingerprint, continuity_lineage_hash, mutation_lineage_hash, verified, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'intent-b',
      'effect-b',
      'governance',
      'timeline.append',
      'record meaning',
      'meaning-b',
      'high',
      1,
      1,
      0,
      'before',
      'after',
      'replay-b',
      'lineage-b',
      'shared-lineage',
      1,
      '2026-05-13T00:00:01.000Z',
    )

    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: {
        freezeStatus: 'frozen',
        currentManifestHash: 'manifest',
        expectedManifestHash: 'manifest',
        identityFields: ['mode'],
        operationalCouplingFields: [],
        prohibitedFields: [],
        driftDetected: false,
        driftWarnings: [],
        observationModeLocked: true,
      },
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation({
        reasons: ['semantic continuity verification required'],
      }),
      runtimeAttestationValidation: buildAttestationValidation({
        recoveryRequired: false,
        brokenAttestationChains: [],
      }),
    })

    assert.equal(status.institutionalUnlockAllowed, false)
    assert.equal(status.semanticIntegrityState, 'failed')
  } finally {
    await harness.close()
  }
})

test('reconstructed attestations are explicit and marked as reconstructed', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await seedRecoverableEpoch(harness.connection)

    await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: {
        freezeStatus: 'frozen',
        currentManifestHash: 'manifest',
        expectedManifestHash: 'manifest',
        identityFields: ['mode'],
        operationalCouplingFields: [],
        prohibitedFields: [],
        driftDetected: false,
        driftWarnings: [],
        observationModeLocked: true,
      },
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation(),
      runtimeAttestationValidation: buildAttestationValidation(),
    })

    const row = await harness.connection.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM flowmind_runtime_continuity_attestation
        WHERE reconstructed_on_recovery = 1
          AND reconstruction_source = 'institutional_recovery_governance'
      `,
    )
    assert.equal(row?.count, 1)
  } finally {
    await harness.close()
  }
})

test('missing full attestation chain triggers cold-start bootstrap', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation(),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    assert.equal(status.recoveryState, 'recovery_complete')
    const row = await harness.connection.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM flowmind_runtime_continuity_attestation
        WHERE continuity_epoch LIKE 'continuity:bootstrap:%'
      `,
    )
    assert.equal((row?.count ?? 0) > 0, true)
  } finally {
    await harness.close()
  }
})

test('bootstrap creates reconstructed attestations', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation(),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    const row = await harness.connection.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM flowmind_runtime_continuity_attestation
        WHERE reconstructed_on_recovery = 1
          AND reconstruction_source = 'cold_start_recovery_bootstrap'
          AND continuity_epoch LIKE 'continuity:bootstrap:%'
      `,
    )

    assert.equal(row?.count, 5)
  } finally {
    await harness.close()
  }
})

test('bootstrap unlocks only when replay freeze is valid', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus({
        freezeStatus: 'frozen',
        driftDetected: false,
      }),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation(),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    assert.equal(status.recoveryState, 'recovery_complete')
    assert.equal(status.institutionalUnlockAllowed, true)
  } finally {
    await harness.close()
  }
})

test('bootstrap fails if replay drift exists', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus({
        freezeStatus: 'drift_detected',
        driftDetected: true,
      }),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation({
        reasons: ['replay freeze drift detected'],
      }),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    assert.equal(status.recoveryState, 'recovery_failed')
    assert.equal(status.institutionalUnlockAllowed, false)
  } finally {
    await harness.close()
  }
})

test('bootstrap fails if semantic continuity has invalid rows', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.connection.run(
      `
        INSERT INTO flowmind_semantic_mutation_attestation (
          intent_id, effect_id, domain, intent_type, semantic_purpose, institutional_meaning, risk_level,
          replay_relevant, continuity_relevant, auth_relevant, before_fingerprint, after_fingerprint,
          replay_fingerprint, continuity_lineage_hash, mutation_lineage_hash, verified, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'intent-invalid',
      'effect-invalid',
      'governance',
      'timeline.append',
      'invalid continuity row',
      'meaning-invalid',
      'high',
      1,
      1,
      0,
      'before',
      'after',
      'replay-invalid',
      'lineage-invalid',
      'mutation-invalid',
      0,
      '2026-05-13T00:00:00.000Z',
    )

    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation({
        reasons: ['semantic continuity validation required'],
      }),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    assert.equal(status.recoveryState, 'recovery_failed')
    assert.equal(status.institutionalUnlockAllowed, false)
    assert.equal(status.semanticIntegrityState, 'failed')
  } finally {
    await harness.close()
  }
})

test('recovery attestation records bootstrap source', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation(),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    const row = await harness.connection.get<{ recovery_metadata_json: string | null }>(
      `
        SELECT recovery_metadata_json
        FROM flowmind_recovery_attestation
        ORDER BY started_at DESC
        LIMIT 1
      `,
    )

    const metadata = row?.recovery_metadata_json ?? ''
    assert.equal(metadata.includes('cold_start_recovery_bootstrap'), true)
  } finally {
    await harness.close()
  }
})

test('startup proceeds only after institutionalUnlockAllowed=true', async () => {
  const successHarness = await createInstitutionalRecoveryHarness()
  const failureHarness = await createInstitutionalRecoveryHarness()

  try {
    const startupValidation = buildStartupValidation({
      failStartup: false,
    })

    const unlocked = await successHarness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation,
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    const blocked = await failureHarness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus({
        freezeStatus: 'drift_detected',
        driftDetected: true,
      }),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation,
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    const canStart = !startupValidation.failStartup && unlocked.institutionalUnlockAllowed
    const canStartBlocked = !startupValidation.failStartup && blocked.institutionalUnlockAllowed

    assert.equal(canStart, true)
    assert.equal(canStartBlocked, false)
  } finally {
    await successHarness.close()
    await failureHarness.close()
  }
})

test('bootstrap fails when auth sovereignty state is unsafe', async () => {
  const harness = await createInstitutionalRecoveryHarness()

  try {
    await harness.connection.run(
      `
        INSERT INTO flowmind_auth_sovereign_attestation (
          mutation_id,
          auth_scope,
          governance_decision,
          continuity_mode,
          runtime_mode,
          replay_verification_state,
          attestation_integrity,
          actor,
          target_user_id,
          target_tenant_id,
          target_session_id,
          lineage_hash,
          persisted,
          executed,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'auth-unsafe-1',
      'session.revoke',
      'blocked',
      'recovery_required',
      'degraded',
      'failed',
      'broken',
      'admin',
      '1',
      '1',
      null,
      'lineage-auth-unsafe',
      1,
      0,
      '2026-05-13T00:00:00.000Z',
    )

    const status = await harness.recoveryGovernance.initializeRecovery({
      replayIdentityOperationalFreezeStatus: buildFreezeStatus(),
      shutdownIntegrityState: 'shutdown_completed',
      startupValidation: buildStartupValidation({
        reasons: ['auth sovereignty verification required'],
      }),
      runtimeAttestationValidation: buildColdStartAttestationValidation(),
    })

    assert.equal(status.recoveryState, 'recovery_failed')
    assert.equal(status.institutionalUnlockAllowed, false)
    assert.equal(status.continuityRestorationState, 'failed')
  } finally {
    await harness.close()
  }
})
