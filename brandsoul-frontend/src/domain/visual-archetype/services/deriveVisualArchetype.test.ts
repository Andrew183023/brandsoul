import { describe, expect, it } from 'vitest'

import type { BaseFormProfile } from '../../base-form/contracts/BaseFormProfile'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import type { ShapeSignature } from '../../shape/contracts/ProcessedShape'
import { deriveVisualArchetype } from './deriveVisualArchetype'

const centeredBaseForm: BaseFormProfile = {
  family: 'orb',
  spine: 'radial',
  massDistribution: 'centered',
  edgeDiscipline: 'controlled',
  openness: 0.42,
  bodyCompression: 0.2,
  corePlacement: { x: 0.5, y: 0.44 },
}

const stableDNA: PersonaDNA = {
  temperament: 'ritual',
  presenceStyle: 'balanced',
  precision: 'balanced',
  expansion: 'balanced',
  defensiveness: 0.28,
  charisma: 0.74,
  stability: 0.82,
  wildness: 0.18,
}

function buildSignature(overrides?: Partial<ShapeSignature>): ShapeSignature {
  return {
    type: 'orbital',
    dominantAxis: 'radial',
    area: 9200,
    complexity: 0.44,
    curvature: 'high',
    curvatureRatio: 0.72,
    angularity: 0.2,
    circularity: 0.84,
    density: 0.58,
    symmetry: 0.88,
    symmetryHorizontal: 0.82,
    symmetryVertical: 0.86,
    massDistribution: 'concentrated',
    fragmentation: 0.12,
    ...overrides,
  }
}

describe('deriveVisualArchetype', () => {
  it('derives a stable orbital archetype from concentrated radial signatures', () => {
    const archetype = deriveVisualArchetype({
      shapeSignature: buildSignature(),
      baseFormProfile: centeredBaseForm,
      personaDNA: stableDNA,
    })

    expect(archetype.bodyType).toBe('orbital')
    expect(archetype.corePlacement).toBe('centered')
    expect(archetype.visualLanguage).toBe('minimal')
    expect(archetype.structureProfile.axisEmphasis).toBe('radial')
  })

  it('reconstructs fragmented shapes into a denser archetype', () => {
    const archetype = deriveVisualArchetype({
      shapeSignature: buildSignature({
        type: 'fragmentado',
        dominantAxis: 'horizontal',
        complexity: 0.84,
        angularity: 0.78,
        density: 0.24,
        massDistribution: 'spread',
        fragmentation: 0.88,
      }),
      baseFormProfile: {
        family: 'shard',
        spine: 'horizontal',
        massDistribution: 'asymmetric',
        edgeDiscipline: 'sharp',
        openness: 0.26,
        bodyCompression: 0.34,
        corePlacement: { x: 0.62, y: 0.46 },
      },
      personaDNA: {
        temperament: 'intense',
        presenceStyle: 'dominant',
        precision: 'precise',
        expansion: 'expansive',
        defensiveness: 0.22,
        charisma: 0.78,
        stability: 0.34,
        wildness: 0.82,
      },
    })

    expect(archetype.bodyType).toBe('fragmented')
    expect(archetype.silhouetteStrategy).toBe('reconstruct')
    expect(archetype.visualLanguage).toBe('dense')
    expect(archetype.surfaceProfile.surfaceBehavior).toBe('crystalline')
  })

  it('derives a linear archetype for stable vertical bodies instead of mirroring the source logo', () => {
    const archetype = deriveVisualArchetype({
      shapeSignature: buildSignature({
        type: 'linear',
        dominantAxis: 'vertical',
        curvatureRatio: 0.34,
        circularity: 0.32,
        angularity: 0.58,
      }),
      baseFormProfile: {
        family: 'totem',
        spine: 'vertical',
        massDistribution: 'centered',
        edgeDiscipline: 'controlled',
        openness: 0.34,
        bodyCompression: 0.26,
        corePlacement: { x: 0.5, y: 0.46 },
      },
      personaDNA: {
        ...stableDNA,
        precision: 'precise',
      },
    })

    expect(archetype.bodyType).toBe('linear')
    expect(archetype.silhouetteStrategy).toBe('reconstruct')
    expect(archetype.structureProfile.axisEmphasis).toBe('vertical')
  })
})