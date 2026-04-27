import type { EntityBehavior, EntityBehaviorProfile, EntityIntensityRule } from '../contracts/EntityBehavior'
import type { EntityFinalForm } from '../contracts/EntityFinalForm'
import type { EntityInput } from '../contracts/EntityInput'
import type { EntityMorphology } from '../contracts/EntityMorphology'
import type { EntityProfile } from '../contracts/EntityProfile'
import type { BehaviorState } from '../contracts/BehaviorState'
import type { HookLoop } from '../contracts/HookLoop'
import type { ProgressionState } from '../contracts/ProgressionState'
import type { UserMemory } from '../contracts/UserMemory'
import { buildInitialBindingState } from '../services/bindingEngine'
import { buildInitialEntityTimelineLog } from '../services/continuityEngine'
import { computeEntityAccumulatedValueFromRelational } from '../services/entityValueEngine'
import { buildInitialIdentityImprint } from '../services/imprintEngine'
import type { EntityManifestation } from '../../manifestation/contracts/EntityManifestation'
import type { ManifestationSpec } from '../../manifestation/contracts/ManifestationSpec'
import { getManifestationSpec } from '../../manifestation/specs'
import { manifestationModes } from '../../manifestation/specs/manifestationModes'
import { buildManifestationPreview } from '../../manifestation/services/previewBuilder'
import { deriveBaseFormProfile } from '../../base-form/services/deriveBaseFormProfile'
import { buildVisualFinishPlan } from '../../materialization/services/buildVisualFinishPlan'
import { derivePersonaDNA } from '../../persona-dna/services/derivePersonaDNA'
import { deriveVisualArchetype } from '../../visual-archetype/services/deriveVisualArchetype'
import { buildVisualBody } from '../../visual-archetype/services/buildVisualBody'
import { modulateBirthTimeline } from '../../persona-dna/services/modulateBirthTimeline'
import { resolvePersonaDNAModulators } from '../../persona-dna/services/resolvePersonaDNAModulators'
import type { RuntimeControl } from '../../orchestration/contracts/RuntimeControl'
import type { ManifestationIntensity, ManifestationMode, PersonaLabPreview } from '../../rendering/contracts/types'
import { abstractShape } from '../../shape/services/shapeIntelligence'
import type { ProcessedShape, ShapePoint, ShapeSignature } from '../../shape/contracts/ProcessedShape'
import { buildEntityProfile } from './buildEntityProfile'

export type ProcessBrandInput = EntityInput

export type ProcessBrandOptions = {
  intensity?: ManifestationIntensity
  runtimeControl?: RuntimeControl
  id?: string
  requestId?: string
  sessionId?: string
  source?: EntityProfile['source']
}

type BrandAnalysis = {
  requestedMode?: ManifestationMode
  requestedVariant?: string
  intensity: ManifestationIntensity
  visualStructure: NonNullable<EntityInput['brand']['visualEssence']>['structure'] | 'unknown'
  visualTemperature: NonNullable<EntityInput['brand']['visualEssence']>['temperature'] | 'unknown'
  visualContrast: NonNullable<EntityInput['brand']['visualEssence']>['contrast'] | 'medium'
  visualComposition: NonNullable<EntityInput['brand']['visualEssence']>['composition'] | 'centered'
  brandCategory: EntityInput['context']['brandCategory']
  shapeSignature?: ShapeSignature
  typographicCandidate: boolean
  complexity: number
  density: number
}

type EntityDecisionContext = {
  input: ProcessBrandInput
  analysis: BrandAnalysis
  manifestation: EntityManifestation
  preview: PersonaLabPreview
  personaDNA: EntityProfile['personaDNA']
  visualArchetype: EntityProfile['visualArchetype']
  visualBodyPlan: EntityProfile['visualBodyPlan']
  visualFinishPlan: EntityProfile['visualFinishPlan']
  baseForm: EntityMorphology['baseForm']
  processedShape?: ProcessedShape
  runtimeControl?: RuntimeControl
}

