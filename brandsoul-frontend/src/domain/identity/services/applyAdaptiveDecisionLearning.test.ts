import { describe, expect, it } from 'vitest'

import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { applyAdaptiveDecisionLearning } from './applyAdaptiveDecisionLearning'

function buildAdaptiveProfile(overrides: Partial<BrandSoulAdaptiveDecisionProfile> = {}): BrandSoulAdaptiveDecisionProfile {
  return {
    intentSelectionWeights: {
      general: 0.38,
      greeting: 0.34,
      support: 0.62,
      policy: 0.6,
      'product-discovery': 0.58,
      promotion: 0.52,
      purchase: 0.5,
      'business-hours': 0.88,
      'guardrail-blocked': 1,
    },
    actionSelectionBias: {
      inform: 0.52,
      guide: 0.48,
      support: 0.46,
      sell: 0.34,
      refuse: 0.02,
    },
    confidenceScalingProfile: {
      baseScale: 1,
      intentScales: {},
      actionScales: {},
      minScale: 0.94,
      maxScale: 1.08,
      evidenceThreshold: 3,
    },
    explorationVsExploitationBalance: {
      explorationBias: 0.54,
      exploitationBias: 0.5,
    },
    safetyProfile: {
      killSwitchEnabled: false,
      localRollbackEnabled: true,
      minimumEvidence: 3,
      criticalConfidenceThreshold: 0.88,
      rollbackDriftThreshold: 0.26,
      maxIntentPromotionBudget: 0.18,
      maxActionPromotionBudget: 0.16,
      maxConfidencePromotionBudget: 0.1,
      maxStylePromotionBudget: 0.12,
    },
    adaptationConfidence: 0.22,
    decisionDrift: 0.08,
    ...overrides,
  }
}

function buildStrategyProfile(overrides: Partial<BrandSoulStrategyProfile> = {}): BrandSoulStrategyProfile {
  return {
    strategyBias: {
      supportBias: 0.22,
      explorationBias: 0.66,
      conversionBias: 0.32,
      cautionBias: 0.18,
    },
    dominantStrategy: 'exploration',
    adaptationConfidence: 0.58,
    lastStrategyUpdateAt: '2026-04-18T14:00:00.000Z',
    ...overrides,
  }
}

function buildPolicyProfile(overrides: Partial<BrandSoulPolicyProfile> = {}): BrandSoulPolicyProfile {
  return {
    decisionWeights: {
      intentShiftWeight: 0.18,
      actionShiftWeight: 0.2,
      confidenceWeight: 0.14,
      memoryWeight: 0.08,
    },
    intentPriorityOverrides: {
      general: 0.38,
      'product-discovery': 0.52,
      support: 0.46,
      policy: 0.44,
    },
    actionPreferenceMatrix: {
      general: {
        inform: 0.54,
        guide: 0.38,
      },
      'product-discovery': {
        guide: 0.8,
        sell: 0.36,
      },
    },
    confidenceAdjustmentProfile: {
      baseAdjustment: 0.02,
      intentAdjustments: {
        'product-discovery': 0.03,
      },
      actionAdjustments: {
        guide: 0.04,
      },
      maxAdjustment: 0.08,
      evidenceThreshold: 3,
      decayFactor: 0.12,
    },
    policyStability: 0.88,
    policyDrift: 0.08,
    ...overrides,
  }
}

function buildHistoricalSignals(overrides: Partial<BrandSoulHistoricalSignals> = {}): BrandSoulHistoricalSignals {
  return {
    totalInteractions: 7,
    reliableEvidenceCount: 5,
    rollingSuccessRate: 0.78,
    rollingContinuationRate: 0.74,
    rollingEngagementDelta: 0.26,
    actionOutcomes: {
      guide: {
        sampleSize: 4,
        successRate: 0.82,
        continuationRate: 0.76,
        averageEngagementDelta: 0.3,
      },
      sell: {
        sampleSize: 2,
        successRate: 0.44,
        continuationRate: 0.3,
        averageEngagementDelta: -0.1,
      },
    },
    intentOutcomes: {
      'product-discovery': {
        sampleSize: 4,
        successRate: 0.82,
        continuationRate: 0.76,
        averageEngagementDelta: 0.3,
      },
    },
    lastUpdatedAt: '2026-04-18T14:00:00.000Z',
    ...overrides,
  }
}

