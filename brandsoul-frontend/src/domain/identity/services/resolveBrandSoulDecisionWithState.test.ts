import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { resolveBrandSoulDecisionWithState } from './resolveBrandSoulDecisionWithState'

function buildContext(): BrandSoulContext {
  return {
    identity: {
      id: 'identity-1',
      brandName: 'BrandSoul Store',
      essence: 'presenca consultiva e clara',
      tone: {
        primary: 'consultative',
        modifiers: ['warm'],
      },
      relationalStyle: {
        primaryMode: 'guide',
        connectionIntent: 'orientacao util e segura',
        trustSignals: ['clareza', 'contexto'],
      },
      commercialRole: 'consultant',
      immutableTraits: ['clara', 'honesta'],
      adaptableTraits: [],
      identityRules: [
        {
          key: 'rule-1',
          description: 'sempre responder com clareza contextual',
        },
      ],
      guardrails: [],
      visualSignature: {
        bodyMotif: 'coeso',
        coreMotif: 'focado',
        fieldMotif: 'contido',
        motionPrinciples: ['clareza'],
      },
    },
    state: {
      currentMood: 'calm',
      currentIntent: 'assist',
      currentFocus: 'acolhimento inicial',
      energyLevel: 0.6,
      interactionMode: 'response',
      lastUpdatedAt: '2026-04-15T10:00:00.000Z',
    },
    memory: [
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.36,
        createdAt: '2026-04-15T09:45:00.000Z',
      },
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.36,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ],
    conversation: {
      lastMessages: [],
      relevantMemoryKeys: [],
    },
    commerce: {
      products: [
        {
          id: 'p-1',
          name: 'Vestido Aurora',
          description: 'Vestido leve para ocasioes especiais.',
          price: 249.9,
          category: 'moda',
          available: true,
        },
      ],
      promotions: [
        {
          id: 'promo-1',
          title: 'Semana da Aurora',
          discountLabel: '15% off',
          active: true,
        },
      ],
      businessHours: [
        {
          day: 'monday',
          open: '09:00',
          close: '18:00',
        },
      ],
      policies: [
        {
          key: 'troca',
          title: 'Politica de troca',
          description: 'Trocas em ate 7 dias com etiqueta preservada.',
        },
      ],
      activeCampaigns: [],
    },
  }
}