type EntityRelationalState = EntityProfile['relational']

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function analyzeBrandInput(input: ProcessBrandInput, options?: ProcessBrandOptions): BrandAnalysis {
  const signature = input.brand.shapeSource?.signature

  return {
    requestedMode: input.manifestation?.mode,
    requestedVariant: input.manifestation?.variant,
    intensity: options?.intensity ?? (
      input.brand.visualEssence?.intensity === 'soft'
        ? 'soft'
        : input.brand.visualEssence?.intensity === 'strong'
          ? 'cinematic'
          : 'balanced'
    ),
    visualStructure: input.brand.visualEssence?.structure ?? 'unknown',
    visualTemperature: input.brand.visualEssence?.temperature ?? 'unknown',
    visualContrast: input.brand.visualEssence?.contrast ?? input.palette.contrast,
    visualComposition: input.brand.visualEssence?.composition ?? 'centered',
    brandCategory: input.context.brandCategory,
    shapeSignature: signature,
    typographicCandidate: Boolean(signature?.typographicCandidate),
    complexity: signature?.complexity ?? 0.5,
    density: signature?.density ?? 0.5,
  }
}

function decideManifestationMode(analysis: BrandAnalysis): ManifestationMode {
  if (analysis.requestedMode) {
    return analysis.requestedMode
  }

  if (analysis.typographicCandidate && analysis.visualContrast === 'high') {
    return 'centelha'
  }
  if (analysis.shapeSignature?.type === 'fragmentado') {
    return 'elemental'
  }
  if (analysis.brandCategory === 'technology' || analysis.brandCategory === 'services') {
    return 'robo-ia'
  }
  if (analysis.brandCategory === 'health' || analysis.visualStructure === 'organic') {
    return 'natureza'
  }
  if (analysis.brandCategory === 'food' || analysis.visualTemperature === 'warm') {
    return 'elemental'
  }
  if (analysis.shapeSignature?.dominantAxis === 'vertical' && analysis.complexity > 0.62) {
    return 'natureza'
  }
  if (analysis.shapeSignature?.type === 'orbital' || analysis.shapeSignature?.type === 'radial') {
    return 'centelha'
  }
  return 'centelha'
}

function decideManifestationVariant(analysis: BrandAnalysis, mode: ManifestationMode): string {
  if (analysis.requestedVariant) {
    return analysis.requestedVariant
  }

  if (mode === 'robo-ia') {
    if (analysis.shapeSignature?.type === 'linear' && (analysis.shapeSignature.angularity ?? 0) > 0.62) {
      return 'industrial'
    }
    if (analysis.visualContrast === 'high' || analysis.complexity > 0.72) {
      return 'premium-tech'
    }
    return analysis.density > 0.62 ? 'industrial' : 'elegante'
  }

  if (mode === 'natureza') {
    if (analysis.shapeSignature?.type === 'organico' && analysis.shapeSignature?.massDistribution === 'spread') {
      return 'folhas'
    }
    if (analysis.visualComposition === 'vertical' || analysis.shapeSignature?.dominantAxis === 'vertical') {
      return 'arvore'
    }
    if (analysis.visualTemperature === 'warm') {
      return 'fruto'
    }
    return analysis.visualContrast === 'high' ? 'energia-verde' : 'folhas'
  }

  if (mode === 'elemental') {
    if (analysis.shapeSignature?.type === 'fragmentado') {
      return 'fogo'
    }
    if (analysis.visualTemperature === 'cool') {
      return 'agua'
    }
    if (analysis.visualStructure === 'angular' || analysis.density > 0.7) {
      return 'terra'
    }
    return analysis.visualComposition === 'spread' ? 'ar' : 'fogo'
  }

  if (analysis.typographicCandidate) {
    return 'fused-logo'
  }
  return analysis.visualContrast === 'high' ? 'living-glow' : 'inspired-shape'
}

function selectManifestation(analysis: BrandAnalysis): EntityManifestation {
  const mode = decideManifestationMode(analysis)
  const requestedVariant = decideManifestationVariant(analysis, mode)
  const modeDefinition = manifestationModes.find((definition) => definition.id === mode)
  const variant = modeDefinition?.variants.some((candidate) => candidate.id === requestedVariant)
    ? requestedVariant
    : modeDefinition?.variants[0]?.id

  if (!variant) {
    throw new Error(`No manifestation variant available for mode "${mode}".`)
  }

  const spec = getManifestationSpec(mode)

  return {
    mode,
    variant,
    intensity: analysis.intensity,
    spec,
    artDirection: spec.artDirection,
    behavior: spec.behavior,
    birthTimeline: spec.birthTimeline,
  }
}

function applyPersonaDNAToManifestation(args: {
  manifestation: EntityManifestation
  personaDNA: EntityProfile['personaDNA']
}): EntityManifestation {
  return {
    ...args.manifestation,
    birthTimeline: modulateBirthTimeline({
      birthTimeline: args.manifestation.birthTimeline,
      personaDNA: args.personaDNA,
    }),
  }
}

