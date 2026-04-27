import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import type { VisualEssence } from '../../../domain/identity/contracts/VisualEssence'
import type { EntityManifestation } from '../../../domain/manifestation/contracts/EntityManifestation'
import type { ManifestationSpec } from '../../../domain/manifestation/contracts/ManifestationSpec'
import type { TimelineState } from '../../../domain/orchestration/contracts/TimelineState'
import type { BrandSoulVisualRuntimePatch } from '../../../domain/rendering/contracts/BrandSoulVisualRuntimePatch'
import type { RenderOutput, ManifestationIntensity } from '../../../domain/rendering/contracts/RenderOutput'
import type { RuntimeSceneSpec, RuntimeStageBudget } from '../../../domain/rendering/contracts/RuntimeSceneSpec'
import { resolveRenderOutput } from '../../../domain/rendering/resolvers/resolveRenderOutput'
import { deriveBaseFormProfile } from '../../../domain/base-form/services/deriveBaseFormProfile'
import { derivePersonaDNA } from '../../../domain/persona-dna/services/derivePersonaDNA'
import { resolvePersonaDNAModulators } from '../../../domain/persona-dna/services/resolvePersonaDNAModulators'

export type PixiLayerVisibility = {
  field?: boolean
  particles?: boolean
  core?: boolean
  debug?: boolean
  liteEffects?: boolean
  shapeOnly?: boolean
}

export type PixiDebugFlags = {
  showDebugOverlay?: boolean
  shapeOnly?: boolean
}

export type PixiSceneSpec = {
  mode: EntityManifestation['mode']
  variant: string
  finalReveal: boolean
  intensity: ManifestationIntensity
  backgroundAlpha: number
  accent: string
  secondary: string
  energy?: string
  neutral?: string
  shapeTint: number
  edgeTint: number
  fillStrategy: EntityManifestation['artDirection']['shapeFillStrategy']
  showField: boolean
  showCore: boolean
  showParticles: boolean
  showDebug: boolean
  shapeOnly: boolean
  originSource?: string
  typographicCandidate: boolean
  archetypeTemperature?: VisualEssence['temperature']
  personaDNA?: EntityProfile['personaDNA']
  timelineProgress?: number
  timelineState?: TimelineState
  fieldPreset?: {
    spread: number
    baseAlpha: number
    accentAlpha: number
    detailAlpha: number
    pulse: number
    rhythmSpeed: number
  }
  fieldBudget?: {
    initial: 'low' | 'medium' | 'high'
    mid: 'low' | 'medium' | 'high'
    climax: 'low' | 'medium' | 'high'
    stabilize: 'low' | 'medium' | 'high'
  }
  particlePreset?: {
    alpha: number
    sizeMultiplier: number
    speedMultiplier: number
    densityMultiplier: number
    emitterConfig?: NonNullable<RenderOutput['particles']['emitterConfig']>
  }
  particleBudget?: {
    initial: 'low' | 'medium' | 'high'
    mid: 'low' | 'medium' | 'high'
    climax: 'low' | 'medium' | 'high'
    stabilize: 'low' | 'medium' | 'high'
  }
  corePreset?: {
    radius: number
    baseAlpha: number
    accentAlpha: number
    detailAlpha: number
    pulse: number
    rhythmSpeed: number
    offsetX: number
    offsetY: number
  }
  shapePreset?: {
    fillAlpha: number
    edgeAlpha: number
    edgeWidth: number
    detailAlpha: number
    pulse: number
    rhythmSpeed: number
  }
  birthTimeline: EntityManifestation['birthTimeline']
  entityFinalForm?: EntityProfile['finalForm']
  runtimeSceneSpec?: RuntimeSceneSpec
  finishPlan?: EntityProfile['visualFinishPlan']
}

function hexToNumber(color: string) {
  const normalized = color.replace('#', '')
  return Number.parseInt(normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized, 16)
}

