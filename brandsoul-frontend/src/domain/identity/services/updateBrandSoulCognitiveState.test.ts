import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulDecision, BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import { updateBrandSoulCognitiveState } from './updateBrandSoulCognitiveState'

function buildState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'neutral',
    tensionLevel: 0.48,
    focusLevel: 0.56,
    engagementLevel: 0.54,
    dominantDrive: 'assist',
    stability: 0.78,
    adaptationMomentum: 0.18,
    lastStateUpdateAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

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
    confidence: 0.52,
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
        before: 0.52,
        after: 0.52,
        delta: 0,
      },
    },
    ...overrides,
  }
}

describe('updateBrandSoulCognitiveState', () => {
  it('updates support interactions gradually without drastic jumps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:10:00.000Z'))

    const nextState = updateBrandSoulCognitiveState(
      buildState(),
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
        confidence: 0.86,
      }),
      buildMemoryInfluence({
        applied: true,
        influenceStrength: 0.18,
        signalsUsed: [
          {
            category: 'recent-context',
            memoryId: 'support-topic:1',
            subject: 'support-context',
            signal: 'support-topic',
            matchedTerms: ['troca'],
            priorityScore: 0.7,
          },
        ],
        impact: {
          confidence: {
            before: 0.46,
            after: 0.86,
            delta: 0.4,
          },
          intent: {
            before: 'general',
            after: 'support',
          },
          action: {
            before: 'inform',
            after: 'support',
          },
        },
      }),
    )

    expect(nextState.currentMode).toBe('neutral')
    expect(nextState.dominantDrive).toBe('clarify')
    expect(nextState.tensionLevel).toBeGreaterThan(0.48)
    expect(nextState.tensionLevel).toBeLessThanOrEqual(0.56)
    expect(nextState.focusLevel).toBeGreaterThan(0.56)
    expect(nextState.engagementLevel).toBeGreaterThan(0.54)
    expect(nextState.adaptationMomentum).toBeGreaterThan(0.18)
    expect(nextState.stability).toBeLessThan(0.78)
    expect(nextState.stability).toBeGreaterThan(0.66)
    expect(nextState.lastStateUpdateAt).toBe('2026-04-15T12:10:00.000Z')
  })

  it('lets repeated exploration continuity shift mode over time', () => {
    const explorationDecision = buildDecision({
      intent: 'product-discovery',
      action: 'guide',
      responsePlan: {
        kind: 'product',
        topic: 'Vestido Aurora',
        intentGoal: 'guide-product-selection',
        requiredData: ['preco 249.90'],
        optionalCloseStyle: 'guide-choice',
      },
      confidence: 0.74,
    })
    const explorationMemory = buildMemoryInfluence({
      applied: true,
      influenceStrength: 0.14,
      signalsUsed: [
        {
          category: 'persistent-trend',
          memoryId: 'trend:intent:product-discovery',
          subject: 'session-trend',
          signal: 'product-discovery',
          matchedTerms: [],
          priorityScore: 0.98,
        },
      ],
      impact: {
        confidence: {
          before: 0.46,
          after: 0.74,
          delta: 0.28,
        },
        intent: {
          before: 'general',
          after: 'product-discovery',
        },
        action: {
          before: 'inform',
          after: 'guide',
        },
      },
    })

    const midState = updateBrandSoulCognitiveState(buildState(), explorationDecision, explorationMemory)
    const lateState = updateBrandSoulCognitiveState(midState, explorationDecision, explorationMemory)
    const finalState = updateBrandSoulCognitiveState(lateState, explorationDecision, explorationMemory)

    expect(midState.currentMode).toBe('neutral')
    expect(finalState.currentMode).toBe('exploration')
    expect(finalState.dominantDrive).toBe('explore')
    expect(finalState.adaptationMomentum).toBeGreaterThan(lateState.adaptationMomentum)
    expect(finalState.engagementLevel).toBeGreaterThan(lateState.engagementLevel)
  })
})