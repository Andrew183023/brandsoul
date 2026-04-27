import { describe, expect, it } from 'vitest'

import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulState } from '../contracts/BrandSoulState'
import { buildBrandSoulVisualRuntimePatch } from './buildBrandSoulVisualRuntimePatch'
import type { BrandSoulVisualState } from './mapCognitiveToVisualState'

describe('buildBrandSoulVisualRuntimePatch', () => {
  it('builds an expressive patch for high-conversion decisions', () => {
    const decision: BrandSoulDecision = {
      intent: 'promotion',
      action: 'sell',
      responsePlan: {
        kind: 'promotion',
        topic: 'Semana da Aurora',
        intentGoal: 'highlight-active-promotion',
        requiredData: ['15% off'],
        optionalCloseStyle: 'explore-promotion',
      },
      statePatch: {},
      memoryCandidates: [],
      confidence: 0.94,
      memoryInfluence: {
        applied: false,
        influenceStrength: 0,
        signalsUsed: [],
        impact: {
          confidence: {
            before: 0.94,
            after: 0.94,
            delta: 0,
          },
        },
      },
    }
    const visualState: BrandSoulVisualState = {
      visualIntensity: 'cinematic',
      tensionLevel: 0.84,
      stability: 0.58,
      fieldSpread: 0.8,
      coreActivity: 0.86,
    }
    const currentState: BrandSoulState = {
      currentMood: 'focused',
      currentIntent: 'convert',
      currentFocus: 'promocao ativa',
      energyLevel: 0.88,
      interactionMode: 'sale',
      lastUpdatedAt: '2026-04-14T12:00:00.000Z',
    }

    const patch = buildBrandSoulVisualRuntimePatch({ decision, visualState, currentState })

    expect(patch.metadata?.visualIntensity).toBe('cinematic')
    expect((patch.core?.pulseMultiplier ?? 1)).toBeGreaterThan(1)
    expect((patch.field?.accentAlphaMultiplier ?? 1)).toBeGreaterThan(1)
    expect((patch.particles?.speedMultiplier ?? 1)).toBeGreaterThan(1)
  })

  it('contains and stabilizes support-oriented decisions', () => {
    const decision: BrandSoulDecision = {
      intent: 'support',
      action: 'support',
      responsePlan: {
        kind: 'policy',
        topic: 'Politica de troca',
        intentGoal: 'support-policy-clarity',
        requiredData: ['Trocas em ate 7 dias'],
        optionalCloseStyle: 'safe-guidance',
      },
      statePatch: {},
      memoryCandidates: [],
      confidence: 0.88,
      memoryInfluence: {
        applied: false,
        influenceStrength: 0,
        signalsUsed: [],
        impact: {
          confidence: {
            before: 0.88,
            after: 0.88,
            delta: 0,
          },
        },
      },
    }
    const visualState: BrandSoulVisualState = {
      visualIntensity: 'soft',
      tensionLevel: 0.22,
      stability: 0.9,
      fieldSpread: 0.38,
      coreActivity: 0.34,
    }
    const currentState: BrandSoulState = {
      currentMood: 'calm',
      currentIntent: 'support',
      currentFocus: 'troca',
      energyLevel: 0.3,
      interactionMode: 'support',
      lastUpdatedAt: '2026-04-14T12:00:00.000Z',
    }

    const patch = buildBrandSoulVisualRuntimePatch({ decision, visualState, currentState })

    expect(patch.metadata?.visualIntensity).toBe('soft')
    expect((patch.field?.spreadMultiplier ?? 1)).toBeLessThan(1)
    expect((patch.particles?.densityMultiplier ?? 1)).toBeLessThan(1)
    expect((patch.core?.pulseMultiplier ?? 1)).toBeLessThan(1.05)
  })
})