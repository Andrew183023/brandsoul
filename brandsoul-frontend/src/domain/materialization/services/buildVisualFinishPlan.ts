import type {
  VisualCoreBridge,
  VisualCavityMask,
  VisualFieldContourHint,
  VisualFinishLayer,
  VisualFinishPlan,
  VisualMaterialProfile,
  VisualRidgePath,
} from '../contracts/VisualFinishPlan'
import type { VisualArchetype } from '../../visual-archetype/contracts/VisualArchetype'
import type {
  VisualBodyAnchor,
  VisualBodyCavity,
  VisualBodyPlan,
  VisualBodySegment,
} from '../../visual-archetype/contracts/VisualBodyPlan'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function ellipsePath(cavity: VisualBodyCavity) {
  const left = cavity.center.x - cavity.radiusX
  const right = cavity.center.x + cavity.radiusX

  return [
    `M${left} ${cavity.center.y}`,
    `A${cavity.radiusX} ${cavity.radiusY} 0 1 0 ${right} ${cavity.center.y}`,
    `A${cavity.radiusX} ${cavity.radiusY} 0 1 0 ${left} ${cavity.center.y}`,
    'Z',
  ].join(' ')
}

function midpointPath(segment: VisualBodySegment, curveLift = 0) {
  const midX = (segment.from.x + segment.to.x) / 2
  const midY = (segment.from.y + segment.to.y) / 2 - curveLift

  return `M${segment.from.x} ${segment.from.y} Q${midX} ${midY} ${segment.to.x} ${segment.to.y}`
}

function linePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  return `M${from.x} ${from.y} L${to.x} ${to.y}`
}

function resolveMaterialProfile(archetype: VisualArchetype): VisualMaterialProfile {
  const visualLanguageBias = archetype.visualLanguage === 'dense' ? 0.08 : archetype.visualLanguage === 'minimal' ? -0.06 : 0
  const densityBase = 0.42 + archetype.surfaceProfile.textureIntensity * 0.42 + visualLanguageBias

  switch (archetype.bodyType) {
    case 'orbital':
      return {
        style: 'smooth',
        edgeDiscipline: 'controlled',
        density: clamp(densityBase - 0.08),
        contrast: clamp(0.62 + archetype.surfaceProfile.contrastBias * 0.2, 0.6, 0.8),
        shellDepth: 0.84,
        ridgeWeight: 0.18,
        cavityDepth: 0.14,
        bridgeTension: 0.4,
        contourAdhesion: 0.82,
      }
    case 'linear':
      return {
        style: 'layered',
        edgeDiscipline: 'controlled',
        density: clamp(densityBase + 0.04),
        contrast: clamp(0.66 + archetype.surfaceProfile.contrastBias * 0.22, 0.62, 0.84),
        shellDepth: 0.7,
        ridgeWeight: 0.72,
        cavityDepth: 0.4,
        bridgeTension: 0.76,
        contourAdhesion: 0.72,
      }
    case 'organic':
      return {
        style: 'veined',
        edgeDiscipline: 'controlled',
        density: clamp(densityBase + 0.1),
        contrast: clamp(0.64 + archetype.surfaceProfile.contrastBias * 0.18, 0.6, 0.8),
        shellDepth: 0.66,
        ridgeWeight: 0.62,
        cavityDepth: 0.58,
        bridgeTension: 0.52,
        contourAdhesion: 0.8,
      }
    case 'fragmented':
      return {
        style: 'segmented',
        edgeDiscipline: 'sharp',
        density: clamp(densityBase + 0.14),
        contrast: clamp(0.74 + archetype.surfaceProfile.contrastBias * 0.18, 0.66, 0.9),
        shellDepth: 0.56,
        ridgeWeight: 0.8,
        cavityDepth: 0.62,
        bridgeTension: 0.7,
        contourAdhesion: 0.6,
      }
    case 'geometric':
      return {
        style: 'plated',
        edgeDiscipline: 'sharp',
        density: clamp(densityBase + 0.08),
        contrast: clamp(0.78 + archetype.surfaceProfile.contrastBias * 0.16, 0.7, 0.92),
        shellDepth: 0.76,
        ridgeWeight: 0.74,
        cavityDepth: 0.42,
        bridgeTension: 0.84,
        contourAdhesion: 0.68,
      }
  }
}

