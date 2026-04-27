import type { ManifestationMode } from '../../rendering/contracts/types'
import type { ExtractedShapeSource, ProcessedShape, ShapePoint } from '../contracts/ProcessedShape'
import { buildEmissionPoints, chaikin, clamp, computeBoundingBox, computeCentroid, computePerceptualCentroid, distance, normalizePoints, pointsToPath, simplifyPoints } from '../analysis/shapeMetrics'

type SemanticMorphologyProfile = {
  compression: number
  expansion: number
  elongationX: number
  elongationY: number
  circularityBlend: number
  rigidity: number
  fluidity: number
  cohesion: number
  rupture: number
  fragmentation: number
  openness: number
  lift: number
  grounding: number
  lean: number
  massX: number
  massY: number
}

function snapToGrid(points: ShapePoint[], grid = 12) {
  return points.map((point) => ({
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  }))
}

function chunkyContour(points: ShapePoint[]) {
  const reduced = points.filter((_, index) => index % 2 === 0)
  return snapToGrid(reduced, 10)
}

function fireContour(points: ShapePoint[], centroid: ShapePoint) {
  return points.map((point) => {
    const verticalBias = clamp((centroid.y - point.y) / 90, -0.3, 0.8)
    return {
      x: point.x + Math.sin(point.y * 0.12) * 4,
      y: point.y - 10 - verticalBias * 18,
    }
  })
}

function waterContour(points: ShapePoint[]) {
  return chaikin(points, 2).map((point, index) => ({
    x: point.x + Math.sin(index * 0.22) * 2,
    y: point.y + Math.cos(index * 0.19) * 3,
  }))
}

function airContour(points: ShapePoint[], centroid: ShapePoint) {
  return points
    .filter((_, index) => index % 2 === 0)
    .map((point, index) => ({
      x: point.x + (point.x - centroid.x) * 0.08 + Math.sin(index * 0.6) * 6,
      y: point.y + Math.cos(index * 0.4) * 4,
    }))
}

function naturezaContour(points: ShapePoint[], centroid: ShapePoint) {
  return chaikin(points, 1).map((point, index) => {
    const asymmetry = index % 3 === 0 ? 1.12 : 1.02
    return {
      x: centroid.x + (point.x - centroid.x) * asymmetry + Math.sin(index * 0.4) * 2,
      y: centroid.y + (point.y - centroid.y) * (index % 4 === 0 ? 1.16 : 1.04) - Math.cos(index * 0.32) * 3,
    }
  })
}

function centelhaContour(points: ShapePoint[], centroid: ShapePoint) {
  return points.map((point, index) => ({
    x: centroid.x + (point.x - centroid.x) * 0.76 + Math.sin(index * 0.5) * 1.4,
    y: centroid.y + (point.y - centroid.y) * 0.76 + Math.cos(index * 0.44) * 1.4,
  }))
}

function roboContour(points: ShapePoint[]) {
  return snapToGrid(simplifyPoints(points, 6), 14)
}

function blendContours(basePoints: ShapePoint[], transformedPoints: ShapePoint[], preserve: number) {
  const clampedPreserve = clamp(preserve, 0, 1)

  return transformedPoints.map((point, index) => {
    const basePoint = basePoints[index % basePoints.length] ?? point
    return {
      x: basePoint.x + (point.x - basePoint.x) * clampedPreserve,
      y: basePoint.y + (point.y - basePoint.y) * clampedPreserve,
    }
  })
}

function averageRadius(points: ShapePoint[], centroid: ShapePoint) {
  if (!points.length) {
    return 0
  }

  return points.reduce((total, point) => total + distance(point, centroid), 0) / points.length
}

