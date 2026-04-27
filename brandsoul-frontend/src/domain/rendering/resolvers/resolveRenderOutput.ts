import type { EntityProfile } from '../../entity/contracts/EntityProfile'
import type { RuntimeDebugFlags, RuntimeLayerVisibility } from '../../orchestration/contracts/RuntimeControl'
import type { TimelineState } from '../../orchestration/contracts/TimelineState'
import { resolvePersonaDNAModulators } from '../../persona-dna/services/resolvePersonaDNAModulators'
import { resolvePersonaSemantics } from '../../persona-dna/services/resolvePersonaSemantics'
import type { BrandSoulVisualRuntimePatch } from '../contracts/BrandSoulVisualRuntimePatch'
import type { RuntimeBudgetLevel, RuntimeSceneSpec, RuntimeStageBudget } from '../contracts/RuntimeSceneSpec'
import { applyBrandSoulVisualRuntimePatch } from '../services/applyBrandSoulVisualRuntimePatch'

type RuntimeAnatomyContext = {
  source: 'visual-body-plan' | 'preview-body' | 'renderer-fallback' | 'core-symbol'
  usesVisualBodyPlan: boolean
  core?: EntityProfile['visualBodyPlan']['core']
  emissionOrigin?: { x: number; y: number }
  convergencePoint?: { x: number; y: number }
  anchorCount: number
  emissionAnchorCount: number
  anchorDispersion: number
  segmentCount: number
  segmentReach: number
  segmentRigidity: number
  cavityCount: number
  cavityDepth: number
  fieldAttachment: number
  stability: number
  dispersion: number
  legibility: number
  framingScale: number
  centrality: number
  corePresence: number
  boundingBox?: EntityProfile['visualBodyPlan']['silhouette']['boundingBox']
}

type RuntimeBirthMode = 'idle' | 'origin' | 'formation' | 'stabilize'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function hexToNumber(color: string) {
  const normalized = color.replace('#', '')
  return Number.parseInt(normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized, 16)
}

function readStyleVar(entity: EntityProfile, name: string, fallback: string) {
  return entity.runtime?.renderOutput?.animationConfig.styleVars[name] ?? fallback
}

function dedupeColors(colors: Array<string | undefined>) {
  return [...new Set(colors.filter((color): color is string => Boolean(color)))]
}

function angleBetweenPoints(from: { x: number; y: number }, to: { x: number; y: number }) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

function resolveBirthMode(timelineState?: TimelineState): RuntimeBirthMode {
  if (!timelineState?.active) {
    return 'idle'
  }

  if (/stabilize|final|settle|hold/i.test(timelineState.id)) {
    return 'stabilize'
  }

  if (/entry|signal|logo|scan|gather|read|origin/i.test(timelineState.id)) {
    return 'origin'
  }

  return 'formation'
}

function resolveShapeDegradation(entity: EntityProfile) {
  const signature = entity.morphology.processedShape?.signature ?? entity.brand.shapeSource?.signature
  if (!signature) {
    return 0.82
  }

  const rasterBias = entity.brand.shapeSource?.sourceType === 'raster' ? 0.08 : 0
  const weakDensity = clamp((0.42 - signature.density) / 0.42, 0, 1)
  const weakSymmetry = clamp((0.56 - signature.symmetry) / 0.56, 0, 1)
  const fragmentation = clamp(signature.fragmentation)
  const weakCircularity = clamp((0.48 - signature.circularity) / 0.48, 0, 1)

  return clamp(
    weakDensity * 0.34 +
      weakSymmetry * 0.22 +
      fragmentation * 0.22 +
      weakCircularity * 0.14 +
      rasterBias -
      clamp(signature.density - 0.62, 0, 0.32) * 0.18,
  )
}

function resolveVariant(entity: EntityProfile) {
  return (
    entity.manifestation.variant ||
    entity.runtime?.renderOutput?.animationConfig.rootClassName.match(/manifestation-variant-([a-z0-9-]+)/)?.[1] ||
    'default'
  )
}

