import type { EntityBehavior, EntityBehaviorProfile, EntityIntensityRule } from '../contracts/EntityBehavior'
import type { EntityFinalForm } from '../contracts/EntityFinalForm'
import type { EntityInput } from '../contracts/EntityInput'
import type { EntityMorphology } from '../contracts/EntityMorphology'
import type { EntityProfile } from '../contracts/EntityProfile'
import type { BehaviorState } from '../contracts/BehaviorState'
import type { HookLoop } from '../contracts/HookLoop'
import type { ProgressionState } from '../contracts/ProgressionState'
import type { UserMemory } from '../contracts/UserMemory'
import type { EntityManifestation } from '../../manifestation/contracts/EntityManifestation'
import type { RuntimeControl } from '../../orchestration/contracts/RuntimeControl'
import type { RenderOutput } from '../../rendering/contracts/RenderOutput'
import type { ProcessedShape } from '../../shape/contracts/ProcessedShape'
import { buildVisualFinishPlan } from '../../materialization/services/buildVisualFinishPlan'
import { deriveBaseFormProfile } from '../../base-form/services/deriveBaseFormProfile'
import { derivePersonaDNA } from '../../persona-dna/services/derivePersonaDNA'
import { deriveVisualArchetype } from '../../visual-archetype/services/deriveVisualArchetype'
import { buildVisualBody } from '../../visual-archetype/services/buildVisualBody'
import { buildInitialBindingState } from '../services/bindingEngine'
import { buildInitialEntityTimelineLog } from '../services/continuityEngine'
import { computeEntityAccumulatedValueFromRelational } from '../services/entityValueEngine'
import { buildEntityExportProfile } from '../services/exportProfileEngine'
import { buildInitialIdentityImprint } from '../services/imprintEngine'
import { initializeUserMemory } from '../services/memoryEngine'
import { buildEntitySocialProfile } from '../services/socialProfileEngine'