function resolveParticleColors(args: {
  accent: string
  secondary: string
  energy?: string
  neutral?: string
  emitterColors?: string | string[]
}) {
  const sourceColors = Array.isArray(args.emitterColors)
    ? args.emitterColors
    : args.emitterColors
      ? [args.emitterColors]
      : []

  return [...new Set([args.neutral, args.energy, args.secondary, args.accent, ...sourceColors].filter((color): color is string => Boolean(color)))].slice(0, 5)
}

function buildFieldPreset(args: {
  manifestationSpec: ManifestationSpec
  rendererOutput: RenderOutput
  intensity: ManifestationIntensity
  personaDNA: EntityProfile['personaDNA']
  layerVisibility?: PixiLayerVisibility
}) {
  const { manifestationSpec, rendererOutput, intensity, layerVisibility, personaDNA } = args
  const dnaModulators = resolvePersonaDNAModulators(personaDNA)
  const variant = rendererOutput.animationConfig.rootClassName.match(/manifestation-variant-([a-z0-9-]+)/)?.[1] ?? 'default'
  const signature = rendererOutput.debugShape?.processedShape?.signature ?? rendererOutput.debugShape?.sourceSignature
  const base =
    intensity === 'soft'
      ? { spread: 1.06, baseAlpha: 0.08, accentAlpha: 0.12, detailAlpha: 0.08, pulse: 0.06, rhythmSpeed: 1.1 }
      : intensity === 'cinematic'
        ? { spread: 1.16, baseAlpha: 0.14, accentAlpha: 0.2, detailAlpha: 0.14, pulse: 0.12, rhythmSpeed: 1.8 }
        : { spread: 1.1, baseAlpha: 0.11, accentAlpha: 0.16, detailAlpha: 0.11, pulse: 0.09, rhythmSpeed: 1.4 }

  if (layerVisibility?.liteEffects) {
    return {
      ...base,
      baseAlpha: base.baseAlpha * 0.72,
      accentAlpha: base.accentAlpha * 0.72,
      detailAlpha: base.detailAlpha * 0.72,
      pulse: base.pulse * 0.8,
    }
  }

  if (manifestationSpec.mode === 'centelha') {
    return { ...base, spread: base.spread - 0.05, accentAlpha: base.accentAlpha * 1.1, detailAlpha: base.detailAlpha * 1.15 }
  }
  if (manifestationSpec.mode === 'natureza') {
    return { ...base, spread: base.spread + 0.03, baseAlpha: base.baseAlpha * 1.1, rhythmSpeed: 1 }
  }
  if (manifestationSpec.mode === 'robo-ia') {
    return { ...base, spread: base.spread - 0.04, baseAlpha: base.baseAlpha * 0.7, accentAlpha: base.accentAlpha * 0.9, detailAlpha: base.detailAlpha * 0.9, pulse: base.pulse * 0.5 }
  }

  if (variant === 'agua') {
    return { ...base, spread: base.spread + 0.06, baseAlpha: base.baseAlpha * 0.9, detailAlpha: base.detailAlpha * 0.9 }
  }
  if (variant === 'fogo') {
    return { ...base, spread: base.spread - 0.02, accentAlpha: base.accentAlpha * 1.2, pulse: base.pulse * 1.15, rhythmSpeed: base.rhythmSpeed * 1.15 }
  }
  if (variant === 'terra') {
    return { ...base, spread: base.spread - 0.08, baseAlpha: base.baseAlpha * 1.15, detailAlpha: base.detailAlpha * 1.1, pulse: base.pulse * 0.5 }
  }
  const semanticSpread = signature?.massDistribution === 'spread' ? 0.08 : signature?.massDistribution === 'concentrated' ? -0.04 : 0
  const semanticRhythm = signature?.type === 'fragmentado' ? 1.12 : signature?.symmetry && signature.symmetry > 0.72 ? 0.92 : 1
  return {
    ...base,
    spread: base.spread + 0.08 + semanticSpread + dnaModulators.fieldSpreadBias,
    baseAlpha: base.baseAlpha * 0.82,
    accentAlpha: base.accentAlpha * 0.8,
    detailAlpha: base.detailAlpha * (1 + dnaModulators.fieldAttachment * 0.12),
    pulse: base.pulse * dnaModulators.cadenceMultiplier,
    rhythmSpeed: base.rhythmSpeed * semanticRhythm * dnaModulators.cadenceMultiplier,
  }
}

