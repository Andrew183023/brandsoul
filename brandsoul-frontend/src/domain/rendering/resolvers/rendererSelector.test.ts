import { describe, expect, it } from 'vitest'

import type { PersonaRenderInput, PersonaLabPreview } from '../contracts/types'
import { resolvePersonaRenderer } from './rendererSelector'

function buildPreview(mode: PersonaLabPreview['manifestationMode'], variant: string): PersonaLabPreview {
  return {
    id: `${mode}-${variant}`,
    label: mode,
    description: variant,
    archetype: 'technical',
    manifestationMode: mode,
    manifestationVariant: variant,
    baseFormProfile: {
      family: 'totem',
      spine: 'vertical',
      massDistribution: 'centered',
      edgeDiscipline: 'controlled',
      openness: 0.36,
      bodyCompression: 0.2,
      corePlacement: { x: 0.5, y: 0.46 },
    },
    personaDNA: {
      temperament: 'ritual',
      presenceStyle: 'balanced',
      precision: 'precise',
      expansion: 'balanced',
      defensiveness: 0.28,
      charisma: 0.72,
      stability: 0.76,
      wildness: 0.24,
    },
    visualArchetype: {
      bodyType: 'linear',
      constructionStyle: 'rigid',
      silhouetteStrategy: 'preserve',
      corePlacement: 'centered',
      visualLanguage: 'minimal',
      structureProfile: {
        axisEmphasis: 'vertical',
        massFrame: 'compact',
        cohesion: 0.82,
        rigidity: 0.66,
        openness: 0.36,
      },
      silhouetteProfile: {
        preservation: 0.82,
        exaggeration: 0.26,
        reconstruction: 0.18,
        edgeEmphasis: 0.62,
      },
      surfaceProfile: {
        surfaceBehavior: 'smooth',
        textureIntensity: 0.24,
        contrastBias: 0.58,
      },
    },
    visualBodyPlan: {
      bodyPath: 'M70 44 Q120 24 170 44 Q194 120 170 196 Q120 216 70 196 Q46 120 70 44 Z',
      innerPath: 'M92 74 Q120 60 148 74 Q164 120 148 166 Q120 180 92 166 Q76 120 92 74 Z',
      core: {
        position: { x: 123, y: 111 },
        radius: 21,
        intensity: 0.76,
      },
      structure: {
        anchors: [
          { id: 'core', point: { x: 123, y: 111 }, role: 'core', weight: 1 },
          { id: 'em-0', point: { x: 177, y: 104 }, role: 'emission', weight: 0.72 },
          { id: 'edge-0', point: { x: 70, y: 44 }, role: 'edge', weight: 0.64 },
        ],
        segments: [],
        cavities: [{ id: 'primary', center: { x: 123, y: 111 }, radiusX: 18, radiusY: 18, weight: 0.8 }],
      },
      silhouette: {
        strategy: 'preserve',
        envelopePath: 'M70 44 Q120 24 170 44 Q194 120 170 196 Q120 216 70 196 Q46 120 70 44 Z',
        boundingBox: { minX: 46, minY: 24, maxX: 194, maxY: 216, width: 148, height: 192 },
        legibility: 0.86,
      },
    },
    silhouette: {
      bodyPath: 'M70 44 Q120 24 170 44 Q194 120 170 196 Q120 216 70 196 Q46 120 70 44 Z',
      innerPath: 'M92 74 Q120 60 148 74 Q164 120 148 166 Q120 180 92 166 Q76 120 92 74 Z',
      source: 'visual-body-plan',
      legibility: 0.86,
      framing: { minX: 46, minY: 24, maxX: 194, maxY: 216, width: 148, height: 192 },
      core: { x: 123, y: 111, radius: 21, intensity: 0.76 },
    },
    visualConfig: {
      accent: '#ff9460',
      secondary: '#6e86ff',
      shape: 'prism',
      motion: 'pulse',
      glow: 'focused',
      density: 'balanced',
    },
  }
}

function buildInput(mode: PersonaLabPreview['manifestationMode'], variant: string): PersonaRenderInput {
  const preview = buildPreview(mode, variant)

  return {
    logoData: {
      shapeSource: {
        sourceType: 'svg',
        shapeData: {
          type: 'contour',
          points: [
            { x: 82, y: 30 },
            { x: 160, y: 34 },
            { x: 188, y: 118 },
            { x: 154, y: 206 },
            { x: 84, y: 210 },
            { x: 42, y: 120 },
          ],
          boundingBox: { minX: 42, minY: 30, maxX: 188, maxY: 210, width: 146, height: 180 },
          centroid: { x: 118, y: 118 },
        },
        signature: {
          type: 'linear',
          dominantAxis: 'vertical',
          area: 8800,
          complexity: 0.48,
          curvature: 'medium',
          curvatureRatio: 0.5,
          angularity: 0.34,
          circularity: 0.4,
          density: 0.62,
          symmetry: 0.8,
          symmetryHorizontal: 0.64,
          symmetryVertical: 0.84,
          massDistribution: 'concentrated',
          fragmentation: 0.18,
        },
        debug: {
          contourPoints: [],
          centroid: { x: 118, y: 118 },
        },
      },
    },
    intensity: 'balanced',
    variant: 'final',
    preview,
    bodyPath: preview.silhouette.bodyPath,
    innerPath: preview.silhouette.innerPath,
    usesLogoMask: false,
    styleVars: {},
  }
}

describe('resolvePersonaRenderer VisualBodyPlan integration', () => {
  it('keeps the sovereign body plan anatomy across final renderers', () => {
    const cases: Array<[PersonaLabPreview['manifestationMode'], string]> = [
      ['centelha', 'fused-logo'],
      ['elemental', 'fogo'],
      ['natureza', 'arvore'],
      ['robo-ia', 'industrial'],
    ]

    for (const [mode, variant] of cases) {
      const input = buildInput(mode, variant)
      const output = resolvePersonaRenderer(input)

      expect(output.shapes.bodyPath).toBe(input.preview.visualBodyPlan?.bodyPath)
      expect(output.shapes.innerPath).toBe(input.preview.visualBodyPlan?.innerPath)
      expect(output.shapes.usesLogoMask).toBe(false)
    }
  })

  it('uses body plan anchors for particle origin when available', () => {
    const output = resolvePersonaRenderer(buildInput('centelha', 'fused-logo'))

    expect(output.particles.emitterConfig?.origin).toEqual({ x: 177, y: 104 })
  })
})