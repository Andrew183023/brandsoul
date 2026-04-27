import { describe, expect, it } from 'vitest'

import type { ProcessedShape } from '../../shape/contracts/ProcessedShape'
import type { VisualArchetype } from '../contracts/VisualArchetype'
import { buildVisualBody, resolveCanonicalWeightProfile } from './buildVisualBody'

function buildProcessedShape(overrides?: Partial<ProcessedShape>): ProcessedShape {
  return {
    baseGeometry: {
      type: 'contour',
      points: [
        { x: 72, y: 28 },
        { x: 164, y: 30 },
        { x: 188, y: 112 },
        { x: 160, y: 206 },
        { x: 82, y: 212 },
        { x: 42, y: 118 },
      ],
      boundingBox: { minX: 42, minY: 28, maxX: 188, maxY: 212, width: 146, height: 184 },
      centroid: { x: 118, y: 118 },
    },
    abstractedGeometry: {
      path: 'M72 28Z',
      points: [
        { x: 78, y: 34 },
        { x: 156, y: 32 },
        { x: 186, y: 110 },
        { x: 162, y: 200 },
        { x: 86, y: 206 },
        { x: 48, y: 116 },
      ],
      boundingBox: { minX: 48, minY: 32, maxX: 186, maxY: 206, width: 138, height: 174 },
      centroid: { x: 119, y: 116 },
    },
    emissionPoints: [
      { x: 120, y: 42 },
      { x: 174, y: 120 },
      { x: 120, y: 194 },
      { x: 60, y: 124 },
    ],
    deformationProfile: {
      mode: 'centelha',
      dominantAxis: 'vertical',
      complexity: 0.48,
      curvature: 'medium',
      density: 0.62,
    },
    signature: {
      type: 'orbital',
      dominantAxis: 'vertical',
      area: 9200,
      complexity: 0.48,
      curvature: 'medium',
      curvatureRatio: 0.58,
      angularity: 0.28,
      circularity: 0.64,
      density: 0.62,
      symmetry: 0.82,
      symmetryHorizontal: 0.72,
      symmetryVertical: 0.86,
      massDistribution: 'concentrated',
      fragmentation: 0.18,
    },
    debug: {
      contourPoints: [],
      centroid: { x: 118, y: 118 },
      perceptualCentroid: { x: 120, y: 114 },
      emissionPoints: [
        { x: 120, y: 42 },
        { x: 174, y: 120 },
        { x: 120, y: 194 },
        { x: 60, y: 124 },
      ],
    },
    ...overrides,
  }
}

function buildArchetype(strategy: VisualArchetype['silhouetteStrategy'], overrides?: Partial<VisualArchetype>): VisualArchetype {
  return {
    bodyType: 'orbital',
    constructionStyle: 'energy-based',
    silhouetteStrategy: strategy,
    corePlacement: 'centered',
    visualLanguage: 'minimal',
    structureProfile: {
      axisEmphasis: 'vertical',
      massFrame: 'compact',
      cohesion: 0.82,
      rigidity: 0.44,
      openness: 0.48,
    },
    silhouetteProfile: {
      preservation: strategy === 'preserve' ? 0.82 : 0.42,
      exaggeration: strategy === 'exaggerate' ? 0.74 : 0.28,
      reconstruction: strategy === 'reconstruct' ? 0.8 : 0.24,
      edgeEmphasis: 0.62,
    },
    surfaceProfile: {
      surfaceBehavior: 'smooth',
      textureIntensity: 0.26,
      contrastBias: 0.58,
    },
    ...overrides,
  }
}

