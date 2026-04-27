import type { BrandSoulIdentityProfile } from '../contracts/BrandSoulIdentityProfile'
import type { BrandSoulCognitiveDrive, BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveBaselineDrive(baseIdentity: BrandSoulIdentityProfile): BrandSoulCognitiveDrive {
  if (baseIdentity.commercialRole === 'seller' || baseIdentity.commercialRole === 'concierge') {
    return 'sell'
  }

  if (baseIdentity.relationalStyle.primaryMode === 'guide' || baseIdentity.relationalStyle.primaryMode === 'advisor') {
    return 'explore'
  }

  if (baseIdentity.relationalStyle.primaryMode === 'guardian') {
    return 'clarify'
  }

  return 'assist'
}

function resolveBaselineTension(baseIdentity: BrandSoulIdentityProfile) {
  const toneBias =
    baseIdentity.tone.primary === 'direct'
      ? 0.08
      : baseIdentity.tone.primary === 'confident'
        ? 0.06
        : baseIdentity.tone.primary === 'consultative'
          ? 0.02
          : baseIdentity.tone.primary === 'warm' || baseIdentity.tone.primary === 'welcoming'
            ? -0.04
            : 0

  const roleBias =
    baseIdentity.commercialRole === 'seller'
      ? 0.08
      : baseIdentity.commercialRole === 'consultant' || baseIdentity.commercialRole === 'guide'
        ? 0.02
        : 0

  return clamp(0.46 + toneBias + roleBias)
}

function resolveBaselineFocus(baseIdentity: BrandSoulIdentityProfile) {
  const roleBias =
    baseIdentity.commercialRole === 'seller' || baseIdentity.commercialRole === 'consultant'
      ? 0.08
      : baseIdentity.commercialRole === 'educator'
        ? 0.05
        : 0.03

  const modeBias =
    baseIdentity.relationalStyle.primaryMode === 'guide' || baseIdentity.relationalStyle.primaryMode === 'advisor'
      ? 0.06
      : baseIdentity.relationalStyle.primaryMode === 'host'
        ? -0.02
        : 0

  return clamp(0.5 + roleBias + modeBias)
}

function resolveBaselineEngagement(baseIdentity: BrandSoulIdentityProfile) {
  const modeBias =
    baseIdentity.relationalStyle.primaryMode === 'host' || baseIdentity.relationalStyle.primaryMode === 'companion'
      ? 0.08
      : baseIdentity.relationalStyle.primaryMode === 'seller'
        ? 0.04
        : 0.05

  return clamp(0.48 + modeBias)
}

function resolveBaselineStability(baseIdentity: BrandSoulIdentityProfile) {
  const guardrailBias = Math.min(baseIdentity.guardrails.length, 3) * 0.03
  const immutableBias = Math.min(baseIdentity.immutableTraits.length, 4) * 0.025
  const ruleBias = Math.min(baseIdentity.identityRules.length, 3) * 0.03

  return clamp(0.62 + guardrailBias + immutableBias + ruleBias)
}

export function initializeBrandSoulCognitiveState(baseIdentity: BrandSoulIdentityProfile): BrandSoulCognitiveState {
  return {
    currentMode: 'neutral',
    tensionLevel: resolveBaselineTension(baseIdentity),
    focusLevel: resolveBaselineFocus(baseIdentity),
    engagementLevel: resolveBaselineEngagement(baseIdentity),
    dominantDrive: resolveBaselineDrive(baseIdentity),
    stability: resolveBaselineStability(baseIdentity),
    adaptationMomentum: 0.18,
    lastStateUpdateAt: new Date().toISOString(),
  }
}