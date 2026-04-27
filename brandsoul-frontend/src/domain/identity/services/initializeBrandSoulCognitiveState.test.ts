import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulIdentityProfile } from '../contracts/BrandSoulIdentityProfile'
import { initializeBrandSoulCognitiveState } from './initializeBrandSoulCognitiveState'

function buildIdentity(overrides: Partial<BrandSoulIdentityProfile> = {}): BrandSoulIdentityProfile {
  return {
    id: 'identity-1',
    brandName: 'BrandSoul Store',
    essence: 'presenca consultiva e clara',
    tone: {
      primary: 'consultative',
      modifiers: ['warm'],
    },
    relationalStyle: {
      primaryMode: 'guide',
      connectionIntent: 'orientacao util e segura',
      trustSignals: ['clareza', 'contexto'],
    },
    commercialRole: 'consultant',
    immutableTraits: ['clara', 'honesta'],
    adaptableTraits: [],
    identityRules: [
      {
        key: 'rule-1',
        description: 'sempre responder com clareza contextual',
      },
    ],
    guardrails: [],
    visualSignature: {
      bodyMotif: 'coeso',
      coreMotif: 'focado',
      fieldMotif: 'contido',
      motionPrinciples: ['clareza'],
    },
    ...overrides,
  }
}

describe('initializeBrandSoulCognitiveState', () => {
  it('creates a neutral mid-range state aligned with a guide persona', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const state = initializeBrandSoulCognitiveState(buildIdentity())

    expect(state).toEqual({
      currentMode: 'neutral',
      tensionLevel: expect.any(Number),
      focusLevel: expect.any(Number),
      engagementLevel: expect.any(Number),
      dominantDrive: 'explore',
      stability: expect.any(Number),
      adaptationMomentum: 0.18,
      lastStateUpdateAt: '2026-04-15T12:00:00.000Z',
    })
    expect(state.tensionLevel).toBeGreaterThan(0.4)
    expect(state.tensionLevel).toBeLessThan(0.6)
    expect(state.focusLevel).toBeGreaterThan(0.55)
    expect(state.engagementLevel).toBeGreaterThan(0.5)
    expect(state.stability).toBeGreaterThan(0.7)
  })
})