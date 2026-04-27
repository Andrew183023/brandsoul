import { describe, expect, it } from 'vitest'

import type { BrandSoulIdentityProfile } from '../contracts/BrandSoulIdentityProfile'
import type { BrandSoulMemoryInfluenceTrend } from './computeMemoryInfluenceTrend'
import type { BrandSoulDerivedPreferencesResult } from './deriveBrandSoulPreferences'
import { validateIdentityDrift } from './validateIdentityDrift'

function buildGuideIdentity(): BrandSoulIdentityProfile {
  return {
    id: 'identity-guide',
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
  }
}

function buildConversionIdentity(): BrandSoulIdentityProfile {
  return {
    id: 'identity-conversion',
    brandName: 'Impulse Brand',
    essence: 'presenca comercial de conversao',
    tone: {
      primary: 'confident',
      modifiers: ['direct'],
    },
    relationalStyle: {
      primaryMode: 'seller',
      connectionIntent: 'conduzir a melhor oferta com objetividade',
      trustSignals: ['objetividade'],
    },
    commercialRole: 'seller',
    immutableTraits: ['assertiva', 'comercial'],
    adaptableTraits: [],
    identityRules: [
      {
        key: 'rule-1',
        description: 'priorizar conversao e curadoria de oferta',
      },
    ],
    guardrails: [],
    visualSignature: {
      bodyMotif: 'vetorial',
      coreMotif: 'focado',
      fieldMotif: 'denso',
      motionPrinciples: ['pressao'],
    },
  }
}

function buildDerivedPreferences(preferences: BrandSoulDerivedPreferencesResult['preferences']): BrandSoulDerivedPreferencesResult {
  return { preferences }
}

function buildTrend(overrides: Partial<BrandSoulMemoryInfluenceTrend> = {}): BrandSoulMemoryInfluenceTrend {
  return {
    dominantIntentTrend: null,
    preferenceSignals: [],
    supportBias: 0,
    explorationBias: 0,
    ...overrides,
  }
}

describe('validateIdentityDrift', () => {
  it('preserves aligned support and commercial evolution when it matches the base persona', () => {
    const result = validateIdentityDrift(
      buildGuideIdentity(),
      buildDerivedPreferences([
        {
          kind: 'most-consulted-product',
          value: 'Vestido Aurora',
          score: 0.71,
          confidence: 0.9,
        },
        {
          kind: 'dominant-interaction',
          value: 'support',
          score: 0.68,
          confidence: 0.87,
        },
      ]),
      buildTrend({
        dominantIntentTrend: {
          intent: 'product-discovery',
          score: 0.66,
        },
        supportBias: 0.62,
        explorationBias: 0.7,
      }),
    )

    expect(result.preferences.preferences).toHaveLength(2)
    expect(result.trend.dominantIntentTrend).toEqual({
      intent: 'product-discovery',
      score: 0.66,
    })
    expect(result.blockedChanges).toEqual([])
    expect(result.profile.dominantMode).toBe('support')
  })

  it('blocks support drift that conflicts with a conversion-first base persona', () => {
    const result = validateIdentityDrift(
      buildConversionIdentity(),
      buildDerivedPreferences([
        {
          kind: 'dominant-interaction',
          value: 'support',
          score: 0.76,
          confidence: 0.89,
        },
      ]),
      buildTrend({
        dominantIntentTrend: {
          intent: 'support',
          score: 0.72,
        },
        supportBias: 0.78,
        explorationBias: 0.31,
      }),
    )

    expect(result.preferences.preferences).toEqual([])
    expect(result.trend.dominantIntentTrend).toBeNull()
    expect(result.trend.supportBias).toBeLessThan(0.55)
    expect(result.blockedChanges).toEqual(
      expect.arrayContaining(['blocked-preference:dominant-interaction:support', 'blocked-trend:support']),
    )
    expect(result.profile.dominantMode).toBe('explore')
  })
})