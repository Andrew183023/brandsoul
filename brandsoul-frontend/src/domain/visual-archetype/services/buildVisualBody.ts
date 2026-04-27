import { chaikin, clamp, computeBoundingBox, computeCentroid, normalizePointSets, pointsToPath, simplifyPoints } from '../../shape/analysis/shapeMetrics'
import type { ProcessedShape, ShapePoint } from '../../shape/contracts/ProcessedShape'
import type { VisualArchetype } from '../contracts/VisualArchetype'
import type { VisualBodyAnchor, VisualBodyCavity, VisualBodyPlan, VisualBodySegment } from '../contracts/VisualBodyPlan'

export type CanonicalWeightProfile = {
  preserve: number
  exaggerate: number
  reconstruct: number
}

function resolveSourcePoints(processedShape?: ProcessedShape) {
  if (!processedShape) {
    return []
  }

  if (processedShape.abstractedGeometry.points.length >= 3) {
    return processedShape.abstractedGeometry.points
  }

  return processedShape.baseGeometry.points
}

function resolveCentroid(processedShape: ProcessedShape, points: ShapePoint[]) {
  return processedShape.debug.perceptualCentroid ?? processedShape.abstractedGeometry.centroid ?? computeCentroid(points)
}

function scaleAround(points: ShapePoint[], center: ShapePoint, scaleX: number, scaleY: number, shiftX = 0, shiftY = 0) {
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * scaleX + shiftX,
    y: center.y + (point.y - center.y) * scaleY + shiftY,
  }))
}

function insetPoints(points: ShapePoint[], target: ShapePoint, factor: number) {
  return points.map((point) => ({
    x: target.x + (point.x - target.x) * factor,
    y: target.y + (point.y - target.y) * factor,
  }))
}

function blendPoints(primary: ShapePoint[], secondary: ShapePoint[], blend: number) {
  const normalized = normalizePointSets([primary, secondary])
  const left = normalized[0] ?? primary
  const right = normalized[1] ?? secondary

  return left.map((point, index) => {
    const target = right[index] ?? point
    return {
      x: point.x + (target.x - point.x) * blend,
      y: point.y + (target.y - point.y) * blend,
    }
  })
}

export function resolveCanonicalWeightProfile(args: {
  archetype: VisualArchetype
  processedShape?: ProcessedShape
}): CanonicalWeightProfile {
  const { archetype, processedShape } = args
  const signature = processedShape?.signature
  const complexity = signature?.complexity ?? 0.5
  const fragmentation = signature?.fragmentation ?? 0.5
  const symmetry = signature?.symmetry ?? 0.5
  const density = signature?.density ?? 0.5
  const base = (() => {
  switch (archetype.bodyType) {
    case 'orbital':
      return { preserve: 0.28, exaggerate: 0.5, reconstruct: 0.76 }
    case 'linear':
      return { preserve: 0.54, exaggerate: 0.76, reconstruct: 0.92 }
    case 'organic':
      return { preserve: 0.34, exaggerate: 0.58, reconstruct: 0.8 }
    case 'fragmented':
      return { preserve: 0.48, exaggerate: 0.7, reconstruct: 0.94 }
    case 'geometric':
    default:
      return { preserve: 0.58, exaggerate: 0.82, reconstruct: 0.96 }
  }
  })()

  const complexityBoost = clamp((complexity - 0.52) * 0.24, -0.08, 0.12)
  const fragmentationBoost = clamp((fragmentation - 0.34) * 0.3, -0.04, 0.16)
  const symmetryDamping = clamp((symmetry - 0.72) * 0.18, -0.08, 0.08)
  const densityDamping = clamp((density - 0.62) * 0.14, -0.06, 0.05)
  const typographicDamping = signature?.typographicCandidate ? 0.12 : 0

  return {
    preserve: clamp(base.preserve + complexityBoost + fragmentationBoost - symmetryDamping - densityDamping - typographicDamping, 0.18, 0.82),
    exaggerate: clamp(base.exaggerate + complexityBoost * 0.72 + fragmentationBoost * 0.64 - typographicDamping * 0.4, 0.28, 0.9),
    reconstruct: clamp(base.reconstruct + complexityBoost * 0.48 + fragmentationBoost * 0.72 - symmetryDamping * 0.32 - typographicDamping * 0.22, 0.52, 0.98),
  }
}

