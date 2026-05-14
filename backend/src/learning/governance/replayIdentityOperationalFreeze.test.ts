import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCurrentReplayIdentityManifest,
  buildReplayIdentityOperationalConfigHash,
  getFrozenReplayIdentityManifest,
  validateReplayIdentityOperationalFreeze,
  type ReplayIdentityFreezeManifest,
  ReplayIdentityFreezeValidationError,
} from './replayIdentityOperationalFreeze.js'
import type { AdaptiveInfluenceEnvConfig } from '../../config/env.js'

const baselineAdaptiveConfig: AdaptiveInfluenceEnvConfig = {
  enabled: false,
  mode: 'off',
  rolloutPercentage: 0,
  killSwitchEnabled: false,
  minimumSampleRequirement: 3,
  allowedScopes: ['signal', 'category', 'entity'],
  boundedMin: 0.75,
  boundedMax: 1.35,
}

test('unchanged replay identity manifest passes operational freeze validation', () => {
  const status = validateReplayIdentityOperationalFreeze({
    adaptiveInfluenceConfig: baselineAdaptiveConfig,
    observationMode: false,
    allowOverride: false,
  })

  assert.equal(status.freezeStatus, 'frozen')
  assert.equal(status.driftDetected, false)
  assert.equal(status.currentManifestHash, status.expectedManifestHash)
})

test('added identity field fails without version bump or override', () => {
  const current = buildCurrentReplayIdentityManifest()
  const mutated: ReplayIdentityFreezeManifest = {
    ...current,
    identityFieldsBySurface: {
      ...current.identityFieldsBySurface,
      adaptive_influence: [...current.identityFieldsBySurface.adaptive_influence, 'config.syntheticField'],
    },
  }

  assert.throws(() => {
    validateReplayIdentityOperationalFreeze({
      adaptiveInfluenceConfig: baselineAdaptiveConfig,
      observationMode: false,
      allowOverride: false,
      currentManifest: mutated,
      expectedManifest: getFrozenReplayIdentityManifest(),
    })
  }, (error: unknown) => {
    assert.equal(error instanceof ReplayIdentityFreezeValidationError, true)
    const typed = error as ReplayIdentityFreezeValidationError
    assert.equal(typed.status.driftDetected, true)
    assert.equal(typed.status.driftWarnings.some((warning) => warning.code === 'manifest_hash_mismatch'), true)
    return true
  })
})

test('prohibited replay identity fields fail operational freeze validation', () => {
  const current = buildCurrentReplayIdentityManifest()
  const mutated: ReplayIdentityFreezeManifest = {
    ...current,
    identityFieldsBySurface: {
      ...current.identityFieldsBySurface,
      adaptive_influence: [...current.identityFieldsBySurface.adaptive_influence, 'runtimeName'],
    },
  }

  assert.throws(() => {
    validateReplayIdentityOperationalFreeze({
      adaptiveInfluenceConfig: baselineAdaptiveConfig,
      observationMode: false,
      allowOverride: false,
      currentManifest: mutated,
    })
  }, (error: unknown) => {
    assert.equal(error instanceof ReplayIdentityFreezeValidationError, true)
    const typed = error as ReplayIdentityFreezeValidationError
    assert.equal(typed.status.driftWarnings.some((warning) => warning.code === 'prohibited_identity_field_in_use'), true)
    return true
  })
})

test('request metadata fields remain excluded from replay identity during freeze validation', () => {
  const status = validateReplayIdentityOperationalFreeze({
    adaptiveInfluenceConfig: baselineAdaptiveConfig,
    observationMode: false,
    allowOverride: false,
  })

  assert.equal(
    status.driftWarnings.some((warning) => warning.code === 'request_metadata_identity_field_in_use'),
    false,
  )
  assert.equal(status.identityFields.includes('generatedAt'), false)
})

test('observation mode locks replay identity affecting config fields', () => {
  const expectedConfigHash = buildReplayIdentityOperationalConfigHash(baselineAdaptiveConfig)
  const lockedStatus = validateReplayIdentityOperationalFreeze({
    adaptiveInfluenceConfig: baselineAdaptiveConfig,
    observationMode: true,
    allowOverride: false,
    expectedObservationConfigHash: expectedConfigHash,
  })

  assert.equal(lockedStatus.observationModeLocked, true)

  const changedConfig = {
    ...baselineAdaptiveConfig,
    rolloutPercentage: 5,
  }

  assert.throws(() => {
    validateReplayIdentityOperationalFreeze({
      adaptiveInfluenceConfig: changedConfig,
      observationMode: true,
      allowOverride: false,
      expectedObservationConfigHash: expectedConfigHash,
    })
  }, (error: unknown) => {
    assert.equal(error instanceof ReplayIdentityFreezeValidationError, true)
    const typed = error as ReplayIdentityFreezeValidationError
    assert.equal(
      typed.status.driftWarnings.some((warning) => warning.code === 'observation_mode_config_lock_violation'),
      true,
    )
    return true
  })
})

