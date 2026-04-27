import type { ManifestationSpec } from '../../manifestation/contracts/ManifestationSpec'
import type { ProcessedShape, ShapePoint, ShapeSignature } from '../../shape/contracts/ProcessedShape'
import type { BaseFormProfile } from '../../base-form/contracts/BaseFormProfile'

export type EntityCoreZone = {
  id: 'primary' | 'secondary' | 'perceptual' | string
  center: ShapePoint
  radius: number
  weight: number
}

export type EntityStructuralAnchor = {
  id: string
  point: ShapePoint
  role: 'core' | 'edge' | 'emission' | 'field' | 'origin'
  weight: number
}

export type EntityMorphology = {
  source: 'shape-intelligence' | 'backend-engine' | 'hybrid'
  shapeRelation: ManifestationSpec['artDirection']['shapeRelation']
  massDistribution: ManifestationSpec['artDirection']['massDistribution']
  abstractionLevel: ManifestationSpec['artDirection']['abstractionLevel']
  fillStrategy: ManifestationSpec['artDirection']['shapeFillStrategy']
  baseForm: BaseFormProfile
  edgeStrength: number
  silhouetteClarity: 'low' | 'medium' | 'high'
  typographicProtection: boolean
  axis: ShapeSignature['dominantAxis']
  symmetry: 'asymmetric' | 'balanced' | 'radial' | 'vertical' | 'horizontal'
  structuralComplexity: number
  coreZones: EntityCoreZone[]
  fieldRelation: {
    mask: 'shape-bound' | 'aura-bound' | 'distributed' | 'minimal'
    spread: number
    adhesion: number
  }
  anchors: EntityStructuralAnchor[]
  emissionPoints: ShapePoint[]
  processedShape?: ProcessedShape
}