function buildPreview(args: {
  input: ProcessBrandInput
  manifestation: EntityManifestation
  processedShape?: ProcessedShape
  baseForm: EntityMorphology['baseForm']
  personaDNA: EntityProfile['personaDNA']
  visualArchetype: EntityProfile['visualArchetype']
  visualBodyPlan: EntityProfile['visualBodyPlan']
  visualFinishPlan: EntityProfile['visualFinishPlan']
}): PersonaLabPreview {
  const preview = buildManifestationPreview({
    manifestationMode: args.manifestation.mode,
    manifestationVariant: args.manifestation.variant,
    visualEssence: args.input.brand.visualEssence,
    palette: args.input.palette,
    shapeSource: args.input.brand.shapeSource,
    processedShape: args.processedShape,
    baseFormProfile: args.baseForm,
    personaDNA: args.personaDNA,
    visualBodyPlan: args.visualBodyPlan,
    visualFinishPlan: args.visualFinishPlan,
  })

  if (!preview) {
    throw new Error('Unable to build entity preview from manifestation decision.')
  }

  return {
    ...preview,
    visualArchetype: args.visualArchetype,
    visualBodyPlan: args.visualBodyPlan,
    visualFinishPlan: args.visualFinishPlan,
  }
}

function processShape(input: ProcessBrandInput, manifestation: EntityManifestation): ProcessedShape | undefined {
  if (!input.brand.shapeSource) {
    return undefined
  }

  return abstractShape(input.brand.shapeSource, manifestation.mode, manifestation.variant)
}

function resolveSilhouetteClarity(args: {
  analysis: BrandAnalysis
  processedShape?: ProcessedShape
}): EntityMorphology['silhouetteClarity'] {
  const { analysis, processedShape } = args
  const complexity = processedShape?.signature.complexity ?? analysis.complexity
  const density = processedShape?.signature.density ?? analysis.density

  if (analysis.typographicCandidate || analysis.visualContrast === 'high') {
    return 'high'
  }
  if (complexity > 0.78 || density < 0.22) {
    return 'low'
  }
  return 'medium'
}

function resolveSymmetry(axis?: ShapeSignature['dominantAxis']): EntityMorphology['symmetry'] {
  if (axis === 'vertical') {
    return 'vertical'
  }
  if (axis === 'horizontal') {
    return 'horizontal'
  }
  return axis === 'radial' ? 'radial' : 'balanced'
}

function buildCoreZones(args: {
  manifestation: EntityManifestation
  processedShape?: ProcessedShape
}): EntityMorphology['coreZones'] {
  const centroid = args.processedShape?.debug.perceptualCentroid ?? args.processedShape?.debug.centroid ?? { x: 120, y: 120 }
  const signature = args.processedShape?.signature
  const radiusBias =
    signature?.type === 'orbital'
      ? 3
      : signature?.massDistribution === 'concentrated'
        ? 2
        : signature?.fragmentation && signature.fragmentation > 0.66
          ? -2
          : 0

  return [
    {
      id: 'primary',
      center: centroid,
      radius: (args.manifestation.mode === 'robo-ia' ? 18 : args.manifestation.mode === 'natureza' ? 20 : 24) + radiusBias,
      weight:
        (args.manifestation.mode === 'centelha' ? 0.94 : args.manifestation.mode === 'natureza' ? 0.58 : 0.72) *
        (signature?.massDistribution === 'concentrated' ? 1.06 : 0.94),
    },
  ]
}

function buildAnchors(emissionPoints: ShapePoint[]): EntityMorphology['anchors'] {
  return emissionPoints.slice(0, 12).map((point, index) => ({
    id: `emission-${index}`,
    point,
    role: 'emission',
    weight: 1 - index / Math.max(12, emissionPoints.length || 12),
  }))
}

