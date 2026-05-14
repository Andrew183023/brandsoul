import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { RuntimeControl } from '../brain/domain/orchestration/contracts/RuntimeControl.js'
import type { RuntimeSceneSpec, RuntimeStageBudget } from '../brain/domain/rendering/contracts/RuntimeSceneSpec.js'
import { requireCanonicalEntityIdentity } from '../entities/identity/entityIdentityBuilder.js'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function hexToNumber(color: string) {
  const normalized = color.replace('#', '')
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized

  return Number.parseInt(expanded, 16)
}

function toStageBudget(level: EntityProfile['finalForm']['particles']['budget']): RuntimeStageBudget {
  if (level === 'high') {
    return {
      initial: 'medium',
      mid: 'medium',
      climax: 'high',
      stabilize: 'medium',
    }
  }

  if (level === 'medium') {
    return {
      initial: 'low',
      mid: 'medium',
      climax: 'medium',
      stabilize: 'low',
    }
  }

  if (level === 'low') {
    return {
      initial: 'low',
      mid: 'low',
      climax: 'medium',
      stabilize: 'low',
    }
  }

  return {
    initial: 'low',
    mid: 'low',
    climax: 'low',
    stabilize: 'low',
  }
}

function resolveParticleEmitter(profile: EntityProfile) {
  const runtimeSpec = profile.manifestation.spec?.runtime
  const variantKey = readString(profile.manifestation.variant)
  const intensityKey = readString(profile.manifestation.intensity)
  const variantParticle = variantKey
    ? runtimeSpec?.variantOverrides?.[variantKey]?.particleByIntensity?.[intensityKey]
    : undefined
  const defaultParticle = intensityKey
    ? runtimeSpec?.particleByIntensity?.[intensityKey]
    : undefined
  return variantParticle ?? defaultParticle
}

function resolveSecondary(profile: EntityProfile) {
  const runtimeSpec = profile.manifestation.spec?.runtime
  const variantKey = readString(profile.manifestation.variant)
  const variantVisual = variantKey
    ? runtimeSpec?.variantOverrides?.[variantKey]?.visual
    : undefined
  const secondarySource = variantVisual?.secondarySource ?? runtimeSpec?.defaultVisual.secondarySource
  if (secondarySource === 'primary') {
    return profile.palette.primary
  }

  return profile.palette.secondary ?? profile.palette.primary
}

function resolveFieldMask(profile: EntityProfile): RuntimeSceneSpec['field']['mask'] {
  if (profile.manifestation.mode === 'natureza') {
    return 'aura-bound'
  }
  if (profile.manifestation.mode === 'robo-ia') {
    return 'distributed'
  }
  if (profile.finalForm.particles.budget === 'none') {
    return 'minimal'
  }
  return 'shape-bound'
}

