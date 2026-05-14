import { createHash } from 'node:crypto'

import type { AdaptiveInfluenceEnvConfig, RuntimeDeploymentEnvironment } from '../../config/env.js'
import {
  REPLAY_IDENTITY_POLICY_VERSION,
  assessReplayIdentityFreeze,
  getFrozenReplayIdentityFields,
  getReplayIdentityFieldClassificationMatrix,
  type ReplayIdentitySurface,
} from './replayIdentityGovernancePolicy.js'

export type ReplayIdentityFreezeStatus = 'frozen' | 'drift_detected' | 'override_active'

export type ReplayIdentityFreezeDriftWarning = {
  code:
    | 'manifest_hash_mismatch'
    | 'request_metadata_identity_field_in_use'
    | 'prohibited_identity_field_in_use'
    | 'unknown_identity_field'
    | 'observation_mode_config_lock_missing'
    | 'observation_mode_config_lock_violation'
    | 'override_metadata_missing'
    | 'override_expired'
    | 'override_forbidden_high_risk_mode'
    | 'override_active_staging_warning'
  message: string
  fields?: string[]
}

export type ReplayIdentityOverrideActivation = {
  environment: RuntimeDeploymentEnvironment
  until: string
  reason: string
  approver: string
  activatedAt: string
  warningOnly: boolean
}

export type ReplayIdentityFreezeManifest = {
  manifestVersion: number
  identityFieldsBySurface: Record<ReplayIdentitySurface, string[]>
  evidenceDerivedFields: string[]
  operationalConfigFieldsCurrentlyIncluded: string[]
  excludedRequestMetadataFields: string[]
  prohibitedFields: string[]
}

export type ReplayIdentityOperationalFreezeStatus = {
  freezeStatus: ReplayIdentityFreezeStatus
  currentManifestHash: string
  expectedManifestHash: string
  identityFields: string[]
  operationalCouplingFields: string[]
  prohibitedFields: string[]
  driftDetected: boolean
  driftWarnings: ReplayIdentityFreezeDriftWarning[]
  observationModeLocked: boolean
  overrideActivation?: ReplayIdentityOverrideActivation
}