function buildMorphology(context: EntityDecisionContext): EntityMorphology {
  const { analysis, manifestation, processedShape, baseForm, personaDNA } = context
  const dnaModulators = resolvePersonaDNAModulators(personaDNA)
  const signature = processedShape?.signature ?? analysis.shapeSignature
  const silhouetteClarity = resolveSilhouetteClarity({ analysis, processedShape })
  const edgeBase =
    silhouetteClarity === 'high'
      ? 0.88
      : silhouetteClarity === 'low'
        ? 0.58
        : 0.74
  const edgeStrength = clamp(edgeBase + (analysis.typographicCandidate ? 0.08 : 0) + (analysis.visualContrast === 'high' ? 0.05 : 0))
  const emissionPoints = processedShape?.emissionPoints ?? []

  return {
    source: processedShape ? 'shape-intelligence' : 'backend-engine',
    shapeRelation: manifestation.artDirection.shapeRelation,
    massDistribution: manifestation.artDirection.massDistribution,
    abstractionLevel: manifestation.artDirection.abstractionLevel,
    fillStrategy: manifestation.artDirection.shapeFillStrategy,
    baseForm,
    edgeStrength,
    silhouetteClarity,
    typographicProtection: analysis.typographicCandidate,
    axis: signature?.dominantAxis ?? 'radial',
    symmetry: resolveSymmetry(signature?.dominantAxis),
    structuralComplexity: clamp(signature?.complexity ?? analysis.complexity),
    coreZones: buildCoreZones({ manifestation, processedShape }),
    fieldRelation: {
      mask:
        personaDNA.defensiveness > 0.66
          ? 'shape-bound'
          : manifestation.mode === 'robo-ia'
          ? 'minimal'
          : manifestation.mode === 'natureza'
            ? 'aura-bound'
            : signature?.massDistribution === 'spread'
              ? 'distributed'
              : 'shape-bound',
      spread: clamp(
        (manifestation.mode === 'natureza' ? 0.66 : manifestation.mode === 'robo-ia' ? 0.42 : 0.56) +
          (signature?.massDistribution === 'spread' ? 0.08 : -0.04) +
          (signature?.type === 'fragmentado' ? 0.06 : 0) +
          dnaModulators.fieldSpreadBias,
      ),
      adhesion: clamp(
        (manifestation.artDirection.shapeRelation === 'literal' ? 0.88 : analysis.typographicCandidate ? 0.78 : 0.62) +
          ((signature?.symmetry ?? 0.5) - 0.5) * 0.12 +
          dnaModulators.fieldAttachment * 0.12,
      ),
    },
    anchors: buildAnchors(emissionPoints),
    emissionPoints,
    processedShape,
  }
}

function buildBehaviorProfile(args: {
  id: string
  family: EntityBehaviorProfile['family']
  mode: string
  manifestation: EntityManifestation
  spec: ManifestationSpec
  amplitudeMultiplier?: number
  speedMultiplier?: number
}): EntityBehaviorProfile {
  const runtimeVisual = args.spec.runtime.defaultVisual
  const legacySpec = args.spec as ManifestationSpec & {
    motion?: {
      rhythm?: string
      speed?: number
    }
    lighting?: {
      glow?: number
    }
  }
  const rhythm = legacySpec.motion?.rhythm ?? runtimeVisual.motion
  const speed = legacySpec.motion?.speed ?? (runtimeVisual.motion === 'pulse' ? 1 : runtimeVisual.motion === 'float' ? 0.76 : 0.62)
  const amplitude = legacySpec.lighting?.glow ?? (runtimeVisual.glow === 'bold' ? 0.88 : runtimeVisual.glow === 'focused' ? 0.74 : 0.58)

  return {
    id: args.id,
    family: args.family,
    mode: args.mode,
    intensity: args.manifestation.intensity,
    rhythm,
    speed: speed * (args.speedMultiplier ?? 1),
    amplitude: amplitude * (args.amplitudeMultiplier ?? 1),
  }
}

function buildIntensityRules(args: {
  manifestation: EntityManifestation
  morphology: EntityMorphology
}): EntityIntensityRule[] {
  const contrastBoost = args.manifestation.artDirection.contrast === 'high' ? 1.12 : args.manifestation.artDirection.contrast === 'low' ? 0.86 : 1
  const structureBoost = args.morphology.silhouetteClarity === 'high' ? 1.08 : args.morphology.silhouetteClarity === 'low' ? 0.86 : 1

  return [
    { intensity: 'soft', shape: 0.88 * contrastBoost * structureBoost, core: 0.62, field: 0.34, particles: 0.28 },
    { intensity: 'balanced', shape: 1 * contrastBoost * structureBoost, core: 0.76, field: 0.5, particles: 0.44 },
    { intensity: 'cinematic', shape: 1.08 * contrastBoost * structureBoost, core: 0.88, field: 0.68, particles: 0.72 },
  ]
}

