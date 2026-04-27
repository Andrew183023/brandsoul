import type { PersonaDensityType, PersonaGlowType, PersonaMotionType, PersonaShapeType } from '../../rendering/contracts/types'

export type ManifestationBirthStage = {
  id: string
  label: string
  duration: number
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  emphasis: {
    origin: number
    shape: number
    core: number
    field: number
    particles: number
  }
  transforms?: {
    originScale?: number
    originRotation?: number
    shapeScale?: number
    coreScale?: number
    fieldScale?: number
    particleBoost?: number
    deform?: number
  }
}

export interface ManifestationSpec {
  id: string
  label: string
  description: string
  artDirection: {
    contrast: 'low' | 'medium' | 'high'
    abstractionLevel: 'low' | 'medium' | 'high'
    shapeRelation: string
    massDistribution: string
    texture: string
    lightBehavior: string
    shapeFillStrategy: string
  }
  behavior: {
    idle: string
    hover: string
    birth: string
    stabilize: string
  }
  birthTimeline: {
    duration: number
    stages: ManifestationBirthStage[]
  }
  runtime: {
    defaultVisual: {
      accent: string
      secondarySource: 'primary' | 'secondary'
      shape: PersonaShapeType
      motion: PersonaMotionType
      glow: PersonaGlowType
      density: PersonaDensityType
    }
    variantOverrides?: Record<string, {
      visual?: Partial<ManifestationSpec['runtime']['defaultVisual']>
      silhouette?: {
        bodyPath: string
        innerPath: string
      }
    }>
  }
}