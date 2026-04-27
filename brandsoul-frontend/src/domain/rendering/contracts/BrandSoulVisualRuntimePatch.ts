type ManifestationIntensity = 'soft' | 'balanced' | 'cinematic'

export type BrandSoulVisualRuntimePatchApplicationPoint = 'resolve-render-output' | 'consumer-local'

export type BrandSoulCoreRuntimePatch = {
  radiusMultiplier?: number
  baseAlphaMultiplier?: number
  accentAlphaMultiplier?: number
  detailAlphaMultiplier?: number
  pulseMultiplier?: number
  rhythmSpeedMultiplier?: number
}

export type BrandSoulFieldRuntimePatch = {
  spreadMultiplier?: number
  baseAlphaMultiplier?: number
  accentAlphaMultiplier?: number
  detailAlphaMultiplier?: number
  pulseMultiplier?: number
  rhythmSpeedMultiplier?: number
}

export type BrandSoulShapeRuntimePatch = {
  fillAlphaMultiplier?: number
  edgeAlphaMultiplier?: number
  edgeWidthMultiplier?: number
  detailAlphaMultiplier?: number
  pulseMultiplier?: number
  rhythmSpeedMultiplier?: number
}

export type BrandSoulParticleRuntimePatch = {
  alphaMultiplier?: number
  sizeMultiplier?: number
  speedMultiplier?: number
  densityMultiplier?: number
  spreadMultiplier?: number
}

export type BrandSoulVisualRuntimePatchMetadata = {
  source: 'brandsoul-cognition'
  decisionIntent: string
  actionType: string
  confidence: number
  visualIntensity?: ManifestationIntensity
  derivedFromStateAt?: string
}

export type BrandSoulVisualRuntimePatch = {
  core?: BrandSoulCoreRuntimePatch
  field?: BrandSoulFieldRuntimePatch
  shape?: BrandSoulShapeRuntimePatch
  particles?: BrandSoulParticleRuntimePatch
  metadata?: BrandSoulVisualRuntimePatchMetadata
}