test('prod override without metadata fails', () => {
  const current = buildCurrentReplayIdentityManifest()
  const mutated: ReplayIdentityFreezeManifest = {
    ...current,
    identityFieldsBySurface: {
      ...current.identityFieldsBySurface,
      adaptive_influence: [...current.identityFieldsBySurface.adaptive_influence, 'config.syntheticField'],
    },
  }

  assert.throws(() => {
    validateReplayIdentityOperationalFreeze({
      adaptiveInfluenceConfig: baselineAdaptiveConfig,
      observationMode: false,
      allowOverride: true,
      runtimeEnvironment: 'production',
      currentManifest: mutated,
    })
  }, (error: unknown) => {
    assert.equal(error instanceof ReplayIdentityFreezeValidationError, true)
    const typed = error as ReplayIdentityFreezeValidationError
    assert.equal(typed.status.freezeStatus, 'drift_detected')
    assert.equal(typed.status.driftWarnings.some((warning) => warning.code === 'override_metadata_missing'), true)
    return true
  })
})

test('expired override fails', () => {
  const current = buildCurrentReplayIdentityManifest()
  const mutated: ReplayIdentityFreezeManifest = {
    ...current,
    identityFieldsBySurface: {
      ...current.identityFieldsBySurface,
      adaptive_influence: [...current.identityFieldsBySurface.adaptive_influence, 'config.syntheticField'],
    },
  }

  assert.throws(() => {
    validateReplayIdentityOperationalFreeze({
      adaptiveInfluenceConfig: baselineAdaptiveConfig,
      observationMode: false,
      allowOverride: true,
      runtimeEnvironment: 'production',
      overrideUntil: '2026-05-01T00:00:00.000Z',
      overrideReason: 'temporary freeze exception',
      overrideApprover: 'operator-b',
      now: '2026-05-12T00:00:00.000Z',
      currentManifest: mutated,
    })
  }, (error: unknown) => {
    assert.equal(error instanceof ReplayIdentityFreezeValidationError, true)
    const typed = error as ReplayIdentityFreezeValidationError
    assert.equal(typed.status.driftWarnings.some((warning) => warning.code === 'override_expired'), true)
    return true
  })
})

test('high-risk override fails', () => {
  const current = buildCurrentReplayIdentityManifest()
  const mutated: ReplayIdentityFreezeManifest = {
    ...current,
    identityFieldsBySurface: {
      ...current.identityFieldsBySurface,
      adaptive_influence: [...current.identityFieldsBySurface.adaptive_influence, 'config.syntheticField'],
    },
  }

  assert.throws(() => {
    validateReplayIdentityOperationalFreeze({
      adaptiveInfluenceConfig: baselineAdaptiveConfig,
      observationMode: false,
      allowOverride: true,
      runtimeEnvironment: 'production',
      highRiskGovernanceMode: true,
      overrideUntil: '2026-05-20T00:00:00.000Z',
      overrideReason: 'temporary freeze exception',
      overrideApprover: 'operator-b',
      now: '2026-05-12T00:00:00.000Z',
      currentManifest: mutated,
    })
  }, (error: unknown) => {
    assert.equal(error instanceof ReplayIdentityFreezeValidationError, true)
    const typed = error as ReplayIdentityFreezeValidationError
    assert.equal(typed.status.driftWarnings.some((warning) => warning.code === 'override_forbidden_high_risk_mode'), true)
    return true
  })
})

test('staging override emits audit warning and remains time-boxed', () => {
  const current = buildCurrentReplayIdentityManifest()
  const mutated: ReplayIdentityFreezeManifest = {
    ...current,
    identityFieldsBySurface: {
      ...current.identityFieldsBySurface,
      adaptive_influence: [...current.identityFieldsBySurface.adaptive_influence, 'config.syntheticField'],
    },
  }

  const status = validateReplayIdentityOperationalFreeze({
    adaptiveInfluenceConfig: baselineAdaptiveConfig,
    observationMode: false,
    allowOverride: true,
    runtimeEnvironment: 'staging',
    overrideUntil: '2026-05-20T00:00:00.000Z',
    overrideReason: 'staging validation window',
    overrideApprover: 'operator-c',
    now: '2026-05-12T00:00:00.000Z',
    currentManifest: mutated,
  })

  assert.equal(status.freezeStatus, 'override_active')
  assert.equal(status.overrideActivation?.warningOnly, true)
  assert.equal(status.driftWarnings.some((warning) => warning.code === 'override_active_staging_warning'), true)
})