function buildQualifiedOutcome(overrides: Partial<BrandSoulQualifiedInteractionOutcome> = {}): BrandSoulQualifiedInteractionOutcome {
  return {
    outcome: {
      interactionSuccess: 0.84,
      userContinuation: true,
      engagementDelta: 0.24,
      signalStrength: 0.8,
    },
    provenance: 'observed',
    confidence: 0.8,
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

describe('applyAdaptiveDecisionLearning', () => {
  it('moves the adaptive profile toward historically supported exploratory guidance with bounded drift', () => {
    const result = applyAdaptiveDecisionLearning({
      adaptiveDecisionProfile: buildAdaptiveProfile(),
      historicalSignals: buildHistoricalSignals(),
      qualifiedOutcomes: [buildQualifiedOutcome()],
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
    })

    expect(result.intentSelectionWeights['product-discovery']).toBeGreaterThan(0.58)
    expect(result.actionSelectionBias.guide).toBeGreaterThan(0.48)
    expect(result.confidenceScalingProfile.actionScales.guide).toBeGreaterThan(1)
    expect(result.adaptationConfidence).toBeGreaterThan(0.22)
    expect(result.decisionDrift).toBeLessThan(0.2)
  })

  it('keeps structural intent and action weights stable when evidence is still below threshold', () => {
    const initialProfile = buildAdaptiveProfile()
    const result = applyAdaptiveDecisionLearning({
      adaptiveDecisionProfile: initialProfile,
      historicalSignals: buildHistoricalSignals({
        totalInteractions: 1,
        reliableEvidenceCount: 0.6,
        rollingSuccessRate: 0.52,
        rollingContinuationRate: 0.5,
        rollingEngagementDelta: 0.02,
      }),
      qualifiedOutcomes: [buildQualifiedOutcome({ provenance: 'inferred', confidence: 0.42 })],
      strategyProfile: buildStrategyProfile({ adaptationConfidence: 0.24 }),
      policyProfile: buildPolicyProfile(),
    })

    expect(result.intentSelectionWeights).toEqual(initialProfile.intentSelectionWeights)
    expect(result.actionSelectionBias).toEqual(initialProfile.actionSelectionBias)
    expect(result.adaptationConfidence).toBeGreaterThanOrEqual(initialProfile.adaptationConfidence)
    expect(result.decisionDrift).toBeGreaterThanOrEqual(initialProfile.decisionDrift)
  })

  it('rolls back toward a safer baseline when drift rises under weak consistency', () => {
    const initialProfile = buildAdaptiveProfile({
      intentSelectionWeights: {
        general: 0.2,
        greeting: 0.24,
        support: 0.82,
        policy: 0.78,
        'product-discovery': 0.74,
        promotion: 0.68,
        purchase: 0.62,
        'business-hours': 0.88,
        'guardrail-blocked': 1,
      },
      actionSelectionBias: {
        inform: 0.22,
        guide: 0.68,
        support: 0.72,
        sell: 0.7,
        refuse: 0.02,
      },
      decisionDrift: 0.28,
      adaptationConfidence: 0.4,
    })
    const result = applyAdaptiveDecisionLearning({
      adaptiveDecisionProfile: initialProfile,
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 4,
        rollingSuccessRate: 0.38,
        rollingContinuationRate: 0.34,
        rollingEngagementDelta: -0.22,
      }),
      qualifiedOutcomes: [buildQualifiedOutcome({
        provenance: 'observed',
        confidence: 0.52,
        outcome: {
          interactionSuccess: 0.34,
          userContinuation: false,
          engagementDelta: -0.18,
          signalStrength: 0.5,
        },
      })],
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
    })

    expect(result.intentSelectionWeights.support).toBeLessThan(initialProfile.intentSelectionWeights.support ?? 1)
    expect(result.actionSelectionBias.sell).toBeLessThan(initialProfile.actionSelectionBias.sell ?? 1)
    expect(result.decisionDrift).toBeLessThan(initialProfile.decisionDrift)
  })
})