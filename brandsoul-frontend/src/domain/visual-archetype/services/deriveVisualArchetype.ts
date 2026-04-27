import type { BaseFormProfile } from '../../base-form/contracts/BaseFormProfile'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import type { ShapeSignature } from '../../shape/contracts/ProcessedShape'
import type { VisualArchetype } from '../contracts/VisualArchetype'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveBodyType(args: {
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype['bodyType'] {
  const { shapeSignature, baseFormProfile, personaDNA } = args

  if ((shapeSignature?.fragmentation ?? 0) > 0.62 || shapeSignature?.type === 'fragmentado') {
    return 'fragmented'
  }
  if (baseFormProfile.family === 'orb' || shapeSignature?.type === 'orbital' || shapeSignature?.type === 'radial') {
    return 'orbital'
  }
  if (
    shapeSignature?.type === 'linear' ||
    baseFormProfile.family === 'lattice' ||
    baseFormProfile.spine === 'vertical' ||
    baseFormProfile.spine === 'horizontal' ||
    (baseFormProfile.family === 'totem' && personaDNA.precision === 'precise')
  ) {
    return 'linear'
  }
  if (
    shapeSignature?.type === 'organico' ||
    baseFormProfile.family === 'flare' ||
    (personaDNA.expansion === 'expansive' && (shapeSignature?.curvatureRatio ?? 0.5) > 0.54)
  ) {
    return 'organic'
  }
  return 'geometric'
}

function resolveConstructionStyle(args: {
  bodyType: VisualArchetype['bodyType']
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype['constructionStyle'] {
  const { bodyType, shapeSignature, baseFormProfile, personaDNA } = args

  if (bodyType === 'linear' || bodyType === 'geometric' || personaDNA.precision === 'precise') {
    return baseFormProfile.edgeDiscipline === 'sharp' || (shapeSignature?.angularity ?? 0) > 0.62 ? 'mechanical' : 'rigid'
  }
  if (bodyType === 'orbital' && personaDNA.charisma > 0.7) {
    return 'energy-based'
  }
  if (bodyType === 'organic' || shapeSignature?.type === 'organico') {
    return 'organic'
  }
  if (bodyType === 'fragmented') {
    return personaDNA.precision === 'organic' ? 'organic' : 'mechanical'
  }
  return personaDNA.precision === 'balanced' ? 'rigid' : 'energy-based'
}

function resolveSilhouetteStrategy(args: {
  bodyType: VisualArchetype['bodyType']
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype['silhouetteStrategy'] {
  const { bodyType, shapeSignature, baseFormProfile, personaDNA } = args
  const complexity = shapeSignature?.complexity ?? 0.5
  const fragmentation = shapeSignature?.fragmentation ?? 0.5
  const symmetry = shapeSignature?.symmetry ?? 0.5

  if (bodyType === 'fragmented' || fragmentation > 0.68 || complexity > 0.76) {
    return 'reconstruct'
  }

  if (bodyType === 'geometric') {
    return symmetry > 0.64 ? 'reconstruct' : 'exaggerate'
  }

  if (bodyType === 'linear') {
    return symmetry > 0.72 && fragmentation < 0.3 ? 'reconstruct' : 'exaggerate'
  }

  if (shapeSignature?.typographicCandidate || baseFormProfile.edgeDiscipline === 'sharp') {
    return 'preserve'
  }
  if (personaDNA.presenceStyle === 'dominant' || bodyType === 'orbital' || bodyType === 'organic') {
    return 'exaggerate'
  }
  return 'preserve'
}

function resolveCorePlacement(args: {
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype['corePlacement'] {
  const { shapeSignature, baseFormProfile, personaDNA } = args

  if (shapeSignature?.massDistribution === 'spread' && personaDNA.expansion === 'expansive') {
    return 'distributed'
  }
  if (personaDNA.presenceStyle === 'reserved' || baseFormProfile.massDistribution === 'asymmetric') {
    return 'offset'
  }
  return 'centered'
}

function resolveVisualLanguage(args: {
  bodyType: VisualArchetype['bodyType']
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype['visualLanguage'] {
  const { bodyType, shapeSignature, baseFormProfile, personaDNA } = args
  const density = shapeSignature?.density ?? 0.5
  const complexity = shapeSignature?.complexity ?? 0.5

  if (density > 0.7 || complexity > 0.74 || bodyType === 'fragmented') {
    return 'dense'
  }
  if (bodyType === 'geometric' || bodyType === 'linear') {
    return personaDNA.presenceStyle === 'dominant' ? 'expressive' : 'minimal'
  }
  if (personaDNA.presenceStyle === 'dominant' || baseFormProfile.family === 'flare') {
    return 'expressive'
  }
  return 'minimal'
}

function resolveSurfaceBehavior(args: {
  constructionStyle: VisualArchetype['constructionStyle']
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype['surfaceProfile']['surfaceBehavior'] {
  const { constructionStyle, shapeSignature, baseFormProfile, personaDNA } = args

  if (constructionStyle === 'mechanical' || baseFormProfile.edgeDiscipline === 'sharp') {
    return 'crystalline'
  }
  if (constructionStyle === 'organic' || personaDNA.precision === 'organic') {
    return 'soft'
  }
  if ((shapeSignature?.fragmentation ?? 0) > 0.52 || personaDNA.wildness > 0.64) {
    return 'noisy'
  }
  return 'smooth'
}

export function deriveVisualArchetype(args: {
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  personaDNA: PersonaDNA
}): VisualArchetype {
  const { shapeSignature, baseFormProfile, personaDNA } = args
  const bodyType = resolveBodyType(args)
  const constructionStyle = resolveConstructionStyle({ bodyType, shapeSignature, baseFormProfile, personaDNA })
  const silhouetteStrategy = resolveSilhouetteStrategy({ bodyType, shapeSignature, baseFormProfile, personaDNA })
  const corePlacement = resolveCorePlacement({ shapeSignature, baseFormProfile, personaDNA })
  const visualLanguage = resolveVisualLanguage({ bodyType, shapeSignature, baseFormProfile, personaDNA })
  const surfaceBehavior = resolveSurfaceBehavior({ constructionStyle, shapeSignature, baseFormProfile, personaDNA })
  const symmetry = shapeSignature?.symmetry ?? 0.5
  const density = shapeSignature?.density ?? 0.5
  const complexity = shapeSignature?.complexity ?? 0.5
  const fragmentation = shapeSignature?.fragmentation ?? 0.5

  return {
    bodyType,
    constructionStyle,
    silhouetteStrategy,
    corePlacement,
    visualLanguage,
    structureProfile: {
      axisEmphasis:
        shapeSignature?.dominantAxis === 'vertical'
          ? 'vertical'
          : shapeSignature?.dominantAxis === 'horizontal'
            ? 'horizontal'
            : bodyType === 'orbital' || shapeSignature?.dominantAxis === 'radial'
              ? 'radial'
              : 'balanced',
      massFrame:
        baseFormProfile.massDistribution === 'distributed' || shapeSignature?.massDistribution === 'spread'
          ? 'spread'
          : bodyType === 'orbital' || baseFormProfile.massDistribution === 'centered'
            ? 'compact'
            : 'balanced',
      cohesion: clamp(symmetry * 0.42 + personaDNA.stability * 0.38 + (1 - fragmentation) * 0.2),
      rigidity: clamp((shapeSignature?.angularity ?? 0.5) * 0.34 + (baseFormProfile.edgeDiscipline === 'sharp' ? 0.28 : baseFormProfile.edgeDiscipline === 'controlled' ? 0.16 : 0.06) + (personaDNA.precision === 'precise' ? 0.18 : 0.08)),
      openness: clamp(baseFormProfile.openness * 0.48 + (shapeSignature?.massDistribution === 'spread' ? 0.2 : 0.08) + (personaDNA.expansion === 'expansive' ? 0.18 : personaDNA.expansion === 'compact' ? -0.08 : 0.04)),
    },
    silhouetteProfile: {
      preservation: clamp(silhouetteStrategy === 'preserve' ? 0.78 : silhouetteStrategy === 'exaggerate' ? 0.52 : 0.32),
      exaggeration: clamp((silhouetteStrategy === 'exaggerate' ? 0.62 : 0.28) + personaDNA.charisma * 0.16),
      reconstruction: clamp((silhouetteStrategy === 'reconstruct' ? 0.74 : 0.22) + fragmentation * 0.18 + complexity * 0.08),
      edgeEmphasis: clamp((baseFormProfile.edgeDiscipline === 'sharp' ? 0.74 : baseFormProfile.edgeDiscipline === 'controlled' ? 0.56 : 0.38) + (personaDNA.precision === 'precise' ? 0.12 : 0.04)),
    },
    surfaceProfile: {
      surfaceBehavior,
      textureIntensity: clamp((surfaceBehavior === 'noisy' ? 0.64 : surfaceBehavior === 'crystalline' ? 0.54 : surfaceBehavior === 'soft' ? 0.32 : 0.24) + density * 0.14),
      contrastBias: clamp((constructionStyle === 'mechanical' ? 0.66 : constructionStyle === 'energy-based' ? 0.58 : constructionStyle === 'rigid' ? 0.52 : 0.42) + complexity * 0.08 - personaDNA.defensiveness * 0.06),
    },
  }
}