function buildBehavior(context: EntityDecisionContext, morphology: EntityMorphology): EntityBehavior {
  const { manifestation, personaDNA } = context
  const dnaModulators = resolvePersonaDNAModulators(personaDNA)
  const signature = morphology.processedShape?.signature
  const runtimeVisual = manifestation.spec.runtime.defaultVisual
  const legacySpec = manifestation.spec as ManifestationSpec & {
    motion?: {
      rhythm?: string
      speed?: number
    }
    lighting?: {
      glow?: number
    }
    particleSystem?: {
      density?: number
    }
  }
  const baseRhythm = legacySpec.motion?.rhythm ?? runtimeVisual.motion
  const baseSpeed = legacySpec.motion?.speed ?? (runtimeVisual.motion === 'pulse' ? 1 : runtimeVisual.motion === 'float' ? 0.76 : 0.62)
  const basePulse = legacySpec.lighting?.glow ?? (runtimeVisual.glow === 'bold' ? 0.88 : runtimeVisual.glow === 'focused' ? 0.74 : 0.58)
  const baseVariance = legacySpec.particleSystem?.density ?? (runtimeVisual.density === 'compact' ? 0.78 : runtimeVisual.density === 'airy' ? 0.34 : 0.56)
  const speedMultiplier =
    (morphology.typographicProtection ? 0.82 : morphology.structuralComplexity > 0.72 ? 0.92 : 1) *
    (signature?.massDistribution === 'spread' ? 1.06 : 0.96) *
    (signature?.type === 'fragmentado' ? 1.08 : signature?.type === 'geometrico' ? 0.94 : 1) *
    dnaModulators.cadenceMultiplier
  const amplitudeMultiplier =
    (morphology.silhouetteClarity === 'low' ? 0.72 : morphology.silhouetteClarity === 'high' ? 1.02 : 0.9) *
    ((signature?.curvatureRatio ?? 0.5) > 0.62 ? 1.08 : (signature?.angularity ?? 0.5) > 0.6 ? 0.9 : 1) *
    (1 + personaDNA.charisma * 0.14 - personaDNA.defensiveness * 0.08)

  return {
    idle: buildBehaviorProfile({ id: 'idle', family: 'idle', mode: manifestation.behavior.idle, manifestation, spec: manifestation.spec, speedMultiplier, amplitudeMultiplier }),
    hover: buildBehaviorProfile({ id: 'hover', family: 'hover', mode: manifestation.behavior.hover, manifestation, spec: manifestation.spec, speedMultiplier: 1.05, amplitudeMultiplier: 1.08 }),
    birth: {
      ...buildBehaviorProfile({ id: 'birth', family: 'birth', mode: manifestation.behavior.birth, manifestation, spec: manifestation.spec, speedMultiplier: 1, amplitudeMultiplier: 1 }),
      timelineId: `${manifestation.mode}-${manifestation.variant}-birth`,
      ritualStages: manifestation.birthTimeline.stages.map((stage) => stage.id),
    },
    stabilize: buildBehaviorProfile({ id: 'stabilize', family: 'stabilize', mode: manifestation.behavior.stabilize, manifestation, spec: manifestation.spec, speedMultiplier: 0.76, amplitudeMultiplier: 0.58 }),
    rhythm: {
      base: baseRhythm,
      speed: baseSpeed * speedMultiplier,
      pulse: basePulse * amplitudeMultiplier * (1 + dnaModulators.corePulseBias),
      variance:
        baseVariance *
        (morphology.typographicProtection ? 0.5 : 0.76) *
        ((signature?.fragmentation ?? 0.4) > 0.6 ? 1.18 : (signature?.symmetry ?? 0.5) > 0.72 ? 0.86 : 1) *
        (1 + personaDNA.wildness * 0.18 - personaDNA.stability * 0.12),
    },
    intensityRules: buildIntensityRules({ manifestation, morphology }),
  }
}

function buildParticleBudget(context: EntityDecisionContext, morphology: EntityMorphology): EntityFinalForm['particles']['budget'] {
  if (morphology.typographicProtection || morphology.silhouetteClarity === 'low') {
    return 'low'
  }
  if (context.personaDNA.wildness > 0.66 || context.personaDNA.charisma > 0.72) {
    return context.manifestation.intensity === 'soft' ? 'low' : 'medium'
  }
  if (context.manifestation.intensity === 'cinematic' && context.manifestation.mode !== 'robo-ia') {
    return 'medium'
  }
  return 'low'
}

