import { describe, expect, it } from 'vitest'

import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { generateAdaptiveSemanticProposal } from './generateAdaptiveSemanticProposal'

function buildMemorySignals(overrides: Partial<BrandSoulMemoryInfluence> = {}): BrandSoulMemoryInfluence {
  return {
    applied: true,
    influenceStrength: 0.22,
    signalsUsed: [],
    impact: {
      confidence: {
        before: 0.4,
        after: 0.48,
        delta: 0.08,
      },
    },
    ...overrides,
  }
}

function buildState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'exploration',
    tensionLevel: 0.42,
    focusLevel: 0.58,
    engagementLevel: 0.66,
    dominantDrive: 'explore',
    stability: 0.78,
    adaptationMomentum: 0.62,
    lastStateUpdateAt: '2026-04-18T12:00:00.000Z',
    ...overrides,
  }
}

function buildStrategyProfile(overrides: Partial<BrandSoulStrategyProfile> = {}): BrandSoulStrategyProfile {
  return {
    strategyBias: {
      supportBias: 0.24,
      explorationBias: 0.72,
      conversionBias: 0.18,
      cautionBias: 0.22,
    },
    dominantStrategy: 'exploration',
    adaptationConfidence: 0.54,
    lastStrategyUpdateAt: '2026-04-18T12:00:00.000Z',
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
      general: 0.36,
      support: 0.46,
      policy: 0.46,
      'product-discovery': 0.72,
    },
    actionPreferenceMatrix: {},
    confidenceAdjustmentProfile: {
      baseAdjustment: 0,
      intentAdjustments: {},
      actionAdjustments: {},
      maxAdjustment: 0.08,
      evidenceThreshold: 3,
      decayFactor: 0.12,
    },
    policyStability: 0.86,
    policyDrift: 0.08,
    ...overrides,
  }
}

function buildAdaptiveProfile(overrides: Partial<BrandSoulAdaptiveDecisionProfile> = {}): BrandSoulAdaptiveDecisionProfile {
  return {
    intentSelectionWeights: {
      general: 0.34,
      greeting: 0.3,
      support: 0.62,
      policy: 0.6,
      'product-discovery': 0.76,
      promotion: 0.42,
      purchase: 0.4,
      'business-hours': 0.88,
      'guardrail-blocked': 1,
    },
    actionSelectionBias: {
      inform: 0.34,
      guide: 0.74,
      support: 0.44,
      sell: 0.24,
      refuse: 0.02,
    },
    confidenceScalingProfile: {
      baseScale: 1.02,
      intentScales: {},
      actionScales: {},
      minScale: 0.94,
      maxScale: 1.08,
      evidenceThreshold: 3,
    },
    explorationVsExploitationBalance: {
      explorationBias: 0.62,
      exploitationBias: 0.54,
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
    adaptationConfidence: 0.72,
    decisionDrift: 0.08,
    ...overrides,
  }
}

function buildHistoricalSignals(overrides: Partial<BrandSoulHistoricalSignals> = {}): BrandSoulHistoricalSignals {
  return {
    totalInteractions: 6,
    reliableEvidenceCount: 4.8,
    rollingSuccessRate: 0.76,
    rollingContinuationRate: 0.72,
    rollingEngagementDelta: 0.22,
    actionOutcomes: {
      guide: {
        sampleSize: 2,
        successRate: 0.82,
        continuationRate: 0.78,
        averageEngagementDelta: 0.24,
      },
    },
    intentOutcomes: {
      'product-discovery': {
        sampleSize: 2,
        successRate: 0.82,
        continuationRate: 0.78,
        averageEngagementDelta: 0.24,
      },
    },
    lastUpdatedAt: '2026-04-18T12:00:00.000Z',
    ...overrides,
  }
}

describe('generateAdaptiveSemanticProposal', () => {
  it('proposes a primary semantic exploration skeleton only in safe zones', () => {
    const result = generateAdaptiveSemanticProposal({
      memorySignals: buildMemorySignals(),
      cognitiveState: buildState(),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
      adaptiveDecisionProfile: buildAdaptiveProfile(),
      historicalSignals: buildHistoricalSignals(),
    })

    expect(result.semanticZone).toBe('safe')
    expect(result.fallbackRequired).toBe(false)
    expect(result.proposedIntent).toBe('product-discovery')
    expect(result.proposedAction).toBe('guide')
    expect(result.proposedResponsePlanSkeleton?.kind).toBe('product')
    expect(result.proposalConfidence).toBeGreaterThan(0.58)
  })

  it('forces fallback in critical or prohibited zones', () => {
    const result = generateAdaptiveSemanticProposal({
      memorySignals: buildMemorySignals(),
      cognitiveState: buildState({ tensionLevel: 0.84 }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
      adaptiveDecisionProfile: buildAdaptiveProfile(),
      historicalSignals: buildHistoricalSignals(),
    })

    expect(result.semanticZone).toBe('prohibited')
    expect(result.fallbackRequired).toBe(true)
    expect(result.proposedIntent).toBeUndefined()
  })
})