function buildCognitiveState(): BrandSoulCognitiveState {
  return {
    currentMode: 'neutral',
    tensionLevel: 0.48,
    focusLevel: 0.56,
    engagementLevel: 0.54,
    dominantDrive: 'assist',
    stability: 0.78,
    adaptationMomentum: 0.52,
    lastStateUpdateAt: '2026-04-15T11:00:00.000Z',
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

function buildAdaptiveDecisionProfile(overrides: Partial<BrandSoulAdaptiveDecisionProfile> = {}): BrandSoulAdaptiveDecisionProfile {
  return {
    intentSelectionWeights: {
      general: 0.34,
      greeting: 0.3,
      support: 0.72,
      policy: 0.66,
      'product-discovery': 0.52,
      promotion: 0.44,
      purchase: 0.42,
      'business-hours': 0.88,
      'guardrail-blocked': 1,
    },
    actionSelectionBias: {
      inform: 0.34,
      guide: 0.42,
      support: 0.74,
      sell: 0.3,
      refuse: 0.02,
    },
    confidenceScalingProfile: {
      baseScale: 1.03,
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
      exploitationBias: 0.7,
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
      support: 0.6,
      policy: 0.54,
      'product-discovery': 0.48,
    },
    actionPreferenceMatrix: {
      general: {
        inform: 0.34,
        support: 0.62,
      },
      'product-discovery': {
        guide: 0.74,
        sell: 0.4,
      },
    },
    confidenceAdjustmentProfile: {
      baseAdjustment: 0.02,
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

function buildHistoricalSignals(overrides: Partial<BrandSoulHistoricalSignals> = {}): BrandSoulHistoricalSignals {
  return {
    totalInteractions: 4,
    reliableEvidenceCount: 4,
    rollingSuccessRate: 0.72,
    rollingContinuationRate: 0.68,
    rollingEngagementDelta: 0.18,
    actionOutcomes: {
      support: {
        sampleSize: 2,
        successRate: 0.74,
        continuationRate: 0.7,
        averageEngagementDelta: 0.22,
      },
    },
    intentOutcomes: {
      support: {
        sampleSize: 2,
        successRate: 0.74,
        continuationRate: 0.7,
        averageEngagementDelta: 0.22,
      },
    },
    lastUpdatedAt: '2026-04-15T11:00:00.000Z',
    ...overrides,
  }
}

describe('resolveBrandSoulDecisionWithState', () => {
  it('returns the original decision plus the evolved cognitive state', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:20:00.000Z'))

    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me mostra algo',
      currentState: buildCognitiveState(),
    })

    expect(result.decision.intent).toBe('product-discovery')
    expect(result.decision.action).toBe('guide')
    expect(result.adaptiveDecisionCore.decisionSource).toBe('heuristic-fallback')
    expect(result.decision.cognitiveStateInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      signalsUsed: expect.arrayContaining([
        expect.objectContaining({
          category: 'focus',
          signal: 'decision-focus',
        }),
        expect.objectContaining({
          category: 'engagement',
          signal: 'interaction-continuity',
        }),
      ]),
      impact: {
        confidence: {
          before: expect.any(Number),
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        intent: undefined,
        action: undefined,
        responsePlanStyle: undefined,
      },
    })
    expect(result.nextCognitiveState.currentMode).toBe('exploration')
    expect(result.nextCognitiveState.dominantDrive).toBe('explore')
    expect(result.nextPolicyProfile.policyStability).toBeGreaterThan(0)
    expect(result.nextAdaptiveDecisionProfile.adaptationConfidence).toBeGreaterThan(0)
    expect(result.nextStrategyProfile.dominantStrategy).toBe('balanced')
    expect(result.nextHistoricalSignals.totalInteractions).toBe(0)
    expect(result.nextCognitiveState.lastStateUpdateAt).toBe('2026-04-15T12:20:00.000Z')
    expect(result.nextCognitiveState.engagementLevel).toBeGreaterThan(0.54)
    expect(result.nextCognitiveState.stability).toBeLessThanOrEqual(0.78)
  })

  it('keeps adaptive-core semantics stable while still applying support-oriented presentation bias', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:25:00.000Z'))

    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me explica melhor',
      currentState: {
        ...buildCognitiveState(),
        currentMode: 'support',
        dominantDrive: 'clarify',
        tensionLevel: 0.66,
        focusLevel: 0.68,
        engagementLevel: 0.61,
      },
    })

    expect(result.decision.intent).toBe('general')
    expect(result.decision.action).toBe('inform')
    expect(result.decision.responsePlan.kind).toBe('general')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('contextual-clarity')
    expect(result.decision.confidence).toBeGreaterThan(0.46)
    expect(result.decision.cognitiveStateInfluence?.applied).toBe(true)
    expect(result.decision.cognitiveStateInfluence?.impact.intent).toBeUndefined()
  })

  it('keeps the base semantic contract when policy runs under adaptive-core sovereignty', () => {
    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me explica melhor',
      currentState: buildCognitiveState(),
      currentPolicyProfile: buildPolicyProfile({
        decisionWeights: {
          intentShiftWeight: 1,
          actionShiftWeight: 0.5,
          confidenceWeight: 0.4,
          memoryWeight: 0.08,
        },
        policyStability: 0.94,
      }),
      historicalSignals: buildHistoricalSignals(),
    })

    expect(result.decision.intent).toBe('general')
    expect(result.decision.action).toBe('inform')
    expect(result.decision.responsePlan.kind).toBe('general')
    expect(result.nextPolicyProfile.intentPriorityOverrides.support).toBeGreaterThan(0.5)
    expect(result.nextHistoricalSignals.totalInteractions).toBe(4)
  })

  it('lets the adaptive decision layer reshape an ambiguous base decision before policy', () => {
    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me explica melhor',
      currentState: buildCognitiveState(),
      currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile(),
      currentPolicyProfile: buildPolicyProfile({
        decisionWeights: {
          intentShiftWeight: 0,
          actionShiftWeight: 0,
          confidenceWeight: 0,
          memoryWeight: 0.08,
        },
      }),
      historicalSignals: buildHistoricalSignals(),
    })

    expect(result.adaptiveDecisionCore.decisionSource).toBe('adaptive-core')
    expect(result.decision.intent).toBe('support')
    expect(result.decision.action).toBe('support')
    expect(result.decision.responsePlan.kind).toBe('policy')
  })

  it('preserves adaptive-core semantic authority after arbitration while downstream layers only enrich', () => {
    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'mostra algo',
      currentState: {
        ...buildCognitiveState(),
        currentMode: 'exploration',
        dominantDrive: 'explore',
        engagementLevel: 0.72,
        focusLevel: 0.66,
      },
      currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile({
        intentSelectionWeights: {
          general: 0.34,
          greeting: 0.3,
          support: 0.46,
          policy: 0.44,
          'product-discovery': 0.76,
          promotion: 0.42,
          purchase: 0.4,
          'business-hours': 0.88,
          'guardrail-blocked': 1,
        },
        actionSelectionBias: {
          inform: 0.32,
          guide: 0.74,
          support: 0.32,
          sell: 0.66,
          refuse: 0.02,
        },
        explorationVsExploitationBalance: {
          explorationBias: 0.74,
          exploitationBias: 0.62,
        },
      }),
      currentPolicyProfile: buildPolicyProfile({
        decisionWeights: {
          intentShiftWeight: 0.18,
          actionShiftWeight: 1,
          confidenceWeight: 0.3,
          memoryWeight: 0.08,
        },
        actionPreferenceMatrix: {
          general: {
            inform: 0.34,
            support: 0.48,
          },
          'product-discovery': {
            guide: 0.42,
            sell: 0.84,
          },
        },
      }),
      currentStrategyProfile: buildStrategyProfile({
        strategyBias: {
          supportBias: 0.2,
          explorationBias: 0.66,
          conversionBias: 0.82,
          cautionBias: 0.12,
        },
        dominantStrategy: 'conversion',
        adaptationConfidence: 0.62,
      }),
      historicalSignals: buildHistoricalSignals({
        actionOutcomes: {
          guide: {
            sampleSize: 3,
            successRate: 0.78,
            continuationRate: 0.74,
            averageEngagementDelta: 0.24,
          },
          sell: {
            sampleSize: 2,
            successRate: 0.61,
            continuationRate: 0.52,
            averageEngagementDelta: 0.08,
          },
        },
        intentOutcomes: {
          'product-discovery': {
            sampleSize: 3,
            successRate: 0.79,
            continuationRate: 0.76,
            averageEngagementDelta: 0.26,
          },
        },
      }),
    })

    expect(result.adaptiveDecisionCore.decisionSource).toBe('adaptive-core')
    expect(result.adaptiveDecisionCore.decision.intent).toBe('product-discovery')
    expect(result.adaptiveDecisionCore.decision.action).toBe('guide')
    expect(result.decision.intent).toBe(result.adaptiveDecisionCore.decision.intent)
    expect(result.decision.action).toBe(result.adaptiveDecisionCore.decision.action)
    expect(result.decision.responsePlan.kind).toBe(result.adaptiveDecisionCore.decision.responsePlan.kind)
    expect(result.decision.responsePlan.intentGoal).toBe(result.adaptiveDecisionCore.decision.responsePlan.intentGoal)
    expect(result.decision.responsePlan.topic).toBe(result.adaptiveDecisionCore.decision.responsePlan.topic)
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('guide-choice')
  })

  it('forces heuristic fallback when the adaptive core lacks enough evidence for structural override', () => {
    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me explica melhor',
      currentState: buildCognitiveState(),
      currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile(),
      currentPolicyProfile: buildPolicyProfile({
        decisionWeights: {
          intentShiftWeight: 0,
          actionShiftWeight: 0,
          confidenceWeight: 0,
          memoryWeight: 0.08,
        },
      }),
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 0.2,
        rollingSuccessRate: 0.48,
        rollingContinuationRate: 0.45,
      }),
    })

    expect(result.adaptiveDecisionCore.decisionSource).toBe('heuristic-fallback')
    expect(result.adaptiveDecisionCore.core.fallbackConditions).toContain('insufficient-evidence')
    expect(result.decision.intent).toBe('general')
  })

  it('does not let cognitive state overwrite a critical current intent', () => {
    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'Tem alguma promocao agora?',
      currentState: {
        ...buildCognitiveState(),
        currentMode: 'support',
        dominantDrive: 'clarify',
        tensionLevel: 0.82,
        focusLevel: 0.74,
      },
    })

    expect(result.decision.intent).toBe('promotion')
    expect(result.decision.action).toBe('sell')
    expect(result.decision.responsePlan.kind).toBe('promotion')
    expect(result.decision.cognitiveStateInfluence?.impact.intent).toBeUndefined()
  })

  it('can prioritize conversion action on exploratory commercial decisions with strong conversion state', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:26:00.000Z'))

    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me mostra algo',
      currentState: {
        ...buildCognitiveState(),
        currentMode: 'conversion',
        dominantDrive: 'sell',
        engagementLevel: 0.72,
        focusLevel: 0.64,
      },
    })

    expect(result.decision.intent).toBe('product-discovery')
    expect(result.decision.action).toBe('sell')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('explore-promotion')
    expect(result.decision.cognitiveStateInfluence?.impact.action).toEqual({
      before: 'guide',
      after: 'sell',
    })
  })

  it('adapts the strategy profile and uses strong historical conversion bias in the wrapper', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:28:00.000Z'))

    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me mostra algo',
      currentState: {
        ...buildCognitiveState(),
        currentMode: 'exploration',
        dominantDrive: 'explore',
        engagementLevel: 0.68,
      },
      currentStrategyProfile: buildStrategyProfile({
        strategyBias: {
          supportBias: 0.22,
          explorationBias: 0.48,
          conversionBias: 0.67,
          cautionBias: 0.21,
        },
        dominantStrategy: 'conversion',
        adaptationConfidence: 0.54,
      }),
      interactionOutcome: {
        interactionSuccess: 0.91,
        userContinuation: true,
        engagementDelta: 0.28,
        signalStrength: 0.8,
      },
    })

    expect(result.decision.action).toBe('sell')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('explore-promotion')
    expect(result.nextStrategyProfile.dominantStrategy).toBe('conversion')
    expect(result.nextStrategyProfile.strategyBias.conversionBias).toBeGreaterThan(0.67)
    expect(result.nextStrategyProfile.adaptationConfidence).toBeGreaterThan(0.54)
    expect(result.nextStrategyProfile.lastStrategyUpdateAt).toBe('2026-04-15T12:28:00.000Z')
  })

  it('applies behavior feedback to the next cognitive state when an interaction outcome is provided', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:30:00.000Z'))

    const result = resolveBrandSoulDecisionWithState({
      context: buildContext(),
      userMessage: 'me mostra algo',
      currentState: buildCognitiveState(),
      interactionOutcome: {
        interactionSuccess: 0.88,
        userContinuation: true,
        engagementDelta: 0.35,
        signalStrength: 0.78,
      },
    })

    expect(result.decision.intent).toBe('product-discovery')
    expect(result.decision.behaviorFeedbackInfluence).toEqual({
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
          before: expect.any(Number),
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        engagementLevel: {
          before: expect.any(Number),
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        stability: {
          before: expect.any(Number),
          after: expect.any(Number),
          delta: expect.any(Number),
        },
        adaptationMomentum: {
          before: expect.any(Number),
          after: expect.any(Number),
          delta: expect.any(Number),
        },
      },
    })
    expect(result.nextHistoricalSignals.totalInteractions).toBe(1)
    expect(result.nextHistoricalSignals.reliableEvidenceCount).toBeGreaterThan(0.4)
    expect(result.qualifiedInteractionOutcome?.provenance).toBe('observed')
    expect(result.nextPolicyProfile.policyStability).toBeGreaterThan(0)
    expect(result.nextAdaptiveDecisionProfile.adaptationConfidence).toBeGreaterThan(0.18)
    expect(result.nextCognitiveState.engagementLevel).toBeGreaterThan(0.6)
    expect(result.nextCognitiveState.stability).toBeGreaterThan(0.7)
    expect(result.nextCognitiveState.adaptationMomentum).toBeGreaterThan(0.52)
    expect(result.nextStrategyProfile.adaptationConfidence).toBeGreaterThan(0.18)
    expect(result.nextCognitiveState.lastStateUpdateAt).toBe('2026-04-15T12:30:00.000Z')
  })
})