export class ReplayIdentityFreezeValidationError extends Error {
  constructor(
    message: string,
    public readonly status: ReplayIdentityOperationalFreezeStatus,
  ) {
    super(message)
    this.name = 'ReplayIdentityFreezeValidationError'
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

function hashPayload(value: unknown) {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

function dedupe(values: string[]) {
  return [...new Set(values)]
}

function sortValues(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

const FROZEN_REPLAY_IDENTITY_MANIFEST: ReplayIdentityFreezeManifest = {
  manifestVersion: REPLAY_IDENTITY_POLICY_VERSION,
  identityFieldsBySurface: {
    adaptive_influence: [
      'opportunityId',
      'marketSignalId',
      'entityId',
      'baseScore',
      'baseRank',
      'adaptiveMultiplier',
      'finalProjectedScore',
      'projectedRank',
      'rankDelta',
      'blockedReason',
      'rolloutBucket',
      'sampleThresholdSatisfied',
      'projectionMode',
      'weightSources.signal',
      'weightSources.category',
      'weightSources.entity',
      'memoryIds.signal',
      'memoryIds.category',
      'memoryIds.entity',
      'config.enabled',
      'config.mode',
      'config.killSwitchEnabled',
      'config.rolloutPercentage',
      'config.minimumSampleRequirement',
      'config.allowedScopes',
      'evidence.signal.weightId',
      'evidence.category.weightId',
      'evidence.entity.weightId',
    ],
    adaptive_equilibrium: [
      'opportunityId',
      'marketSignalId',
      'baseRank',
      'projectedRank',
      'adaptiveMultiplier',
      'finalProjectedScore',
      'replayFingerprint',
    ],
    governance_timeline: [
      'compatibility',
      'epistemicConfidence',
      'reducers',
      'events',
      'pagination',
    ],
  },
  evidenceDerivedFields: [
    'opportunityId',
    'marketSignalId',
    'entityId',
    'baseScore',
    'baseRank',
    'adaptiveMultiplier',
    'finalProjectedScore',
    'projectedRank',
    'rankDelta',
    'blockedReason',
    'rolloutBucket',
    'sampleThresholdSatisfied',
    'projectionMode',
    'weightSources.signal',
    'weightSources.category',
    'weightSources.entity',
    'memoryIds.signal',
    'memoryIds.category',
    'memoryIds.entity',
    'evidence.signal.weightId',
    'evidence.category.weightId',
    'evidence.entity.weightId',
    'replayFingerprint',
    'classification',
    'recommendation',
    'severity',
    'triggerFactors',
    'longitudinalWindow',
    'sourceEvidenceId',
    'events',
    'reducers',
    'compatibility',
    'epistemicConfidence',
    'pagination',
  ],
  operationalConfigFieldsCurrentlyIncluded: [
    'config.enabled',
    'config.mode',
    'config.killSwitchEnabled',
    'config.rolloutPercentage',
    'config.minimumSampleRequirement',
    'config.allowedScopes',
  ],
  excludedRequestMetadataFields: [
    'generatedAt',
    'recordedAt',
    'requestId',
    'traceId',
    'servedAt',
    'responseTimeMs',
    'requestDurationMs',
    'lastRefreshDurationMs',
  ],
  prohibitedFields: [
    'generatedAt',
    'recordedAt',
    'requestId',
    'traceId',
    'servedAt',
    'responseTimeMs',
    'requestDurationMs',
    'lastRefreshDurationMs',
    'observabilityWritesOnly',
    'observabilityCounters',
    'observabilityTimings',
    'auditWarnings',
    'sourceIp',
    'sourceUserAgent',
    'runtimeName',
  ],
}

export function getFrozenReplayIdentityManifest() {
  return {
    manifestVersion: FROZEN_REPLAY_IDENTITY_MANIFEST.manifestVersion,
    identityFieldsBySurface: {
      adaptive_influence: [...FROZEN_REPLAY_IDENTITY_MANIFEST.identityFieldsBySurface.adaptive_influence],
      adaptive_equilibrium: [...FROZEN_REPLAY_IDENTITY_MANIFEST.identityFieldsBySurface.adaptive_equilibrium],
      governance_timeline: [...FROZEN_REPLAY_IDENTITY_MANIFEST.identityFieldsBySurface.governance_timeline],
    },
    evidenceDerivedFields: [...FROZEN_REPLAY_IDENTITY_MANIFEST.evidenceDerivedFields],
    operationalConfigFieldsCurrentlyIncluded: [...FROZEN_REPLAY_IDENTITY_MANIFEST.operationalConfigFieldsCurrentlyIncluded],
    excludedRequestMetadataFields: [...FROZEN_REPLAY_IDENTITY_MANIFEST.excludedRequestMetadataFields],
    prohibitedFields: [...FROZEN_REPLAY_IDENTITY_MANIFEST.prohibitedFields],
  } satisfies ReplayIdentityFreezeManifest
}

export function buildCurrentReplayIdentityManifest(): ReplayIdentityFreezeManifest {
  const matrix = getReplayIdentityFieldClassificationMatrix()
  const adaptiveIdentityFields = getFrozenReplayIdentityFields('adaptive_influence')
  const operationalSet = new Set(matrix.operationalConfigIdentityFields)

  return {
    manifestVersion: REPLAY_IDENTITY_POLICY_VERSION,
    identityFieldsBySurface: {
      adaptive_influence: adaptiveIdentityFields,
      adaptive_equilibrium: getFrozenReplayIdentityFields('adaptive_equilibrium'),
      governance_timeline: getFrozenReplayIdentityFields('governance_timeline'),
    },
    evidenceDerivedFields: [...matrix.evidenceDerivedIdentityFields],
    operationalConfigFieldsCurrentlyIncluded: dedupe(adaptiveIdentityFields.filter((field) => operationalSet.has(field))),
    excludedRequestMetadataFields: [...matrix.requestMetadataFields],
    prohibitedFields: [...matrix.prohibitedIdentityFields],
  }
}

export function getReplayIdentityManifestHash(manifest: ReplayIdentityFreezeManifest) {
  return hashPayload({
    manifestVersion: manifest.manifestVersion,
    identityFieldsBySurface: {
      adaptive_influence: sortValues(manifest.identityFieldsBySurface.adaptive_influence),
      adaptive_equilibrium: sortValues(manifest.identityFieldsBySurface.adaptive_equilibrium),
      governance_timeline: sortValues(manifest.identityFieldsBySurface.governance_timeline),
    },
    evidenceDerivedFields: sortValues(manifest.evidenceDerivedFields),
    operationalConfigFieldsCurrentlyIncluded: sortValues(manifest.operationalConfigFieldsCurrentlyIncluded),
    excludedRequestMetadataFields: sortValues(manifest.excludedRequestMetadataFields),
    prohibitedFields: sortValues(manifest.prohibitedFields),
  })
}

export function buildReplayIdentityOperationalConfigHash(config: AdaptiveInfluenceEnvConfig) {
  return hashPayload({
    'config.enabled': config.enabled,
    'config.mode': config.mode,
    'config.killSwitchEnabled': config.killSwitchEnabled,
    'config.rolloutPercentage': config.rolloutPercentage,
    'config.minimumSampleRequirement': config.minimumSampleRequirement,
    'config.allowedScopes': [...config.allowedScopes].sort((left, right) => left.localeCompare(right)),
  })
}

export function validateReplayIdentityOperationalFreeze(args: {
  adaptiveInfluenceConfig: AdaptiveInfluenceEnvConfig
  observationMode: boolean
  allowOverride: boolean
  runtimeEnvironment?: RuntimeDeploymentEnvironment
  highRiskGovernanceMode?: boolean
  overrideUntil?: string
  overrideReason?: string
  overrideApprover?: string
  now?: string
  expectedObservationConfigHash?: string
  currentManifest?: ReplayIdentityFreezeManifest
  expectedManifest?: ReplayIdentityFreezeManifest
}): ReplayIdentityOperationalFreezeStatus {
  const currentManifest = args.currentManifest ?? buildCurrentReplayIdentityManifest()
  const expectedManifest = args.expectedManifest ?? getFrozenReplayIdentityManifest()
  const currentManifestHash = getReplayIdentityManifestHash(currentManifest)
  const expectedManifestHash = getReplayIdentityManifestHash(expectedManifest)
  const driftWarnings: ReplayIdentityFreezeDriftWarning[] = []
  const runtimeEnvironment = args.runtimeEnvironment ?? 'development'
  const now = args.now ?? new Date().toISOString()

  if (currentManifestHash !== expectedManifestHash) {
    driftWarnings.push({
      code: 'manifest_hash_mismatch',
      message: `Replay identity manifest drift detected. Current hash ${currentManifestHash} does not match expected hash ${expectedManifestHash}.`,
    })
  }

  for (const surface of ['adaptive_influence', 'adaptive_equilibrium', 'governance_timeline'] as const) {
    const assessment = assessReplayIdentityFreeze({
      surface,
      identityFields: currentManifest.identityFieldsBySurface[surface],
    })

    for (const warning of assessment.warnings) {
      if (
        warning.code === 'request_metadata_identity_field_in_use'
        || warning.code === 'prohibited_identity_field_in_use'
        || warning.code === 'unknown_identity_field'
      ) {
        driftWarnings.push({
          code: warning.code,
          message: warning.message,
          fields: [...warning.fields],
        })
      }
    }
  }

  const currentOperationalConfigHash = buildReplayIdentityOperationalConfigHash(args.adaptiveInfluenceConfig)
  let observationModeLocked = false
  let overrideActivation: ReplayIdentityOverrideActivation | undefined

  if (args.observationMode) {
    const expectedLockHash = args.expectedObservationConfigHash?.trim()
    if (!expectedLockHash) {
      driftWarnings.push({
        code: 'observation_mode_config_lock_missing',
        message: 'LONGITUDINAL_OBSERVATION_MODE=true requires REPLAY_IDENTITY_OBSERVATION_CONFIG_LOCK_HASH to lock replay-identity-affecting config fields.',
      })
    } else if (expectedLockHash !== currentOperationalConfigHash) {
      driftWarnings.push({
        code: 'observation_mode_config_lock_violation',
        message: 'Replay-identity-affecting config changed during longitudinal observation mode.',
        fields: expectedManifest.operationalConfigFieldsCurrentlyIncluded,
      })
    } else {
      observationModeLocked = true
    }
  }

  const driftDetected = driftWarnings.length > 0

  if (driftDetected && args.allowOverride) {
    if (args.highRiskGovernanceMode) {
      driftWarnings.push({
        code: 'override_forbidden_high_risk_mode',
        message: 'Replay identity override is forbidden while HIGH_RISK_GOVERNANCE_MODE=true.',
      })
    } else if (runtimeEnvironment === 'production' || runtimeEnvironment === 'staging') {
      const missingFields = [
        isMissing(args.overrideUntil) ? 'REPLAY_IDENTITY_OVERRIDE_UNTIL' : undefined,
        isMissing(args.overrideReason) ? 'REPLAY_IDENTITY_OVERRIDE_REASON' : undefined,
        isMissing(args.overrideApprover) ? 'REPLAY_IDENTITY_OVERRIDE_APPROVER' : undefined,
      ].filter((value): value is string => Boolean(value))

      if (missingFields.length > 0) {
        driftWarnings.push({
          code: 'override_metadata_missing',
          message: `Replay identity override requires metadata: ${missingFields.join(', ')}.`,
          fields: missingFields,
        })
      } else {
        const until = parseOverrideUntil(args.overrideUntil)
        const nowDate = new Date(now)
        if (!until || until.getTime() <= nowDate.getTime()) {
          driftWarnings.push({
            code: 'override_expired',
            message: 'Replay identity override expiration is missing, invalid, or already expired.',
            fields: ['REPLAY_IDENTITY_OVERRIDE_UNTIL'],
          })
        } else {
          overrideActivation = {
            environment: runtimeEnvironment,
            until: until.toISOString(),
            reason: args.overrideReason!.trim(),
            approver: args.overrideApprover!.trim(),
            activatedAt: now,
            warningOnly: runtimeEnvironment === 'staging',
          }

          if (runtimeEnvironment === 'staging') {
            driftWarnings.push({
              code: 'override_active_staging_warning',
              message: 'Replay identity override is active in staging and must remain time-boxed and audited.',
              fields: ['REPLAY_IDENTITY_OVERRIDE_UNTIL', 'REPLAY_IDENTITY_OVERRIDE_REASON', 'REPLAY_IDENTITY_OVERRIDE_APPROVER'],
            })
          }
        }
      }
    } else {
      const until = parseOverrideUntil(args.overrideUntil)
      overrideActivation = {
        environment: runtimeEnvironment,
        until: until?.toISOString() ?? now,
        reason: args.overrideReason?.trim() || 'development override',
        approver: args.overrideApprover?.trim() || 'local-operator',
        activatedAt: now,
        warningOnly: true,
      }
    }
  }

  const overrideBlockingWarnings = new Set<ReplayIdentityFreezeDriftWarning['code']>([
    'override_metadata_missing',
    'override_expired',
    'override_forbidden_high_risk_mode',
  ])
  const overrideAllowed = Boolean(
    args.allowOverride
    && overrideActivation
    && !driftWarnings.some((warning) => overrideBlockingWarnings.has(warning.code)),
  )
  const freezeStatus: ReplayIdentityFreezeStatus = driftDetected
    ? (overrideAllowed ? 'override_active' : 'drift_detected')
    : 'frozen'

  const status: ReplayIdentityOperationalFreezeStatus = {
    freezeStatus,
    currentManifestHash,
    expectedManifestHash,
    identityFields: [...currentManifest.identityFieldsBySurface.adaptive_influence],
    operationalCouplingFields: [...currentManifest.operationalConfigFieldsCurrentlyIncluded],
    prohibitedFields: [...currentManifest.prohibitedFields],
    driftDetected,
    driftWarnings,
    observationModeLocked,
    overrideActivation,
  }

  if (driftDetected && !overrideAllowed) {
    throw new ReplayIdentityFreezeValidationError(
      'Replay identity operational freeze validation failed at startup.',
      status,
    )
  }

  return status
}

function isMissing(value: string | undefined) {
  return !value || value.trim().length === 0
}

function parseOverrideUntil(rawValue: string | undefined) {
  if (isMissing(rawValue)) {
    return null
  }

  const parsed = new Date(rawValue!)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}