function buildFieldBudget(args: {
  manifestationSpec: ManifestationSpec
  rendererOutput: RenderOutput
}) {
  const { manifestationSpec, rendererOutput } = args
  const variant = rendererOutput.animationConfig.rootClassName.match(/manifestation-variant-([a-z0-9-]+)/)?.[1] ?? 'default'

  if (manifestationSpec.mode === 'centelha') {
    return {
      initial: 'low',
      mid: 'medium',
      climax: 'high',
      stabilize: 'low',
    } as const
  }

  if (manifestationSpec.mode === 'natureza') {
    return {
      initial: 'low',
      mid: 'low',
      climax: 'medium',
      stabilize: 'low',
    } as const
  }

  if (manifestationSpec.mode === 'robo-ia') {
    return {
      initial: 'low',
      mid: 'low',
      climax: 'medium',
      stabilize: 'low',
    } as const
  }

  if (variant === 'fogo') {
    return {
      initial: 'low',
      mid: 'medium',
      climax: 'high',
      stabilize: 'low',
    } as const
  }

  if (variant === 'agua' || variant === 'terra' || variant === 'ar') {
    return {
      initial: 'low',
      mid: 'low',
      climax: 'medium',
      stabilize: 'low',
    } as const
  }

  return {
    initial: 'low',
    mid: 'medium',
    climax: 'medium',
    stabilize: 'low',
  } as const
}

function buildParticlePreset(args: {
  manifestationSpec: ManifestationSpec
  rendererOutput: RenderOutput
  intensity: ManifestationIntensity
  personaDNA: EntityProfile['personaDNA']
  visualEssence?: VisualEssence
  layerVisibility?: PixiLayerVisibility
}) {
  const { manifestationSpec, rendererOutput, intensity, layerVisibility, visualEssence, personaDNA } = args
  const dnaModulators = resolvePersonaDNAModulators(personaDNA)
  if (!rendererOutput.particles.emitterConfig) {
    return undefined
  }
  const signature = rendererOutput.debugShape?.processedShape?.signature ?? rendererOutput.debugShape?.sourceSignature
  const accent = rendererOutput.animationConfig.styleVars['--persona-lab-accent'] ?? visualEssence?.primaryColor ?? '#ff9460'
  const secondary = rendererOutput.animationConfig.styleVars['--persona-lab-secondary'] ?? visualEssence?.secondaryColor ?? '#6e86ff'
  const energy = rendererOutput.animationConfig.styleVars['--persona-lab-energy'] ?? visualEssence?.energyColor ?? secondary
  const neutral = rendererOutput.animationConfig.styleVars['--persona-lab-neutral'] ?? visualEssence?.neutralColor ?? secondary

  const base =
    intensity === 'soft'
      ? { alpha: 0.52, sizeMultiplier: 0.8, speedMultiplier: 0.84, densityMultiplier: 0.68 }
      : intensity === 'cinematic'
        ? { alpha: 0.86, sizeMultiplier: 1.12, speedMultiplier: 1.16, densityMultiplier: 1.18 }
        : { alpha: 0.68, sizeMultiplier: 1, speedMultiplier: 1, densityMultiplier: 1 }

  const familyAdjusted =
    manifestationSpec.mode === 'centelha'
      ? { ...base, alpha: base.alpha * 1.08, sizeMultiplier: base.sizeMultiplier * 0.86 }
      : manifestationSpec.mode === 'natureza'
        ? { ...base, alpha: base.alpha * 0.84, sizeMultiplier: base.sizeMultiplier * 0.76, speedMultiplier: base.speedMultiplier * 0.88 }
        : manifestationSpec.mode === 'robo-ia'
          ? { ...base, alpha: base.alpha * 0.76, sizeMultiplier: base.sizeMultiplier * 0.72, speedMultiplier: base.speedMultiplier * 0.96 }
          : base

  if (layerVisibility?.liteEffects) {
    return {
      ...familyAdjusted,
      alpha: familyAdjusted.alpha * 0.72,
      densityMultiplier: familyAdjusted.densityMultiplier * 0.68,
      emitterConfig: {
        ...rendererOutput.particles.emitterConfig,
        color: resolveParticleColors({ accent, secondary, energy, neutral, emitterColors: rendererOutput.particles.emitterConfig.color }),
      },
    }
  }

  return {
    ...familyAdjusted,
    densityMultiplier:
      familyAdjusted.densityMultiplier *
      (signature?.fragmentation && signature.fragmentation > 0.6 ? 1.16 : signature?.symmetry && signature.symmetry > 0.72 ? 0.88 : 1) +
      dnaModulators.particleDensityBias,
    speedMultiplier:
      familyAdjusted.speedMultiplier *
      (signature?.massDistribution === 'spread' ? 1.08 : signature?.massDistribution === 'concentrated' ? 0.94 : 1) +
      dnaModulators.particleSpeedBias,
    emitterConfig: {
      ...rendererOutput.particles.emitterConfig,
      color: resolveParticleColors({ accent, secondary, energy, neutral, emitterColors: rendererOutput.particles.emitterConfig.color }),
    },
  }
}