function buildCanonicalPoints(args: {
  archetype: VisualArchetype
  center: ShapePoint
  width: number
  height: number
}): ShapePoint[] {
  const { archetype, center, width, height } = args
  const radiusX = Math.max(width * 0.5, 24)
  const radiusY = Math.max(height * 0.5, 24)

  switch (archetype.bodyType) {
    case 'orbital':
      return Array.from({ length: 16 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 16
        const wobble = archetype.visualLanguage === 'expressive' ? 1 + Math.sin(angle * 4) * 0.08 : 1 + Math.sin(angle * 2) * 0.03
        return {
          x: center.x + Math.cos(angle) * radiusX * wobble,
          y: center.y + Math.sin(angle) * radiusY * (wobble * 0.96),
        }
      })
    case 'linear': {
      const tall = archetype.structureProfile.axisEmphasis === 'vertical'
      const wide = archetype.structureProfile.axisEmphasis === 'horizontal'
      const rx = wide ? radiusX * 1.12 : radiusX * 0.62
      const ry = tall ? radiusY * 1.18 : radiusY * 0.84
      return [
        { x: center.x - rx * 0.44, y: center.y - ry },
        { x: center.x + rx * 0.44, y: center.y - ry },
        { x: center.x + rx * 0.82, y: center.y - ry * 0.42 },
        { x: center.x + rx * 0.76, y: center.y + ry * 0.34 },
        { x: center.x + rx * 0.48, y: center.y + ry },
        { x: center.x - rx * 0.48, y: center.y + ry },
        { x: center.x - rx * 0.76, y: center.y + ry * 0.34 },
        { x: center.x - rx * 0.82, y: center.y - ry * 0.42 },
      ]
    }
    case 'organic':
      return Array.from({ length: 12 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 12
        const topBias = Math.sin(angle) < 0 ? 1.18 : 0.82
        const sideDrift = Math.sin(angle * 2) * radiusX * 0.12
        const taper = index === 0 || index === 11 ? 0.84 : index >= 5 && index <= 7 ? 0.92 : 1
        return {
          x: center.x + Math.cos(angle) * radiusX * 0.9 * taper + sideDrift,
          y: center.y + Math.sin(angle) * radiusY * topBias,
        }
      })
    case 'fragmented':
      return Array.from({ length: 10 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 10
        const shard = index % 2 === 0 ? 1.26 : 0.62
        return {
          x: center.x + Math.cos(angle) * radiusX * shard,
          y: center.y + Math.sin(angle) * radiusY * (index % 3 === 0 ? 1.14 : 0.76),
        }
      })
    case 'geometric':
    default:
      return [
        { x: center.x, y: center.y - radiusY * 1.08 },
        { x: center.x + radiusX * 0.72, y: center.y - radiusY * 0.68 },
        { x: center.x + radiusX, y: center.y - radiusY * 0.08 },
        { x: center.x + radiusX * 0.78, y: center.y + radiusY * 0.74 },
        { x: center.x, y: center.y + radiusY },
        { x: center.x - radiusX * 0.78, y: center.y + radiusY * 0.74 },
        { x: center.x - radiusX, y: center.y - radiusY * 0.08 },
        { x: center.x - radiusX * 0.72, y: center.y - radiusY * 0.68 },
      ]
  }
}

function buildPreservedBody(args: {
  archetype: VisualArchetype
  processedShape: ProcessedShape
  sourcePoints: ShapePoint[]
  center: ShapePoint
}) {
  const smoothed = args.archetype.surfaceProfile.surfaceBehavior === 'soft'
    ? chaikin(args.sourcePoints, 1)
    : simplifyPoints(args.sourcePoints, 2)
  const bounds = computeBoundingBox(smoothed)
  const weights = resolveCanonicalWeightProfile({ archetype: args.archetype, processedShape: args.processedShape })
  const canonical = buildCanonicalPoints({
    archetype: args.archetype,
    center: args.center,
    width: bounds.width,
    height: bounds.height,
  })
  const inward = 1 - args.archetype.silhouetteProfile.edgeEmphasis * 0.06
  const blended = blendPoints(scaleAround(smoothed, args.center, inward, inward), canonical, weights.preserve)
  return simplifyPoints(blended, 1.6)
}

