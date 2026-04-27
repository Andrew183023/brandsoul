import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulDominantStrategy, BrandSoulStrategyBias, BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveDominantStrategy(strategyBias: BrandSoulStrategyBias): BrandSoulDominantStrategy {
  const entries = [
    ['support', strategyBias.supportBias],
    ['exploration', strategyBias.explorationBias],
    ['conversion', strategyBias.conversionBias],
    ['caution', strategyBias.cautionBias],
  ] as const
  const strongest = [...entries].sort((left, right) => right[1] - left[1])[0]

  if (!strongest || strongest[1] < 0.3) {
    return 'balanced'
  }

  return strongest[0]
}

export function initializeBrandSoulStrategyProfile(currentState?: BrandSoulCognitiveState): BrandSoulStrategyProfile {
  const strategyBias: BrandSoulStrategyBias = {
    supportBias: 0.25,
    explorationBias: 0.25,
    conversionBias: 0.25,
    cautionBias: 0.25,
  }

  if (currentState?.currentMode === 'support' || currentState?.dominantDrive === 'clarify') {
    strategyBias.supportBias = clamp(strategyBias.supportBias + 0.08)
    strategyBias.cautionBias = clamp(strategyBias.cautionBias + 0.04)
  }

  if (currentState?.currentMode === 'exploration' || currentState?.dominantDrive === 'explore') {
    strategyBias.explorationBias = clamp(strategyBias.explorationBias + 0.08)
  }

  if (currentState?.currentMode === 'conversion' || currentState?.dominantDrive === 'sell') {
    strategyBias.conversionBias = clamp(strategyBias.conversionBias + 0.08)
  }

  return {
    strategyBias,
    dominantStrategy: resolveDominantStrategy(strategyBias),
    adaptationConfidence: 0.18,
    lastStrategyUpdateAt: new Date().toISOString(),
  }
}