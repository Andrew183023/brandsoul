export type VisualArchetypeBodyType = 'orbital' | 'fragmented' | 'linear' | 'organic' | 'geometric'

export type VisualArchetypeConstructionStyle = 'rigid' | 'organic' | 'energy-based' | 'mechanical'

export type VisualArchetypeSilhouetteStrategy = 'preserve' | 'exaggerate' | 'reconstruct'

export type VisualArchetypeCorePlacement = 'centered' | 'offset' | 'distributed'

export type VisualArchetypeVisualLanguage = 'minimal' | 'expressive' | 'dense'

export type VisualArchetypeStructureProfile = {
  axisEmphasis: 'vertical' | 'horizontal' | 'radial' | 'balanced'
  massFrame: 'compact' | 'balanced' | 'spread'
  cohesion: number
  rigidity: number
  openness: number
}

export type VisualArchetypeSilhouetteProfile = {
  preservation: number
  exaggeration: number
  reconstruction: number
  edgeEmphasis: number
}

export type VisualArchetypeSurfaceProfile = {
  surfaceBehavior: 'smooth' | 'noisy' | 'crystalline' | 'soft'
  textureIntensity: number
  contrastBias: number
}

export type VisualArchetype = {
  bodyType: VisualArchetypeBodyType
  constructionStyle: VisualArchetypeConstructionStyle
  silhouetteStrategy: VisualArchetypeSilhouetteStrategy
  corePlacement: VisualArchetypeCorePlacement
  visualLanguage: VisualArchetypeVisualLanguage
  structureProfile: VisualArchetypeStructureProfile
  silhouetteProfile: VisualArchetypeSilhouetteProfile
  surfaceProfile: VisualArchetypeSurfaceProfile
}