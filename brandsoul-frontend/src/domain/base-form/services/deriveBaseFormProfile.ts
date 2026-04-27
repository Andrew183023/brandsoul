import type { VisualEssence } from '../../identity/contracts/VisualEssence'
import type { ShapeSignature } from '../../shape/contracts/ProcessedShape'
import type { BaseFormProfile } from '../contracts/BaseFormProfile'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

export function deriveBaseFormProfile(args: {
  shapeSignature?: ShapeSignature
  visualEssence?: VisualEssence
}): BaseFormProfile {
  const signature = args.shapeSignature
  const visualEssence = args.visualEssence

  if (!signature) {
    return {
      family: 'orb',
      spine: 'radial',
      massDistribution: 'centered',
      edgeDiscipline: 'controlled',
      openness: 0.38,
      bodyCompression: 0.18,
      corePlacement: { x: 0.5, y: 0.5 },
    }
  }

  const cohesion = clamp(signature.symmetry * 0.52 + signature.circularity * 0.3 + (1 - signature.fragmentation) * 0.18)
  const radiality = signature.dominantAxis === 'radial' || signature.type === 'orbital' || signature.type === 'radial'
  const distributed = signature.massDistribution === 'spread'
  const vertical = signature.dominantAxis === 'vertical'
  const horizontal = signature.dominantAxis === 'horizontal'

  const family =
    signature.circularity > 0.74 && signature.symmetry > 0.72
      ? 'orb'
      : vertical && cohesion > 0.62
        ? 'totem'
        : radiality || (distributed && signature.circularity > 0.52)
          ? 'flare'
          : signature.fragmentation > 0.58 && signature.angularity > 0.42
            ? 'shard'
            : 'lattice'

  const edgeDiscipline =
    signature.angularity > 0.58 || family === 'shard'
      ? 'sharp'
      : signature.curvatureRatio > 0.66 || family === 'orb'
        ? 'soft'
        : 'controlled'

  const massDistribution: BaseFormProfile['massDistribution'] =
    signature.fragmentation > 0.64
      ? 'asymmetric'
      : distributed
        ? 'distributed'
        : 'centered'

  const compositionBiasX = visualEssence?.composition === 'spread' ? 0.04 : 0
  const compositionBiasY = visualEssence?.composition === 'vertical' ? -0.06 : 0
  const warmthBias = visualEssence?.temperature === 'warm' ? -0.03 : visualEssence?.temperature === 'cool' ? 0.02 : 0

  return {
    family,
    spine: radiality ? 'radial' : vertical ? 'vertical' : 'horizontal',
    massDistribution,
    edgeDiscipline,
    openness: clamp(
      (distributed ? 0.56 : 0.28) +
        (radiality ? 0.12 : 0) +
        signature.fragmentation * 0.12 -
        cohesion * 0.14,
      0.12,
      0.84,
    ),
    bodyCompression: clamp(
      (signature.massDistribution === 'concentrated' ? 0.42 : 0.18) +
        (family === 'totem' ? 0.08 : 0) -
        (family === 'flare' ? 0.08 : 0),
      0.08,
      0.78,
    ),
    corePlacement: {
      x: clamp(0.5 + (horizontal ? 0.04 : 0) + compositionBiasX + (massDistribution === 'asymmetric' ? 0.04 : 0), 0.3, 0.7),
      y: clamp(0.5 + (vertical ? -0.08 : 0) + compositionBiasY + warmthBias, 0.26, 0.72),
    },
  }
}