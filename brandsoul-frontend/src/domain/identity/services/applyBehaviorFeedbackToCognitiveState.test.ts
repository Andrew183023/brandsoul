import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulInteractionOutcome } from '../contracts/BrandSoulInteractionOutcome'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import {
  applyBehaviorFeedbackToCognitiveState,
  applyBehaviorFeedbackToCognitiveStateWithInfluence,
} from './applyBehaviorFeedbackToCognitiveState'

function buildState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'exploration',
    tensionLevel: 0.44,
    focusLevel: 0.58,
    engagementLevel: 0.57,
    dominantDrive: 'explore',
    stability: 0.7,
    adaptationMomentum: 0.31,
    lastStateUpdateAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

function buildDecision(overrides: Partial<BrandSoulDecision> = {}): BrandSoulDecision {
  return {
    intent: 'product-discovery',
    action: 'guide',
    responsePlan: {
      kind: 'product',
      topic: 'Vestido Aurora',
      intentGoal: 'guide-product-selection',
      requiredData: ['preco 249.90'],
      optionalCloseStyle: 'guide-choice',
    },
    statePatch: {},
    memoryCandidates: [],
    confidence: 0.74,
    memoryInfluence: {
      applied: false,
      influenceStrength: 0,
      signalsUsed: [],
      impact: {
        confidence: {
          before: 0.74,
          after: 0.74,
          delta: 0,
        },
      },
    },
    cognitiveStateInfluence: {
      applied: true,
      influenceStrength: 0.05,
      signalsUsed: [],
      impact: {
        confidence: {
          before: 0.7,
          after: 0.74,
          delta: 0.04,
        },
      },
    },
    ...overrides,
  }
}

function buildOutcome(overrides: Partial<BrandSoulInteractionOutcome> = {}): BrandSoulInteractionOutcome {
  return {
    interactionSuccess: 0.82,
    userContinuation: true,
    engagementDelta: 0.3,
    signalStrength: 0.76,
    ...overrides,
  }
}

function buildQualifiedOutcome(overrides: Partial<BrandSoulQualifiedInteractionOutcome> = {}): BrandSoulQualifiedInteractionOutcome {
  return {
    outcome: buildOutcome(),
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
    observedAt: '2026-04-15T12:40:00.000Z',
    ...overrides,
  }
}

describe('applyBehaviorFeedbackToCognitiveState', () => {
  it('raises stability and engagement after a strong successful continuation', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:40:00.000Z'))

    const nextState = applyBehaviorFeedbackToCognitiveState(buildState(), buildDecision(), buildQualifiedOutcome())

    expect(nextState.stability).toBeGreaterThan(0.7)
    expect(nextState.engagementLevel).toBeGreaterThan(0.57)
    expect(nextState.focusLevel).toBeGreaterThan(0.58)
    expect(nextState.adaptationMomentum).toBeGreaterThan(0.31)
    expect(nextState.lastStateUpdateAt).toBe('2026-04-15T12:40:00.000Z')
  })

  it('raises adaptation momentum and lowers stability after failure and rupture', () => {
    const nextState = applyBehaviorFeedbackToCognitiveState(
      buildState({ stability: 0.76, adaptationMomentum: 0.24, engagementLevel: 0.61 }),
      buildDecision({
        intent: 'support',
        action: 'support',
        responsePlan: {
          kind: 'policy',
          topic: 'Politica de troca',
          intentGoal: 'support-policy-clarity',
          requiredData: ['trocas em ate 7 dias'],
          optionalCloseStyle: 'safe-guidance',
        },
      }),
      buildQualifiedOutcome({
        outcome: buildOutcome({
          interactionSuccess: false,
          userContinuation: false,
          engagementDelta: -0.4,
          signalStrength: 0.8,
        }),
        provenance: 'observed',
        confidence: 0.76,
        evidence: {
          userContinuationObserved: false,
          responseAccepted: false,
          explicitCorrection: true,
          engagementObserved: true,
          sessionContinuation: true,
          manualValidation: false,
        },
      }),
    )

    expect(nextState.stability).toBeLessThan(0.76)
    expect(nextState.adaptationMomentum).toBeGreaterThan(0.24)
    expect(nextState.engagementLevel).toBeLessThan(0.61)
  })

  it('exposes feedback observability separately from the state transition', () => {
    const result = applyBehaviorFeedbackToCognitiveStateWithInfluence(buildState(), buildDecision(), buildQualifiedOutcome())

    expect(result.behaviorFeedbackInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      outcomeSignalsUsed: [
        expect.objectContaining({ signal: 'interaction-success' }),
        expect.objectContaining({ signal: 'user-continuation' }),
        expect.objectContaining({ signal: 'engagement-delta' }),
        expect.objectContaining({ signal: 'signal-strength' }),
      ],
      impact: {
        focusLevel: {
          before: 0.58,
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        engagementLevel: {
          before: 0.57,
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        stability: {
          before: 0.7,
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        adaptationMomentum: {
          before: 0.31,
          after: expect.any(Number),
          delta: expect.any(Number),
        },
      },
    })
  })

  it('discounts inferred outcomes compared with validated outcomes', () => {
    const inferred = applyBehaviorFeedbackToCognitiveState(
      buildState(),
      buildDecision(),
      buildQualifiedOutcome({
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
    )
    const validated = applyBehaviorFeedbackToCognitiveState(
      buildState(),
      buildDecision(),
      buildQualifiedOutcome({
        provenance: 'validated',
        confidence: 0.96,
        evidence: {
          userContinuationObserved: true,
          responseAccepted: true,
          explicitCorrection: false,
          engagementObserved: true,
          sessionContinuation: true,
          manualValidation: true,
        },
      }),
    )

    expect(validated.engagementLevel - 0.57).toBeGreaterThan(inferred.engagementLevel - 0.57)
    expect(validated.stability - 0.7).toBeGreaterThan(inferred.stability - 0.7)
  })
})