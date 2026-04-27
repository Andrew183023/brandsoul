import { describe, expect, it } from 'vitest'

import { deriveBaseFormProfile } from '../../base-form/services/deriveBaseFormProfile'
import type { ExtractedShapeSource } from '../../shape/contracts/ProcessedShape'
import { abstractShape } from '../../shape/transformation/abstractShape'
import { buildVisualBody } from '../../visual-archetype/services/buildVisualBody'
import { deriveVisualArchetype } from '../../visual-archetype/services/deriveVisualArchetype'
import { buildManifestationPreview } from './previewBuilder'

const shapeSource: ExtractedShapeSource = {
  sourceType: 'svg',
  shapeData: {
    type: 'contour',
    points: [
      { x: 72, y: 34 },
      { x: 138, y: 28 },
      { x: 172, y: 76 },
      { x: 164, y: 164 },
      { x: 118, y: 206 },
      { x: 66, y: 182 },
      { x: 48, y: 108 },
    ],
    boundingBox: { minX: 48, minY: 28, maxX: 172, maxY: 206, width: 124, height: 178 },
    centroid: { x: 111, y: 114 },
  },
  signature: {
    type: 'linear',
    dominantAxis: 'vertical',
    area: 9000,
    complexity: 0.52,
    curvature: 'medium',
    curvatureRatio: 0.48,
    angularity: 0.42,
    circularity: 0.44,
    density: 0.62,
    symmetry: 0.71,
    symmetryHorizontal: 0.46,
    symmetryVertical: 0.82,
    massDistribution: 'concentrated',
    fragmentation: 0.18,
  },
  debug: {
    contourPoints: [],
    centroid: { x: 111, y: 114 },
  },
}

describe('buildManifestationPreview', () => {
  it('prefers real geometry silhouettes over manifestation fallbacks when shape data exists', () => {
    const processedShape = abstractShape(shapeSource, 'centelha', 'fused-logo')
    const baseFormProfile = deriveBaseFormProfile({
      shapeSignature: processedShape.signature,
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'medium',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.5,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
      },
    })

    const preview = buildManifestationPreview({
      manifestationMode: 'centelha',
      manifestationVariant: 'fused-logo',
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'medium',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.5,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
      },
      palette: {
        primary: '#ff9460',
        secondary: '#6e86ff',
      },
      shapeSource,
      processedShape,
      baseFormProfile,
    })

    expect(preview).toBeDefined()
    expect(preview?.silhouette.source).toBe('real-geometry')
    expect(preview?.baseFormProfile.family).toBe('totem')
    expect(preview?.silhouette.bodyPath).not.toContain('M119 22C147 22')
  })

  it('uses VisualBodyPlan as the primary preview silhouette when available', () => {
    const processedShape = abstractShape(shapeSource, 'centelha', 'fused-logo')
    const baseFormProfile = deriveBaseFormProfile({
      shapeSignature: processedShape.signature,
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'medium',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.5,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
      },
    })
    const personaDNA = {
      temperament: 'ritual' as const,
      presenceStyle: 'dominant' as const,
      precision: 'precise' as const,
      expansion: 'balanced' as const,
      defensiveness: 0.24,
      charisma: 0.78,
      stability: 0.74,
      wildness: 0.22,
    }
    const visualArchetype = deriveVisualArchetype({
      shapeSignature: processedShape.signature,
      baseFormProfile,
      personaDNA,
    })
    const visualBodyPlan = buildVisualBody({
      visualArchetype,
      processedShape,
    })

    const preview = buildManifestationPreview({
      manifestationMode: 'centelha',
      manifestationVariant: 'fused-logo',
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'medium',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.5,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
      },
      palette: {
        primary: '#ff9460',
        secondary: '#6e86ff',
      },
      shapeSource,
      processedShape,
      baseFormProfile,
      personaDNA,
      visualBodyPlan,
    })

    expect(preview).toBeDefined()
    expect(preview?.visualBodyPlan?.bodyPath).toBe(visualBodyPlan.bodyPath)
    expect(preview?.visualArchetype?.bodyType).toBeUndefined()
    expect(preview?.silhouette.source).toBe('visual-body-plan')
    expect(preview?.silhouette.bodyPath).toBe(visualBodyPlan.bodyPath)
    expect(preview?.silhouette.innerPath).toBe(visualBodyPlan.innerPath)
    expect(preview?.silhouette.legibility).toBe(visualBodyPlan.silhouette.legibility)
    expect(preview?.silhouette.core?.x).toBe(visualBodyPlan.core.position.x)
  })

  it('keeps the injected VisualArchetype alongside the sovereign body plan for validation flows', () => {
    const processedShape = abstractShape(shapeSource, 'centelha', 'fused-logo')
    const baseFormProfile = deriveBaseFormProfile({
      shapeSignature: processedShape.signature,
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'medium',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.5,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
      },
    })
    const personaDNA = {
      temperament: 'ritual' as const,
      presenceStyle: 'dominant' as const,
      precision: 'precise' as const,
      expansion: 'balanced' as const,
      defensiveness: 0.24,
      charisma: 0.78,
      stability: 0.74,
      wildness: 0.22,
    }
    const visualArchetype = deriveVisualArchetype({
      shapeSignature: processedShape.signature,
      baseFormProfile,
      personaDNA,
    })
    const visualBodyPlan = buildVisualBody({
      visualArchetype,
      processedShape,
    })

    const preview = buildManifestationPreview({
      manifestationMode: 'centelha',
      manifestationVariant: 'fused-logo',
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'medium',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.5,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
      },
      palette: {
        primary: '#ff9460',
        secondary: '#6e86ff',
      },
      shapeSource,
      processedShape,
      baseFormProfile,
      personaDNA,
      visualArchetype,
      visualBodyPlan,
    })

    expect(preview?.visualArchetype?.bodyType).toBe(visualArchetype.bodyType)
    expect(preview?.visualArchetype?.silhouetteStrategy).toBe(visualArchetype.silhouetteStrategy)
  })
})