function resolveRuntimeAnatomy(entity: EntityProfile): RuntimeAnatomyContext {
  const source = entity.runtime?.renderOutput?.anatomySource ?? 'preview-body'

  if (source !== 'visual-body-plan') {
    return {
      source,
      usesVisualBodyPlan: false,
      anchorCount: 0,
      emissionAnchorCount: 0,
      anchorDispersion: 0,
      segmentCount: 0,
      segmentReach: 0,
      segmentRigidity: 0,
      cavityCount: 0,
      cavityDepth: 0,
      fieldAttachment: 0.5,
      stability: 0.5,
      dispersion: 0.5,
      legibility: 0.72,
      framingScale: 1,
      centrality: 0.5,
      corePresence: 0.5,
    }
  }

  const plan = entity.visualBodyPlan
  const anchors = plan.structure.anchors
  const segments = plan.structure.segments
  const cavities = plan.structure.cavities
  const emissionAnchors = anchors.filter((anchor) => anchor.role === 'emission')
  const fallbackAnchors = anchors.filter((anchor) => anchor.role === 'edge' || anchor.role === 'axis')
  const core = plan.core
  const boundingBox = plan.silhouette.boundingBox
  const centerX = boundingBox.minX + boundingBox.width / 2
  const centerY = boundingBox.minY + boundingBox.height / 2
  const maxDistance = Math.max(Math.hypot(boundingBox.width / 2, boundingBox.height / 2), 1)
  const centrality = clamp(1 - Math.hypot(core.position.x - centerX, core.position.y - centerY) / maxDistance)
  const anchorDistances = anchors.map((anchor) => Math.hypot(anchor.point.x - core.position.x, anchor.point.y - core.position.y))
  const averageAnchorDistance = anchorDistances.length > 0 ? anchorDistances.reduce((total, distance) => total + distance, 0) / anchorDistances.length : 0
  const anchorDispersion = clamp(averageAnchorDistance / Math.max(Math.max(boundingBox.width, boundingBox.height), 1), 0, 1)
  const emissionOrigin = [...emissionAnchors, ...fallbackAnchors]
    .sort((left, right) => right.weight - left.weight)[0]?.point ?? core.position
  const segmentLengths = segments.map((segment) => Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y))
  const averageSegmentLength = segmentLengths.length > 0 ? segmentLengths.reduce((total, length) => total + length, 0) / segmentLengths.length : 0
  const segmentReach = clamp(averageSegmentLength / Math.max(Math.max(boundingBox.width, boundingBox.height), 1), 0, 1)
  const segmentRigidity =
    segments.length > 0 ? clamp(segments.reduce((total, segment) => total + segment.weight, 0) / segments.length, 0, 1) : 0
  const cavityFootprint =
    cavities.length > 0
      ? cavities.reduce((total, cavity) => total + cavity.radiusX * cavity.radiusY * Math.max(cavity.weight, 0.2), 0) /
        Math.max(boundingBox.width * boundingBox.height, 1)
      : 0
  const cavityDepth = clamp(cavityFootprint * 6.2 + cavities.length * 0.06, 0, 1)
  const weightedSegmentPoint = segments.length
    ? segments.reduce(
        (acc, segment) => {
          const weight = Math.max(segment.weight, 0.01)
          return {
            x: acc.x + segment.to.x * weight,
            y: acc.y + segment.to.y * weight,
            totalWeight: acc.totalWeight + weight,
          }
        },
        { x: 0, y: 0, totalWeight: 0 },
      )
    : undefined
  const convergencePoint = weightedSegmentPoint && weightedSegmentPoint.totalWeight > 0
    ? {
        x: weightedSegmentPoint.x / weightedSegmentPoint.totalWeight,
        y: weightedSegmentPoint.y / weightedSegmentPoint.totalWeight,
      }
    : core.position
  const framingScale = clamp((boundingBox.width + boundingBox.height) / 360, 0.72, 1.28)
  const corePresence = clamp(core.intensity * 0.58 + (core.radius / Math.max(Math.max(boundingBox.width, boundingBox.height), 1)) * 2.4 + centrality * 0.18, 0.2, 1)
  const dispersion = clamp(anchorDispersion * 0.44 + cavityDepth * 0.32 + emissionAnchors.length * 0.05 + (1 - segmentRigidity) * 0.12, 0, 1)
  const stability = clamp(legibilityClamp(plan.silhouette.legibility) * 0.26 + corePresence * 0.24 + centrality * 0.22 + segmentRigidity * 0.16 + (1 - dispersion) * 0.12, 0, 1)
  const fieldAttachment = clamp(segmentRigidity * 0.3 + segmentReach * 0.2 + corePresence * 0.18 + centrality * 0.12 + plan.silhouette.legibility * 0.12 - cavityDepth * 0.1, 0, 1)

  return {
    source,
    usesVisualBodyPlan: true,
    core,
    emissionOrigin,
    convergencePoint,
    anchorCount: anchors.length,
    emissionAnchorCount: emissionAnchors.length,
    anchorDispersion,
    segmentCount: segments.length,
    segmentReach,
    segmentRigidity,
    cavityCount: cavities.length,
    cavityDepth,
    fieldAttachment,
    stability,
    dispersion,
    legibility: clamp(plan.silhouette.legibility, 0.2, 1),
    framingScale,
    centrality,
    corePresence,
    boundingBox,
  }
}