function createEntityId() {
  return `entity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveSilhouetteClarity(readabilityScore?: number): EntityFinalForm['silhouetteClarity'] {
  if (typeof readabilityScore !== 'number') {
    return 'medium'
  }
  if (readabilityScore >= 76) {
    return 'high'
  }
  if (readabilityScore <= 48) {
    return 'low'
  }
  return 'medium'
}

function buildBehaviorProfile(args: {
  id: string
  family: EntityBehaviorProfile['family']
  mode: string
  manifestation: EntityManifestation
}): EntityBehaviorProfile {
  return {
    id: args.id,
    family: args.family,
    mode: args.mode,
    intensity: args.manifestation.intensity,
    rhythm: args.manifestation.spec.motion.rhythm,
    speed: args.manifestation.spec.motion.speed,
    amplitude: args.manifestation.spec.lighting.glow,
  }
}

function buildIntensityRules(manifestation: EntityManifestation): EntityIntensityRule[] {
  const contrastBoost = manifestation.artDirection.contrast === 'high' ? 1.12 : manifestation.artDirection.contrast === 'low' ? 0.86 : 1

  return [
    { intensity: 'soft', shape: 0.92 * contrastBoost, core: 0.72, field: 0.48, particles: 0.42 },
    { intensity: 'balanced', shape: 1 * contrastBoost, core: 0.82, field: 0.62, particles: 0.58 },
    { intensity: 'cinematic', shape: 1.06 * contrastBoost, core: 0.9, field: 0.76, particles: 0.82 },
  ]
}

function buildInitialBehaviorState(manifestation: EntityManifestation): BehaviorState {
  const warmerModes = manifestation.mode === 'natureza' || manifestation.mode === 'centelha'

  return {
    schemaVersion: 1,
    engagementLevel: 'warming',
    responseIntensity: manifestation.intensity,
    interactionCount: 0,
    affinityScore: 0.32,
    loopStrength: manifestation.intensity === 'cinematic' ? 0.46 : manifestation.intensity === 'soft' ? 0.26 : 0.36,
    relationshipMode: 'new',
    behavioralTemperature: warmerModes ? 'warm' : manifestation.mode === 'robo-ia' ? 'cool' : 'neutral',
  }
}

function buildInitialProgressionState(): ProgressionState {
  return {
    schemaVersion: 1,
    level: 1,
    xp: 0,
    maturityStage: 'seed',
    evolutionStage: 'initial',
    refinementScore: 0.24,
    unlockFlags: [],
    growthHistory: [
      {
        at: new Date().toISOString(),
        event: 'created',
        deltaXp: 0,
        note: 'Entity profile initialized.',
      },
    ],
  }
}

function buildInitialUserMemory(): UserMemory {
  return initializeUserMemory()
}

function buildInitialHookLoop(manifestation: EntityManifestation): HookLoop {
  const socialModes = manifestation.mode === 'centelha' || manifestation.mode === 'natureza'

  return {
    schemaVersion: 1,
    triggerType: 'visual-reveal',
    expectedUserAction: 'return',
    rewardType: socialModes ? 'visual-payoff' : 'identity-insight',
    reinforcementScore: manifestation.intensity === 'cinematic' ? 0.5 : 0.34,
    returnProbability: manifestation.intensity === 'soft' ? 0.22 : 0.31,
    loopCategory: 'onboarding',
    cadence: 'session',
  }
}

export function buildEntityMorphology(args: {
  manifestation: EntityManifestation
  renderOutput?: RenderOutput
  processedShape?: ProcessedShape
}): EntityMorphology {
  const processedShape = args.renderOutput?.debugShape?.processedShape ?? args.processedShape
  const signature = processedShape?.signature
  const centroid = processedShape?.debug.perceptualCentroid ?? processedShape?.debug.centroid ?? { x: 120, y: 120 }
  const emissionPoints = processedShape?.emissionPoints ?? []

  return {
    source: processedShape ? 'shape-intelligence' : 'hybrid',
    shapeRelation: args.manifestation.artDirection.shapeRelation,
    massDistribution: args.manifestation.artDirection.massDistribution,
    abstractionLevel: args.manifestation.artDirection.abstractionLevel,
    fillStrategy: args.manifestation.artDirection.shapeFillStrategy,
    baseForm: deriveBaseFormProfile({
      shapeSignature: signature,
    }),
    edgeStrength: args.renderOutput?.debugShape?.silhouetteContrast === 'high' ? 0.92 : args.renderOutput?.debugShape?.silhouetteContrast === 'low' ? 0.56 : 0.74,
    silhouetteClarity: resolveSilhouetteClarity(args.renderOutput?.debugShape?.readabilityScore),
    typographicProtection: Boolean(signature?.typographicCandidate),
    axis: signature?.dominantAxis ?? 'radial',
    symmetry: signature?.dominantAxis === 'vertical' ? 'vertical' : signature?.dominantAxis === 'horizontal' ? 'horizontal' : 'balanced',
    structuralComplexity: signature?.complexity ?? 0.5,
    coreZones: [
      {
        id: 'primary',
        center: centroid,
        radius: args.manifestation.mode === 'robo-ia' ? 18 : 24,
        weight: args.manifestation.mode === 'centelha' ? 0.94 : args.manifestation.mode === 'natureza' ? 0.52 : 0.72,
      },
    ],
    fieldRelation: {
      mask: args.manifestation.mode === 'robo-ia' ? 'minimal' : args.manifestation.mode === 'natureza' ? 'aura-bound' : 'shape-bound',
      spread: args.manifestation.mode === 'centelha' ? 0.58 : args.manifestation.mode === 'natureza' ? 0.72 : 0.64,
      adhesion: args.manifestation.artDirection.shapeRelation === 'literal' ? 0.86 : 0.62,
    },
    anchors: emissionPoints.slice(0, 12).map((point, index) => ({
      id: `emission-${index}`,
      point,
      role: 'emission',
      weight: 1 - index / Math.max(12, emissionPoints.length || 12),
    })),
    emissionPoints,
    processedShape,
  }
}

export function buildEntityBehavior(manifestation: EntityManifestation): EntityBehavior {
  return {
    idle: buildBehaviorProfile({ id: 'idle', family: 'idle', mode: manifestation.behavior.idle, manifestation }),
    hover: buildBehaviorProfile({ id: 'hover', family: 'hover', mode: manifestation.behavior.hover, manifestation }),
    birth: {
      ...buildBehaviorProfile({ id: 'birth', family: 'birth', mode: manifestation.behavior.birth, manifestation }),
      timelineId: `${manifestation.mode}-${manifestation.variant}-birth`,
      ritualStages: manifestation.birthTimeline.stages.map((stage) => stage.id),
    },
    stabilize: buildBehaviorProfile({ id: 'stabilize', family: 'stabilize', mode: manifestation.behavior.stabilize, manifestation }),
    rhythm: {
      base: manifestation.spec.motion.rhythm,
      speed: manifestation.spec.motion.speed,
      pulse: manifestation.spec.lighting.glow,
      variance: manifestation.spec.particleSystem.density,
    },
    intensityRules: buildIntensityRules(manifestation),
  }
}

export function buildEntityFinalForm(args: {
  manifestation: EntityManifestation
  morphology: EntityMorphology
  runtimeControl?: RuntimeControl
}): EntityFinalForm {
  const finalRevealBoost = args.manifestation.intensity === 'cinematic' ? 1.08 : args.manifestation.intensity === 'soft' ? 0.88 : 1

  return {
    presenceMode: 'presence-settle',
    locked: true,
    intensity: args.manifestation.intensity,
    silhouetteClarity: args.morphology.silhouetteClarity,
    edgeStrength: Math.min(1, args.morphology.edgeStrength * finalRevealBoost),
    smearReduction: args.manifestation.mode === 'elemental' ? 0.72 : 0.82,
    shape: {
      opacity: 1,
      scale: 1,
      blur: 0,
      intensity: finalRevealBoost,
      deformation: args.morphology.typographicProtection ? 0.08 : 0.18,
      edgeContrast: Math.min(1, args.morphology.edgeStrength * 1.12),
    },
    core: {
      opacity: 0.6,
      scale: 0.82,
      blur: 0.2,
      intensity: 0.58,
      internalPresence: 0.64,
    },
    field: {
      opacity: 0.34,
      scale: 0.78,
      blur: 0.6,
      intensity: 0.36,
      spread: 0.44,
    },
    particles: {
      opacity: 0.28,
      scale: 0.72,
      blur: 0,
      intensity: 0.24,
      budget: 'low',
      spread: 0.38,
      size: 0.54,
    },
    layerVisibility: args.runtimeControl?.layerVisibility,
  }
}

export function buildLocalEntityProfile(args: {
  input: EntityInput
  manifestation: EntityManifestation
  personaDNA?: EntityProfile['personaDNA']
  visualArchetype?: EntityProfile['visualArchetype']
  visualBodyPlan?: EntityProfile['visualBodyPlan']
  visualFinishPlan?: EntityProfile['visualFinishPlan']
  renderOutput?: RenderOutput
  processedShape?: ProcessedShape
  runtimeControl?: RuntimeControl
  id?: string
  requestId?: string
  sessionId?: string
}): EntityProfile {
  const morphology = buildEntityMorphology({
    manifestation: args.manifestation,
    renderOutput: args.renderOutput,
    processedShape: args.processedShape,
  })
  const personaDNA = args.personaDNA ?? derivePersonaDNA({
    shapeSignature: morphology.processedShape?.signature ?? args.input.brand.shapeSource?.signature,
    baseFormProfile: morphology.baseForm,
    visualEssence: args.input.brand.visualEssence,
  })
  const visualArchetype = args.visualArchetype ?? deriveVisualArchetype({
    shapeSignature: morphology.processedShape?.signature ?? args.input.brand.shapeSource?.signature,
    baseFormProfile: morphology.baseForm,
    personaDNA,
  })
  const visualBodyPlan = args.visualBodyPlan ?? buildVisualBody({
    visualArchetype,
    processedShape: morphology.processedShape ?? args.processedShape,
  })
  const visualFinishPlan = args.visualFinishPlan ?? buildVisualFinishPlan({
    visualArchetype,
    visualBodyPlan,
  })
  const behavior = buildEntityBehavior(args.manifestation)
  const finalForm = buildEntityFinalForm({
    manifestation: args.manifestation,
    morphology,
    runtimeControl: args.runtimeControl,
  })
  const now = new Date().toISOString()
  const entityId = args.id ?? createEntityId()
  const relational = {
    behaviorState: {
      ...buildInitialBehaviorState(args.manifestation),
      updatedAt: now,
    },
    progression: {
      ...buildInitialProgressionState(),
      updatedAt: now,
    },
    userMemory: {
      ...buildInitialUserMemory(),
      updatedAt: now,
    },
    hookLoop: {
      ...buildInitialHookLoop(args.manifestation),
      updatedAt: now,
    },
    binding: buildInitialBindingState({
      manifestation: args.manifestation,
      createdAt: now,
    }),
    imprint: buildInitialIdentityImprint({
      manifestation: args.manifestation,
      createdAt: now,
    }),
    timelineLog: buildInitialEntityTimelineLog(now),
  }

  const entity: EntityProfile = {
    id: entityId,
    schemaVersion: 1,
    source: 'frontend-local',
    brand: args.input.brand,
    context: args.input.context,
    palette: args.input.palette,
    social: buildEntitySocialProfile({
      entityId,
      input: args.input,
      manifestation: args.manifestation,
      createdAt: now,
    }),
    export: buildEntityExportProfile({
      entityId,
      input: args.input,
      manifestation: args.manifestation,
    }),
    manifestation: args.manifestation,
    personaDNA,
    visualArchetype,
    visualBodyPlan,
    visualFinishPlan,
    morphology,
    behavior,
    relational: {
      ...relational,
      value: computeEntityAccumulatedValueFromRelational(relational, now),
    },
    finalForm,
    runtime: {
      control: args.runtimeControl,
      renderOutput: args.renderOutput,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      requestId: args.requestId,
      sessionId: args.sessionId,
      confidence: args.renderOutput?.debugShape?.readabilityScore ? args.renderOutput.debugShape.readabilityScore / 100 : undefined,
    },
  }

  return entity
}
