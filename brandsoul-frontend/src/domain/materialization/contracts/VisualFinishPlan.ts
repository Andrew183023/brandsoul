import type { VisualArchetypeBodyType } from '../../visual-archetype/contracts/VisualArchetype'

export type VisualSurfaceZoneRole =
  | 'shell'
  | 'inner-shell'
  | 'plate'
  | 'band'
  | 'ridge'
  | 'cavity'
  | 'core-bridge'
  | 'field-contour'

export type VisualMaterialStyle = 'smooth' | 'layered' | 'veined' | 'segmented' | 'plated'

export type VisualMaterialProfile = {
  style: VisualMaterialStyle
  edgeDiscipline: 'controlled' | 'sharp'
  density: number
  contrast: number
  shellDepth: number
  ridgeWeight: number
  cavityDepth: number
  bridgeTension: number
  contourAdhesion: number
}

export type VisualFinishLayer = {
  id: string
  role: 'shell' | 'inner-shell' | 'plate' | 'band'
  path: string
  renderMode: 'fill' | 'stroke'
  alpha: number
  emphasis: number
  strokeWidth?: number
}

export type VisualRidgePath = {
  id: string
  path: string
  weight: number
  emphasis: number
}

export type VisualCavityMask = {
  id: string
  path: string
  depth: number
  softness: number
}

export type VisualCoreBridge = {
  id: string
  path: string
  weight: number
  tension: number
}

export type VisualFieldContourHint = {
  id: string
  path: string
  adhesion: number
  alpha: number
}

export type VisualFinishPlan = {
  schemaVersion: 1
  source: 'visual-body-plan'
  bodyType: VisualArchetypeBodyType
  surfaceBias: VisualMaterialStyle
  coreDominance: number
  shapeScale: number
  primaryLayerRole: VisualFinishLayer['role']
  secondaryLayerRole: VisualFinishLayer['role']
  materialProfile: VisualMaterialProfile
  layers: VisualFinishLayer[]
  ridgePaths: VisualRidgePath[]
  cavityMasks: VisualCavityMask[]
  coreBridges: VisualCoreBridge[]
  fieldContourHints: VisualFieldContourHint[]
}