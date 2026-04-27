import type { ShapeBoundingBox, ShapePoint } from '../../shape/contracts/ProcessedShape'
import type { VisualArchetypeSilhouetteStrategy } from './VisualArchetype'

export type VisualBodyCore = {
  position: ShapePoint
  radius: number
  intensity: number
}

export type VisualBodyAnchor = {
  id: string
  point: ShapePoint
  role: 'core' | 'edge' | 'axis' | 'emission'
  weight: number
}

export type VisualBodySegment = {
  id: string
  from: ShapePoint
  to: ShapePoint
  weight: number
}

export type VisualBodyCavity = {
  id: string
  center: ShapePoint
  radiusX: number
  radiusY: number
  weight: number
}

export type VisualBodyPlan = {
  bodyPath: string
  innerPath?: string
  core: VisualBodyCore
  structure: {
    anchors: VisualBodyAnchor[]
    segments: VisualBodySegment[]
    cavities: VisualBodyCavity[]
  }
  silhouette: {
    strategy: VisualArchetypeSilhouetteStrategy
    envelopePath: string
    boundingBox: ShapeBoundingBox
    legibility: number
  }
}