export function buildRuntimeSceneProjection(args: {
  entityProfile?: EntityProfile
  runtimeControl: RuntimeControl
  stage?: string
}): RuntimeSceneSpec | undefined {
  const profile = args.entityProfile
  if (!profile) {
    return undefined
  }

  const canonicalIdentity = requireCanonicalEntityIdentity(profile, 'runtimeSceneProjection.buildRuntimeSceneProjection')

  // Public/entity smoke data can exist before the full runtime scene spec is materialized.
  // In that case, skip renderSpec projection instead of crashing the presence route.
  if (
    !profile.manifestation?.spec?.runtime
    || !profile.manifestation?.spec?.motion
    || !profile.manifestation?.artDirection
    || !profile.finalForm?.shape
    || !profile.finalForm?.core
    || !profile.finalForm?.field
    || !profile.finalForm?.particles
  ) {
    return undefined
  }

  const runtimeSpec = profile.manifestation.spec.runtime
  const motionSpec = profile.manifestation.spec.motion
  const artDirection = profile.manifestation.artDirection
  const birthTimeline = profile.manifestation.birthTimeline
  const variantKey = readString(profile.manifestation.variant)
  const accent = (variantKey
    ? runtimeSpec.variantOverrides?.[variantKey]?.visual?.accent
    : undefined)
    ?? runtimeSpec.defaultVisual.accent
  const secondary = resolveSecondary(profile)
  const shapeOnly = args.runtimeControl.debugFlags?.shapeOnly ?? false
  const emitter = resolveParticleEmitter(profile)
  const particleBudget = toStageBudget(profile.finalForm.particles.budget)
  const fillStrategy = readString(artDirection.shapeFillStrategy)
  const shapeRelation = readString(artDirection.shapeRelation) as RuntimeSceneSpec['field']['relation']
  const edgeStrength = readNumber(profile.finalForm.edgeStrength, profile.finalForm.shape.edgeContrast)
  const isLocked = profile.finalForm.locked === true
  const presenceMode = readString(profile.finalForm.presenceMode)
  const silhouetteClarity = readString(profile.finalForm.silhouetteClarity)
  const motionSpeed = readNumber(motionSpec.speed, 1)
  const finalFormRecord = asRecord(profile.finalForm)

  return {
    schemaVersion: 1,
    source: 'entity-profile',
    shape: {
      fillStrategy,
      typographicCandidate: silhouetteClarity === 'high',
      fillAlpha: Math.min(1, Math.max(0.24, profile.finalForm.shape.opacity)),
      edgeAlpha: Math.min(1, Math.max(0.36, edgeStrength)),
      edgeWidth: 1.8 + profile.finalForm.shape.edgeContrast * 1.4,
      edgeTint: hexToNumber(secondary),
      tint: hexToNumber(accent),
      detailAlpha: Math.min(0.42, 0.12 + profile.finalForm.shape.intensity * 0.18),
      pulse: presenceMode === 'final-stabilize' ? 0.002 : 0.007,
      rhythmSpeed: motionSpeed,
    },
    core: {
      radius: 10 + profile.finalForm.core.scale * 6,
      baseAlpha: Math.min(1, Math.max(0.18, profile.finalForm.core.opacity)),
      accentAlpha: Math.min(1, 0.2 + profile.finalForm.core.intensity * 0.22),
      detailAlpha: Math.min(1, 0.16 + profile.finalForm.core.internalPresence * 0.18),
      pulse: isLocked ? 0.02 : 0.08,
      rhythmSpeed: motionSpeed,
      offsetX: 0,
      offsetY: 0,
    },
    field: {
      relation: shapeRelation,
      mask: resolveFieldMask(profile),
      spread: 1 + profile.finalForm.field.spread * 0.18,
      baseAlpha: Math.min(0.24, Math.max(0.04, profile.finalForm.field.opacity * 0.2)),
      accentAlpha: Math.min(0.3, Math.max(0.08, profile.finalForm.field.intensity * 0.24)),
      detailAlpha: Math.min(0.22, Math.max(0.06, profile.finalForm.field.blur * 0.1 + 0.06)),
      pulse: isLocked ? 0.02 : 0.08,
      rhythmSpeed: motionSpeed,
      budget: particleBudget,
    },
    particles: {
      alpha: profile.finalForm.particles.budget === 'none' ? 0 : Math.min(0.9, Math.max(0.18, profile.finalForm.particles.opacity)),
      sizeMultiplier: Math.max(0.5, profile.finalForm.particles.size),
      speedMultiplier: motionSpeed,
      densityMultiplier: profile.finalForm.particles.budget === 'none' ? 0 : Math.max(0.2, profile.finalForm.particles.intensity),
      spread: Math.max(0.3, profile.finalForm.particles.spread),
      budget: particleBudget,
      emitterConfig: emitter?.emitterConfig,
    },
    timeline: {
      birthTimeline,
      duration: birthTimeline?.duration,
      stages: birthTimeline?.stages,
      activeStageId: args.runtimeControl.playback?.activeStage ?? args.stage,
    },
    composition: {
      mode: profile.manifestation.mode,
      variant: profile.manifestation.variant,
      intensity: profile.manifestation.intensity,
      finalReveal: isLocked,
      backgroundAlpha: shapeOnly ? 0 : 0.18,
      accent,
      secondary,
      shapeTint: hexToNumber(accent),
      edgeTint: hexToNumber(secondary),
      originSource: canonicalIdentity.identity.canonicalName,
      layerVisibility: {
        ...profile.finalForm.layerVisibility,
        ...args.runtimeControl.layerVisibility,
      },
      debugFlags: args.runtimeControl.debugFlags,
      shapeOnly,
      finalForm: finalFormRecord,
    },
  }
}
