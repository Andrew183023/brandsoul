import { describe, expect, it } from 'vitest'

import type { EntityInput } from '../contracts/EntityInput'
import { processBrand } from './processBrand'

type TestVisualEssence = NonNullable<EntityInput['brand']['visualEssence']>

function buildVisualEssence(overrides?: Partial<TestVisualEssence>): TestVisualEssence {
  return {
    ...defaultVisualEssence(),
    ...overrides,
  }
}

function defaultVisualEssence(): TestVisualEssence {
  return {
    primaryColor: '#ff9460',
    secondaryColor: '#6e86ff',
    contrast: 'high' as const,
    saturation: 'medium' as const,
    temperature: 'neutral' as const,
    brightness: 0.54,
    structure: 'balanced' as const,
    composition: 'centered' as const,
    intensity: 'vivid' as const,
    dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
  }
}

function buildInput(args: {
  points: Array<{ x: number; y: number }>
  visualEssence?: Partial<TestVisualEssence>
  signature: {
    type: 'linear' | 'fragmentado'
    dominantAxis: 'vertical' | 'horizontal'
    complexity: number
    curvatureRatio: number
    angularity: number
    circularity: number
    density: number
    symmetry: number
    symmetryHorizontal: number
    symmetryVertical: number
    massDistribution: 'concentrated' | 'spread'
    fragmentation: number
  }
}) {
  return {
    brand: {
      logoPreview: 'data:image/png;base64,preview',
      visualEssence: buildVisualEssence(args.visualEssence),
      shapeSource: {
        sourceType: 'svg' as const,
        shapeData: {
          type: 'contour' as const,
          points: args.points,
          boundingBox: { minX: 32, minY: 20, maxX: 188, maxY: 220, width: 156, height: 200 },
          centroid: { x: 110, y: 120 },
        },
        signature: {
          area: 8200,
          curvature: args.signature.curvatureRatio > 0.62 ? 'high' as const : args.signature.curvatureRatio > 0.38 ? 'medium' as const : 'low' as const,
          ...args.signature,
        },
        debug: {
          contourPoints: [],
          centroid: { x: 110, y: 120 },
        },
      },
    },
    manifestation: {
      mode: 'centelha' as const,
      variant: 'fused-logo',
    },
    context: {
      brandCategory: 'technology' as const,
      styleAnswers: {},
    },
    palette: {
      primary: '#ff9460',
      secondary: '#6e86ff',
      contrast: 'high' as const,
    },
  }
}

describe('processBrand birth timeline modulation', () => {
  it('produces different birth timelines for calm and intense entities under the same manifestation', () => {
    const calmEntity = processBrand(
      buildInput({
        visualEssence: {
          composition: 'vertical',
        },
        points: [
          { x: 88, y: 26 },
          { x: 140, y: 22 },
          { x: 164, y: 84 },
          { x: 156, y: 198 },
          { x: 112, y: 216 },
          { x: 66, y: 198 },
          { x: 58, y: 88 },
        ],
        signature: {
          type: 'linear',
          dominantAxis: 'vertical',
          complexity: 0.42,
          curvatureRatio: 0.56,
          angularity: 0.26,
          circularity: 0.46,
          density: 0.72,
          symmetry: 0.86,
          symmetryHorizontal: 0.42,
          symmetryVertical: 0.9,
          massDistribution: 'concentrated',
          fragmentation: 0.12,
        },
      }),
    )

    const intenseEntity = processBrand(
      buildInput({
        points: [
          { x: 44, y: 64 },
          { x: 112, y: 24 },
          { x: 182, y: 72 },
          { x: 154, y: 126 },
          { x: 192, y: 182 },
          { x: 108, y: 214 },
          { x: 36, y: 170 },
        ],
        signature: {
          type: 'fragmentado',
          dominantAxis: 'horizontal',
          complexity: 0.82,
          curvatureRatio: 0.22,
          angularity: 0.76,
          circularity: 0.2,
          density: 0.28,
          symmetry: 0.26,
          symmetryHorizontal: 0.24,
          symmetryVertical: 0.3,
          massDistribution: 'spread',
          fragmentation: 0.84,
        },
      }),
    )

    expect(calmEntity.personaDNA.temperament).toBe('calm')
    expect(intenseEntity.personaDNA.temperament).toBe('intense')
    expect(calmEntity.visualArchetype.bodyType).toBe('linear')
    expect(intenseEntity.visualArchetype.bodyType).toBe('fragmented')
    expect(calmEntity.visualArchetype.silhouetteStrategy).toBe('reconstruct')
    expect(intenseEntity.visualArchetype.silhouetteStrategy).toBe('reconstruct')
    expect(calmEntity.visualBodyPlan.silhouette.strategy).toBe('reconstruct')
    expect(intenseEntity.visualBodyPlan.silhouette.strategy).toBe('reconstruct')
    expect(calmEntity.visualFinishPlan.materialProfile.style).toBe('layered')
    expect(intenseEntity.visualFinishPlan.materialProfile.style).toBe('segmented')
    expect(calmEntity.visualBodyPlan.bodyPath).not.toBe(intenseEntity.visualBodyPlan.bodyPath)
    expect(calmEntity.visualFinishPlan.layers.length).toBeGreaterThan(1)
    expect(intenseEntity.visualFinishPlan.ridgePaths.length).toBeGreaterThan(0)
    expect(calmEntity.visualBodyPlan.structure.anchors.length).toBeGreaterThan(0)
    expect(intenseEntity.visualBodyPlan.core.radius).toBeGreaterThan(0)
    expect(calmEntity.manifestation.mode).toBe('centelha')
    expect(intenseEntity.manifestation.mode).toBe('centelha')
    expect(calmEntity.manifestation.birthTimeline.duration).toBeGreaterThan(intenseEntity.manifestation.birthTimeline.duration)
    expect(intenseEntity.manifestation.birthTimeline.stages.find((stage) => stage.id === 'ignite')?.transforms?.particleBoost).toBeGreaterThan(
      calmEntity.manifestation.birthTimeline.stages.find((stage) => stage.id === 'ignite')?.transforms?.particleBoost ?? 0,
    )
    expect(calmEntity.manifestation.birthTimeline.stages.at(-1)?.duration).toBeGreaterThan(
      intenseEntity.manifestation.birthTimeline.stages.at(-1)?.duration ?? 0,
    )
  })
})