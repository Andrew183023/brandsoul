import type { BrandArchetype, BrandCategory } from '../../../lib/personaArchetypes'
import type { VisualEssence } from '../../identity/contracts/VisualEssence'
import type { ManifestationSpec } from '../../manifestation/contracts/ManifestationSpec'
import type { ExtractedShapeSource, ProcessedShape, ShapeSignature } from '../../shape/contracts/ProcessedShape'
import type { ParticleEmitterConfig } from '../../../personaLab/engine'
import type { BaseFormProfile } from '../../base-form/contracts/BaseFormProfile'
import type { VisualFinishPlan } from '../../materialization/contracts/VisualFinishPlan'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import type { VisualArchetype } from '../../visual-archetype/contracts/VisualArchetype'
import type { VisualBodyPlan } from '../../visual-archetype/contracts/VisualBodyPlan'

export type PersonaShapeType = 'halo' | 'flare' | 'prism'
export type PersonaMotionType = 'float' | 'pulse' | 'drift'
export type PersonaGlowType = 'soft' | 'bold' | 'focused'
export type PersonaDensityType = 'airy' | 'balanced' | 'compact'
export type PersonaVisualVariant = 'preview' | 'final'
export type ManifestationIntensity = 'soft' | 'balanced' | 'cinematic'

export type ManifestationMode =
  | 'elemental'
  | 'natureza'
  | 'robo-ia'
  | 'centelha'

export interface PersonaVisualConfig {
  accent: string
  secondary: string
  shape: PersonaShapeType
  motion: PersonaMotionType
  glow: PersonaGlowType
  density: PersonaDensityType
}

export interface PersonaLabPreview {
  id: string
  label: string
  description: string
  archetype: BrandArchetype
  manifestationMode: ManifestationMode
  manifestationVariant: string
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
  visualArchetype?: VisualArchetype
  visualBodyPlan?: VisualBodyPlan
  visualFinishPlan?: VisualFinishPlan
  silhouette: {
    bodyPath: string
    innerPath: string
    source: 'real-geometry' | 'visual-body-plan' | 'manifestation-fallback'
    legibility?: number
    framing?: {
      minX: number
      minY: number
      maxX: number
      maxY: number
      width: number
      height: number
    }
    core?: {
      x: number
      y: number
      radius: number
      intensity: number
    }
  }
  visualConfig: PersonaVisualConfig
}

export type PersonaStyleVarMap = Record<string, string>

export type PersonaRenderInput = {
  manifestationSpec?: ManifestationSpec
  logoData: {
    preview?: string
    mask?: string
    coreSymbol?: string
    shapeSource?: ExtractedShapeSource
  }
  visualEssence?: VisualEssence
  intensity: ManifestationIntensity
  variant: PersonaVisualVariant
  brandCategory?: BrandCategory
  preview: PersonaLabPreview
  bodyPath: string
  innerPath: string
  usesLogoMask: boolean
  dominantSymbol?: string
  styleVars: PersonaStyleVarMap
}

export type PersonaRenderOutput = {
  manifestationSpec: ManifestationSpec
  anatomySource: 'visual-body-plan' | 'preview-body' | 'renderer-fallback' | 'core-symbol'
  particles: {
    count: number
    className?: string
    emitterConfig?: ParticleEmitterConfig
  }
  shapes: {
    bodyPath: string
    innerPath: string
    dominantSymbol?: string
    usesLogoMask: boolean
  }
  animationConfig: {
    rootClassName: string
    styleVars: PersonaStyleVarMap
  }
  anatomy: {
    layers: string[]
    classNames: string[]
  }
  debugShape?: {
    processedShape?: ProcessedShape
    sourceSignature?: ShapeSignature
    readabilityScore?: number
    silhouetteContrast?: 'low' | 'medium' | 'high'
  }
  renderType: 'core-symbol' | 'abstract-shape'
}
