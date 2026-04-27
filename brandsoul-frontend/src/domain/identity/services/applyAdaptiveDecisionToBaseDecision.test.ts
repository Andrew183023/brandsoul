import { describe, expect, it } from 'vitest'

import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import { applyAdaptiveDecisionToBaseDecision } from './applyAdaptiveDecisionToBaseDecision'

function buildDecision(overrides: Partial<BrandSoulDecision> = {}): BrandSoulDecision {
  return {
    intent: 'general',
    action: 'inform',
    responsePlan: {
      kind: 'general',
      topic: 'ajuda',
      intentGoal: 'continue-contextual-guidance',
      requiredData: [],
      optionalCloseStyle: 'open-dialogue',
    },
    statePatch: {},
    memoryCandidates: [],
    confidence: 0.48,
    memoryInfluence: {
      applied: false,
      influenceStrength: 0,
      signalsUsed: [],
      impact: {
        confidence: {
          before: 0.48,
          after: 0.48,
          delta: 0,
        },
      },
    },
    ...overrides,
  }
}

function buildProfile(overrides: Partial<BrandSoulAdaptiveDecisionProfile> = {}): BrandSoulAdaptiveDecisionProfile {
  return {
    intentSelectionWeights: {
      general: 0.34,
      greeting: 0.3,
      support: 0.72,
      policy: 0.66,
      'product-discovery': 0.48,
      promotion: 0.42,
      purchase: 0.4,
      'business-hours': 0.84,
      'guardrail-blocked': 1,
    },
    actionSelectionBias: {
      inform: 0.34,
      guide: 0.42,
      support: 0.74,
      sell: 0.26,
      refuse: 0.02,
    },
    confidenceScalingProfile: {
      baseScale: 1.04,
      intentScales: {
        support: 1.03,
      },
      actionScales: {
        support: 1.04,
      },
      minScale: 0.94,
      maxScale: 1.08,
      evidenceThreshold: 3,
    },
    explorationVsExploitationBalance: {
      explorationBias: 0.48,
      exploitationBias: 0.68,
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

describe('applyAdaptiveDecisionToBaseDecision', () => {
  it('can shift an ambiguous base decision toward a supported structural support policy', () => {
    const result = applyAdaptiveDecisionToBaseDecision(buildDecision(), buildProfile())

    expect(result.intent).toBe('support')
    expect(result.action).toBe('support')
    expect(result.responsePlan.kind).toBe('policy')
    expect(result.responsePlan.optionalCloseStyle).toBe('safe-guidance')
    expect(result.confidence).toBeGreaterThan(0.48)
  })

  it('can promote structural close style in safe zones even without changing intent', () => {
    const result = applyAdaptiveDecisionToBaseDecision(
      buildDecision({
        intent: 'product-discovery',
        action: 'guide',
        responsePlan: {
          kind: 'product',
          topic: 'colecao',
          intentGoal: 'guide-product-selection',
          requiredData: [],
          optionalCloseStyle: 'open-dialogue',
        },
        confidence: 0.62,
      }),
      buildProfile({
        actionSelectionBias: {
          inform: 0.24,
          guide: 0.66,
          support: 0.3,
          sell: 0.2,
          refuse: 0.02,
        },
      }),
    )

    expect(result.intent).toBe('product-discovery')
    expect(result.action).toBe('guide')
    expect(result.responsePlan.optionalCloseStyle).toBe('guide-choice')
  })

  it('keeps critical heuristic decisions untouched as a safe fallback', () => {
    const result = applyAdaptiveDecisionToBaseDecision(
      buildDecision({
        intent: 'guardrail-blocked',
        action: 'refuse',
        confidence: 0.96,
        responsePlan: {
          kind: 'guardrail',
          topic: 'bloqueio',
          intentGoal: 'respect-guardrail-boundary',
          requiredData: [],
          constraints: ['nao prosseguir'],
        },
      }),
      buildProfile(),
    )

    expect(result.intent).toBe('guardrail-blocked')
    expect(result.action).toBe('refuse')
    expect(result.responsePlan.kind).toBe('guardrail')
    expect(result.confidence).toBe(0.96)
  })

  it('honors the kill switch and falls back to the heuristic base decision', () => {
    const decision = buildDecision({
      intent: 'general',
      action: 'inform',
      confidence: 0.44,
    })
    const result = applyAdaptiveDecisionToBaseDecision(
      decision,
      buildProfile({
        safetyProfile: {
          killSwitchEnabled: true,
          localRollbackEnabled: true,
          minimumEvidence: 3,
          criticalConfidenceThreshold: 0.88,
          rollbackDriftThreshold: 0.26,
          maxIntentPromotionBudget: 0.18,
          maxActionPromotionBudget: 0.16,
          maxConfidencePromotionBudget: 0.1,
          maxStylePromotionBudget: 0.12,
        },
      }),
    )

    expect(result).toEqual(decision)
  })
})