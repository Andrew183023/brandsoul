import { describe, expect, it } from 'vitest'

import type { BrandSoulDecision, BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import { applyCognitiveStateDecisionBias } from './applyCognitiveStateDecisionBias'

function buildDecision(overrides: Partial<BrandSoulDecision> = {}): BrandSoulDecision {
  return {
    intent: 'general',
    action: 'inform',
    responsePlan: {
      kind: 'general',
      topic: 'acolhimento inicial',
      intentGoal: 'continue-contextual-guidance',
      requiredData: [],
      optionalCloseStyle: 'contextual-clarity',
    },
    statePatch: {},
    memoryCandidates: [],
    confidence: 0.46,
    memoryInfluence: buildMemoryInfluence(),
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
        before: 0.46,
        after: 0.46,
        delta: 0,
      },
    },
    ...overrides,
  }
}

function buildState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'neutral',
    tensionLevel: 0.48,
    focusLevel: 0.56,
    engagementLevel: 0.54,
    dominantDrive: 'assist',
    stability: 0.78,
    adaptationMomentum: 0.52,
    lastStateUpdateAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

describe('applyCognitiveStateDecisionBias', () => {
  it('shifts low-confidence general decisions toward support when the state is support-oriented', () => {
    const result = applyCognitiveStateDecisionBias(
      buildState({
        currentMode: 'support',
        dominantDrive: 'clarify',
        tensionLevel: 0.66,
        focusLevel: 0.68,
        engagementLevel: 0.62,
      }),
      buildDecision(),
      buildMemoryInfluence(),
    )

    expect(result.applied).toBe(true)
    expect(result.influenceStrength).toBeLessThanOrEqual(0.2)
    expect(result.decision.intent).toBe('support')
    expect(result.decision.action).toBe('support')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('safe-guidance')
    expect(result.cognitiveStateInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      signalsUsed: expect.arrayContaining([
        expect.objectContaining({
          category: 'mode',
          signal: 'support',
        }),
        expect.objectContaining({
          category: 'drive',
          signal: 'clarify',
        }),
      ]),
      impact: {
        confidence: {
          before: 0.46,
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        intent: {
          before: 'general',
          after: 'support',
        },
        action: {
          before: 'inform',
          after: 'support',
        },
        responsePlanStyle: {
          before: 'contextual-clarity',
          after: 'safe-guidance',
        },
      },
    })
  })

  it('does not replace a critical decision even with a strong conflicting state', () => {
    const result = applyCognitiveStateDecisionBias(
      buildState({
        currentMode: 'support',
        dominantDrive: 'clarify',
        tensionLevel: 0.84,
        focusLevel: 0.74,
      }),
      buildDecision({
        intent: 'promotion',
        action: 'sell',
        confidence: 0.94,
        responsePlan: {
          kind: 'promotion',
          topic: 'Semana da Aurora',
          intentGoal: 'highlight-active-promotion',
          requiredData: ['15% off'],
          optionalCloseStyle: 'explore-promotion',
        },
      }),
      buildMemoryInfluence({
        applied: true,
        influenceStrength: 0.16,
      }),
    )

    expect(result.decision.intent).toBe('promotion')
    expect(result.decision.action).toBe('sell')
    expect(result.influenceStrength).toBeLessThanOrEqual(0.2)
    expect(result.cognitiveStateInfluence.impact.intent).toBeUndefined()
    expect(result.cognitiveStateInfluence.impact.action).toBeUndefined()
  })
})