import { describe, expect, it } from 'vitest'

import type { BrandSoulVisualRuntimePatch } from '../contracts/BrandSoulVisualRuntimePatch'
import type { RuntimeSceneSpec } from '../contracts/RuntimeSceneSpec'
import { applyBrandSoulVisualRuntimePatch } from './applyBrandSoulVisualRuntimePatch'

function buildRuntimeSceneSpec(): RuntimeSceneSpec {
  return {
    schemaVersion: 1,
    source: 'entity-profile',
    shape: {
      fillStrategy: 'solid',
      typographicCandidate: false,
      fillAlpha: 0.9,
      edgeAlpha: 0.9,
      edgeWidth: 2,
      edgeTint: 0xffffff,
      tint: 0xffaa66,
      detailAlpha: 0.2,
      pulse: 0.2,
      rhythmSpeed: 1,
    },
    core: {
      radius: 16,
      baseAlpha: 0.8,
      accentAlpha: 0.8,
      detailAlpha: 0.5,
      pulse: 0.3,
      rhythmSpeed: 1,
      offsetX: 0,
      offsetY: 0,
    },
    field: {
      relation: 'balanced',
      mask: 'shape-bound',
      spread: 1,
      baseAlpha: 0.2,
      accentAlpha: 0.3,
      detailAlpha: 0.2,
      pulse: 0.1,
      rhythmSpeed: 1,
      budget: {
        initial: 'low',
        mid: 'medium',
        climax: 'high',
        stabilize: 'low',
      },
    },
    particles: {
      alpha: 0.4,
      sizeMultiplier: 1,
      speedMultiplier: 1,
      densityMultiplier: 1,
      spread: 1,
      budget: {
        initial: 'low',
        mid: 'medium',
        climax: 'high',
        stabilize: 'low',
      },
    },
    timeline: {
      birthTimeline: {
        steps: [],
        duration: 1000,
        stages: [],
      },
      duration: 1000,
      stages: [],
    },
    composition: {
      mode: 'centelha',
      variant: 'default',
      intensity: 'balanced',
      finalReveal: false,
      backgroundAlpha: 0.18,
      accent: '#ff9460',
      secondary: '#6e86ff',
      energy: '#6e86ff',
      neutral: '#d8d8d8',
      shapeTint: 0xff9460,
      edgeTint: 0xd8d8d8,
      layerVisibility: {},
      shapeOnly: false,
    },
    anatomy: {
      source: 'renderer-fallback',
      anchorCount: 0,
      emissionAnchorCount: 0,
      anchorDispersion: 0,
    },
  }
}

describe('applyBrandSoulVisualRuntimePatch', () => {
  it('marks the runtime scene spec when a BrandSoul patch is applied', () => {
    const patch: BrandSoulVisualRuntimePatch = {
      core: {
        pulseMultiplier: 1.2,
      },
      metadata: {
        source: 'brandsoul-cognition',
        decisionIntent: 'promotion',
        actionType: 'sell',
        confidence: 0.94,
        derivedFromStateAt: '2026-04-14T18:00:00.000Z',
      },
    }

    const result = applyBrandSoulVisualRuntimePatch(buildRuntimeSceneSpec(), patch, {
      applicationPoint: 'consumer-local',
    })

    expect(result.core.pulse).toBeGreaterThan(0.3)
    expect(result.modulation?.brandSoulRuntimePatch?.source).toBe('brandsoul-cognition')
    expect(result.modulation?.brandSoulRuntimePatch?.applicationPoint).toBe('consumer-local')
  })

  it('does not apply the patch a second time once the spec is marked as modulated', () => {
    const patch: BrandSoulVisualRuntimePatch = {
      core: {
        pulseMultiplier: 1.2,
      },
      metadata: {
        source: 'brandsoul-cognition',
        decisionIntent: 'promotion',
        actionType: 'sell',
        confidence: 0.94,
      },
    }

    const once = applyBrandSoulVisualRuntimePatch(buildRuntimeSceneSpec(), patch, {
      applicationPoint: 'resolve-render-output',
    })
    const twice = applyBrandSoulVisualRuntimePatch(once, patch, {
      applicationPoint: 'consumer-local',
    })

    expect(twice.core.pulse).toBe(once.core.pulse)
    expect(twice.modulation?.brandSoulRuntimePatch?.applicationPoint).toBe('resolve-render-output')
  })
})