function legibilityClamp(value: number) {
  return clamp(value, 0.2, 1)
}

function budgetToStageBudget(budget: EntityProfile['finalForm']['particles']['budget'], mode: EntityProfile['manifestation']['mode']): RuntimeStageBudget {
  const climax: RuntimeBudgetLevel = budget === 'high' ? 'high' : budget === 'medium' ? 'medium' : mode === 'centelha' ? 'medium' : 'low'

  return {
    initial: 'low',
    mid: climax === 'high' ? 'medium' : 'low',
    climax,
    stabilize: 'low',
  }
}

function resolveFieldBudget(entity: EntityProfile): RuntimeStageBudget {
  const mode = entity.manifestation.mode
  const variant = entity.manifestation.variant

  if (mode === 'centelha' || variant === 'fogo') {
    return { initial: 'low', mid: 'medium', climax: 'high', stabilize: 'low' }
  }

  if (mode === 'natureza' || mode === 'robo-ia') {
    return { initial: 'low', mid: 'low', climax: 'medium', stabilize: 'low' }
  }

  return { initial: 'low', mid: 'medium', climax: 'medium', stabilize: 'low' }
}

function resolveLayerVisibility(
  entity: EntityProfile,
  fallback?: RuntimeLayerVisibility,
): RuntimeLayerVisibility {
  return {
    ...fallback,
    ...entity.runtime?.control?.layerVisibility,
    ...entity.finalForm.layerVisibility,
    particles: entity.finalForm.particles.budget === 'none' ? false : (entity.finalForm.layerVisibility?.particles ?? entity.runtime?.control?.layerVisibility?.particles ?? fallback?.particles),
  }
}

