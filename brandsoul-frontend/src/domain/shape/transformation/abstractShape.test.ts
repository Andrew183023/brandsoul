import { describe, expect, it } from 'vitest'

import type { ExtractedShapeSource, ShapePoint, ShapeSignature } from '../contracts/ProcessedShape'
import { computeBoundingBox, computeCentroid, computeSignature, computeSymmetryScore } from '../analysis/shapeMetrics'
import { abstractShape } from './abstractShape'

function buildCirclePoints(radius = 60, count = 36): ShapePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return {
      x: 120 + Math.cos(angle) * radius,
      y: 120 + Math.sin(angle) * radius,
    }
  })
}

function buildRoundedDiamondPoints(): ShapePoint[] {
  return [
    { x: 120, y: 34 },
    { x: 150, y: 48 },
    { x: 180, y: 78 },
    { x: 194, y: 120 },
    { x: 176, y: 166 },
    { x: 142, y: 198 },
    { x: 120, y: 210 },
    { x: 92, y: 198 },
    { x: 58, y: 166 },
    { x: 42, y: 120 },
    { x: 60, y: 78 },
    { x: 92, y: 48 },
  ]
}

function buildSignature(overrides: Partial<ShapeSignature>): ShapeSignature {
  return {
    type: 'orbital',
    dominantAxis: 'radial',
    area: 8400,
    complexity: 0.46,
    curvature: 'medium',
    curvatureRatio: 0.58,
    angularity: 0.3,
    circularity: 0.76,
    density: 0.56,
    symmetry: 0.74,
    symmetryHorizontal: 0.72,
    symmetryVertical: 0.76,
    massDistribution: 'concentrated',
    fragmentation: 0.18,
    ...overrides,
  }
}

function buildSource(points: ShapePoint[], signature: ShapeSignature): ExtractedShapeSource {
  const centroid = computeCentroid(points)

  return {
    sourceType: 'raster',
    shapeData: {
      type: 'contour',
      points,
      boundingBox: computeBoundingBox(points),
      centroid,
    },
    signature,
    debug: {
      contourPoints: points,
      centroid,
    },
  }
}

describe('abstractShape semantic morphology', () => {
  it('strengthens cohesion for orbital silhouettes and controlled rupture for fragmented silhouettes', () => {
    const points = buildCirclePoints()
    const orbital = abstractShape(
      buildSource(
        points,
        buildSignature({
          type: 'orbital',
          dominantAxis: 'radial',
          curvature: 'high',
          curvatureRatio: 0.84,
          angularity: 0.16,
          circularity: 0.92,
          symmetry: 0.9,
          symmetryHorizontal: 0.88,
          symmetryVertical: 0.92,
          massDistribution: 'concentrated',
          fragmentation: 0.08,
        }),
      ),
      'centelha',
    )
    const fragmented = abstractShape(
      buildSource(
        points,
        buildSignature({
          type: 'fragmentado',
          dominantAxis: 'horizontal',
          curvatureRatio: 0.34,
          angularity: 0.62,
          circularity: 0.36,
          density: 0.24,
          symmetry: 0.28,
          symmetryHorizontal: 0.26,
          symmetryVertical: 0.3,
          massDistribution: 'spread',
          fragmentation: 0.86,
        }),
      ),
      'centelha',
    )

    const orbitalMetrics = computeSignature(orbital.abstractedGeometry.points)
    const fragmentedMetrics = computeSignature(fragmented.abstractedGeometry.points)

    expect(orbital.abstractedGeometry.path).not.toBe(fragmented.abstractedGeometry.path)
    expect(orbitalMetrics.circularity).toBeGreaterThan(fragmentedMetrics.circularity)
    expect(computeSymmetryScore(orbital.abstractedGeometry.points, 'radial')).toBeGreaterThan(
      computeSymmetryScore(fragmented.abstractedGeometry.points, 'radial'),
    )
    expect(fragmentedMetrics.fragmentation).toBeGreaterThan(orbitalMetrics.fragmentation)
  })

  it('elongates the silhouette along the semantic dominant axis', () => {
    const points = buildCirclePoints(58)
    const vertical = abstractShape(
      buildSource(
        points,
        buildSignature({
          type: 'linear',
          dominantAxis: 'vertical',
          curvature: 'low',
          curvatureRatio: 0.22,
          angularity: 0.74,
          circularity: 0.42,
          density: 0.32,
          symmetry: 0.62,
          symmetryHorizontal: 0.54,
          symmetryVertical: 0.78,
          massDistribution: 'spread',
          fragmentation: 0.2,
        }),
      ),
      'robo-ia',
    )
    const horizontal = abstractShape(
      buildSource(
        points,
        buildSignature({
          type: 'linear',
          dominantAxis: 'horizontal',
          curvature: 'low',
          curvatureRatio: 0.22,
          angularity: 0.74,
          circularity: 0.42,
          density: 0.32,
          symmetry: 0.62,
          symmetryHorizontal: 0.78,
          symmetryVertical: 0.54,
          massDistribution: 'spread',
          fragmentation: 0.2,
        }),
      ),
      'robo-ia',
    )

    const verticalRatio = vertical.abstractedGeometry.boundingBox.height / vertical.abstractedGeometry.boundingBox.width
    const horizontalRatio = horizontal.abstractedGeometry.boundingBox.width / horizontal.abstractedGeometry.boundingBox.height

    expect(verticalRatio).toBeGreaterThan(1.08)
    expect(horizontalRatio).toBeGreaterThan(1.08)
  })

  it('makes geometric silhouettes more angular and organic silhouettes more fluid', () => {
    const points = buildRoundedDiamondPoints()
    const geometric = abstractShape(
      buildSource(
        points,
        buildSignature({
          type: 'geometrico',
          dominantAxis: 'radial',
          curvature: 'low',
          curvatureRatio: 0.2,
          angularity: 0.82,
          circularity: 0.44,
          density: 0.58,
          symmetry: 0.8,
          symmetryHorizontal: 0.78,
          symmetryVertical: 0.82,
          massDistribution: 'concentrated',
          fragmentation: 0.18,
        }),
      ),
      'centelha',
    )
    const organic = abstractShape(
      buildSource(
        points,
        buildSignature({
          type: 'organico',
          dominantAxis: 'vertical',
          curvature: 'high',
          curvatureRatio: 0.82,
          angularity: 0.14,
          circularity: 0.68,
          density: 0.48,
          symmetry: 0.46,
          symmetryHorizontal: 0.4,
          symmetryVertical: 0.52,
          massDistribution: 'spread',
          fragmentation: 0.32,
        }),
      ),
      'centelha',
    )

    const geometricMetrics = computeSignature(geometric.abstractedGeometry.points)
    const organicMetrics = computeSignature(organic.abstractedGeometry.points)

    expect(geometricMetrics.angularity).toBeGreaterThan(organicMetrics.angularity)
    expect(organicMetrics.curvatureRatio).toBeGreaterThan(geometricMetrics.curvatureRatio)
  })
})