function buildExaggeratedBody(args: {
  archetype: VisualArchetype
  processedShape: ProcessedShape
  sourcePoints: ShapePoint[]
  center: ShapePoint
}) {
  const bounds = computeBoundingBox(args.sourcePoints)
  const weights = resolveCanonicalWeightProfile({ archetype: args.archetype, processedShape: args.processedShape })
  const canonical = buildCanonicalPoints({
    archetype: args.archetype,
    center: args.center,
    width: bounds.width,
    height: bounds.height,
  })
  const axis = args.archetype.structureProfile.axisEmphasis
  const exaggeration = 1 + args.archetype.silhouetteProfile.exaggeration * 0.22
  const scaleX = axis === 'horizontal' ? exaggeration * 1.08 : axis === 'vertical' ? 0.94 : 1 + args.archetype.structureProfile.openness * 0.12
  const scaleY = axis === 'vertical' ? exaggeration * 1.08 : axis === 'horizontal' ? 0.94 : 1 + args.archetype.structureProfile.cohesion * 0.08
  const shiftX = args.archetype.corePlacement === 'offset' ? 6 : args.archetype.corePlacement === 'distributed' ? -4 : 0
  const shiftY = axis === 'vertical' ? -4 : 0
  const emphasized = scaleAround(blendPoints(chaikin(args.sourcePoints, 1), canonical, weights.exaggerate), args.center, scaleX, scaleY, shiftX, shiftY)
  return simplifyPoints(emphasized, 1.4)
}

function buildReconstructedBody(args: {
  archetype: VisualArchetype
  processedShape: ProcessedShape
  sourcePoints: ShapePoint[]
  center: ShapePoint
}) {
  const bounds = computeBoundingBox(args.sourcePoints)
  const weights = resolveCanonicalWeightProfile({ archetype: args.archetype, processedShape: args.processedShape })
  const canonical = buildCanonicalPoints({
    archetype: args.archetype,
    center: args.center,
    width: bounds.width,
    height: bounds.height,
  })
  const blend = clamp(1 - weights.reconstruct, 0.04, 0.22)
  const source = simplifyPoints(args.sourcePoints, 3)

  return canonical.map((point, index) => {
    const sourcePoint = source[index % source.length] ?? point
    return {
      x: point.x + (sourcePoint.x - point.x) * blend,
      y: point.y + (sourcePoint.y - point.y) * blend,
    }
  })
}

function buildCorePosition(args: {
  archetype: VisualArchetype
  bounds: ReturnType<typeof computeBoundingBox>
  center: ShapePoint
}): ShapePoint {
  const { archetype, bounds, center } = args

  if (archetype.corePlacement === 'distributed') {
    return {
      x: center.x + bounds.width * 0.08,
      y: center.y - bounds.height * 0.04,
    }
  }
  if (archetype.corePlacement === 'offset') {
    return {
      x: center.x + bounds.width * 0.12,
      y: center.y - bounds.height * 0.1,
    }
  }

  return center
}

function roundPointKey(point: ShapePoint) {
  return `${Math.round(point.x)}:${Math.round(point.y)}`
}

function resolveClosestPoint(points: ShapePoint[], target: ShapePoint) {
  return points.reduce((closest, point) => {
    if (!closest) {
      return point
    }

    const currentDistance = Math.hypot(point.x - target.x, point.y - target.y)
    const closestDistance = Math.hypot(closest.x - target.x, closest.y - target.y)
    return currentDistance < closestDistance ? point : closest
  }, points[0])
}

function sampleEvenly(points: ShapePoint[], count: number) {
  if (points.length <= count) {
    return points
  }

  return Array.from({ length: count }, (_, index) => points[Math.floor((index / count) * points.length)] ?? points[0]!)
}

function sortPointsByAngle(points: ShapePoint[], center: ShapePoint) {
  return [...points].sort((left, right) => Math.atan2(left.y - center.y, left.x - center.x) - Math.atan2(right.y - center.y, right.x - center.x))
}

function resolveBodyLandmarks(bodyPoints: ShapePoint[]) {
  const bounds = computeBoundingBox(bodyPoints)
  const centroid = computeCentroid(bodyPoints)
  const sorted = sortPointsByAngle(bodyPoints, centroid)

  return {
    bounds,
    centroid,
    sorted,
    top: resolveClosestPoint(bodyPoints, { x: centroid.x, y: bounds.minY }),
    right: resolveClosestPoint(bodyPoints, { x: bounds.maxX, y: centroid.y }),
    bottom: resolveClosestPoint(bodyPoints, { x: centroid.x, y: bounds.maxY }),
    left: resolveClosestPoint(bodyPoints, { x: bounds.minX, y: centroid.y }),
  }
}