function buildSemanticMorphologyProfile(source: ExtractedShapeSource): SemanticMorphologyProfile {
  const { signature } = source
  const horizontalAxis = signature.dominantAxis === 'horizontal' ? 1 : 0
  const verticalAxis = signature.dominantAxis === 'vertical' ? 1 : 0
  const radialAxis = signature.dominantAxis === 'radial' ? 1 : 0
  const spread = signature.massDistribution === 'spread' ? 1 : 0
  const concentrated = signature.massDistribution === 'concentrated' ? 1 : 0
  const stable = clamp(signature.symmetry * 0.58 + signature.circularity * 0.34 - signature.fragmentation * 0.38, 0, 1)
  const disrupted = clamp((1 - signature.symmetry) * 0.36 + signature.fragmentation * 0.78 + (signature.type === 'fragmentado' ? 0.16 : 0), 0, 1)
  const typographicDamping = signature.typographicCandidate ? 0.42 : 1

  return {
    compression: clamp((concentrated ? 0.28 : 0.06) + (signature.type === 'orbital' ? 0.14 : 0) + stable * 0.14 - spread * 0.08, 0, 0.72) * typographicDamping,
    expansion: clamp((spread ? 0.34 : 0.08) + radialAxis * 0.16 + (signature.type === 'radial' ? 0.2 : 0) + (signature.type === 'organico' ? 0.08 : 0), 0, 0.86) * typographicDamping,
    elongationX: clamp(horizontalAxis * 0.44 + (signature.type === 'linear' && horizontalAxis ? 0.24 : 0) - verticalAxis * 0.12, -0.18, 0.74) * typographicDamping,
    elongationY: clamp(verticalAxis * 0.44 + (signature.type === 'linear' && verticalAxis ? 0.24 : 0) - horizontalAxis * 0.12 + (signature.type === 'organico' ? 0.06 : 0), -0.18, 0.74) * typographicDamping,
    circularityBlend: clamp(signature.circularity * 0.22 + (signature.type === 'orbital' ? 0.4 : 0) + (signature.type === 'radial' ? 0.3 : 0) - signature.angularity * 0.16, 0, 0.82) * typographicDamping,
    rigidity: clamp(signature.angularity * 0.54 + (signature.type === 'geometrico' ? 0.28 : 0) + (signature.type === 'linear' ? 0.14 : 0) - signature.curvatureRatio * 0.16, 0, 0.8) * typographicDamping,
    fluidity: clamp(signature.curvatureRatio * 0.52 + (signature.type === 'organico' ? 0.34 : 0) + (signature.type === 'orbital' ? 0.12 : 0) - signature.angularity * 0.18, 0, 0.88) * typographicDamping,
    cohesion: clamp(stable * 0.32 + concentrated * 0.18 + (signature.type === 'orbital' ? 0.18 : 0) - disrupted * 0.2, 0, 0.76) * typographicDamping,
    rupture: clamp(disrupted * 0.4 + (signature.type === 'fragmentado' ? 0.22 : 0) + (signature.type === 'organico' ? 0.08 : 0), 0, 0.84) * typographicDamping,
    fragmentation: clamp(signature.fragmentation * 0.72 + (signature.type === 'fragmentado' ? 0.24 : 0), 0, 1) * typographicDamping,
    openness: clamp((spread ? 0.2 : 0.04) + radialAxis * 0.14 + (signature.type === 'radial' ? 0.16 : 0) + (signature.type === 'organico' ? 0.14 : 0) - concentrated * 0.12, 0, 0.8) * typographicDamping,
    lift: clamp(verticalAxis * 0.32 + (signature.type === 'organico' ? 0.12 : 0) + (signature.type === 'linear' && verticalAxis ? 0.08 : 0), 0, 0.66) * typographicDamping,
    grounding: clamp(horizontalAxis * 0.16 + concentrated * 0.1 + (signature.type === 'geometrico' ? 0.08 : 0) + stable * 0.08, 0, 0.54) * typographicDamping,
    lean: clamp(horizontalAxis * 0.08 - verticalAxis * 0.03 + (signature.type === 'linear' && horizontalAxis ? 0.05 : 0), -0.2, 0.2) * typographicDamping,
    massX: clamp((spread ? 0.14 : -0.08) + horizontalAxis * 0.1 + (signature.type === 'linear' && horizontalAxis ? 0.08 : 0), -0.24, 0.28) * typographicDamping,
    massY: clamp((verticalAxis ? -0.16 : 0.04) + (signature.type === 'organico' ? -0.08 : 0) + concentrated * 0.05, -0.26, 0.18) * typographicDamping,
  }
}

