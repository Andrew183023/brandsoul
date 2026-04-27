import { describe, expect, it } from 'vitest'

import { derivePersonaDNA } from './derivePersonaDNA'

describe('derivePersonaDNA', () => {
  it('derives a calm dominant DNA for stable totemic forms', () => {
    const personaDNA = derivePersonaDNA({
      shapeSignature: {
        type: 'linear',
        dominantAxis: 'vertical',
        area: 8200,
        complexity: 0.42,
        curvature: 'medium',
        curvatureRatio: 0.52,
        angularity: 0.28,
        circularity: 0.44,
        density: 0.7,
        symmetry: 0.82,
        symmetryHorizontal: 0.42,
        symmetryVertical: 0.88,
        massDistribution: 'concentrated',
        fragmentation: 0.12,
      },
      baseFormProfile: {
        family: 'totem',
        spine: 'vertical',
        massDistribution: 'centered',
        edgeDiscipline: 'controlled',
        openness: 0.36,
        bodyCompression: 0.24,
        corePlacement: { x: 0.5, y: 0.42 },
      },
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'high',
        saturation: 'medium',
        temperature: 'neutral',
        brightness: 0.56,
        structure: 'balanced',
        composition: 'vertical',
        intensity: 'vivid',
        dominantZones: [{ x: 0.5, y: 0.42, weight: 1 }],
      },
    })

    expect(personaDNA.temperament).toBe('calm')
    expect(personaDNA.presenceStyle).toBe('dominant')
    expect(personaDNA.precision).toBe('precise')
    expect(personaDNA.stability).toBeGreaterThan(personaDNA.wildness)
  })

  it('derives an intense expansive DNA for fragmented shard forms', () => {
    const personaDNA = derivePersonaDNA({
      shapeSignature: {
        type: 'fragmentado',
        dominantAxis: 'horizontal',
        area: 2600,
        complexity: 0.82,
        curvature: 'low',
        curvatureRatio: 0.22,
        angularity: 0.78,
        circularity: 0.18,
        density: 0.26,
        symmetry: 0.28,
        symmetryHorizontal: 0.24,
        symmetryVertical: 0.32,
        massDistribution: 'spread',
        fragmentation: 0.86,
      },
      baseFormProfile: {
        family: 'shard',
        spine: 'horizontal',
        massDistribution: 'distributed',
        edgeDiscipline: 'sharp',
        openness: 0.72,
        bodyCompression: 0.14,
        corePlacement: { x: 0.58, y: 0.48 },
      },
      visualEssence: {
        primaryColor: '#ff9460',
        secondaryColor: '#6e86ff',
        contrast: 'high',
        saturation: 'high',
        temperature: 'warm',
        brightness: 0.62,
        structure: 'angular',
        composition: 'spread',
        intensity: 'vivid',
        dominantZones: [{ x: 0.62, y: 0.46, weight: 1 }],
      },
    })

    expect(personaDNA.temperament).toBe('intense')
    expect(personaDNA.expansion).toBe('expansive')
    expect(personaDNA.wildness).toBeGreaterThan(0.6)
    expect(personaDNA.charisma).toBeGreaterThan(0.5)
  })
})