function buildParticleBudget(args: {
  manifestationSpec: ManifestationSpec
  rendererOutput: RenderOutput
}) {
  const { manifestationSpec, rendererOutput } = args
  const variant = rendererOutput.animationConfig.rootClassName.match(/manifestation-variant-([a-z0-9-]+)/)?.[1] ?? 'default'

  if (manifestationSpec.mode === 'centelha') {
    return {
      initial: 'low',
      mid: 'medium',
      climax: 'high',
      stabilize: 'low',
    } as const
  }

  if (manifestationSpec.mode === 'natureza') {
    return {
      initial: 'low',
      mid: 'medium',
      climax: variant === 'energia-verde' ? 'high' : 'medium',
      stabilize: 'low',
    } as const
  }

  if (manifestationSpec.mode === 'robo-ia') {
    return {
      initial: 'low',
      mid: 'low',
      climax: 'medium',
      stabilize: 'low',
    } as const
  }

  if (variant === 'fogo') {
    return {
      initial: 'low',
      mid: 'medium',
      climax: 'high',
      stabilize: 'low',
    } as const
  }

  return {
    initial: 'low',
    mid: 'medium',
    climax: 'medium',
    stabilize: 'low',
  } as const
}

function buildCorePreset(args: {
  manifestationSpec: ManifestationSpec
  rendererOutput: RenderOutput
  intensity: ManifestationIntensity
  personaDNA: EntityProfile['personaDNA']
  layerVisibility?: PixiLayerVisibility
}) {
  const { manifestationSpec, rendererOutput, intensity, layerVisibility, personaDNA } = args
  const dnaModulators = resolvePersonaDNAModulators(personaDNA)
  const variant = rendererOutput.animationConfig.rootClassName.match(/manifestation-variant-([a-z0-9-]+)/)?.[1] ?? 'default'
  const signature = rendererOutput.debugShape?.processedShape?.signature ?? rendererOutput.debugShape?.sourceSignature
  const base =
    intensity === 'soft'
      ? { radius: 10, baseAlpha: 0.24, accentAlpha: 0.2, detailAlpha: 0.18, pulse: 0.06, rhythmSpeed: 1.2, offsetX: 0, offsetY: 0 }
      : intensity === 'cinematic'
        ? { radius: 14, baseAlpha: 0.36, accentAlpha: 0.3, detailAlpha: 0.28, pulse: 0.12, rhythmSpeed: 1.8, offsetX: 0, offsetY: 0 }
        : { radius: 12, baseAlpha: 0.3, accentAlpha: 0.25, detailAlpha: 0.22, pulse: 0.09, rhythmSpeed: 1.5, offsetX: 0, offsetY: 0 }

  const withLite = layerVisibility?.liteEffects
    ? {
        ...base,
        baseAlpha: base.baseAlpha * 0.76,
        accentAlpha: base.accentAlpha * 0.76,
        detailAlpha: base.detailAlpha * 0.76,
        pulse: base.pulse * 0.82,
      }
    : base

  switch (manifestationSpec.mode) {
    case 'centelha':
      return {
        ...withLite,
        radius: withLite.radius + 1 + (signature?.massDistribution === 'concentrated' ? 2 : 0) + dnaModulators.coreRadiusBias * 10,
        accentAlpha: withLite.accentAlpha * 1.15,
        detailAlpha: withLite.detailAlpha * 1.18,
        pulse: withLite.pulse * (1 + dnaModulators.corePulseBias),
        rhythmSpeed: withLite.rhythmSpeed * (signature?.type === 'orbital' ? 0.96 : 1.1) * dnaModulators.cadenceMultiplier,
      }
    case 'natureza':
      return {
        ...withLite,
        radius: withLite.radius - 1.5 + (signature?.massDistribution === 'spread' ? 1 : 0),
        baseAlpha: withLite.baseAlpha * 0.82,
        accentAlpha: withLite.accentAlpha * 0.94,
        offsetY: 4 + dnaModulators.postureLift,
        pulse: withLite.pulse * (1 + dnaModulators.corePulseBias * 0.8),
        rhythmSpeed: (signature?.curvatureRatio && signature.curvatureRatio > 0.62 ? 1.08 : 1.02) * dnaModulators.cadenceMultiplier,
      }
    case 'robo-ia':
      return {
        ...withLite,
        radius: withLite.radius - 0.5 + (signature?.type === 'orbital' ? 1.5 : 0) + dnaModulators.coreRadiusBias * 8,
        baseAlpha: withLite.baseAlpha * 0.88,
        pulse: withLite.pulse * (signature?.symmetry && signature.symmetry > 0.72 ? 0.34 : 0.46) * (1 + dnaModulators.corePulseBias),
        rhythmSpeed: (signature?.type === 'linear' ? 0.86 : 0.94) * dnaModulators.cadenceMultiplier,
      }
    case 'elemental':
      if (variant === 'agua') {
        return { ...withLite, radius: withLite.radius - 0.5, baseAlpha: withLite.baseAlpha * 0.7, accentAlpha: withLite.accentAlpha * 0.86, pulse: withLite.pulse * 0.7 }
      }
      if (variant === 'fogo') {
        return { ...withLite, radius: withLite.radius + 1.5, baseAlpha: withLite.baseAlpha * 1.08, accentAlpha: withLite.accentAlpha * 1.12, pulse: withLite.pulse * 1.18, offsetY: -3 }
      }
      if (variant === 'terra') {
        return { ...withLite, radius: withLite.radius + 0.5, baseAlpha: withLite.baseAlpha * 0.96, accentAlpha: withLite.accentAlpha * 0.78, pulse: withLite.pulse * 0.34, offsetY: 6 }
      }
      return { ...withLite, radius: withLite.radius - 3.5, baseAlpha: withLite.baseAlpha * 0.46, accentAlpha: withLite.accentAlpha * 0.58, pulse: withLite.pulse * 0.22, offsetX: 7, offsetY: -2 }
  }
}