function applySemanticMorphology(points: ShapePoint[], anchor: ShapePoint, source: ExtractedShapeSource) {
  if (points.length < 3) {
    return points
  }

  const profile = buildSemanticMorphologyProfile(source)
  const bounds = computeBoundingBox(points)
  const radiusX = Math.max(bounds.width / 2, 1)
  const radiusY = Math.max(bounds.height / 2, 1)
  const maxRadius = Math.max(radiusX, radiusY, 1)
  const meanRadius = Math.max(averageRadius(points, anchor), 1)
  const dominantAxis = source.signature.dominantAxis

  return points.map((point, index) => {
    const dx = point.x - anchor.x
    const dy = point.y - anchor.y
    const distanceFromAnchor = Math.max(distance(point, anchor), 1)
    const angle = Math.atan2(dy, dx)
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    const workingAngle = angle + (snappedAngle - angle) * profile.rigidity
    const normalizedX = dx / radiusX
    const normalizedY = dy / radiusY
    const axisAlignment =
      dominantAxis === 'horizontal'
        ? Math.abs(Math.cos(angle))
        : dominantAxis === 'vertical'
          ? Math.abs(Math.sin(angle))
          : 1 - Math.abs(Math.sin(angle * 2)) * 0.2
    const circularRadius = meanRadius * (1 + profile.expansion * 0.16 - profile.compression * 0.08)
    const circularizedRadius = distanceFromAnchor + (circularRadius - distanceFromAnchor) * profile.circularityBlend
    const apertureRadius = circularizedRadius * (1 + axisAlignment * profile.openness * 0.18 - (1 - axisAlignment) * profile.compression * 0.08)
    const scaledRadius = apertureRadius * (1 + profile.expansion * 0.08 - profile.cohesion * 0.06)
    let x = Math.cos(workingAngle) * scaledRadius * (1 + profile.elongationX * 0.42)
    let y = Math.sin(workingAngle) * scaledRadius * (1 + profile.elongationY * 0.42)

    const centerBias = 1 - clamp(Math.hypot(normalizedX, normalizedY) / 1.35, 0, 1)
    const cohesionScale = 1 - profile.cohesion * centerBias * 0.18
    x *= cohesionScale
    y *= cohesionScale

    const organicWave = profile.fluidity * Math.sin(index * 0.52 + angle * 2.3) * maxRadius * 0.04
    const ruptureOffsetX = profile.rupture * Math.cos(angle * 2.2 + index * 0.38) * maxRadius * 0.044
    const ruptureOffsetY = profile.rupture * Math.sin(angle * 2.7 + index * 0.34) * maxRadius * 0.044
    const fragmentationBurst = profile.fragmentation * Math.sin(index * 1.12 + angle * 3.4) * maxRadius * 0.058
    const tangentX = -Math.sin(workingAngle)
    const tangentY = Math.cos(workingAngle)

    x += tangentX * organicWave + ruptureOffsetX + Math.cos(workingAngle) * fragmentationBurst
    y += tangentY * organicWave + ruptureOffsetY + Math.sin(workingAngle) * fragmentationBurst

    const lateralSpread = Math.sign(normalizedX) * Math.abs(normalizedX) * profile.massX * maxRadius * 0.12
    const verticalSpread = Math.sign(normalizedY) * Math.abs(normalizedY) * profile.massY * maxRadius * 0.12
    const postureX = profile.lean * (1 - Math.abs(normalizedY)) * maxRadius * 0.08
    const postureY =
      profile.lift * Math.max(0, -normalizedY) * maxRadius * 0.14 -
      profile.grounding * Math.max(0, normalizedY) * maxRadius * 0.12

    return {
      x: anchor.x + x + lateralSpread + postureX,
      y: anchor.y + y + verticalSpread + postureY,
    }
  })
}

