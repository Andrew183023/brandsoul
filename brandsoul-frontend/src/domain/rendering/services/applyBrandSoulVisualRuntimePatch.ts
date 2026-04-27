import type { BrandSoulVisualRuntimePatch, BrandSoulVisualRuntimePatchApplicationPoint } from '../contracts/BrandSoulVisualRuntimePatch'
import type { RuntimeSceneSpec } from '../contracts/RuntimeSceneSpec'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function applyMultiplier(value: number, multiplier = 1, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(max, Math.max(min, value * multiplier))
}

export function applyBrandSoulVisualRuntimePatch(
  runtimeSceneSpec: RuntimeSceneSpec,
  patch?: BrandSoulVisualRuntimePatch,
  options?: {
    applicationPoint: BrandSoulVisualRuntimePatchApplicationPoint
  },
): RuntimeSceneSpec {
  if (!patch) {
    return runtimeSceneSpec
  }

  if (runtimeSceneSpec.modulation?.brandSoulRuntimePatch?.source === 'brandsoul-cognition') {
    return runtimeSceneSpec
  }

  return {
    ...runtimeSceneSpec,
    shape: {
      ...runtimeSceneSpec.shape,
      fillAlpha: clamp(applyMultiplier(runtimeSceneSpec.shape.fillAlpha, patch.shape?.fillAlphaMultiplier)),
      edgeAlpha: clamp(applyMultiplier(runtimeSceneSpec.shape.edgeAlpha, patch.shape?.edgeAlphaMultiplier)),
      edgeWidth: applyMultiplier(runtimeSceneSpec.shape.edgeWidth, patch.shape?.edgeWidthMultiplier, 0.2, 24),
      detailAlpha: clamp(applyMultiplier(runtimeSceneSpec.shape.detailAlpha, patch.shape?.detailAlphaMultiplier)),
      pulse: applyMultiplier(runtimeSceneSpec.shape.pulse, patch.shape?.pulseMultiplier, 0, 2.2),
      rhythmSpeed: applyMultiplier(runtimeSceneSpec.shape.rhythmSpeed, patch.shape?.rhythmSpeedMultiplier, 0.2, 3),
    },
    core: {
      ...runtimeSceneSpec.core,
      radius: applyMultiplier(runtimeSceneSpec.core.radius, patch.core?.radiusMultiplier, 1, 240),
      baseAlpha: clamp(applyMultiplier(runtimeSceneSpec.core.baseAlpha, patch.core?.baseAlphaMultiplier)),
      accentAlpha: clamp(applyMultiplier(runtimeSceneSpec.core.accentAlpha, patch.core?.accentAlphaMultiplier)),
      detailAlpha: clamp(applyMultiplier(runtimeSceneSpec.core.detailAlpha, patch.core?.detailAlphaMultiplier)),
      pulse: applyMultiplier(runtimeSceneSpec.core.pulse, patch.core?.pulseMultiplier, 0, 2.2),
      rhythmSpeed: applyMultiplier(runtimeSceneSpec.core.rhythmSpeed, patch.core?.rhythmSpeedMultiplier, 0.2, 3),
    },
    field: {
      ...runtimeSceneSpec.field,
      spread: applyMultiplier(runtimeSceneSpec.field.spread, patch.field?.spreadMultiplier, 0.1, 3),
      baseAlpha: clamp(applyMultiplier(runtimeSceneSpec.field.baseAlpha, patch.field?.baseAlphaMultiplier)),
      accentAlpha: clamp(applyMultiplier(runtimeSceneSpec.field.accentAlpha, patch.field?.accentAlphaMultiplier)),
      detailAlpha: clamp(applyMultiplier(runtimeSceneSpec.field.detailAlpha, patch.field?.detailAlphaMultiplier)),
      pulse: applyMultiplier(runtimeSceneSpec.field.pulse, patch.field?.pulseMultiplier, 0, 2.2),
      rhythmSpeed: applyMultiplier(runtimeSceneSpec.field.rhythmSpeed, patch.field?.rhythmSpeedMultiplier, 0.2, 3),
    },
    particles: {
      ...runtimeSceneSpec.particles,
      alpha: clamp(applyMultiplier(runtimeSceneSpec.particles.alpha, patch.particles?.alphaMultiplier)),
      sizeMultiplier: applyMultiplier(runtimeSceneSpec.particles.sizeMultiplier, patch.particles?.sizeMultiplier, 0.1, 3),
      speedMultiplier: applyMultiplier(runtimeSceneSpec.particles.speedMultiplier, patch.particles?.speedMultiplier, 0.1, 3),
      densityMultiplier: applyMultiplier(runtimeSceneSpec.particles.densityMultiplier, patch.particles?.densityMultiplier, 0.05, 3),
      spread: applyMultiplier(runtimeSceneSpec.particles.spread, patch.particles?.spreadMultiplier, 0.1, 3),
    },
    composition: {
      ...runtimeSceneSpec.composition,
      intensity: patch.metadata?.visualIntensity ?? runtimeSceneSpec.composition.intensity,
    },
    modulation: {
      ...runtimeSceneSpec.modulation,
      brandSoulRuntimePatch: {
        source: 'brandsoul-cognition',
        applicationPoint: options?.applicationPoint ?? 'consumer-local',
        decisionIntent: patch.metadata?.decisionIntent,
        actionType: patch.metadata?.actionType,
        confidence: patch.metadata?.confidence,
        derivedFromStateAt: patch.metadata?.derivedFromStateAt,
      },
    },
  }
}