function buildFinishLayers(args: {
  visualBodyPlan: VisualBodyPlan
  archetype: VisualArchetype
  materialProfile: VisualMaterialProfile
}): VisualFinishLayer[] {
  const { visualBodyPlan, archetype, materialProfile } = args
  const layers: VisualFinishLayer[] = [
    {
      id: 'shell-primary',
      role: 'shell',
      path: visualBodyPlan.bodyPath,
      renderMode: 'fill',
      alpha: clamp(0.84 + materialProfile.shellDepth * 0.12),
      emphasis: clamp(0.8 + materialProfile.contrast * 0.18),
    },
  ]

  if (visualBodyPlan.innerPath) {
    layers.push({
      id: 'shell-inner',
      role: 'inner-shell',
      path: visualBodyPlan.innerPath,
      renderMode: 'fill',
      alpha: clamp(0.16 + materialProfile.shellDepth * 0.12),
      emphasis: clamp(0.28 + materialProfile.density * 0.18),
    })
  }

  if (archetype.bodyType === 'linear') {
    layers.push({
      id: 'shell-banded-envelope',
      role: 'band',
      path: visualBodyPlan.silhouette.envelopePath,
      renderMode: 'stroke',
      alpha: 0.18,
      emphasis: 0.78,
      strokeWidth: 2.6,
    })
  }

  if (archetype.bodyType === 'fragmented' || archetype.bodyType === 'geometric') {
    layers.push({
      id: 'shell-envelope-plate',
      role: 'plate',
      path: visualBodyPlan.silhouette.envelopePath,
      renderMode: archetype.bodyType === 'geometric' ? 'stroke' : 'fill',
      alpha: archetype.bodyType === 'geometric' ? 0.18 : 0.14,
      emphasis: clamp(0.58 + materialProfile.contrast * 0.2),
      strokeWidth: archetype.bodyType === 'geometric' ? 2.8 : undefined,
    })
  }

  return layers
}

function buildRidgePaths(args: {
  visualBodyPlan: VisualBodyPlan
  archetype: VisualArchetype
  materialProfile: VisualMaterialProfile
}): VisualRidgePath[] {
  const segments = [...args.visualBodyPlan.structure.segments]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, args.archetype.bodyType === 'orbital' ? 5 : args.archetype.bodyType === 'fragmented' ? 8 : 6)

  return segments.map((segment, index) => ({
    id: `ridge-${segment.id}`,
    path:
      args.archetype.bodyType === 'organic' || args.archetype.bodyType === 'orbital'
        ? midpointPath(segment, (index % 2 === 0 ? 1 : -1) * (6 + segment.weight * 6))
        : linePath(segment.from, segment.to),
    weight: clamp(segment.weight * (0.54 + args.materialProfile.ridgeWeight * 0.26)),
    emphasis: clamp(0.18 + args.materialProfile.ridgeWeight * 0.18 + index * 0.01),
  }))
}

function buildCavityMasks(args: {
  visualBodyPlan: VisualBodyPlan
  materialProfile: VisualMaterialProfile
}): VisualCavityMask[] {
  return args.visualBodyPlan.structure.cavities.map((cavity) => ({
    id: `cavity-${cavity.id}`,
    path: ellipsePath(cavity),
    depth: clamp(cavity.weight * (0.4 + args.materialProfile.cavityDepth * 0.28)),
    softness: clamp(1 - args.materialProfile.contrast * 0.3),
  }))
}

function selectBridgeAnchors(anchors: VisualBodyAnchor[]) {
  return [...anchors]
    .sort((left, right) => right.weight - left.weight)
    .filter((anchor) => anchor.role === 'axis' || anchor.role === 'core' || anchor.role === 'emission')
    .slice(0, 4)
}

