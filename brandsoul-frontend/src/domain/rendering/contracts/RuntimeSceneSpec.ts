import type { EntityFinalForm } from '../../entity/contracts/EntityFinalForm'
import type { EntityManifestation } from '../../manifestation/contracts/EntityManifestation'
import type { RuntimeDebugFlags, RuntimeLayerVisibility } from '../../orchestration/contracts/RuntimeControl'
import type { TimelineState } from '../../orchestration/contracts/TimelineState'
import type { VisualFinishPlan } from '../../materialization/contracts/VisualFinishPlan'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import type { ShapeBoundingBox } from '../../shape/contracts/ProcessedShape'
import type { BrandSoulVisualRuntimePatchApplicationPoint } from './BrandSoulVisualRuntimePatch'
import type { ManifestationIntensity } from './types'
import type { ParticleEmitterConfig } from '../../../personaLab/engine'

export type RuntimeBudgetLevel = 'low' | 'medium' | 'high'

export type RuntimeStageBudget = {
  initial: RuntimeBudgetLevel
  mid: RuntimeBudgetLevel
  climax: RuntimeBudgetLevel
  stabilize: RuntimeBudgetLevel
}

export type ShapeProfile = {
  fillStrategy: EntityManifestation['artDirection']['shapeFillStrategy']
  typographicCandidate: boolean
  fillAlpha: number
  edgeAlpha: number
  edgeWidth: number
  edgeTint: number
  tint: number
  detailAlpha: number
  pulse: number
  rhythmSpeed: number
}

export type CoreProfile = {
  radius: number
  baseAlpha: number
  accentAlpha: number
  detailAlpha: number
  pulse: number
  rhythmSpeed: number
  offsetX: number
  offsetY: number
}

export type FieldProfile = {
  relation: EntityManifestation['artDirection']['shapeRelation']
  mask: 'shape-bound' | 'aura-bound' | 'distributed' | 'minimal'
  spread: number
  baseAlpha: number
  accentAlpha: number
  detailAlpha: number
  pulse: number
  rhythmSpeed: number
  budget: RuntimeStageBudget
}

export type ParticleProfile = {
  alpha: number
  sizeMultiplier: number
  speedMultiplier: number
  densityMultiplier: number
  spread: number
  budget: RuntimeStageBudget
  emitterConfig?: ParticleEmitterConfig
}

export type TimelineProfile = {
  birthTimeline: EntityManifestation['birthTimeline']
  duration: number
  stages: EntityManifestation['birthTimeline']['stages']
  activeStageId?: string
  state?: TimelineState
  progress?: number
}

export type SceneComposition = {
  mode: EntityManifestation['mode']
  variant: string
  intensity: ManifestationIntensity
  finalReveal: boolean
  backgroundAlpha: number
  accent: string
  secondary: string
  energy?: string
  neutral?: string
  shapeTint: number
  edgeTint: number
  originSource?: string
  archetypeTemperature?: 'warm' | 'cool' | 'neutral'
  personaDNA?: PersonaDNA
  layerVisibility: RuntimeLayerVisibility
  debugFlags?: RuntimeDebugFlags
  shapeOnly: boolean
  finalForm?: EntityFinalForm
}

export type RuntimeAnatomyProfile = {
  source: 'visual-body-plan' | 'preview-body' | 'renderer-fallback' | 'core-symbol'
  core?: {
    x: number
    y: number
    radius: number
    intensity: number
    centrality: number
    presence: number
  }
  emissionOrigin?: {
    x: number
    y: number
  }
  convergencePoint?: {
    x: number
    y: number
  }
  anchorCount: number
  emissionAnchorCount: number
  anchorDispersion: number
  segmentCount?: number
  segmentReach?: number
  segmentRigidity?: number
  cavityCount?: number
  cavityDepth?: number
  fieldAttachment?: number
  stability?: number
  dispersion?: number
  silhouette?: {
    boundingBox: ShapeBoundingBox
    legibility: number
    framingScale: number
  }
}

export type BrandSoulRuntimePatchApplicationMetadata = {
  source: 'brandsoul-cognition'
  applicationPoint: BrandSoulVisualRuntimePatchApplicationPoint
  decisionIntent?: string
  actionType?: string
  confidence?: number
  derivedFromStateAt?: string
}

export type RuntimeModulationMetadata = {
  brandSoulRuntimePatch?: BrandSoulRuntimePatchApplicationMetadata
}

export type RuntimeSceneSpec = {
  schemaVersion: 1
  source: 'entity-profile'
  shape: ShapeProfile
  core: CoreProfile
  field: FieldProfile
  particles: ParticleProfile
  timeline: TimelineProfile
  composition: SceneComposition
  anatomy: RuntimeAnatomyProfile
  finishPlan?: VisualFinishPlan
  modulation?: RuntimeModulationMetadata
}
