import type { BrandSoulVisualRuntimePatch } from '../../rendering/contracts/BrandSoulVisualRuntimePatch'
import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulState } from '../contracts/BrandSoulState'
import type { BrandSoulVisualState } from './mapCognitiveToVisualState'

function clamp(value: number, min = 0.7, max = 1.3) {
  return Math.min(max, Math.max(min, value))
}

export function buildBrandSoulVisualRuntimePatch(args: {
  decision: BrandSoulDecision
  visualState: BrandSoulVisualState
  currentState: BrandSoulState
}): BrandSoulVisualRuntimePatch {
  const { decision, visualState, currentState } = args
  const actionBias =
    decision.action === 'sell'
      ? 0.08
      : decision.action === 'guide'
        ? 0.04
        : decision.action === 'support'
          ? -0.06
          : decision.action === 'refuse'
            ? -0.02
            : 0
  const containmentBias = (visualState.stability - 0.5) * 0.12
  const tensionBias = (visualState.tensionLevel - 0.5) * 0.22
  const fieldBias = (visualState.fieldSpread - 0.5) * 0.24
  const coreBias = (visualState.coreActivity - 0.5) * 0.24

  return {
    shape: {
      fillAlphaMultiplier: clamp(0.96 + containmentBias * 0.4 + actionBias * 0.2),
      edgeAlphaMultiplier: clamp(0.98 + tensionBias * 0.42 + (decision.action === 'refuse' ? 0.06 : 0)),
      edgeWidthMultiplier: clamp(0.98 + tensionBias * 0.36 + (decision.action === 'refuse' ? 0.08 : 0), 0.82, 1.24),
      detailAlphaMultiplier: clamp(0.94 + tensionBias * 0.34 + coreBias * 0.12),
      pulseMultiplier: clamp(0.92 + tensionBias * 0.28 + actionBias, 0.76, 1.26),
      rhythmSpeedMultiplier: clamp(0.94 + currentState.energyLevel * 0.14 + actionBias * 0.4, 0.8, 1.24),
    },
    core: {
      radiusMultiplier: clamp(0.96 + coreBias * 0.5 + (decision.action === 'sell' ? 0.06 : 0), 0.84, 1.24),
      baseAlphaMultiplier: clamp(0.96 + coreBias * 0.28),
      accentAlphaMultiplier: clamp(0.98 + coreBias * 0.36 + actionBias * 0.4),
      detailAlphaMultiplier: clamp(0.96 + tensionBias * 0.28 + coreBias * 0.26),
      pulseMultiplier: clamp(0.94 + tensionBias * 0.38 + coreBias * 0.22 + actionBias * 0.7, 0.74, 1.3),
      rhythmSpeedMultiplier: clamp(0.92 + currentState.energyLevel * 0.18 + actionBias * 0.4, 0.8, 1.28),
    },
    field: {
      spreadMultiplier: clamp(0.92 + fieldBias * 0.54 + (decision.action === 'support' ? -0.06 : 0), 0.76, 1.22),
      baseAlphaMultiplier: clamp(0.94 + fieldBias * 0.18 + containmentBias * 0.14),
      accentAlphaMultiplier: clamp(0.96 + tensionBias * 0.28 + actionBias * 0.4),
      detailAlphaMultiplier: clamp(0.94 + tensionBias * 0.26 + fieldBias * 0.18),
      pulseMultiplier: clamp(0.9 + tensionBias * 0.32 + fieldBias * 0.2 + actionBias * 0.4, 0.74, 1.26),
      rhythmSpeedMultiplier: clamp(0.92 + currentState.energyLevel * 0.14 + actionBias * 0.4, 0.8, 1.24),
    },
    particles: {
      alphaMultiplier: clamp(0.92 + tensionBias * 0.18 + (decision.action === 'support' ? -0.08 : 0), 0.7, 1.18),
      sizeMultiplier: clamp(0.96 + coreBias * 0.14, 0.8, 1.18),
      speedMultiplier: clamp(0.98 + tensionBias * 0.28 + actionBias * 0.5, 0.76, 1.24),
      densityMultiplier: clamp(0.9 + tensionBias * 0.18 + (decision.action === 'support' ? -0.06 : 0), 0.7, 1.18),
      spreadMultiplier: clamp(0.9 + fieldBias * 0.36 + (decision.action === 'support' ? -0.08 : 0), 0.72, 1.22),
    },
    metadata: {
      source: 'brandsoul-cognition',
      decisionIntent: decision.intent,
      actionType: decision.action,
      confidence: decision.confidence,
      visualIntensity: visualState.visualIntensity,
      derivedFromStateAt: currentState.lastUpdatedAt,
    },
  }
}