function buildCoreBridges(args: {
  visualBodyPlan: VisualBodyPlan
  archetype: VisualArchetype
  materialProfile: VisualMaterialProfile
}): VisualCoreBridge[] {
  return selectBridgeAnchors(args.visualBodyPlan.structure.anchors).map((anchor, index) => ({
    id: `core-bridge-${anchor.id}`,
    path:
      args.archetype.bodyType === 'organic' || args.archetype.bodyType === 'orbital'
        ? midpointPath(
            {
              id: `bridge-${anchor.id}`,
              from: args.visualBodyPlan.core.position,
              to: anchor.point,
              weight: anchor.weight,
            },
            (index % 2 === 0 ? 1 : -1) * (4 + anchor.weight * 5),
          )
        : linePath(args.visualBodyPlan.core.position, anchor.point),
    weight: clamp(anchor.weight * (0.76 + args.materialProfile.bridgeTension * 0.22)),
    tension: clamp(args.materialProfile.bridgeTension + anchor.weight * 0.14),
  }))
}

function resolveCoreDominance(archetype: VisualArchetype) {
  switch (archetype.bodyType) {
    case 'orbital':
      return 1
    case 'organic':
      return 0.84
    case 'linear':
      return 0.8
    case 'fragmented':
      return 0.74
    case 'geometric':
      return 0.7
  }
}

function resolveShapeScale(archetype: VisualArchetype) {
  switch (archetype.bodyType) {
    case 'orbital':
      return 1.32
    case 'organic':
      return 1.28
    case 'linear':
      return 1.26
    case 'fragmented':
      return 1.22
    case 'geometric':
      return 1.24
  }
}

function resolveSecondaryLayerRole(archetype: VisualArchetype): VisualFinishLayer['role'] {
  switch (archetype.bodyType) {
    case 'linear':
      return 'band'
    case 'fragmented':
    case 'geometric':
      return 'plate'
    default:
      return 'inner-shell'
  }
}

function buildFieldContourHints(args: {
  visualBodyPlan: VisualBodyPlan
  materialProfile: VisualMaterialProfile
}): VisualFieldContourHint[] {
  const contourHints: VisualFieldContourHint[] = [
    {
      id: 'field-contour-envelope',
      path: args.visualBodyPlan.silhouette.envelopePath,
      adhesion: clamp(0.72 + args.materialProfile.contourAdhesion * 0.2),
      alpha: clamp(0.12 + args.materialProfile.contourAdhesion * 0.1),
    },
  ]

  if (args.visualBodyPlan.innerPath) {
    contourHints.push({
      id: 'field-contour-inner',
      path: args.visualBodyPlan.innerPath,
      adhesion: clamp(0.5 + args.materialProfile.contourAdhesion * 0.18),
      alpha: clamp(0.06 + args.materialProfile.shellDepth * 0.08),
    })
  }

  return contourHints
}

export function buildVisualFinishPlan(args: {
  visualArchetype: VisualArchetype
  visualBodyPlan: VisualBodyPlan
}): VisualFinishPlan {
  const materialProfile = resolveMaterialProfile(args.visualArchetype)

  return {
    schemaVersion: 1,
    source: 'visual-body-plan',
    bodyType: args.visualArchetype.bodyType,
    surfaceBias: materialProfile.style,
    coreDominance: resolveCoreDominance(args.visualArchetype),
    shapeScale: resolveShapeScale(args.visualArchetype),
    primaryLayerRole: 'shell',
    secondaryLayerRole: resolveSecondaryLayerRole(args.visualArchetype),
    materialProfile,
    layers: buildFinishLayers({
      visualBodyPlan: args.visualBodyPlan,
      archetype: args.visualArchetype,
      materialProfile,
    }),
    ridgePaths: buildRidgePaths({
      visualBodyPlan: args.visualBodyPlan,
      archetype: args.visualArchetype,
      materialProfile,
    }),
    cavityMasks: buildCavityMasks({
      visualBodyPlan: args.visualBodyPlan,
      materialProfile,
    }),
    coreBridges: buildCoreBridges({
      visualBodyPlan: args.visualBodyPlan,
      archetype: args.visualArchetype,
      materialProfile,
    }),
    fieldContourHints: buildFieldContourHints({
      visualBodyPlan: args.visualBodyPlan,
      materialProfile,
    }),
  }
}