export function resolveRenderOutput(
  entity: EntityProfile,
  options?: {
    finalReveal?: boolean
    originSource?: string
    layerVisibility?: RuntimeLayerVisibility
    debugFlags?: RuntimeDebugFlags
    timelineState?: TimelineState
    timelineProgress?: number
    visualRuntimePatch?: BrandSoulVisualRuntimePatch
  },
): RuntimeSceneSpec {
  const accent = readStyleVar(entity, '--persona-lab-accent', entity.palette.primary ?? entity.brand.visualEssence?.primaryColor ?? '#ff9460')
  const extractedSecondary = entity.palette?.secondary ?? entity.brand.visualEssence?.secondaryColor ?? '#6e86ff'
  const energy = readStyleVar(entity, '--persona-lab-energy', entity.brand.visualEssence?.energyColor ?? extractedSecondary)
  const neutral = readStyleVar(entity, '--persona-lab-neutral', entity.brand.visualEssence?.neutralColor ?? extractedSecondary)
  const secondary = readStyleVar(entity, '--persona-lab-secondary', energy)
  const finalForm = options?.finalReveal ? entity.finalForm : undefined
  const layerVisibility = resolveLayerVisibility(entity, options?.layerVisibility)
  const shapeOnly = options?.debugFlags?.shapeOnly ?? layerVisibility.shapeOnly ?? false
  const edgeStrength = clamp(entity.finalForm.edgeStrength || entity.morphology.edgeStrength || 0.72)
  const intensityMultiplier = entity.finalForm.intensity === 'cinematic' ? 1.12 : entity.finalForm.intensity === 'soft' ? 0.88 : 1
  const renderOutput = entity.runtime?.renderOutput
  const dna = entity.personaDNA
  const finishPlan = entity.visualFinishPlan
  const dnaModulators = resolvePersonaDNAModulators(dna)
  const personaSemantics = resolvePersonaSemantics(dna)
  const anatomy = resolveRuntimeAnatomy(entity)
  const birthMode = resolveBirthMode(options?.timelineState)
  const isIdleRuntime = birthMode === 'idle'
  const birthStageProgress = options?.timelineState?.stageProgress ?? options?.timelineProgress ?? 0
  const shapeDegradation = resolveShapeDegradation(entity)
  const legibilityNoiseFactor = anatomy.usesVisualBodyPlan ? clamp(0.62 + anatomy.legibility * 0.68, 0.55, 1.22) : 1
  const framingSpreadFactor = anatomy.usesVisualBodyPlan ? clamp(0.86 + (anatomy.framingScale - 1) * 0.7, 0.74, 1.24) : 1
  const massFieldFactor =
    anatomy.usesVisualBodyPlan && entity.morphology.massDistribution === 'distributed-field'
      ? 1.16
      : anatomy.usesVisualBodyPlan && entity.morphology.massDistribution === 'compressed-core'
        ? 0.9
        : anatomy.usesVisualBodyPlan && entity.morphology.massDistribution === 'peripheral'
          ? 1.08
          : 1
  const anchorParticleFactor = anatomy.usesVisualBodyPlan ? clamp(0.9 + anatomy.anchorDispersion * 0.42 + anatomy.emissionAnchorCount * 0.04, 0.82, 1.28) : 1
  const nucleusIntensityFactor = anatomy.usesVisualBodyPlan ? clamp(0.76 + anatomy.corePresence * 0.42, 0.72, 1.24) : 1
  const idleBreathFactor = anatomy.usesVisualBodyPlan
    ? clamp(0.9 + anatomy.cavityDepth * 0.16 + anatomy.segmentReach * 0.1 - anatomy.stability * 0.06, 0.84, 1.18) * (isIdleRuntime ? personaSemantics.idle.breathMultiplier : 1)
    : 1
  const idleMicroTensionFactor = anatomy.usesVisualBodyPlan
    ? clamp(0.84 + anatomy.segmentRigidity * 0.22 + anatomy.anchorDispersion * 0.08, 0.8, 1.18) * (isIdleRuntime ? personaSemantics.idle.microTensionMultiplier : 1)
    : 1
  const idleCoreOscillationFactor = anatomy.usesVisualBodyPlan
    ? clamp(0.78 + anatomy.dispersion * 0.24 + anatomy.cavityDepth * 0.12 - anatomy.stability * 0.08, 0.72, 1.18) * (isIdleRuntime ? personaSemantics.idle.coreOscillationMultiplier : 1)
    : 1
  const idleFieldAttachmentFactor = anatomy.usesVisualBodyPlan
    ? clamp(0.82 + anatomy.fieldAttachment * 0.24 - anatomy.cavityDepth * 0.06, 0.76, 1.22) * (isIdleRuntime ? personaSemantics.idle.fieldAttachmentMultiplier : 1)
    : 1
  const idleParticleActivityFactor = isIdleRuntime ? personaSemantics.idle.particleActivityMultiplier : 1
  const idleParticleDispersionFactor = isIdleRuntime ? personaSemantics.idle.particleDispersionMultiplier : 1
  const idleRhythmFactor = isIdleRuntime ? personaSemantics.idle.rhythmSpeedMultiplier : 1
  const idlePredictabilityFactor = isIdleRuntime ? clamp(0.88 + personaSemantics.idle.predictability * 0.18, 0.88, 1.06) : 1
  const birthParticleDensityFactor =
    !anatomy.usesVisualBodyPlan || birthMode === 'idle'
      ? 1
      : birthMode === 'origin'
        ? clamp(0.92 + anatomy.emissionAnchorCount * 0.08 + anatomy.dispersion * 0.1 + birthStageProgress * 0.08, 0.88, 1.24)
        : birthMode === 'formation'
          ? clamp(1 + anatomy.segmentReach * 0.22 + anatomy.segmentCount * 0.03 + anatomy.cavityDepth * 0.08 + birthStageProgress * 0.12, 0.96, 1.42)
          : clamp(0.82 + anatomy.fieldAttachment * 0.18 + anatomy.stability * 0.16, 0.78, 1.18)
  const birthParticleSpreadFactor =
    !anatomy.usesVisualBodyPlan || birthMode === 'idle'
      ? 1
      : birthMode === 'origin'
        ? clamp(1.04 + anatomy.dispersion * 0.18, 0.96, 1.28)
        : birthMode === 'formation'
          ? clamp(0.82 + anatomy.cavityDepth * 0.12 + (1 - anatomy.stability) * 0.08, 0.72, 1.02)
          : clamp(0.68 + anatomy.dispersion * 0.18, 0.62, 0.96)
  const birthFieldFactor =
    !anatomy.usesVisualBodyPlan || birthMode === 'idle'
      ? 1
      : birthMode === 'origin'
        ? clamp(0.86 + anatomy.dispersion * 0.14, 0.8, 1.08)
        : birthMode === 'formation'
          ? clamp(1 + anatomy.fieldAttachment * 0.22 + anatomy.segmentRigidity * 0.12, 0.96, 1.34)
          : clamp(0.88 + anatomy.stability * 0.16, 0.84, 1.14)
  const birthCoreFactor =
    !anatomy.usesVisualBodyPlan || birthMode === 'idle'
      ? 1
      : birthMode === 'origin'
        ? clamp(0.78 + anatomy.corePresence * 0.18, 0.72, 1.02)
        : birthMode === 'formation'
          ? clamp(1.02 + anatomy.segmentRigidity * 0.12 + anatomy.corePresence * 0.12, 1, 1.26)
          : clamp(0.94 + anatomy.stability * 0.14, 0.92, 1.18)
  const silhouetteBoost = 1 + shapeDegradation * 0.18
  const coreBoost = 1 + shapeDegradation * 0.22
  const ambientDamping = 1 - shapeDegradation * 0.34
  const particleDamping = 1 - shapeDegradation * 0.42
  const birthEmitterOrigin =
    !anatomy.usesVisualBodyPlan || birthMode === 'idle'
      ? undefined
      : birthMode === 'origin'
        ? anatomy.emissionOrigin ?? anatomy.convergencePoint ?? anatomy.core?.position
        : birthMode === 'formation'
          ? anatomy.convergencePoint ?? anatomy.core?.position
          : anatomy.core?.position
  const birthEmitterTarget =
    !anatomy.usesVisualBodyPlan || birthMode === 'idle'
      ? undefined
      : birthMode === 'origin'
        ? anatomy.convergencePoint ?? anatomy.core?.position
        : anatomy.core?.position
  const resolvedEmitterOrigin = birthEmitterOrigin ?? renderOutput?.particles.emitterConfig?.origin
  const renderEmitterConfig = renderOutput?.particles.emitterConfig
    ? {
        ...renderOutput.particles.emitterConfig,
        origin:
          birthEmitterOrigin ??
          (anatomy.usesVisualBodyPlan ? anatomy.emissionOrigin ?? renderOutput.particles.emitterConfig.origin : renderOutput.particles.emitterConfig.origin),
        direction: birthEmitterTarget && resolvedEmitterOrigin
          ? {
              angle: angleBetweenPoints(resolvedEmitterOrigin, birthEmitterTarget),
              spread: clamp(renderOutput.particles.emitterConfig.direction.spread * birthParticleSpreadFactor, 18, 360),
            }
          : renderOutput.particles.emitterConfig.direction,
        color: dedupeColors([neutral, energy, extractedSecondary, accent]),
      }
    : undefined
  const coreOffsetX = anatomy.usesVisualBodyPlan && anatomy.core && anatomy.boundingBox
    ? clamp(anatomy.core.position.x - (anatomy.boundingBox.minX + anatomy.boundingBox.width / 2), -24, 24) * idleCoreOscillationFactor
    : 0
  const coreOffsetY = anatomy.usesVisualBodyPlan && anatomy.core && anatomy.boundingBox
    ? clamp(anatomy.core.position.y - (anatomy.boundingBox.minY + anatomy.boundingBox.height / 2), -24, 24) * idleCoreOscillationFactor
    : (entity.manifestation.mode === 'natureza' ? 4 : entity.manifestation.variant === 'terra' ? 6 : 0) + dnaModulators.postureLift
  const finishCoreDominance = finishPlan?.coreDominance ?? 0.76
  const modeCoreDominance = entity.manifestation.mode === 'centelha' ? 1.22 : entity.manifestation.mode === 'robo-ia' ? 0.82 : 1
  const runtimeCoreDominance = finishCoreDominance * modeCoreDominance
  const runtimeShapeScale = finishPlan?.shapeScale ?? 1
  const edgeDisciplineBoost = finishPlan?.materialProfile.edgeDiscipline === 'sharp' ? 1.18 : 1.06
  const modeEdgeBoost = entity.manifestation.mode === 'robo-ia' ? 1.18 : entity.manifestation.mode === 'centelha' ? 1.02 : 1
  const colorAuthorityBoost = entity.manifestation.mode === 'centelha' ? 1.06 : entity.manifestation.mode === 'robo-ia' ? 1.08 : 1

  const runtimeSceneSpec: RuntimeSceneSpec = {
    schemaVersion: 1,
    source: 'entity-profile',
    shape: {
      fillStrategy: entity.morphology.fillStrategy,
      typographicCandidate: entity.morphology.typographicProtection,
      fillAlpha: clamp((0.88 + edgeStrength * 0.1) * silhouetteBoost * colorAuthorityBoost * (anatomy.usesVisualBodyPlan ? 0.94 + anatomy.legibility * 0.12 : 1)) * (finalForm?.shape.opacity ?? 1),
      edgeAlpha: clamp((0.94 + edgeStrength * 0.12) * edgeDisciplineBoost * modeEdgeBoost * (1 + shapeDegradation * 0.1)),
      edgeWidth: (2 + edgeStrength * 1.15 + shapeDegradation * 0.8 + (anatomy.usesVisualBodyPlan ? (1 - anatomy.legibility) * 0.9 + Math.abs(anatomy.framingScale - 1) * 0.4 : 0)) * edgeDisciplineBoost,
      edgeTint: hexToNumber(neutral),
      tint: hexToNumber(accent),
      detailAlpha: entity.morphology.typographicProtection ? 0.08 : clamp((0.12 + entity.morphology.structuralComplexity * 0.14) * (1 - shapeDegradation * 0.24) * legibilityNoiseFactor * idleMicroTensionFactor * (finishPlan?.surfaceBias === 'smooth' ? 0.72 : 1)),
      pulse:
        ((finalForm ? finalForm.shape.deformation : entity.behavior.rhythm.pulse * 0.03) / Math.max(runtimeShapeScale, 1)) *
        (1 - shapeDegradation * 0.24) *
        dnaModulators.cadenceMultiplier *
        (anatomy.usesVisualBodyPlan ? clamp(0.9 + anatomy.centrality * 0.14, 0.82, 1.08) * idleBreathFactor : 1),
      rhythmSpeed: (entity.behavior.stabilize.speed || entity.behavior.rhythm.speed) * dnaModulators.cadenceMultiplier * idleRhythmFactor * (anatomy.usesVisualBodyPlan ? 0.94 + anatomy.stability * 0.08 : 1),
    },
    core: {
      radius: anatomy.usesVisualBodyPlan && anatomy.core
        ? anatomy.core.radius * (1 + runtimeCoreDominance) * (0.92 + anatomy.corePresence * 0.34) * (1 + dnaModulators.coreRadiusBias * 0.45) * birthCoreFactor
        : (9 + edgeStrength * 6) * coreBoost * (1 + runtimeCoreDominance) * (1 + dnaModulators.coreRadiusBias),
      baseAlpha: clamp(Math.max(0.9, (0.22 + entity.finalForm.core.opacity * 0.32) * coreBoost * nucleusIntensityFactor * birthCoreFactor * (0.88 + runtimeCoreDominance * 0.18))) * (shapeOnly ? 0 : 1),
      accentAlpha: clamp(Math.max(0.92, (0.18 + entity.finalForm.core.intensity * 0.28) * (1 + shapeDegradation * 0.18) * nucleusIntensityFactor * birthCoreFactor * (0.9 + runtimeCoreDominance * 0.14))) * (shapeOnly ? 0 : 1),
      detailAlpha: clamp(((0.12 + entity.finalForm.core.internalPresence * 0.22 + dna.charisma * 0.08) * (1 + shapeDegradation * 0.12) * (anatomy.usesVisualBodyPlan ? (0.88 + anatomy.corePresence * 0.32) * idleMicroTensionFactor : 1) * (0.84 + runtimeCoreDominance * 0.12)) + runtimeCoreDominance * 0.06, 0.4, 1) * (shapeOnly ? 0 : 1),
      pulse: (entity.finalForm.core.blur > 0.4 ? 0.08 : 0.14) * (1 - shapeDegradation * 0.12) * (1 + dnaModulators.corePulseBias + runtimeCoreDominance * 0.2) * (anatomy.usesVisualBodyPlan ? (0.86 + anatomy.corePresence * 0.26) * idleBreathFactor * birthCoreFactor * idlePredictabilityFactor : 1),
      rhythmSpeed: entity.behavior.stabilize.speed * dnaModulators.cadenceMultiplier * idleRhythmFactor * (anatomy.usesVisualBodyPlan ? 0.94 + anatomy.stability * 0.08 : 1),
      offsetX: coreOffsetX,
      offsetY: coreOffsetY,
    },
    field: {
      relation: entity.morphology.shapeRelation,
      mask: entity.morphology.fieldRelation.mask,
      spread: clamp((1 + entity.morphology.fieldRelation.spread * 0.24 + dnaModulators.fieldSpreadBias) * (1 - shapeDegradation * 0.16) * framingSpreadFactor * massFieldFactor * idleFieldAttachmentFactor * birthFieldFactor * idleParticleDispersionFactor) * (finalForm?.field.spread ?? 1),
      baseAlpha: clamp((0.06 + entity.finalForm.field.opacity * 0.18) * ambientDamping) * (shapeOnly ? 0 : 1),
      accentAlpha: clamp((0.08 + entity.finalForm.field.intensity * 0.28) * ambientDamping * (anatomy.usesVisualBodyPlan ? (0.84 + anatomy.legibility * 0.22) * birthFieldFactor : 1)) * (shapeOnly ? 0 : 1),
      detailAlpha: clamp((0.05 + entity.morphology.fieldRelation.adhesion * 0.12 + dnaModulators.fieldAttachment * 0.08) * ambientDamping * legibilityNoiseFactor * (anatomy.usesVisualBodyPlan ? idleFieldAttachmentFactor * birthFieldFactor : 1)) * (shapeOnly ? 0 : 1),
      pulse: clamp(entity.behavior.rhythm.pulse * 0.12) * (finalForm ? 0.45 : 1) * (1 - shapeDegradation * 0.32) * dnaModulators.cadenceMultiplier * idleRhythmFactor * (anatomy.usesVisualBodyPlan ? (0.9 + anatomy.anchorDispersion * 0.18) * idleBreathFactor * idlePredictabilityFactor : 1),
      rhythmSpeed: entity.behavior.rhythm.speed * dnaModulators.cadenceMultiplier * idleRhythmFactor * (anatomy.usesVisualBodyPlan ? 0.96 + anatomy.fieldAttachment * 0.08 : 1),
      budget: resolveFieldBudget(entity),
    },
    particles: {
      alpha: clamp((0.24 + entity.finalForm.particles.opacity * 0.7) * particleDamping * idleParticleActivityFactor * (anatomy.usesVisualBodyPlan ? 0.82 + anatomy.legibility * 0.22 : 1)) * (shapeOnly ? 0 : 1),
      sizeMultiplier: clamp(entity.finalForm.particles.size * intensityMultiplier * (1 - shapeDegradation * 0.18) * (anatomy.usesVisualBodyPlan ? 0.92 + Math.abs(anatomy.framingScale - 1) * 0.5 : 1), 0.24, 1.4),
      speedMultiplier: clamp((entity.behavior.birth.speed / Math.max(entity.behavior.stabilize.speed, 0.1) + dnaModulators.particleSpeedBias) * idleRhythmFactor * idleParticleActivityFactor * (birthMode === 'formation' && anatomy.usesVisualBodyPlan ? 0.94 + anatomy.segmentReach * 0.24 : birthMode === 'stabilize' && anatomy.usesVisualBodyPlan ? 0.84 + anatomy.stability * 0.12 : 1), 0.65, 1.45),
      densityMultiplier: clamp(entity.finalForm.particles.intensity * intensityMultiplier * particleDamping * idleParticleActivityFactor * (anatomy.usesVisualBodyPlan ? anchorParticleFactor * (0.82 + anatomy.corePresence * 0.26) * birthParticleDensityFactor : 1) + dnaModulators.particleDensityBias, 0.12, 1.3),
      spread: entity.finalForm.particles.spread * (1 - shapeDegradation * 0.18) * (1 + dna.wildness * 0.12 - dna.defensiveness * 0.1) * idleParticleDispersionFactor * (anatomy.usesVisualBodyPlan ? clamp(0.88 + anatomy.anchorDispersion * 0.42 + (1 - anatomy.legibility) * 0.12, 0.8, 1.28) * birthParticleSpreadFactor * (birthMode === 'idle' ? idleCoreOscillationFactor : 1) : 1),
      budget: budgetToStageBudget(entity.finalForm.particles.budget, entity.manifestation.mode),
      emitterConfig: renderEmitterConfig,
    },
    timeline: {
      birthTimeline: entity.manifestation.birthTimeline,
      duration: entity.manifestation.birthTimeline.duration,
      stages: entity.manifestation.birthTimeline.stages,
      activeStageId: options?.timelineState?.id,
      state: options?.timelineState,
      progress: options?.timelineProgress,
    },
    composition: {
      mode: entity.manifestation.mode,
      variant: resolveVariant(entity),
      intensity: entity.finalForm.intensity,
      finalReveal: options?.finalReveal ?? false,
      backgroundAlpha: shapeOnly ? 0 : 0.18,
      accent,
      secondary,
      energy,
      neutral,
      shapeTint: hexToNumber(accent),
      edgeTint: hexToNumber(neutral),
      originSource: options?.originSource ?? entity.brand.coreSymbol ?? entity.brand.logoMask ?? entity.brand.logoPreview,
      archetypeTemperature: entity.brand.visualEssence?.temperature,
      personaDNA: entity.personaDNA,
      layerVisibility,
      debugFlags: options?.debugFlags,
      shapeOnly,
      finalForm,
    },
    anatomy: {
      source: anatomy.source,
      core: anatomy.core
        ? {
            x: anatomy.core.position.x,
            y: anatomy.core.position.y,
            radius: anatomy.core.radius,
            intensity: anatomy.core.intensity,
            centrality: anatomy.centrality,
            presence: anatomy.corePresence,
          }
        : undefined,
      emissionOrigin: anatomy.emissionOrigin,
      convergencePoint: anatomy.convergencePoint,
      anchorCount: anatomy.anchorCount,
      emissionAnchorCount: anatomy.emissionAnchorCount,
      anchorDispersion: anatomy.anchorDispersion,
      segmentCount: anatomy.segmentCount,
      segmentReach: anatomy.segmentReach,
      segmentRigidity: anatomy.segmentRigidity,
      cavityCount: anatomy.cavityCount,
      cavityDepth: anatomy.cavityDepth,
      fieldAttachment: anatomy.fieldAttachment,
      stability: anatomy.stability,
      dispersion: anatomy.dispersion,
      silhouette: anatomy.boundingBox
        ? {
            boundingBox: anatomy.boundingBox,
            legibility: anatomy.legibility,
            framingScale: anatomy.framingScale,
          }
        : undefined,
    },
    finishPlan: entity.visualFinishPlan,
  }

  return applyBrandSoulVisualRuntimePatch(runtimeSceneSpec, options?.visualRuntimePatch, {
    applicationPoint: 'resolve-render-output',
  })
}