function dedupeAnchors(anchors: VisualBodyAnchor[]) {
  const seen = new Set<string>()

  return anchors.filter((anchor) => {
    const key = `${anchor.role}:${roundPointKey(anchor.point)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function createAnchor(id: string, point: ShapePoint, role: VisualBodyAnchor['role'], weight: number): VisualBodyAnchor {
  return {
    id,
    point,
    role,
    weight: clamp(weight, 0.22, 1),
  }
}

function createSegment(id: string, from: ShapePoint, to: ShapePoint, weight: number): VisualBodySegment {
  return {
    id,
    from,
    to,
    weight: clamp(weight, 0.22, 1),
  }
}

function resolveEmissionPoints(processedShape?: ProcessedShape) {
  return (processedShape?.emissionPoints.length ? processedShape.emissionPoints : processedShape?.debug.emissionPoints ?? []).slice(0, 6)
}

function buildOrbitalStructure(args: {
  bodyPoints: ShapePoint[]
  corePosition: ShapePoint
  processedShape?: ProcessedShape
}) {
  const { bounds, centroid, top, right, bottom, left, sorted } = resolveBodyLandmarks(args.bodyPoints)
  const diagonals = sampleEvenly(sorted, 8).filter((point) => ![top, right, bottom, left].some((landmark) => roundPointKey(landmark) === roundPointKey(point))).slice(0, 4)
  const emissionPoints = resolveEmissionPoints(args.processedShape)
  const anchors = dedupeAnchors([
    createAnchor('core', args.corePosition, 'core', 1),
    createAnchor('axis-top', top, 'axis', 0.92),
    createAnchor('axis-right', right, 'axis', 0.84),
    createAnchor('axis-bottom', bottom, 'axis', 0.8),
    createAnchor('axis-left', left, 'axis', 0.84),
    ...diagonals.map((point, index) => createAnchor(`edge-diagonal-${index}`, point, 'edge', 0.68 - index * 0.04)),
    ...emissionPoints.map((point, index) => createAnchor(`emission-${index}`, point, 'emission', 0.72 - index * 0.06)),
  ])
  const axisAnchors = anchors.filter((anchor) => anchor.role === 'axis')
  const segments = [
    ...axisAnchors.map((anchor, index) => createSegment(`orbital-spoke-${index}`, args.corePosition, anchor.point, 0.86 - index * 0.05)),
    ...axisAnchors.map((anchor, index) => createSegment(`orbital-ring-${index}`, anchor.point, axisAnchors[(index + 1) % axisAnchors.length]!.point, 0.54)),
  ]
  const cavities: VisualBodyCavity[] = [
    {
      id: 'core-basin',
      center: args.corePosition,
      radiusX: Math.max(bounds.width * 0.12, 10),
      radiusY: Math.max(bounds.height * 0.12, 10),
      weight: 0.88,
    },
    {
      id: 'orbital-halo',
      center: centroid,
      radiusX: Math.max(bounds.width * 0.22, 16),
      radiusY: Math.max(bounds.height * 0.22, 16),
      weight: 0.42,
    },
  ]

  return { anchors, segments, cavities }
}

function buildLinearStructure(args: {
  bodyPoints: ShapePoint[]
  corePosition: ShapePoint
  processedShape?: ProcessedShape
}) {
  const { bounds, centroid, top, right, bottom, left } = resolveBodyLandmarks(args.bodyPoints)
  const upper = resolveClosestPoint(args.bodyPoints, { x: centroid.x, y: bounds.minY + bounds.height * 0.34 })
  const lower = resolveClosestPoint(args.bodyPoints, { x: centroid.x, y: bounds.minY + bounds.height * 0.68 })
  const emissionPoints = resolveEmissionPoints(args.processedShape)
  const anchors = dedupeAnchors([
    createAnchor('core', args.corePosition, 'core', 1),
    createAnchor('axis-head', top, 'axis', 0.94),
    createAnchor('axis-upper', upper, 'axis', 0.88),
    createAnchor('axis-lower', lower, 'axis', 0.84),
    createAnchor('axis-base', bottom, 'axis', 0.9),
    createAnchor('edge-left', left, 'edge', 0.66),
    createAnchor('edge-right', right, 'edge', 0.66),
    ...emissionPoints.map((point, index) => createAnchor(`emission-${index}`, point, 'emission', 0.7 - index * 0.06)),
  ])
  const axisAnchors = anchors.filter((anchor) => anchor.role === 'axis')
  const segments = [
    ...axisAnchors.slice(0, -1).map((anchor, index) => createSegment(`linear-column-${index}`, anchor.point, axisAnchors[index + 1]!.point, 0.88 - index * 0.06)),
    createSegment('linear-rib-left', args.corePosition, left, 0.56),
    createSegment('linear-rib-right', args.corePosition, right, 0.56),
  ]
  const cavities: VisualBodyCavity[] = [
    {
      id: 'core-column',
      center: args.corePosition,
      radiusX: Math.max(bounds.width * 0.08, 8),
      radiusY: Math.max(bounds.height * 0.2, 18),
      weight: 0.86,
    },
    {
      id: 'head-node',
      center: upper,
      radiusX: Math.max(bounds.width * 0.06, 7),
      radiusY: Math.max(bounds.height * 0.08, 10),
      weight: 0.44,
    },
  ]

  return { anchors, segments, cavities }
}

function buildOrganicStructure(args: {
  bodyPoints: ShapePoint[]
  corePosition: ShapePoint
  processedShape?: ProcessedShape
}) {
  const { bounds, centroid, sorted, top, right, bottom, left } = resolveBodyLandmarks(args.bodyPoints)
  const growthA = sorted[Math.floor(sorted.length * 0.1)] ?? top
  const growthB = sorted[Math.floor(sorted.length * 0.58)] ?? bottom
  const growthC = sorted[Math.floor(sorted.length * 0.82)] ?? right
  const emissionPoints = resolveEmissionPoints(args.processedShape)
  const anchors = dedupeAnchors([
    createAnchor('core', args.corePosition, 'core', 1),
    createAnchor('growth-a', growthA, 'axis', 0.86),
    createAnchor('growth-b', growthB, 'axis', 0.78),
    createAnchor('growth-c', growthC, 'axis', 0.72),
    createAnchor('edge-left', left, 'edge', 0.58),
    createAnchor('edge-right', right, 'edge', 0.54),
    createAnchor('edge-bottom', bottom, 'edge', 0.6),
    ...emissionPoints.map((point, index) => createAnchor(`emission-${index}`, point, 'emission', 0.74 - index * 0.08)),
  ])
  const growthAnchors = anchors.filter((anchor) => anchor.role === 'axis')
  const edgeAnchors = anchors.filter((anchor) => anchor.role === 'edge')
  const segments = [
    ...growthAnchors.map((anchor, index) => createSegment(`organic-growth-${index}`, args.corePosition, anchor.point, 0.8 - index * 0.08)),
    ...growthAnchors.slice(0, 2).map((anchor, index) => createSegment(`organic-branch-${index}`, anchor.point, edgeAnchors[index % edgeAnchors.length]!.point, 0.48)),
  ]
  const cavities: VisualBodyCavity[] = [
    {
      id: 'organic-heart',
      center: args.corePosition,
      radiusX: Math.max(bounds.width * 0.11, 9),
      radiusY: Math.max(bounds.height * 0.13, 11),
      weight: 0.8,
    },
    {
      id: 'growth-pocket',
      center: { x: centroid.x - bounds.width * 0.08, y: centroid.y + bounds.height * 0.06 },
      radiusX: Math.max(bounds.width * 0.09, 8),
      radiusY: Math.max(bounds.height * 0.08, 8),
      weight: 0.46,
    },
  ]

  return { anchors, segments, cavities }
}

function buildFragmentedStructure(args: {
  bodyPoints: ShapePoint[]
  corePosition: ShapePoint
  processedShape?: ProcessedShape
}) {
  const { bounds, sorted } = resolveBodyLandmarks(args.bodyPoints)
  const emissionPoints = resolveEmissionPoints(args.processedShape)
  const poles = [...sorted]
    .sort(
      (left, right) =>
        Math.hypot(right.x - args.corePosition.x, right.y - args.corePosition.y) - Math.hypot(left.x - args.corePosition.x, left.y - args.corePosition.y),
    )
    .slice(0, 4)
  const anchors = dedupeAnchors([
    createAnchor('core', args.corePosition, 'core', 1),
    ...poles.map((point, index) => createAnchor(`pole-${index}`, point, 'edge', 0.86 - index * 0.1)),
    ...emissionPoints.map((point, index) => createAnchor(`emission-${index}`, point, 'emission', 0.82 - index * 0.08)),
    ...sampleEvenly(sorted, 3).map((point, index) => createAnchor(`axis-${index}`, point, 'axis', 0.56 - index * 0.06)),
  ])
  const poleAnchors = anchors.filter((anchor) => anchor.id.startsWith('pole-'))
  const segments = [
    ...poleAnchors.slice(0, -1).map((anchor, index) => createSegment(`fragment-link-${index}`, anchor.point, poleAnchors[index + 1]!.point, 0.66 - index * 0.08)),
    ...poleAnchors.slice(0, 2).map((anchor, index) => createSegment(`fragment-core-${index}`, args.corePosition, anchor.point, 0.54 - index * 0.06)),
  ]
  const cavities: VisualBodyCavity[] = [
    {
      id: 'fragment-core',
      center: args.corePosition,
      radiusX: Math.max(bounds.width * 0.08, 8),
      radiusY: Math.max(bounds.height * 0.08, 8),
      weight: 0.58,
    },
    ...poleAnchors.slice(0, 3).map((anchor, index) => ({
      id: `fragment-pocket-${index}`,
      center: anchor.point,
      radiusX: Math.max(bounds.width * 0.06, 7),
      radiusY: Math.max(bounds.height * 0.06, 7),
      weight: 0.52 - index * 0.08,
    })),
  ]

  return { anchors, segments, cavities }
}

function buildGeometricStructure(args: {
  bodyPoints: ShapePoint[]
  corePosition: ShapePoint
  processedShape?: ProcessedShape
}) {
  const { bounds, centroid, sorted, top, right, bottom, left } = resolveBodyLandmarks(args.bodyPoints)
  const vertices = sampleEvenly(sorted, Math.min(6, sorted.length))
  const emissionPoints = resolveEmissionPoints(args.processedShape)
  const anchors = dedupeAnchors([
    createAnchor('core', args.corePosition, 'core', 1),
    createAnchor('axis-top', top, 'axis', 0.78),
    createAnchor('axis-right', right, 'axis', 0.74),
    createAnchor('axis-bottom', bottom, 'axis', 0.72),
    createAnchor('axis-left', left, 'axis', 0.74),
    ...vertices.map((point, index) => createAnchor(`vertex-${index}`, point, 'edge', 0.82 - index * 0.06)),
    ...emissionPoints.map((point, index) => createAnchor(`emission-${index}`, point, 'emission', 0.62 - index * 0.06)),
  ])
  const vertexAnchors = anchors.filter((anchor) => anchor.id.startsWith('vertex-'))
  const segments = [
    ...vertexAnchors.map((anchor, index) => createSegment(`geometric-edge-${index}`, anchor.point, vertexAnchors[(index + 1) % vertexAnchors.length]!.point, 0.74)),
    ...vertexAnchors.slice(0, 3).map((anchor, index) => createSegment(`geometric-spoke-${index}`, args.corePosition, anchor.point, 0.52 - index * 0.04)),
  ]
  const cavities: VisualBodyCavity[] = [
    {
      id: 'central-module',
      center: args.corePosition,
      radiusX: Math.max(bounds.width * 0.1, 9),
      radiusY: Math.max(bounds.height * 0.1, 9),
      weight: 0.78,
    },
    {
      id: 'upper-module',
      center: { x: centroid.x, y: bounds.minY + bounds.height * 0.32 },
      radiusX: Math.max(bounds.width * 0.06, 7),
      radiusY: Math.max(bounds.height * 0.06, 7),
      weight: 0.42,
    },
  ]

  return { anchors, segments, cavities }
}

function buildStructure(args: {
  archetype: VisualArchetype
  bodyPoints: ShapePoint[]
  corePosition: ShapePoint
  processedShape?: ProcessedShape
}): Pick<VisualBodyPlan, 'structure'> {
  const categoryStructure =
    args.archetype.bodyType === 'orbital'
      ? buildOrbitalStructure(args)
      : args.archetype.bodyType === 'linear'
        ? buildLinearStructure(args)
        : args.archetype.bodyType === 'organic'
          ? buildOrganicStructure(args)
          : args.archetype.bodyType === 'fragmented'
            ? buildFragmentedStructure(args)
            : buildGeometricStructure(args)

  return {
    structure: {
      anchors: categoryStructure.anchors,
      segments: categoryStructure.segments,
      cavities: categoryStructure.cavities,
    },
  }
}

export function buildVisualBody(args: {
  visualArchetype: VisualArchetype
  processedShape?: ProcessedShape
}): VisualBodyPlan {
  const processedShape = args.processedShape
  const sourcePoints = resolveSourcePoints(processedShape)

  if (!processedShape || sourcePoints.length < 3) {
    const fallbackSeedCenter = { x: 120, y: 120 }
    const fallbackPoints = buildCanonicalPoints({
      archetype: args.visualArchetype,
      center: fallbackSeedCenter,
      width: 132,
      height: 168,
    })
    const fallbackCenter = computeCentroid(fallbackPoints)
    const fallbackBounds = computeBoundingBox(fallbackPoints)
    const corePosition = buildCorePosition({ archetype: args.visualArchetype, bounds: fallbackBounds, center: fallbackCenter })
    const inner = insetPoints(fallbackPoints, corePosition, 0.58)

    return {
      bodyPath: pointsToPath(fallbackPoints),
      innerPath: pointsToPath(inner),
      core: {
        position: corePosition,
        radius: 18,
        intensity: 0.6,
      },
      ...buildStructure({
        archetype: args.visualArchetype,
        bodyPoints: fallbackPoints,
        corePosition,
      }),
      silhouette: {
        strategy: args.visualArchetype.silhouetteStrategy,
        envelopePath: pointsToPath(fallbackPoints),
        boundingBox: fallbackBounds,
        legibility: 0.52,
      },
    }
  }

  const center = resolveCentroid(processedShape, sourcePoints)
  const rawBodyPoints =
    args.visualArchetype.silhouetteStrategy === 'preserve'
      ? buildPreservedBody({ archetype: args.visualArchetype, processedShape, sourcePoints, center })
      : args.visualArchetype.silhouetteStrategy === 'exaggerate'
        ? buildExaggeratedBody({ archetype: args.visualArchetype, processedShape, sourcePoints, center })
        : buildReconstructedBody({ archetype: args.visualArchetype, processedShape, sourcePoints, center })
  const normalizedSets = normalizePointSets([
    simplifyPoints(rawBodyPoints, 2),
    simplifyPoints(rawBodyPoints, 4),
  ])
  const bodyPoints = normalizedSets[0] ?? []
  const envelopePoints = normalizedSets[1] ?? bodyPoints
  const bodyBounds = computeBoundingBox(bodyPoints)
  const corePosition = buildCorePosition({ archetype: args.visualArchetype, bounds: bodyBounds, center: computeCentroid(bodyPoints) })
  const innerInset =
    args.visualArchetype.bodyType === 'fragmented'
      ? 0.48
      : args.visualArchetype.visualLanguage === 'dense'
        ? 0.54
        : args.visualArchetype.bodyType === 'linear' || args.visualArchetype.bodyType === 'geometric'
          ? 0.58
          : 0.62
  const innerPoints = insetPoints(bodyPoints, corePosition, innerInset)
  const coreRadius = Math.max(Math.min(bodyBounds.width, bodyBounds.height) * 0.12, 10)
  const legibility = clamp(
    args.visualArchetype.structureProfile.cohesion * 0.36 +
      args.visualArchetype.silhouetteProfile.edgeEmphasis * 0.34 +
      (1 - args.visualArchetype.surfaceProfile.textureIntensity) * 0.2 +
      (args.visualArchetype.visualLanguage === 'minimal' ? 0.1 : args.visualArchetype.visualLanguage === 'dense' ? -0.04 : 0.04) +
      (args.visualArchetype.bodyType === 'linear' || args.visualArchetype.bodyType === 'geometric' ? 0.06 : args.visualArchetype.bodyType === 'fragmented' ? -0.04 : 0),
    0.18,
    0.96,
  )

  return {
    bodyPath: pointsToPath(bodyPoints),
    innerPath: pointsToPath(innerPoints),
    core: {
      position: corePosition,
      radius: coreRadius,
      intensity: clamp(0.48 + args.visualArchetype.structureProfile.cohesion * 0.22 + args.visualArchetype.surfaceProfile.contrastBias * 0.18, 0.32, 0.94),
    },
    ...buildStructure({
      archetype: args.visualArchetype,
      bodyPoints,
      corePosition,
      processedShape,
    }),
    silhouette: {
      strategy: args.visualArchetype.silhouetteStrategy,
      envelopePath: pointsToPath(envelopePoints),
      boundingBox: bodyBounds,
      legibility,
    },
  }
}