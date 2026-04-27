import { describe, expect, it } from 'vitest'

import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import { applyPolicyToDecision } from './applyPolicyToDecision'

function buildDecision(overrides: Partial<BrandSoulDecision> = {}): BrandSoulDecision {
  return {
    intent: 'general',
    action: 'inform',
    responsePlan: {
      kind: 'general',
      topic: 'atendimento inicial',
      intentGoal: 'open-conversation',
      requiredData: [],
      optionalCloseStyle: 'open-dialogue',
    },
    statePatch: {},
    memoryCandidates: [],
    confidence: 0.46,
    memoryInfluence: {
      applied: false,
      influenceStrength: 0,
      signalsUsed: [],
      impact: {
        confidence: {
          before: 0.46,
          after: 0.46,
          delta: 0,
        },
      },
    },
    ...overrides,
  }
}

function buildPolicyProfile(overrides: Partial<BrandSoulPolicyProfile> = {}): BrandSoulPolicyProfile {
  return {
    decisionWeights: {
      intentShiftWeight: 0.8,
      actionShiftWeight: 0.8,
      confidenceWeight: 0.6,
      memoryWeight: 0.2,
    },
    intentPriorityOverrides: {
      general: 0.32,
      support: 0.62,
      policy: 0.58,
      'product-discovery': 0.38,
    },
    actionPreferenceMatrix: {
      general: {
        inform: 0.28,
        support: 0.64,
        guide: 0.24,
      },
      'product-discovery': {
        guide: 0.34,
        sell: 0.68,
      },
    },
    confidenceAdjustmentProfile: {
      baseAdjustment: 0.04,
      intentAdjustments: {
        support: 0.02,
      },
      actionAdjustments: {
        support: 0.02,
        sell: 0.03,
      },
      maxAdjustment: 0.08,
      evidenceThreshold: 3,
      decayFactor: 0.12,
    },
    policyStability: 0.92,
    policyDrift: 0.08,
    ...overrides,
  }
}

describe('applyPolicyToDecision', () => {
  it('can steer ambiguous general decisions toward support without touching guardrails', () => {
    const result = applyPolicyToDecision(buildDecision(), buildPolicyProfile())

    expect(result.intent).toBe('support')
    expect(result.action).toBe('support')
    expect(result.responsePlan.kind).toBe('policy')
    expect(result.responsePlan.optionalCloseStyle).toBe('safe-guidance')
    expect(result.confidence).toBeGreaterThan(0.46)
  })

  it('does not override guardrail-blocked decisions even with strong policy pressure', () => {
    const result = applyPolicyToDecision(
      buildDecision({
        intent: 'guardrail-blocked',
        action: 'refuse',
        responsePlan: {
          kind: 'guardrail',
          topic: 'fora de escopo',
          intentGoal: 'respect-guardrail-boundary',
          requiredData: [],
        },
        confidence: 0.96,
      }),
      buildPolicyProfile(),
    )

    expect(result.intent).toBe('guardrail-blocked')
    expect(result.action).toBe('refuse')
    expect(result.responsePlan.kind).toBe('guardrail')
  })
})