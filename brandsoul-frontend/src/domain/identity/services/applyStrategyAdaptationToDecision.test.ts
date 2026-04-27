import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulDecision, BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { applyStrategyAdaptationToDecision } from './applyStrategyAdaptationToDecision'

function buildCognitiveState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'neutral',
    tensionLevel: 0.48,
    focusLevel: 0.56,
    engagementLevel: 0.54,
    dominantDrive: 'assist',
    stability: 0.78,
    adaptationMomentum: 0.32,
    lastStateUpdateAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

function buildMemoryInfluence(overrides: Partial<BrandSoulMemoryInfluence> = {}): BrandSoulMemoryInfluence {
  return {
    applied: false,
    influenceStrength: 0,
    signalsUsed: [],
    impact: {
      confidence: {
        before: 0.62,
        after: 0.62,
        delta: 0,
      },
    },
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
    confidence: 0.62,
    memoryInfluence: buildMemoryInfluence(),
    ...overrides,
  }
}

function buildStrategyProfile(overrides: Partial<BrandSoulStrategyProfile> = {}): BrandSoulStrategyProfile {
  return {
    strategyBias: {
      supportBias: 0.25,
      explorationBias: 0.25,
      conversionBias: 0.25,
      cautionBias: 0.25,
    },
    dominantStrategy: 'balanced',
    adaptationConfidence: 0.18,
    lastStrategyUpdateAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

function buildQualifiedOutcome(overrides: Partial<BrandSoulQualifiedInteractionOutcome> = {}): BrandSoulQualifiedInteractionOutcome {
  return {
    outcome: {
      interactionSuccess: 0.88,
      userContinuation: true,
      engagementDelta: 0.24,
      signalStrength: 0.78,
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
    observedAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

describe('applyStrategyAdaptationToDecision', () => {
  it('uses a strong conversion strategy bias to push exploratory decisions toward sell without changing the base resolver', () => {
    const result = applyStrategyAdaptationToDecision({
      currentStrategyProfile: buildStrategyProfile({
        strategyBias: {
          supportBias: 0.22,
          explorationBias: 0.45,
          conversionBias: 0.68,
          cautionBias: 0.18,
        },
        dominantStrategy: 'conversion',
        adaptationConfidence: 0.52,
      }),
      decision: buildDecision(),
      cognitiveState: buildCognitiveState({
        currentMode: 'exploration',
        dominantDrive: 'explore',
        engagementLevel: 0.67,
      }),
      memorySignals: buildMemoryInfluence(),
      behaviorFeedback: buildQualifiedOutcome(),
    })

    expect(result.decision.action).toBe('sell')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('explore-promotion')
    expect(result.updatedStrategyProfile.strategyBias.conversionBias).toBeGreaterThan(0.68)
    expect(result.updatedStrategyProfile.dominantStrategy).toBe('conversion')
  })

  it('pulls conversion strategy back toward support and caution after repeated weak selling feedback', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:12:00.000Z'))

    const result = applyStrategyAdaptationToDecision({
      currentStrategyProfile: buildStrategyProfile({
        strategyBias: {
          supportBias: 0.2,
          explorationBias: 0.24,
          conversionBias: 0.64,
          cautionBias: 0.22,
        },
        dominantStrategy: 'conversion',
        adaptationConfidence: 0.48,
      }),
      decision: buildDecision({
        action: 'sell',
        responsePlan: {
          kind: 'product',
          topic: 'Vestido Aurora',
          intentGoal: 'guide-product-selection',
          requiredData: ['preco 249.90'],
          optionalCloseStyle: 'explore-promotion',
        },
      }),
      cognitiveState: buildCognitiveState({
        currentMode: 'conversion',
        dominantDrive: 'sell',
      }),
      memorySignals: buildMemoryInfluence({
        applied: true,
        influenceStrength: 0.16,
      }),
      behaviorFeedback: buildQualifiedOutcome({
        outcome: {
          interactionSuccess: 0.22,
          userContinuation: false,
          engagementDelta: -0.35,
          signalStrength: 0.82,
        },
        provenance: 'observed',
        confidence: 0.82,
        evidence: {
          userContinuationObserved: false,
          responseAccepted: false,
          explicitCorrection: true,
          engagementObserved: true,
          sessionContinuation: true,
          manualValidation: false,
        },
      }),
    })

    expect(result.updatedStrategyProfile.strategyBias.conversionBias).toBeLessThan(0.64)
    expect(result.updatedStrategyProfile.strategyBias.supportBias).toBeGreaterThan(0.2)
    expect(result.updatedStrategyProfile.strategyBias.cautionBias).toBeGreaterThan(0.22)
    expect(result.updatedStrategyProfile.lastStrategyUpdateAt).toBe('2026-04-15T12:12:00.000Z')
  })

  it('discounts inferred outcomes compared with validated outcomes in strategy learning', () => {
    const inferred = applyStrategyAdaptationToDecision({
      currentStrategyProfile: buildStrategyProfile(),
      decision: buildDecision(),
      cognitiveState: buildCognitiveState({
        currentMode: 'exploration',
        dominantDrive: 'explore',
      }),
      memorySignals: buildMemoryInfluence(),
      behaviorFeedback: buildQualifiedOutcome({
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
    })
    const validated = applyStrategyAdaptationToDecision({
      currentStrategyProfile: buildStrategyProfile(),
      decision: buildDecision(),
      cognitiveState: buildCognitiveState({
        currentMode: 'exploration',
        dominantDrive: 'explore',
      }),
      memorySignals: buildMemoryInfluence(),
      behaviorFeedback: buildQualifiedOutcome({
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
    })

    expect(validated.updatedStrategyProfile.strategyBias.explorationBias - 0.25).toBeGreaterThan(
      inferred.updatedStrategyProfile.strategyBias.explorationBias - 0.25,
    )
    expect(validated.updatedStrategyProfile.adaptationConfidence - 0.18).toBeGreaterThan(
      inferred.updatedStrategyProfile.adaptationConfidence - 0.18,
    )
  })
})