function buildShapePreset(args: {
  manifestationSpec: ManifestationSpec
  rendererOutput: RenderOutput
  intensity: ManifestationIntensity
  personaDNA: EntityProfile['personaDNA']
  layerVisibility?: PixiLayerVisibility
}) {
  const { manifestationSpec, rendererOutput, intensity, layerVisibility, personaDNA } = args
  const dnaModulators = resolvePersonaDNAModulators(personaDNA)
  const silhouetteContrast = rendererOutput.debugShape?.silhouetteContrast ?? 'medium'
  const typographicCandidate = Boolean(rendererOutput.debugShape?.sourceSignature?.typographicCandidate)
  const signature = rendererOutput.debugShape?.processedShape?.signature ?? rendererOutput.debugShape?.sourceSignature

  const base =
    intensity === 'soft'
      ? { fillAlpha: 0.84, edgeAlpha: 0.92, edgeWidth: 2.2, detailAlpha: 0.18, pulse: 0.004, rhythmSpeed: 1 }
      : intensity === 'cinematic'
        ? { fillAlpha: 0.92, edgeAlpha: 1, edgeWidth: 2.8, detailAlpha: 0.3, pulse: 0.01, rhythmSpeed: 1.4 }
        : { fillAlpha: 0.88, edgeAlpha: 0.96, edgeWidth: 2.5, detailAlpha: 0.24, pulse: 0.007, rhythmSpeed: 1.18 }

  const contrastAdjusted =
    silhouetteContrast === 'low'
      ? { ...base, edgeWidth: base.edgeWidth + 0.8, edgeAlpha: 1 }
      : silhouetteContrast === 'medium'
        ? { ...base, edgeWidth: base.edgeWidth + 0.3 }
        : base

  const abstractionAdjusted =
    manifestationSpec.artDirection.abstractionLevel === 'high'
      ? { ...contrastAdjusted, fillAlpha: contrastAdjusted.fillAlpha * 0.94 }
      : manifestationSpec.artDirection.abstractionLevel === 'low'
        ? { ...contrastAdjusted, edgeWidth: contrastAdjusted.edgeWidth + 0.2 }
        : contrastAdjusted

  const typographicAdjusted = typographicCandidate
    ? {
        ...abstractionAdjusted,
        fillAlpha: 0.9,
        edgeAlpha: 1,
        edgeWidth: abstractionAdjusted.edgeWidth + 0.9,
        detailAlpha: abstractionAdjusted.detailAlpha * 0.4,
        pulse: 0.002,
      }
    : abstractionAdjusted

  if (layerVisibility?.liteEffects || layerVisibility?.shapeOnly) {
    return {
      ...typographicAdjusted,
      detailAlpha: layerVisibility?.shapeOnly ? 0 : typographicAdjusted.detailAlpha * 0.6,
      pulse: layerVisibility?.shapeOnly ? 0 : typographicAdjusted.pulse * 0.6,
    }
  }

  return {
    ...typographicAdjusted,
    edgeWidth:
      typographicAdjusted.edgeWidth +
      (signature?.fragmentation && signature.fragmentation > 0.6 ? 0.4 : 0) +
      (signature?.symmetry && signature.symmetry > 0.72 ? 0.2 : 0) +
      dnaModulators.shapeRigidityBias,
    pulse: typographicAdjusted.pulse * (signature?.type === 'orbital' ? 0.7 : signature?.type === 'fragmentado' ? 1.18 : 1) * dnaModulators.cadenceMultiplier,
    rhythmSpeed:
      typographicAdjusted.rhythmSpeed *
      (signature?.massDistribution === 'spread' ? 1.06 : signature?.massDistribution === 'concentrated' ? 0.94 : 1) * dnaModulators.cadenceMultiplier,
  }
}

