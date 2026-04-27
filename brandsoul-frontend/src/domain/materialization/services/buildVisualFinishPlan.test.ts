import { describe, expect, it } from 'vitest'

import type { VisualArchetype } from '../../visual-archetype/contracts/VisualArchetype'
import type { VisualBodyPlan } from '../../visual-archetype/contracts/VisualBodyPlan'
import { buildVisualFinishPlan } from './buildVisualFinishPlan'

function buildArchetype(bodyType: VisualArchetype['bodyType']): VisualArchetype {
  return {
    bodyType,
    constructionStyle: bodyType === 'organic' ? 'organic' : bodyType === 'orbital' ? 'energy-based' : 'mechanical',
    silhouetteStrategy: 'reconstruct',
    corePlacement: 'centered',
    visualLanguage: bodyType === 'fragmented' ? 'dense' : 'expressive',
    structureProfile: {
      axisEmphasis: bodyType === 'linear' ? 'vertical' : bodyType === 'orbital' ? 'radial' : 'balanced',
      massFrame: bodyType === 'fragmented' ? 'spread' : 'balanced',
      cohesion: bodyType === 'fragmented' ? 0.38 : 0.78,
      rigidity: bodyType === 'geometric' ? 0.84 : 0.52,
      openness: bodyType === 'organic' ? 0.68 : 0.42,
    },
    silhouetteProfile: {
      preservation: 0.32,
      exaggeration: 0.56,
      reconstruction: 0.82,
      edgeEmphasis: bodyType === 'geometric' ? 0.82 : 0.58,
    },
    surfaceProfile: {
      surfaceBehavior: bodyType === 'organic' ? 'soft' : bodyType === 'geometric' ? 'crystalline' : 'smooth',
      textureIntensity: bodyType === 'fragmented' ? 0.72 : 0.42,
      contrastBias: bodyType === 'geometric' ? 0.74 : 0.54,
    },
  }
}

function buildBodyPlan(): VisualBodyPlan {
  return {
    bodyPath: 'M78 34C126 20 178 52 184 116C188 170 152 206 94 204C54 202 34 156 42 108C48 74 56 42 78 34Z',
    innerPath: 'M96 62C126 52 158 74 160 114C162 148 140 174 106 176C78 178 64 150 66 118C68 90 76 68 96 62Z',
    core: {
      position: { x: 118, y: 116 },
      radius: 24,
      intensity: 0.82,
    },
    structure: {
      anchors: [
        { id: 'axis-top', point: { x: 118, y: 52 }, role: 'axis', weight: 0.92 },
        { id: 'axis-right', point: { x: 162, y: 116 }, role: 'axis', weight: 0.84 },
        { id: 'axis-bottom', point: { x: 118, y: 182 }, role: 'axis', weight: 0.88 },
        { id: 'emit-left', point: { x: 66, y: 122 }, role: 'emission', weight: 0.72 },
      ],
      segments: [
        { id: 'orbital-ring-1', from: { x: 88, y: 90 }, to: { x: 148, y: 88 }, weight: 0.62 },
        { id: 'linear-column-1', from: { x: 118, y: 62 }, to: { x: 118, y: 174 }, weight: 0.84 },
        { id: 'organic-growth-1', from: { x: 86, y: 144 }, to: { x: 144, y: 164 }, weight: 0.56 },
        { id: 'fragment-link-1', from: { x: 78, y: 108 }, to: { x: 102, y: 76 }, weight: 0.48 },
        { id: 'geometric-edge-1', from: { x: 144, y: 76 }, to: { x: 162, y: 132 }, weight: 0.7 },
      ],
      cavities: [
        { id: 'cavity-1', center: { x: 102, y: 98 }, radiusX: 10, radiusY: 8, weight: 0.62 },
        { id: 'cavity-2', center: { x: 130, y: 142 }, radiusX: 12, radiusY: 9, weight: 0.58 },
      ],
    },
    silhouette: {
      strategy: 'reconstruct',
      envelopePath: 'M68 28C128 8 194 54 198 120C202 186 156 218 86 214C42 210 22 160 30 106C36 72 46 40 68 28Z',
      boundingBox: { minX: 30, minY: 28, maxX: 198, maxY: 214, width: 168, height: 186 },
      legibility: 0.82,
    },
  }
}

describe('buildVisualFinishPlan', () => {
  it('builds structural finish data from the sovereign body plan', () => {
    const bodyPlan = buildBodyPlan()
    const finishPlan = buildVisualFinishPlan({
      visualArchetype: buildArchetype('orbital'),
      visualBodyPlan: bodyPlan,
    })

    expect(finishPlan.source).toBe('visual-body-plan')
    expect(finishPlan.layers[0]?.path).toBe(bodyPlan.bodyPath)
    expect(finishPlan.coreDominance).toBeGreaterThanOrEqual(0.7)
    expect(finishPlan.shapeScale).toBeGreaterThan(1.2)
    expect(finishPlan.primaryLayerRole).toBe('shell')
    expect(finishPlan.ridgePaths.length).toBeGreaterThan(0)
    expect(finishPlan.cavityMasks.every((mask) => mask.path.includes('A'))).toBe(true)
    expect(finishPlan.coreBridges.length).toBeGreaterThan(0)
  })

  it('changes finish strategy across body archetypes instead of collapsing everything into one material', () => {
    const bodyPlan = buildBodyPlan()
    const orbital = buildVisualFinishPlan({ visualArchetype: buildArchetype('orbital'), visualBodyPlan: bodyPlan })
    const linear = buildVisualFinishPlan({ visualArchetype: buildArchetype('linear'), visualBodyPlan: bodyPlan })
    const fragmented = buildVisualFinishPlan({ visualArchetype: buildArchetype('fragmented'), visualBodyPlan: bodyPlan })
    const geometric = buildVisualFinishPlan({ visualArchetype: buildArchetype('geometric'), visualBodyPlan: bodyPlan })

    expect(orbital.materialProfile.style).toBe('smooth')
    expect(linear.materialProfile.style).toBe('layered')
    expect(fragmented.materialProfile.style).toBe('segmented')
    expect(geometric.materialProfile.style).toBe('plated')
    expect(orbital.materialProfile.edgeDiscipline).toBe('controlled')
    expect(geometric.materialProfile.edgeDiscipline).toBe('sharp')
    expect(orbital.coreDominance).toBeGreaterThan(geometric.coreDominance)
    expect(linear.layers.some((layer) => layer.role === 'band')).toBe(true)
    expect(fragmented.layers.some((layer) => layer.role === 'plate')).toBe(true)
    expect(geometric.layers.some((layer) => layer.renderMode === 'stroke')).toBe(true)
  })
})