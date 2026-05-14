import type { AdaptiveInfluenceMode } from './env.js'

const PRODUCTION_ALLOWED_MODES: ReadonlyArray<AdaptiveInfluenceMode> = ['off', 'shadow_compare']
const PRODUCTION_FORBIDDEN_MODE: AdaptiveInfluenceMode = 'live_rank_only'

function logPolicyViolation(details: {
  source: 'startup' | 'runtime'
  nodeEnv: string
  requestedMode: AdaptiveInfluenceMode
  enabled: boolean
  violation: string
  allowedModes: ReadonlyArray<AdaptiveInfluenceMode>
}) {
  console.error('[adaptive-influence] policy.violation', {
    policy: 'adaptive_influence_activation_policy_guard',
    source: details.source,
    nodeEnv: details.nodeEnv,
    requestedMode: details.requestedMode,
    enabled: details.enabled,
    violation: details.violation,
    forbiddenMode: PRODUCTION_FORBIDDEN_MODE,
    allowedModes: details.allowedModes,
    action: 'fail_fast',
  })
}

export function enforceAdaptiveInfluenceProductionPolicy(args: {
  enabled: boolean
  mode: AdaptiveInfluenceMode
  nodeEnv?: string
  source: 'startup' | 'runtime'
}) {
  const nodeEnv = args.nodeEnv ?? process.env.NODE_ENV ?? 'unknown'
  const isProduction = nodeEnv === 'production'
  const isStaging = nodeEnv === 'staging'
  const isTest = nodeEnv === 'test'

  if (args.enabled && !isStaging && !isTest) {
    logPolicyViolation({
      source: args.source,
      nodeEnv,
      requestedMode: args.mode,
      enabled: args.enabled,
      violation: 'enabled_requires_staging_environment',
      allowedModes: ['off'],
    })

    throw new Error(
      `Adaptive influence staging activation policy violation: enabled=true is allowed only when NODE_ENV=staging (received NODE_ENV=${nodeEnv}).`,
    )
  }

  if (args.enabled && args.mode !== 'shadow_compare' && !isTest) {
    logPolicyViolation({
      source: args.source,
      nodeEnv,
      requestedMode: args.mode,
      enabled: args.enabled,
      violation: 'enabled_requires_shadow_compare_mode',
      allowedModes: ['shadow_compare'],
    })

    throw new Error(
      `Adaptive influence staging activation policy violation: enabled=true requires mode "shadow_compare" (received mode="${args.mode}").`,
    )
  }

  if (!isProduction || args.mode !== PRODUCTION_FORBIDDEN_MODE) {
    return
  }

  logPolicyViolation({
    source: args.source,
    nodeEnv,
    requestedMode: args.mode,
    enabled: args.enabled,
    violation: 'production_forbidden_live_rank_only',
    allowedModes: PRODUCTION_ALLOWED_MODES,
  })

  throw new Error(
    `Adaptive influence production policy violation: mode "${args.mode}" is forbidden when NODE_ENV=production. Allowed modes: ${PRODUCTION_ALLOWED_MODES.join(', ')}.`,
  )
}