function resolvePersonaDNA(args: {
  entityProfile?: EntityProfile
  rendererOutput: RenderOutput
  visualEssence?: VisualEssence
}) {
  if (args.entityProfile?.personaDNA) {
    return args.entityProfile.personaDNA
  }

  const shapeSignature = args.rendererOutput.debugShape?.processedShape?.signature ?? args.rendererOutput.debugShape?.sourceSignature
  const baseFormProfile = deriveBaseFormProfile({
    shapeSignature,
    visualEssence: args.visualEssence,
  })

  return derivePersonaDNA({
    shapeSignature,
    baseFormProfile,
    visualEssence: args.visualEssence,
  })
}

export function buildPixiSceneSpecFromRuntimeSceneSpec(runtimeSceneSpec: RuntimeSceneSpec): PixiSceneSpec {
  return {
    mode: runtimeSceneSpec.composition.mode,
    variant: runtimeSceneSpec.composition.variant,
    finalReveal: runtimeSceneSpec.composition.finalReveal,
    intensity: runtimeSceneSpec.composition.intensity,
    backgroundAlpha: runtimeSceneSpec.composition.backgroundAlpha,
    accent: runtimeSceneSpec.composition.accent,
    secondary: runtimeSceneSpec.composition.secondary,
    energy: runtimeSceneSpec.composition.energy,
    neutral: runtimeSceneSpec.composition.neutral,
    shapeTint: runtimeSceneSpec.composition.shapeTint,
    edgeTint: runtimeSceneSpec.composition.edgeTint,
    fillStrategy: runtimeSceneSpec.shape.fillStrategy,
    showField: !runtimeSceneSpec.composition.shapeOnly && (runtimeSceneSpec.composition.layerVisibility.field ?? true),
    showCore: !runtimeSceneSpec.composition.shapeOnly && (runtimeSceneSpec.composition.layerVisibility.core ?? true),
    showParticles: !runtimeSceneSpec.composition.shapeOnly && (runtimeSceneSpec.composition.layerVisibility.particles ?? true),
    showDebug: runtimeSceneSpec.composition.debugFlags?.showDebugOverlay ?? runtimeSceneSpec.composition.layerVisibility.debug ?? false,
    shapeOnly: runtimeSceneSpec.composition.shapeOnly,
    originSource: runtimeSceneSpec.composition.originSource,
    typographicCandidate: runtimeSceneSpec.shape.typographicCandidate,
    archetypeTemperature: runtimeSceneSpec.composition.archetypeTemperature,
    personaDNA: runtimeSceneSpec.composition.personaDNA,
    timelineProgress: runtimeSceneSpec.timeline.progress,
    timelineState: runtimeSceneSpec.timeline.state,
    birthTimeline: runtimeSceneSpec.timeline.birthTimeline,
    fieldPreset: {
      spread: runtimeSceneSpec.field.spread,
      baseAlpha: runtimeSceneSpec.field.baseAlpha,
      accentAlpha: runtimeSceneSpec.field.accentAlpha,
      detailAlpha: runtimeSceneSpec.field.detailAlpha,
      pulse: runtimeSceneSpec.field.pulse,
      rhythmSpeed: runtimeSceneSpec.field.rhythmSpeed,
    },
    fieldBudget: runtimeSceneSpec.field.budget satisfies RuntimeStageBudget,
    particlePreset: runtimeSceneSpec.particles.emitterConfig
      ? {
          alpha: runtimeSceneSpec.particles.alpha,
          sizeMultiplier: runtimeSceneSpec.particles.sizeMultiplier,
          speedMultiplier: runtimeSceneSpec.particles.speedMultiplier,
          densityMultiplier: runtimeSceneSpec.particles.densityMultiplier,
          emitterConfig: runtimeSceneSpec.particles.emitterConfig,
        }
      : undefined,
    particleBudget: runtimeSceneSpec.particles.budget,
    corePreset: {
      radius: runtimeSceneSpec.core.radius,
      baseAlpha: runtimeSceneSpec.core.baseAlpha,
      accentAlpha: runtimeSceneSpec.core.accentAlpha,
      detailAlpha: runtimeSceneSpec.core.detailAlpha,
      pulse: runtimeSceneSpec.core.pulse,
      rhythmSpeed: runtimeSceneSpec.core.rhythmSpeed,
      offsetX: runtimeSceneSpec.core.offsetX,
      offsetY: runtimeSceneSpec.core.offsetY,
    },
    shapePreset: {
      fillAlpha: runtimeSceneSpec.shape.fillAlpha,
      edgeAlpha: runtimeSceneSpec.shape.edgeAlpha,
      edgeWidth: runtimeSceneSpec.shape.edgeWidth,
      detailAlpha: runtimeSceneSpec.shape.detailAlpha,
      pulse: runtimeSceneSpec.shape.pulse,
      rhythmSpeed: runtimeSceneSpec.shape.rhythmSpeed,
    },
    entityFinalForm: runtimeSceneSpec.composition.finalForm,
    runtimeSceneSpec,
    finishPlan: runtimeSceneSpec.finishPlan,
  }
}

