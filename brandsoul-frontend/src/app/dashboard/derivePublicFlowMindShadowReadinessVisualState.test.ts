import { describe, expect, it } from 'vitest'

import { derivePublicFlowMindShadowReadinessVisualState } from './derivePublicFlowMindShadowReadinessVisualState'

describe('derivePublicFlowMindShadowReadinessVisualState', () => {
  it('returns unknown when readiness is missing', () => {
    const result = derivePublicFlowMindShadowReadinessVisualState(undefined)

    expect(result.tone).toBe('unknown')
    expect(result.badgeLabel).toBe('sem prontidão')
  })

  it('maps ready readiness to ready badge', () => {
    const result = derivePublicFlowMindShadowReadinessVisualState({
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.9,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 16,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    })

    expect(result.tone).toBe('ready')
    expect(result.badgeLabel).toBe('pronto para partial')
  })

  it('maps forming readiness to forming badge', () => {
    const result = derivePublicFlowMindShadowReadinessVisualState({
      publicShadowReadinessScore: 58,
      publicShadowReadinessState: 'forming',
      summary: 'forming',
      sampleSize: 3,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.33,
      averageResponseTextSimilarity: 0.78,
      averageBackendLatencyMs: 27,
      averageLatencyDeltaMs: 15,
      intentChangedRate: 0.333,
      actionChangedRate: 0.333,
      fallbackRate: 0.333,
      recentTrend: 'forming',
    })

    expect(result.tone).toBe('forming')
    expect(result.badgeLabel).toBe('em formação')
  })
})