describe('buildVisualBody', () => {
  it('builds a legible preserved body plan from a stable shape', () => {
    const plan = buildVisualBody({
      visualArchetype: buildArchetype('preserve'),
      processedShape: buildProcessedShape(),
    })

    expect(plan.bodyPath).toContain('M')
    expect(plan.innerPath).toContain('M')
    expect(plan.silhouette.strategy).toBe('preserve')
    expect(plan.structure.anchors.length).toBeGreaterThan(3)
    expect(plan.silhouette.legibility).toBeGreaterThan(0.5)
  })

  it('changes the generated body across silhouette strategies', () => {
    const processedShape = buildProcessedShape()
    const exaggerated = buildVisualBody({
      visualArchetype: buildArchetype('exaggerate', {
        visualLanguage: 'expressive',
      }),
      processedShape,
    })
    const reconstructed = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'fragmented',
        constructionStyle: 'mechanical',
        visualLanguage: 'dense',
        surfaceProfile: {
          surfaceBehavior: 'crystalline',
          textureIntensity: 0.58,
          contrastBias: 0.72,
        },
      }),
      processedShape: buildProcessedShape({
        signature: {
          ...processedShape.signature,
          type: 'fragmentado',
          fragmentation: 0.84,
          complexity: 0.82,
          density: 0.28,
        },
      }),
    })

    expect(exaggerated.bodyPath).not.toBe(reconstructed.bodyPath)
    expect(reconstructed.silhouette.strategy).toBe('reconstruct')
    expect(reconstructed.structure.cavities[0]?.radiusX).toBeGreaterThan(0)
    expect(reconstructed.core.radius).toBeGreaterThan(0)
  })

  it('generates visibly distinct silhouettes for strong body categories from the same source shape', () => {
    const processedShape = buildProcessedShape()
    const orbital = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'orbital',
      }),
      processedShape,
    })
    const linear = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'linear',
        constructionStyle: 'rigid',
      }),
      processedShape,
    })
    const geometric = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'geometric',
        constructionStyle: 'mechanical',
      }),
      processedShape,
    })

    expect(orbital.bodyPath).not.toBe(linear.bodyPath)
    expect(linear.bodyPath).not.toBe(geometric.bodyPath)
    expect(geometric.silhouette.legibility).toBeGreaterThan(0.55)
  })

  it('raises canonical influence for rigid and fragmented categories over orbital bodies', () => {
    const processedShape = buildProcessedShape()
    const orbitalWeights = resolveCanonicalWeightProfile({
      archetype: buildArchetype('preserve', { bodyType: 'orbital' }),
      processedShape,
    })
    const geometricWeights = resolveCanonicalWeightProfile({
      archetype: buildArchetype('reconstruct', { bodyType: 'geometric', constructionStyle: 'mechanical' }),
      processedShape: buildProcessedShape({
        signature: {
          ...processedShape.signature,
          type: 'geometrico',
          complexity: 0.82,
          angularity: 0.8,
          fragmentation: 0.28,
        },
      }),
    })
    const fragmentedWeights = resolveCanonicalWeightProfile({
      archetype: buildArchetype('reconstruct', { bodyType: 'fragmented' }),
      processedShape: buildProcessedShape({
        signature: {
          ...processedShape.signature,
          type: 'fragmentado',
          complexity: 0.88,
          fragmentation: 0.9,
          density: 0.24,
        },
      }),
    })

    expect(geometricWeights.exaggerate).toBeGreaterThan(orbitalWeights.exaggerate)
    expect(fragmentedWeights.reconstruct).toBeGreaterThan(orbitalWeights.reconstruct)
  })

  it('builds recognizable internal anchor structures per body category', () => {
    const processedShape = buildProcessedShape()
    const orbital = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', { bodyType: 'orbital' }),
      processedShape,
    })
    const linear = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'linear',
        constructionStyle: 'rigid',
      }),
      processedShape,
    })
    const organic = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'organic',
        constructionStyle: 'organic',
      }),
      processedShape,
    })
    const fragmented = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'fragmented',
        constructionStyle: 'mechanical',
      }),
      processedShape,
    })
    const geometric = buildVisualBody({
      visualArchetype: buildArchetype('reconstruct', {
        bodyType: 'geometric',
        constructionStyle: 'mechanical',
      }),
      processedShape,
    })

    expect(orbital.structure.anchors.filter((anchor) => anchor.role === 'axis').length).toBeGreaterThanOrEqual(4)
    expect(orbital.structure.segments.some((segment) => segment.id.startsWith('orbital-ring-'))).toBe(true)

    expect(linear.structure.anchors.filter((anchor) => anchor.role === 'axis').length).toBeGreaterThanOrEqual(4)
    expect(linear.structure.segments.some((segment) => segment.id.startsWith('linear-column-'))).toBe(true)

    expect(organic.structure.segments.some((segment) => segment.id.startsWith('organic-growth-'))).toBe(true)
    expect(organic.structure.cavities.length).toBeGreaterThan(1)

    expect(fragmented.structure.cavities.length).toBeGreaterThan(2)
    expect(fragmented.structure.segments.some((segment) => segment.id.startsWith('fragment-link-'))).toBe(true)

    expect(geometric.structure.anchors.filter((anchor) => anchor.id.startsWith('vertex-')).length).toBeGreaterThanOrEqual(4)
    expect(geometric.structure.segments.some((segment) => segment.id.startsWith('geometric-edge-'))).toBe(true)
  })
})