export function buildPixiSceneSpec(args: {
  manifestationSpec: ManifestationSpec
  entityProfile?: EntityProfile
  rendererOutput: RenderOutput
  visualEssence?: VisualEssence
  intensity: ManifestationIntensity
  originSource?: string
  layerVisibility?: PixiLayerVisibility
  debugFlags?: PixiDebugFlags
  finalReveal?: boolean
  timelineState?: TimelineState
  timelineProgress?: number
  visualRuntimePatch?: BrandSoulVisualRuntimePatch
}) {
  const { manifestationSpec, entityProfile, rendererOutput, visualEssence, intensity, originSource, layerVisibility, debugFlags, timelineState, timelineProgress, visualRuntimePatch } = args
  const finalReveal = args.finalReveal ?? rendererOutput.animationConfig.rootClassName.includes('variant-final')
  const personaDNA = resolvePersonaDNA({ entityProfile, rendererOutput, visualEssence })

  if (entityProfile) {
    const runtimeSceneSpec = resolveRenderOutput(entityProfile, {
      finalReveal,
      originSource,
      layerVisibility,
      debugFlags,
      timelineState,
      timelineProgress,
      visualRuntimePatch,
    })
    return buildPixiSceneSpecFromRuntimeSceneSpec(runtimeSceneSpec)
  }

  const fieldPreset = buildFieldPreset({ manifestationSpec, rendererOutput, intensity, personaDNA, layerVisibility })
  const particlePreset = buildParticlePreset({ manifestationSpec, rendererOutput, intensity, personaDNA, visualEssence, layerVisibility })
  const corePreset = buildCorePreset({ manifestationSpec, rendererOutput, intensity, personaDNA, layerVisibility })
  const shapePreset = buildShapePreset({ manifestationSpec, rendererOutput, intensity, personaDNA, layerVisibility })
  const accent = rendererOutput.animationConfig.styleVars['--persona-lab-accent'] ?? visualEssence?.primaryColor ?? '#ff9460'
  const secondary = rendererOutput.animationConfig.styleVars['--persona-lab-secondary'] ?? visualEssence?.secondaryColor ?? '#6e86ff'
  const energy = rendererOutput.animationConfig.styleVars['--persona-lab-energy'] ?? visualEssence?.energyColor ?? secondary
  const neutral = rendererOutput.animationConfig.styleVars['--persona-lab-neutral'] ?? visualEssence?.neutralColor ?? secondary

  return {
    mode: manifestationSpec.mode,
    variant: rendererOutput.animationConfig.rootClassName.match(/manifestation-variant-([a-z0-9-]+)/)?.[1] ?? 'default',
    finalReveal,
    intensity,
    backgroundAlpha: debugFlags?.shapeOnly ? 0 : 0.18,
    accent,
    secondary,
    energy,
    neutral,
    shapeTint: hexToNumber(accent),
    edgeTint: hexToNumber(neutral),
    fillStrategy: manifestationSpec.artDirection.shapeFillStrategy,
    showField: !debugFlags?.shapeOnly && (layerVisibility?.field ?? true),
    showCore: !debugFlags?.shapeOnly && (layerVisibility?.core ?? true),
    showParticles: !debugFlags?.shapeOnly && (layerVisibility?.particles ?? true),
    showDebug: debugFlags?.showDebugOverlay ?? layerVisibility?.debug ?? false,
    shapeOnly: debugFlags?.shapeOnly ?? layerVisibility?.shapeOnly ?? false,
    originSource,
    typographicCandidate: Boolean(rendererOutput.debugShape?.sourceSignature?.typographicCandidate),
    archetypeTemperature: visualEssence?.temperature,
    personaDNA,
    birthTimeline: manifestationSpec.birthTimeline,
    fieldPreset,
    fieldBudget: buildFieldBudget({ manifestationSpec, rendererOutput }),
    particlePreset,
    particleBudget: buildParticleBudget({ manifestationSpec, rendererOutput }),
    corePreset,
    shapePreset,
  } satisfies PixiSceneSpec
}
