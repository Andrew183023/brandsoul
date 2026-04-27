import { describe, expect, it } from 'vitest'

import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { resolveBrandSoulAdaptiveDecisionCore } from './resolveBrandSoulAdaptiveDecisionCore'

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

function buildState(overrides: Partial<BrandSoulCognitiveState> = {}): BrandSoulCognitiveState {
  return {
    currentMode: 'neutral',
    tensionLevel: 0.48,
    focusLevel: 0.56,
    engagementLevel: 0.54,
    dominantDrive: 'assist',
    stability: 0.78,
    adaptationMomentum: 0.58,
    lastStateUpdateAt: '2026-04-18T12:00:00.000Z',
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

function buildStrategyProfile(overrides: Partial<BrandSoulStrategyProfile> = {}): BrandSoulStrategyProfile {
  return {
    strategyBias: {
      supportBias: 0.25,
      explorationBias: 0.25,
      conversionBias: 0.25,
      cautionBias: 0.25,
    },
    dominantStrategy: 'balanced',
    adaptationConfidence: 0.38,
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
      support: 0.6,
      policy: 0.54,
      'product-discovery': 0.48,
    },
    actionPreferenceMatrix: {
      general: {
        inform: 0.34,
        support: 0.62,
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
    totalInteractions: 6,
    reliableEvidenceCount: 4.8,
    rollingSuccessRate: 0.76,
    rollingContinuationRate: 0.72,
    rollingEngagementDelta: 0.22,
    actionOutcomes: {},
    intentOutcomes: {},
    lastUpdatedAt: '2026-04-18T12:00:00.000Z',
    ...overrides,
  }
}

describe('resolveBrandSoulAdaptiveDecisionCore', () => {
  it('lets the adaptive core become the primary decider when confidence, evidence and safety align', () => {
    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'me explica melhor',
      baseDecision: buildDecision(),
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile(),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
      historicalSignals: buildHistoricalSignals(),
      memorySignals: buildDecision().memoryInfluence,
    })

    expect(result.decisionSource).toBe('adaptive-core')
    expect(result.decision.intent).toBe('support')
    expect(result.decision.action).toBe('support')
    expect(result.semanticProposal.fallbackRequired).toBe(false)
    expect(result.core.decisionGenerators).toContain('intent-generator')
    expect(result.core.fallbackConditions).toEqual([])
    expect(result.core.learningConfidence).toBeGreaterThan(0.44)
    expect(result.core.adaptivePriority).toBeGreaterThan(0.34)
  })

  it('falls back to the heuristic core when evidence is too weak for structural override', () => {
    const baseDecision = buildDecision()
    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'me explica melhor',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile(),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 0.4,
        rollingSuccessRate: 0.5,
        rollingContinuationRate: 0.48,
      }),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.decisionSource).toBe('heuristic-fallback')
    expect(result.decision).toEqual(baseDecision)
    expect(result.core.fallbackConditions).toContain('insufficient-evidence')
  })

  it('honors the global kill switch and keeps the heuristic fallback mandatory', () => {
    const baseDecision = buildDecision()
    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'oi',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        safetyProfile: {
          ...buildProfile().safetyProfile,
          killSwitchEnabled: true,
        },
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile(),
      historicalSignals: buildHistoricalSignals(),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.decisionSource).toBe('heuristic-fallback')
    expect(result.decision).toEqual(baseDecision)
    expect(result.core.fallbackConditions).toContain('kill-switch')
  })

  it('allows a low-risk greeting lane to enrich style without structural override in a critical semantic zone', () => {
    const baseDecision = buildDecision({
      intent: 'greeting',
      action: 'inform',
      responsePlan: {
        kind: 'greeting',
        topic: 'saudacao',
        intentGoal: 'open-conversation',
        requiredData: [],
        optionalCloseStyle: 'open-dialogue',
      },
      confidence: 0.82,
    })

    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'oi',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        actionSelectionBias: {
          ...buildProfile().actionSelectionBias,
          inform: 0.58,
          support: 0.24,
          guide: 0.22,
          sell: 0.14,
        },
        adaptationConfidence: 0.28,
        decisionDrift: 0.12,
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile({
        policyDrift: 0.2,
      }),
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 0,
      }),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.semanticProposal.semanticZone).toBe('critical')
    expect(result.decisionSource).toBe('adaptive-core')
    expect(result.decision.intent).toBe('greeting')
    expect(result.decision.action).toBe('inform')
    expect(result.decision.responsePlan.kind).toBe('greeting')
    expect(result.decision.responsePlan.intentGoal).toBe('open-conversation')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('contextual-clarity')
    expect(result.decision.confidence).toBe(baseDecision.confidence)
    expect(result.core.decisionGenerators).toEqual(['style-generator'])
    expect(result.core.fallbackConditions).toEqual([])
  })

  it('keeps commercial decisions blocked outside the low-risk lane', () => {
    const baseDecision = buildDecision({
      intent: 'promotion',
      action: 'sell',
      responsePlan: {
        kind: 'promotion',
        topic: 'oferta',
        intentGoal: 'highlight-active-promotion',
        requiredData: [],
        optionalCloseStyle: 'explore-promotion',
      },
      confidence: 0.74,
    })

    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'quero comprar agora',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        adaptationConfidence: 0.28,
        decisionDrift: 0.12,
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile({
        policyDrift: 0.2,
      }),
      historicalSignals: buildHistoricalSignals(),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.semanticProposal.semanticZone).toBe('critical')
    expect(result.decisionSource).toBe('heuristic-fallback')
    expect(result.decision).toEqual(baseDecision)
    expect(result.core.fallbackConditions).toContain('unsafe-semantic-zone')
  })

  it('keeps fallback mandatory when the adaptive candidate would change intent in the low-risk lane', () => {
    const baseDecision = buildDecision({
      intent: 'general',
      action: 'inform',
      responsePlan: {
        kind: 'general',
        topic: 'ajuda',
        intentGoal: 'continue-contextual-guidance',
        requiredData: [],
        optionalCloseStyle: 'open-dialogue',
      },
      confidence: 0.62,
    })

    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'me ajuda melhor',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        intentSelectionWeights: {
          ...buildProfile().intentSelectionWeights,
          general: 0.3,
          support: 0.88,
        },
        actionSelectionBias: {
          ...buildProfile().actionSelectionBias,
          inform: 0.58,
          support: 0.82,
        },
        adaptationConfidence: 0.38,
        decisionDrift: 0.12,
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile({
        policyDrift: 0.2,
      }),
      historicalSignals: buildHistoricalSignals(),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.semanticProposal.semanticZone).toBe('critical')
    expect(result.decisionSource).toBe('heuristic-fallback')
    expect(result.decision).toEqual(baseDecision)
    expect(result.core.fallbackConditions).toContain('unsafe-semantic-zone')
  })

  it('allows a simple general question through the low-risk lane with style-only enrichment', () => {
    const baseDecision = buildDecision({
      intent: 'general',
      action: 'inform',
      responsePlan: {
        kind: 'general',
        topic: 'entrega',
        intentGoal: 'continue-contextual-guidance',
        requiredData: [],
        optionalCloseStyle: 'open-dialogue',
      },
      confidence: 0.58,
    })

    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'como funciona a entrega?',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        actionSelectionBias: {
          ...buildProfile().actionSelectionBias,
          inform: 0.61,
          support: 0.22,
          guide: 0.18,
          sell: 0.12,
        },
        adaptationConfidence: 0.28,
        decisionDrift: 0.12,
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile({
        policyDrift: 0.2,
      }),
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 0,
      }),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.semanticProposal.semanticZone).toBe('critical')
    expect(result.decisionSource).toBe('adaptive-core')
    expect(result.decision.intent).toBe('general')
    expect(result.decision.action).toBe('inform')
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('contextual-clarity')
    expect(result.core.decisionGenerators).toEqual(['style-generator'])
    expect(result.core.fallbackConditions).toEqual([])
  })

  it('allows acknowledgments through the low-risk lane with no structural decision changes', () => {
    const baseDecision = buildDecision({
      confidence: 0.52,
    })

    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'ok, entendi',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        actionSelectionBias: {
          ...buildProfile().actionSelectionBias,
          inform: 0.6,
          support: 0.2,
          guide: 0.16,
          sell: 0.08,
        },
        adaptationConfidence: 0.28,
        decisionDrift: 0.12,
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile({
        policyDrift: 0.2,
      }),
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 0,
      }),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.semanticProposal.semanticZone).toBe('critical')
    expect(result.decisionSource).toBe('adaptive-core')
    expect(result.decision.intent).toBe(baseDecision.intent)
    expect(result.decision.action).toBe(baseDecision.action)
    expect(result.decision.responsePlan.kind).toBe(baseDecision.responsePlan.kind)
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('contextual-clarity')
    expect(result.core.fallbackConditions).toEqual([])
  })

  it('allows light follow-up messages through the low-risk lane with style-only enrichment', () => {
    const baseDecision = buildDecision({
      confidence: 0.54,
    })

    const result = resolveBrandSoulAdaptiveDecisionCore({
      userMessage: 'pode repetir isso?',
      baseDecision,
      currentState: buildState(),
      adaptiveDecisionProfile: buildProfile({
        actionSelectionBias: {
          ...buildProfile().actionSelectionBias,
          inform: 0.59,
          support: 0.24,
          guide: 0.18,
          sell: 0.1,
        },
        adaptationConfidence: 0.28,
        decisionDrift: 0.12,
      }),
      strategyProfile: buildStrategyProfile(),
      policyProfile: buildPolicyProfile({
        policyDrift: 0.2,
      }),
      historicalSignals: buildHistoricalSignals({
        reliableEvidenceCount: 0,
      }),
      memorySignals: baseDecision.memoryInfluence,
    })

    expect(result.semanticProposal.semanticZone).toBe('critical')
    expect(result.decisionSource).toBe('adaptive-core')
    expect(result.decision.intent).toBe(baseDecision.intent)
    expect(result.decision.action).toBe(baseDecision.action)
    expect(result.decision.responsePlan.optionalCloseStyle).toBe('contextual-clarity')
    expect(result.core.decisionGenerators).toEqual(['style-generator'])
    expect(result.core.fallbackConditions).toEqual([])
  })
})