function buildFinalForm(context: EntityDecisionContext, morphology: EntityMorphology): EntityFinalForm {
  const dnaModulators = resolvePersonaDNAModulators(context.personaDNA)
  const revealBoost = context.manifestation.intensity === 'cinematic' ? 1.08 : context.manifestation.intensity === 'soft' ? 0.88 : 1
  const clarityFactor = morphology.silhouetteClarity === 'high' ? 1 : morphology.silhouetteClarity === 'medium' ? 0.84 : 0.68
  const stableShape = morphology.typographicProtection || morphology.structuralComplexity > 0.72

  return {
    presenceMode:
      context.personaDNA.presenceStyle === 'dominant'
        ? 'reveal-lock'
        : context.personaDNA.temperament === 'calm' || context.personaDNA.temperament === 'ritual'
          ? 'final-stabilize'
          : 'presence-settle',
    locked: true,
    intensity: context.manifestation.intensity,
    silhouetteClarity: morphology.silhouetteClarity,
    edgeStrength: clamp(morphology.edgeStrength * revealBoost),
    smearReduction: clamp((stableShape ? 0.9 : context.manifestation.mode === 'elemental' ? 0.72 : 0.82) + dnaModulators.containment * 0.08, 0.6, 0.96),
    shape: {
      opacity: 1,
      scale: stableShape ? 0.98 : 1 + dnaModulators.postureSpread * 0.08,
      blur: stableShape ? 0 : 0.04,
      intensity: revealBoost,
      deformation: clamp((stableShape ? 0.04 : 0.14) + context.personaDNA.wildness * 0.06 - context.personaDNA.stability * 0.04, 0.02, 0.22),
      edgeContrast: clamp(morphology.edgeStrength * (stableShape ? 1.22 : 1.08) + (context.personaDNA.precision === 'precise' ? 0.08 : 0)),
    },
    core: {
      opacity: (0.56 + context.personaDNA.charisma * 0.12) * clarityFactor,
      scale: 0.78 + dnaModulators.coreRadiusBias * 0.28,
      blur: 0.16,
      intensity: clamp(0.52 + context.personaDNA.charisma * 0.18 + dnaModulators.corePulseBias * 0.12, 0.4, 0.92),
      internalPresence: clamp(0.62 + context.personaDNA.stability * 0.12 + context.personaDNA.charisma * 0.08, 0.4, 0.94),
    },
    field: {
      opacity: clamp((0.3 + context.personaDNA.expansion === 'expansive' ? 0.06 : 0) * clarityFactor, 0.12, 0.46),
      scale: 0.68,
      blur: 0.52,
      intensity: clamp(0.3 + context.personaDNA.charisma * 0.12 - context.personaDNA.defensiveness * 0.06, 0.18, 0.56),
      spread: clamp(morphology.fieldRelation.spread * (0.72 + dnaModulators.fieldSpreadBias), 0.18, 0.82),
    },
    particles: {
      opacity: clamp((0.24 + context.personaDNA.wildness * 0.1) * clarityFactor, 0.08, 0.42),
      scale: 0.66,
      blur: 0,
      intensity: clamp(0.2 + context.personaDNA.wildness * 0.16 + context.personaDNA.charisma * 0.08, 0.08, 0.56),
      budget: buildParticleBudget(context, morphology),
      spread: clamp(0.32 + context.personaDNA.wildness * 0.14 - context.personaDNA.defensiveness * 0.1, 0.12, 0.56),
      size: clamp((stableShape ? 0.44 : 0.54) + dnaModulators.particleDensityBias * 0.4, 0.32, 0.72),
    },
    layerVisibility: context.runtimeControl?.layerVisibility,
  }
}

function resolveBehavioralTemperature(context: EntityDecisionContext): BehaviorState['behavioralTemperature'] {
  if (context.analysis.visualTemperature === 'warm' || context.manifestation.mode === 'natureza' || context.manifestation.mode === 'centelha') {
    return context.manifestation.intensity === 'cinematic' ? 'hot' : 'warm'
  }
  if (context.manifestation.mode === 'robo-ia' || context.analysis.visualTemperature === 'cool') {
    return 'cool'
  }
  return 'neutral'
}

