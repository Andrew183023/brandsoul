import { describe, expect, it } from 'vitest'

import type { BrandSoulState } from '../contracts/BrandSoulState'
import { mapCognitiveToVisualState } from './mapCognitiveToVisualState'

describe('mapCognitiveToVisualState', () => {
  it('raises intensity and core activity for high-pressure commercial conversion', () => {
    const state: BrandSoulState = {
      currentMood: 'urgent',
      currentIntent: 'convert',
      currentFocus: 'promocao ativa',
      energyLevel: 0.88,
      interactionMode: 'sale',
      lastUpdatedAt: '2026-04-14T12:00:00.000Z',
    }

    const result = mapCognitiveToVisualState(state, 'promotion', 'sell')

    expect(result.visualIntensity).toBe('cinematic')
    expect(result.tensionLevel).toBeGreaterThan(0.72)
    expect(result.fieldSpread).toBeGreaterThan(0.74)
    expect(result.coreActivity).toBeGreaterThan(0.8)
  })

  it('keeps support states more stable and contained', () => {
    const state: BrandSoulState = {
      currentMood: 'calm',
      currentIntent: 'support',
      currentFocus: 'politica de troca',
      energyLevel: 0.34,
      interactionMode: 'support',
      lastUpdatedAt: '2026-04-14T12:00:00.000Z',
    }

    const result = mapCognitiveToVisualState(state, 'support', 'support')

    expect(result.visualIntensity).toBe('soft')
    expect(result.stability).toBeGreaterThan(0.85)
    expect(result.fieldSpread).toBeLessThan(0.5)
    expect(result.coreActivity).toBeLessThan(0.45)
  })
})