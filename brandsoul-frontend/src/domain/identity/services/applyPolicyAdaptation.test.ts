import { describe, expect, it } from 'vitest'

import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { applyPolicyAdaptation } from './applyPolicyAdaptation'

function buildCognitiveState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'exploration',
    tensionLevel: 0.44,
    focusLevel: 0.6,
    engagementLevel: 0.64,
    dominantDrive: 'explore',
    stability: 0.78,
    adaptationMomentum: 0.46,
    lastStateUpdateAt: '2026-04-18T14:00:00.000Z',
    ...overrides,
  }
}

function buildStrategyProfile(overrides: Partial<BrandSoulStrategyProfile> = {}): BrandSoulStrategyProfile {
  return {
    strategyBias: {
      supportBias: 0.2,
      explorationBias: 0.66,
      conversionBias: 0.34,
      cautionBias: 0.22,
    },
    dominantStrategy: 'exploration',
    adaptationConfidence: 0.58,
    lastStrategyUpdateAt: '2026-04-18T14:00:00.000Z',
    ...overrides,
  }
}

function buildMemoryInfluence(overrides: Partial<BrandSoulMemoryInfluence> = {}): BrandSoulMemoryInfluence {
  return {
    applied: true,
    influenceStrength: 0.22,
    signalsUsed: [],
    impact: {
      confidence: {
        before: 0.55,
        after: 0.61,
        delta: 0.06,
      },
    },
    ...overrides,
  }
}

function buildPolicyProfile(overrides: Partial<BrandSoulPolicyProfile> = {}): BrandSoulPolicyProfile {
  return {
    decisionWeights: {
      intentShiftWeight: 0.16,
      actionShiftWeight: 0.18,
      confidenceWeight: 0.12,
      memoryWeight: 0.08,
    },
    intentPriorityOverrides: {
      general: 0.38,
      'product-discovery': 0.46,
      support: 0.44,
      policy: 0.44,
    },
    actionPreferenceMatrix: {
      general: {
        inform: 0.56,
        guide: 0.34,
      },
      'product-discovery': {
        guide: 0.76,
        sell: 0.42,
      },
    },
    confidenceAdjustmentProfile: {
      baseAdjustment: 0,
      intentAdjustments: {},
      actionAdjustments: {},
      maxAdjustment: 0.08,
      evidenceThreshold: 3,
      decayFactor: 0.12,
    },
    policyStability: 0.84,
    policyDrift: 0.08,
    ...overrides,
  }
}

function buildHistoricalSignals(overrides: Partial<BrandSoulHistoricalSignals> = {}): BrandSoulHistoricalSignals {
  return {
    totalInteractions: 5,
    reliableEvidenceCount: 4,
    rollingSuccessRate: 0.74,
    rollingContinuationRate: 0.7,
    rollingEngagementDelta: 0.24,
    actionOutcomes: {
      guide: {
        sampleSize: 4,
        successRate: 0.76,
        continuationRate: 0.7,
        averageEngagementDelta: 0.28,
      },
      sell: {
        sampleSize: 3,
        successRate: 0.42,
        continuationRate: 0.33,
        averageEngagementDelta: -0.12,
      },
    },
    intentOutcomes: {
      'product-discovery': {
        sampleSize: 4,
        successRate: 0.76,
        continuationRate: 0.7,
        averageEngagementDelta: 0.28,
      },
    },
    lastUpdatedAt: '2026-04-18T14:00:00.000Z',
    ...overrides,
  }
}

function buildQualifiedOutcome(overrides: Partial<BrandSoulQualifiedInteractionOutcome> = {}): BrandSoulQualifiedInteractionOutcome {
  return {
    outcome: {
      interactionSuccess: 0.82,
      userContinuation: true,
      engagementDelta: 0.26,
      signalStrength: 0.78,
    },
    provenance: 'observed',
    confidence: 0.78,
    evidence: {
      userContinuationObserved: true,
      responseAccepted: false,
      explicitCorrection: false,
      engagementObserved: true,
      sessionContinuation: true,
      manualValidation: false,
    },
    observedAt: '2026-04-18T14:00:00.000Z',
    ...overrides,
  }
}

describe('applyPolicyAdaptation', () => {
  it('moves policy toward historically supported exploratory behavior with hysteresis', () => {
    const result = applyPolicyAdaptation({
      policyProfile: buildPolicyProfile(),
      strategyProfile: buildStrategyProfile(),
      cognitiveState: buildCognitiveState(),
      memorySignals: buildMemoryInfluence(),
      behaviorFeedback: buildQualifiedOutcome(),
      historicalSignals: buildHistoricalSignals(),
    })

    expect(result.intentPriorityOverrides['product-discovery']).toBeGreaterThan(0.46)
    expect((result.actionPreferenceMatrix['product-discovery']?.guide ?? 0)).toBeGreaterThan(0.76)
    expect((result.confidenceAdjustmentProfile.actionAdjustments.guide ?? 0)).toBeGreaterThanOrEqual(0)
    expect(result.policyStability).toBeGreaterThan(0.84)
  })

  it('keeps policy changes bounded when evidence is still weak', () => {
    const result = applyPolicyAdaptation({
      policyProfile: buildPolicyProfile(),
      strategyProfile: buildStrategyProfile({
        strategyBias: {
          supportBias: 0.18,
          explorationBias: 0.22,
          conversionBias: 0.68,
          cautionBias: 0.28,
        },
        dominantStrategy: 'conversion',
      }),
      cognitiveState: buildCognitiveState({
        currentMode: 'conversion',
        dominantDrive: 'sell',
      }),
      memorySignals: buildMemoryInfluence({
        influenceStrength: 0.08,
      }),
      behaviorFeedback: buildQualifiedOutcome({
        outcome: {
          interactionSuccess: 0.38,
          userContinuation: false,
          engagementDelta: -0.2,
          signalStrength: 0.42,
        },
        provenance: 'inferred',
        confidence: 0.42,
        evidence: {
          userContinuationObserved: false,
          responseAccepted: false,
          explicitCorrection: false,
          engagementObserved: false,
          sessionContinuation: false,
          manualValidation: false,
        },
      }),
      historicalSignals: buildHistoricalSignals({
        totalInteractions: 2,
        reliableEvidenceCount: 1,
        rollingSuccessRate: 0.48,
        rollingContinuationRate: 0.46,
        rollingEngagementDelta: -0.06,
      }),
    })

    expect(result.decisionWeights.actionShiftWeight).toBeLessThanOrEqual(0.22)
    expect(result.policyDrift).toBeLessThan(0.2)
    expect(Math.abs((result.confidenceAdjustmentProfile.actionAdjustments.sell ?? 0))).toBeLessThanOrEqual(0.03)
  })
})