function buildBehaviorState(context: EntityDecisionContext, behavior: EntityBehavior, morphology: EntityMorphology): BehaviorState {
  const { input, analysis, manifestation } = context
  const isPremium = input.context.brandCategory === 'legal' || input.context.styleAnswers.brandStyle === 'formal'
  const isBold = input.context.styleAnswers.actionStyle === 'urgent' || manifestation.intensity === 'cinematic' || analysis.visualContrast === 'high'
  const isTechnical = input.context.brandCategory === 'technology' || input.context.brandCategory === 'services' || input.context.styleAnswers.languageStyle === 'technical'
  const clarityBoost = morphology.silhouetteClarity === 'high' ? 0.08 : morphology.silhouetteClarity === 'low' ? -0.08 : 0
  const baseLoop = manifestation.mode === 'centelha' ? 0.42 : manifestation.mode === 'natureza' ? 0.38 : manifestation.mode === 'robo-ia' ? 0.28 : 0.34

  return {
    schemaVersion: 1,
    engagementLevel: isBold ? 'engaged' : 'warming',
    responseIntensity: isPremium || isTechnical ? 'soft' : behavior.idle.intensity,
    interactionCount: 0,
    affinityScore: clamp(0.3 + clarityBoost + (isTechnical ? 0.04 : 0) + (isPremium ? 0.02 : 0)),
    loopStrength: clamp(baseLoop + (isBold ? 0.12 : 0) - (isPremium ? 0.08 : 0) + (isTechnical ? 0.02 : 0)),
    relationshipMode: 'new',
    behavioralTemperature: resolveBehavioralTemperature(context),
  }
}

function buildProgressionState(context: EntityDecisionContext, morphology: EntityMorphology): ProgressionState {
  const technicalUnlock = context.manifestation.mode === 'robo-ia' ? (['advanced-orchestration'] as const) : []
  const visualUnlock = context.manifestation.intensity === 'cinematic' ? (['social-export-pack'] as const) : []
  const baselineRefinement = 0.2 + (morphology.silhouetteClarity === 'high' ? 0.12 : 0) + (morphology.typographicProtection ? 0.08 : 0)

  return {
    schemaVersion: 1,
    level: 1,
    xp: 0,
    maturityStage: 'seed',
    evolutionStage: 'initial',
    refinementScore: clamp(baselineRefinement),
    unlockFlags: [...technicalUnlock, ...visualUnlock],
    growthHistory: [
      {
        at: new Date().toISOString(),
        event: 'created',
        deltaXp: 0,
        note: `Initialized as ${context.manifestation.mode}/${context.manifestation.variant}.`,
      },
    ],
  }
}