export function abstractShape(source: ExtractedShapeSource, mode: ManifestationMode, variant?: string): ProcessedShape {
  const basePoints = source.shapeData.points
  const centroid = source.shapeData.centroid
  const perceptualCentroid = computePerceptualCentroid(basePoints, source.signature)

  let abstractedPoints = basePoints

  switch (mode) {
    case 'centelha':
      abstractedPoints = centelhaContour(basePoints, centroid)
      break
    case 'elemental':
      if (variant === 'agua') {
        abstractedPoints = waterContour(basePoints)
      } else if (variant === 'fogo') {
        abstractedPoints = fireContour(basePoints, centroid)
      } else if (variant === 'terra') {
        abstractedPoints = chunkyContour(basePoints)
      } else {
        abstractedPoints = airContour(basePoints, centroid)
      }
      break
    case 'natureza':
      abstractedPoints = naturezaContour(basePoints, centroid)
      break
    case 'robo-ia':
      abstractedPoints = roboContour(basePoints)
      break
    default:
      abstractedPoints = simplifyPoints(basePoints, 3)
  }

  abstractedPoints = applySemanticMorphology(abstractedPoints, perceptualCentroid, source)

  const typographicProtection = source.signature.typographicCandidate
  const basePreserveFactor =
    typographicProtection
      ? 0.92
      : mode === 'centelha'
        ? 0.68
        : mode === 'natureza'
          ? 0.74
          : mode === 'robo-ia'
            ? 0.82
            : variant === 'agua'
              ? 0.78
              : variant === 'fogo'
                ? 0.7
                : variant === 'terra'
                  ? 0.88
                  : 0.64
      const semanticIntensity = clamp(
        source.signature.fragmentation * 0.18 +
          (source.signature.type === 'orbital' || source.signature.type === 'radial' ? 0.08 : 0) +
          source.signature.angularity * 0.08 +
          source.signature.curvatureRatio * 0.06,
        0,
        typographicProtection ? 0.12 : 0.24,
      )
      const preserveFactor = clamp(basePreserveFactor - semanticIntensity, typographicProtection ? 0.82 : 0.44, 0.94)

  const preservedAbstracted = blendContours(basePoints, abstractedPoints, preserveFactor)
  const normalizedAbstracted = simplifyPoints(normalizePoints(preservedAbstracted), 2)
  const abstractedCentroid = computeCentroid(normalizedAbstracted)
  const abstractedBoundingBox = computeBoundingBox(normalizedAbstracted)
  const emissionPoints =
    mode === 'centelha'
      ? buildEmissionPoints(basePoints, perceptualCentroid, 18)
      : mode === 'natureza'
        ? buildEmissionPoints(normalizedAbstracted, abstractedCentroid, 14)
        : buildEmissionPoints(normalizedAbstracted, abstractedCentroid, 12)

  return {
    baseGeometry: source.shapeData,
    abstractedGeometry: {
      path: pointsToPath(normalizedAbstracted),
      points: normalizedAbstracted,
      boundingBox: abstractedBoundingBox,
      centroid: abstractedCentroid,
    },
    emissionPoints,
    deformationProfile: {
      mode,
      variant,
      dominantAxis: source.signature.dominantAxis,
      complexity: source.signature.complexity,
      curvature: source.signature.curvature,
      density: source.signature.density,
    },
    signature: source.signature,
    debug: {
      contourPoints: source.debug.contourPoints,
      centroid: source.debug.centroid,
      perceptualCentroid,
      emissionPoints,
    },
  }
}
