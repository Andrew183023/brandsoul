import { describe, expect, it } from 'vitest'

import type { RenderOutput } from '../../../domain/rendering/contracts/RenderOutput'
import type { VisualEssence } from '../../../domain/identity/contracts/VisualEssence'
import type { ManifestationSpec } from '../../../domain/manifestation/contracts/ManifestationSpec'
import type { ShapeSignature } from '../../../domain/shape/contracts/ProcessedShape'
import { buildPixiSceneSpec } from './sceneSpecAdapter'

const baseManifestationSpec = {
  mode: 'centelha',
  artDirection: {
    shapeFillStrategy: 'hybrid',
    abstractionLevel: 'medium',
    massDistribution: 'compressed-core',
    shapeRelation: 'symbolic',
    contrast: 'high',
    texture: 'luminous',
  },
  anatomy: {
    layers: ['shape', 'core'],
  },
  birthTimeline: {
    stages: [],
    totalDurationMs: 2400,
  },
} as unknown as ManifestationSpec

const rasterVisualEssence: VisualEssence = {
  primaryColor: '#cf512c',
  secondaryColor: '#355f9a',
  energyColor: '#ff9f64',
  neutralColor: '#8892a6',
  contrast: 'medium',
  saturation: 'medium',
  temperature: 'neutral',
  brightness: 0.48,
  structure: 'balanced',
  composition: 'centered',
  intensity: 'vivid',
  dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
}

function buildRendererOutput(signature: ShapeSignature): RenderOutput {
  return {
    manifestationSpec: baseManifestationSpec,
    anatomySource: 'renderer-fallback',
    renderType: 'abstract-shape',
    particles: {
      count: 12,
      emitterConfig: {
        origin: { x: 120, y: 120 },
        direction: { angle: -90, spread: 120 },
        spawnRate: 1,
        maxParticles: 24,
        lifetime: { min: 800, max: 1400 },
        color: ['#ff9460', '#6e86ff'],
        size: { min: 2, max: 4 },
        velocity: { min: 12, max: 24 },
        opacity: { start: 0.7, end: 0 },
      },
    },
    shapes: {
      bodyPath: 'M0 0L10 0L10 10Z',
      innerPath: 'M2 2L8 2L8 8Z',
      usesLogoMask: false,
    },
    animationConfig: {
      rootClassName: 'manifestation-mode-centelha manifestation-variant-living-glow',
      styleVars: {
        '--persona-lab-accent': '#ff9460',
        '--persona-lab-secondary': '#6e86ff',
      },
    },
    anatomy: {
      layers: ['shape', 'core'],
      classNames: [],
    },
    debugShape: {
      sourceSignature: signature,
      silhouetteContrast: 'medium',
      readabilityScore: 82,
    },
  }
}

describe('buildPixiSceneSpec', () => {
  it('uses shape signature semantics to change core and particle presets', () => {
    const orbitalSpec = buildPixiSceneSpec({
      manifestationSpec: baseManifestationSpec,
      rendererOutput: buildRendererOutput({
        type: 'orbital',
        dominantAxis: 'radial',
        area: 8000,
        complexity: 0.44,
        curvature: 'high',
        curvatureRatio: 0.82,
        angularity: 0.18,
        circularity: 0.92,
        density: 0.64,
        symmetry: 0.86,
        symmetryHorizontal: 0.84,
        symmetryVertical: 0.88,
        massDistribution: 'concentrated',
        fragmentation: 0.12,
      }),
      intensity: 'balanced',
      visualEssence: rasterVisualEssence,
    })

    const fragmentedSpec = buildPixiSceneSpec({
      manifestationSpec: baseManifestationSpec,
      rendererOutput: buildRendererOutput({
        type: 'fragmentado',
        dominantAxis: 'horizontal',
        area: 2800,
        complexity: 0.78,
        curvature: 'medium',
        curvatureRatio: 0.46,
        angularity: 0.54,
        circularity: 0.28,
        density: 0.22,
        symmetry: 0.34,
        symmetryHorizontal: 0.3,
        symmetryVertical: 0.38,
        massDistribution: 'spread',
        fragmentation: 0.84,
      }),
      intensity: 'balanced',
      visualEssence: rasterVisualEssence,
    })

    expect(orbitalSpec.corePreset?.radius).toBeGreaterThan(fragmentedSpec.corePreset?.radius ?? 0)
    expect(fragmentedSpec.particlePreset?.densityMultiplier).toBeGreaterThan(orbitalSpec.particlePreset?.densityMultiplier ?? 0)
    expect(fragmentedSpec.shapePreset?.pulse).toBeGreaterThan(orbitalSpec.shapePreset?.pulse ?? 0)
    expect(orbitalSpec.corePreset?.radius).toBeGreaterThan(0)
    expect(orbitalSpec.personaDNA?.temperament).toBe('calm')
    expect(fragmentedSpec.personaDNA?.temperament).toBe('intense')
    expect(fragmentedSpec.personaDNA?.wildness).toBeGreaterThan(orbitalSpec.personaDNA?.wildness ?? 0)
    expect(orbitalSpec.energy).toBe(rasterVisualEssence.energyColor)
    expect(orbitalSpec.neutral).toBe(rasterVisualEssence.neutralColor)
    expect(orbitalSpec.particlePreset?.emitterConfig?.color).toEqual([
      rasterVisualEssence.neutralColor,
      rasterVisualEssence.energyColor,
      '#6e86ff',
      '#ff9460',
    ])
  })
})