function buildInitialMemory(context: EntityDecisionContext): UserMemory {
  const { input } = context
  const knownPreferences: UserMemory['knownPreferences'] = []
  const recentInterests = [input.context.brandCategory, input.manifestation?.mode].filter(Boolean) as string[]

  if (input.context.styleAnswers.languageStyle) {
    knownPreferences.push({
      key: 'languageStyle',
      value: input.context.styleAnswers.languageStyle,
      confidence: 0.72,
      source: 'explicit',
      updatedAt: new Date().toISOString(),
    })
  }

  if (input.context.styleAnswers.brandStyle) {
    knownPreferences.push({
      key: 'brandStyle',
      value: input.context.styleAnswers.brandStyle,
      confidence: 0.72,
      source: 'explicit',
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    schemaVersion: 1,
    knownPreferences,
    lastInteractions: [],
    recentInterests,
    recurringTopics: [],
    memoryConfidence: knownPreferences.length > 0 ? 0.28 : 0,
  }
}

function buildHookLoop(context: EntityDecisionContext, behaviorState: BehaviorState): HookLoop {
  const { manifestation, input } = context
  const isConsultive = input.context.styleAnswers.actionStyle === 'consultive'
  const isTechnical = manifestation.mode === 'robo-ia' || input.context.styleAnswers.languageStyle === 'technical'
  const isSocial = manifestation.mode === 'centelha' || manifestation.mode === 'natureza'

  return {
    schemaVersion: 1,
    triggerType: isTechnical ? 'progress-update' : 'visual-reveal',
    expectedUserAction: isConsultive ? 'reply' : isSocial ? 'share' : 'return',
    rewardType: isTechnical ? 'identity-insight' : isSocial ? 'visual-payoff' : 'personalization',
    reinforcementScore: clamp(behaviorState.loopStrength + (isConsultive ? 0.04 : 0)),
    returnProbability: clamp(0.18 + behaviorState.affinityScore * 0.35 + behaviorState.loopStrength * 0.28),
    loopCategory: isConsultive ? 'conversion' : 'onboarding',
    cadence: isTechnical ? 'event-driven' : 'session',
  }
}

function buildRelationalState(context: EntityDecisionContext, behavior: EntityBehavior, morphology: EntityMorphology): EntityRelationalState {
  const now = new Date().toISOString()
  const behaviorState = buildBehaviorState(context, behavior, morphology)
  const progression = buildProgressionState(context, morphology)
  const userMemory = buildInitialMemory(context)
  const hookLoop = buildHookLoop(context, behaviorState)
  const binding = buildInitialBindingState({
    manifestation: context.manifestation,
    createdAt: now,
  })
  const imprint = buildInitialIdentityImprint({
    manifestation: context.manifestation,
    createdAt: now,
  })
  const timelineLog = buildInitialEntityTimelineLog(now)

  const relational = {
    behaviorState: {
      ...behaviorState,
      updatedAt: now,
    },
    progression: {
      ...progression,
      updatedAt: now,
    },
    userMemory: {
      ...userMemory,
      updatedAt: now,
    },
    hookLoop: {
      ...hookLoop,
      updatedAt: now,
    },
    binding,
    imprint,
    timelineLog,
    value: computeEntityAccumulatedValueFromRelational({
      binding,
      imprint,
      progression: {
        ...progression,
        updatedAt: now,
      },
      userMemory: {
        ...userMemory,
        updatedAt: now,
      },
    }, now),
  }

  return relational
}

function assembleEntityProfile(context: EntityDecisionContext, args: {
  morphology: EntityMorphology
  behavior: EntityBehavior
  relational: EntityRelationalState
  finalForm: EntityFinalForm
  options?: ProcessBrandOptions
}): EntityProfile {
  return buildEntityProfile({
    input: context.input,
    manifestation: context.manifestation,
    preview: context.preview,
    personaDNA: context.personaDNA,
    visualArchetype: context.visualArchetype,
    visualBodyPlan: context.visualBodyPlan,
    visualFinishPlan: context.visualFinishPlan,
    morphology: args.morphology,
    behavior: args.behavior,
    relational: args.relational,
    finalForm: args.finalForm,
    processedShape: context.processedShape,
    runtimeControl: context.runtimeControl,
    id: args.options?.id,
    requestId: args.options?.requestId,
    sessionId: args.options?.sessionId,
    source: args.options?.source ?? 'backend-engine',
  })
}

export function processBrand(input: ProcessBrandInput, options?: ProcessBrandOptions): EntityProfile {
  const analysis = analyzeBrandInput(input, options)
  const baseManifestation = selectManifestation(analysis)
  const processedShape = processShape(input, baseManifestation)
  const baseForm = deriveBaseFormProfile({
    shapeSignature: processedShape?.signature ?? analysis.shapeSignature,
    visualEssence: input.brand.visualEssence,
  })
  const personaDNA = derivePersonaDNA({
    shapeSignature: processedShape?.signature ?? analysis.shapeSignature,
    baseFormProfile: baseForm,
    visualEssence: input.brand.visualEssence,
  })
  const visualArchetype = deriveVisualArchetype({
    shapeSignature: processedShape?.signature ?? analysis.shapeSignature,
    baseFormProfile: baseForm,
    personaDNA,
  })
  const visualBodyPlan = buildVisualBody({
    visualArchetype,
    processedShape,
  })
  const visualFinishPlan = buildVisualFinishPlan({
    visualArchetype,
    visualBodyPlan,
  })
  const manifestation = applyPersonaDNAToManifestation({
    manifestation: baseManifestation,
    personaDNA,
  })
  const preview = buildPreview({
    input,
    manifestation,
    processedShape,
    baseForm,
    personaDNA,
    visualArchetype,
    visualBodyPlan,
    visualFinishPlan,
  })
  const context = {
    input,
    analysis,
    manifestation,
    preview,
    personaDNA,
    visualArchetype,
    visualBodyPlan,
    visualFinishPlan,
    baseForm,
    processedShape,
    runtimeControl: options?.runtimeControl,
  }
  const morphology = buildMorphology(context)
  const behavior = buildBehavior(context, morphology)
  const relational = buildRelationalState(context, behavior, morphology)
  const finalForm = buildFinalForm(context, morphology)

  return assembleEntityProfile(context, {
    morphology,
    behavior,
    relational,
    finalForm,
    options,
  })
}
