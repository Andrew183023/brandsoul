import { describe, expect, it } from 'vitest'

import { deriveBaseFormProfile } from './deriveBaseFormProfile'

describe('deriveBaseFormProfile', () => {
  it('maps highly circular and symmetric signatures to orb', () => {
    const profile = deriveBaseFormProfile({
      shapeSignature: {
        type: 'orbital',
        dominantAxis: 'radial',
        area: 7200,
        complexity: 0.4,
        curvature: 'high',
        curvatureRatio: 0.84,
        angularity: 0.12,
        circularity: 0.9,
        density: 0.7,
        symmetry: 0.88,
        symmetryHorizontal: 0.86,
        symmetryVertical: 0.9,
        massDistribution: 'concentrated',
        fragmentation: 0.1,
      },
    })

    expect(profile.family).toBe('orb')
    expect(profile.spine).toBe('radial')
    expect(profile.edgeDiscipline).toBe('soft')
  })

  it('maps fragmented angular signatures to shard', () => {
    const profile = deriveBaseFormProfile({
      shapeSignature: {
        type: 'fragmentado',
        dominantAxis: 'horizontal',
        area: 2500,
        complexity: 0.8,
        curvature: 'medium',
        curvatureRatio: 0.32,
        angularity: 0.72,
        circularity: 0.24,
        density: 0.28,
        symmetry: 0.26,
        symmetryHorizontal: 0.24,
        symmetryVertical: 0.28,
        massDistribution: 'spread',
        fragmentation: 0.82,
      },
    })

    expect(profile.family).toBe('shard')
    expect(profile.edgeDiscipline).toBe('sharp')
    expect(profile.massDistribution).toBe('asymmetric')
  })
})