import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'
import type { BrandSoulAdaptiveDecisionProfile } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulPolicyProfile } from '../../domain/identity/contracts/BrandSoulPolicyProfile'
import type { BrandSoulStrategyProfile } from '../../domain/identity/contracts/BrandSoulStrategyProfile'
import { resolveFalsePositiveGain, resolvePublicPresenceVisualFlow, getOrCreateBrandSoulMemoryWriter, resetBrandSoulMemoryWriterRegistry } from './brandSoulPresenceRuntime'
import { buildBrandSoulContextFromPublicPresence } from './services/buildBrandSoulContextFromPublicPresence'
import { deriveCognitivePresenceIndicator } from './services/deriveCognitivePresenceIndicator'
import { deriveBrandSoulStateFromPublicPresence } from './services/deriveBrandSoulStateFromPublicPresence'

function buildPresence(): PublicPresenceResponse {
  return {
    entity: {
      id: 'entity-1',
      name: 'Aurora Flux',
      tagline: 'Uma presenca publica em movimento.',
      species: 'entidade publica',
    },
    visual: {
      intensity: 0.82,
      presenceHealth: {
        trend: 'expanding',
        intensity: 'high',
        summary: 'Expandindo com leitura relacional consistente.',
        recentSignals: [],
      },
    },
    relational: {
      relationshipLabel: 'vinculo em crescimento',
      tier: 'engaged',
    },
    trajectory: [],
    exports: [],
    cta: {
      type: 'interact',
      label: 'Interagir',
    },
    deprecatedFallbacks: [],
  }
}

function buildAdaptiveDecisionProfile(): BrandSoulAdaptiveDecisionProfile {
  return {
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
    confidenceScalingProfile: {
      baseScale: 1.03,
      intentScales: {
        'product-discovery': 1.04,
      },
      actionScales: {
        guide: 1.04,
      },
      minScale: 0.94,
      maxScale: 1.08,
      evidenceThreshold: 3,
    },
    explorationVsExploitationBalance: {
      explorationBias: 0.74,
      exploitationBias: 0.62,
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
  }
}

function buildPolicyProfile(): BrandSoulPolicyProfile {
  return {
    decisionWeights: {
      intentShiftWeight: 0.18,
      actionShiftWeight: 1,
      confidenceWeight: 0.3,
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
        support: 0.48,
      },
      'product-discovery': {
        guide: 0.42,
        sell: 0.84,
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
  }
}

function buildStrategyProfile(): BrandSoulStrategyProfile {
  return {
    strategyBias: {
      supportBias: 0.2,
      explorationBias: 0.66,
      conversionBias: 0.82,
      cautionBias: 0.12,
    },
    dominantStrategy: 'conversion',
    adaptationConfidence: 0.62,
    lastStrategyUpdateAt: '2026-04-15T11:00:00.000Z',
  }
}

describe('brandSoulPresenceRuntime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reuses the same local in-memory writer for the same session id and isolates different sessions', () => {
    resetBrandSoulMemoryWriterRegistry()

    const firstWriter = getOrCreateBrandSoulMemoryWriter('session-a')
    const secondWriter = getOrCreateBrandSoulMemoryWriter('session-a')
    const thirdWriter = getOrCreateBrandSoulMemoryWriter('session-b')

    expect(secondWriter).toBe(firstWriter)
    expect(thirdWriter).not.toBe(firstWriter)
  })

  it('derives a coherent BrandSoul state from public presence data', () => {
    const state = deriveBrandSoulStateFromPublicPresence(buildPresence(), '2026-04-14T15:00:00.000Z')

    expect(state.currentMood).toBe('celebratory')
    expect(state.currentIntent).toBe('recommend')
    expect(state.interactionMode).toBe('response')
    expect(state.energyLevel).toBe(0.84)
  })

  it('builds a local cognition context and resolves a visual flow for a user signal', async () => {
    resetBrandSoulMemoryWriterRegistry()
    const presence = buildPresence()
    const currentState = deriveBrandSoulStateFromPublicPresence(presence, '2026-04-14T15:00:00.000Z')
    const context = buildBrandSoulContextFromPublicPresence(presence, currentState)
    const memorySessionId = 'public-session:entity-1:user-1'
    const result = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:05:00.000Z',
      memorySessionId,
    })

    expect(context.identity.brandName).toBe('Aurora Flux')
    expect(result.debug.decision.action).toBe('support')
    expect(result.debug.visualState.visualIntensity).toBe('balanced')
    expect((result.debug.runtimePatch.core?.pulseMultiplier ?? 1)).toBeLessThan(1.05)
    expect(result.indicator.intentLabel).toBe('suporte')
    expect(result.indicator.actionLabel).toBe('amparo')
    expect(result.indicator.presenceLabel).toBe('presenca em ajuste')
    expect(result.nextState.currentIntent).toBe('support')
    expect(result.nextCognitiveState.currentMode).toBe('neutral')
    expect(result.nextCognitiveState.dominantDrive).toBe('clarify')
    expect(result.nextAdaptiveDecisionProfile.adaptationConfidence).toBeGreaterThan(0)
    expect(result.nextPolicyProfile.policyStability).toBeGreaterThan(0)
    expect(result.nextStrategyProfile.dominantStrategy).toBe('exploration')
    expect(result.nextStrategyProfile.adaptationConfidence).toBeGreaterThan(0.18)
    expect(result.nextHistoricalSignals.totalInteractions).toBe(1)
    expect(result.nextState.lastUpdatedAt).toBe('2026-04-14T15:05:00.000Z')
    expect(result.responseText).toContain('Aurora Flux')
    expect(result.debug.memoryPersistence.status).toBe('completed')
    expect(result.debug.previousTerminalAuthority).toBeUndefined()
    expect(result.debug.terminalAuthorityShift).toBe('initial-turn')
    expect(result.debug.authorityRegimeCorrelation).toEqual({
      previousRegime: undefined,
      currentRegime: 'forming',
      regimeChanged: false,
      label: 'turno inicial em forming',
    })
    expect(result.debug.correlationType).toBeUndefined()
    expect(result.debug.structuralTransitionQuality).toBeUndefined()
    expect(result.debug.structuralTransitionDirection).toBeUndefined()
    expect(result.debug.structuralTransitionStability).toBeUndefined()
    expect(result.debug.structuralTransitionMaturity).toBeUndefined()
    expect(result.debug.falsePositiveGain).toBe(false)
    expect(result.debug.falsePositiveCause).toBeUndefined()
    expect(result.debug.causeCategory).toBeUndefined()
    expect(result.debug.secondaryCauses).toEqual([])
    expect(result.debug.causeRanking).toEqual([])
    expect(result.debug.temporalCauseChain).toBeUndefined()
    expect(result.debug.causeTimeline).toEqual([])
    expect(result.debug.causeOriginTurn).toBeUndefined()
    expect(result.debug.falsePositiveReason).toBeUndefined()
    expect(result.debug.terminalAuthority).toBe('heuristic-fallback')
    expect(result.debug.semanticFrozen).toBe(false)
    expect(result.debug.terminalReason).toContain('heuristic-fallback')
    expect(result.debug.interactionOutcome).toEqual({
      interactionSuccess: expect.any(Number),
      userContinuation: false,
      engagementDelta: expect.any(Number),
      signalStrength: expect.any(Number),
    })
    expect(result.debug.qualifiedInteractionOutcome).toEqual({
      outcome: result.debug.interactionOutcome,
      provenance: 'inferred',
      confidence: expect.any(Number),
      evidence: {
        userContinuationObserved: false,
        responseAccepted: false,
        explicitCorrection: false,
        engagementObserved: false,
        sessionContinuation: false,
        manualValidation: false,
      },
      observedAt: expect.any(String),
    })
    expect(result.debug.currentStrategyProfile).toEqual(result.debug.nextStrategyProfile)
    expect(result.debug.currentAdaptiveDecisionProfile).toEqual(result.debug.nextAdaptiveDecisionProfile)
    expect(result.debug.currentPolicyProfile).toEqual(result.debug.nextPolicyProfile)
    expect(result.debug.currentHistoricalSignals).toEqual(result.debug.nextHistoricalSignals)
    expect(result.debug.memoryPersistence.dispatchOutcome.writtenMemoryIds).toEqual([
      expect.stringMatching(/^support-topic:/),
    ])
    expect(getOrCreateBrandSoulMemoryWriter(memorySessionId).getAll()).toHaveLength(1)
    expect(result.debug.localMemoryAudit).toEqual({
      recentSemanticMerges: [],
      totalSemanticMergeCount: 0,
    })
    expect(result.debug.decision.memoryInfluence).toEqual({
      applied: false,
      influenceStrength: 0,
      signalsUsed: [],
      impact: {
        confidence: {
          before: expect.any(Number),
          after: expect.any(Number),
          delta: 0,
        },
        intent: undefined,
        action: undefined,
      },
    })
    expect(result.debug.decision.cognitiveStateInfluence?.applied).toBe(true)
    expect(result.debug.decision.behaviorFeedbackInfluence).toEqual({
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
  })

  it('keeps persisted local memory across interactions in the same session', async () => {
    resetBrandSoulMemoryWriterRegistry()
    vi.useFakeTimers()
    const presence = buildPresence()
    const currentState = deriveBrandSoulStateFromPublicPresence(presence, '2026-04-14T15:00:00.000Z')
    const memorySessionId = 'public-session:entity-1:user-1'

    vi.setSystemTime(new Date('2026-04-14T15:05:00.000Z'))
    const firstInteractionResult = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:05:00.000Z',
      memorySessionId,
    })

    const persistedMemoryWriter = getOrCreateBrandSoulMemoryWriter(memorySessionId)
    const storedAfterFirstInteraction = persistedMemoryWriter.getAll()

    expect(storedAfterFirstInteraction).toHaveLength(1)
    expect(storedAfterFirstInteraction[0]?.relevanceScore).toBe(0.64)
    const firstStoredTimestamp = storedAfterFirstInteraction[0]?.createdAt
    expect(firstStoredTimestamp).toEqual(expect.any(String))

    vi.setSystemTime(new Date('2026-04-14T15:06:00.000Z'))
    const secondInteractionResult = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'isso continua',
      currentState: {
        ...currentState,
        currentIntent: 'support',
      },
      currentCognitiveState: firstInteractionResult.nextCognitiveState,
      currentAdaptiveDecisionProfile: firstInteractionResult.nextAdaptiveDecisionProfile,
      currentPolicyProfile: firstInteractionResult.nextPolicyProfile,
      currentStrategyProfile: firstInteractionResult.nextStrategyProfile,
      historicalSignals: firstInteractionResult.nextHistoricalSignals,
      now: '2026-04-14T15:06:00.000Z',
      memorySessionId,
    })

    const storedAfterSecondInteraction = getOrCreateBrandSoulMemoryWriter(memorySessionId).getAll()
    expect(storedAfterSecondInteraction).toEqual([
      expect.objectContaining({
        subject: 'support-context',
        signal: 'support-topic',
      }),
    ])
    expect(storedAfterSecondInteraction[0]?.relevanceScore).toBeCloseTo(0.69, 10)
    expect(new Date(storedAfterSecondInteraction[0]?.createdAt ?? '').getTime()).toBeGreaterThanOrEqual(
      new Date(firstStoredTimestamp ?? '').getTime(),
    )
    expect(getOrCreateBrandSoulMemoryWriter(memorySessionId).getSemanticMergeAuditLog()).toEqual([
      {
        originalMemoryId: expect.stringMatching(/^support-topic:/),
        mergedIntoMemoryId: expect.stringMatching(/^support-topic:/),
        reason: 'same subject and signal, same context key, shared attributes: topic',
        similarityMatch: {
          subjectMatched: true,
          signalMatched: true,
          contextKeyMatched: true,
          sharedAttributes: ['topic'],
        },
      },
    ])
    expect(secondInteractionResult.debug.localMemoryAudit).toEqual({
      recentSemanticMerges: [
        {
          originalMemoryId: expect.stringMatching(/^support-topic:/),
          mergedIntoMemoryId: expect.stringMatching(/^support-topic:/),
          reason: 'same subject and signal, same context key, shared attributes: topic',
          similarityMatch: {
            subjectMatched: true,
            signalMatched: true,
            contextKeyMatched: true,
            sharedAttributes: ['topic'],
          },
        },
      ],
      totalSemanticMergeCount: 1,
    })
    expect(secondInteractionResult.debug.decision.memoryInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      signalsUsed: [
        expect.objectContaining({
          category: 'recent-context',
          signal: 'support-topic',
        }),
      ],
      impact: {
        confidence: {
          before: expect.any(Number),
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
      },
    })
    expect(secondInteractionResult.debug.interactionOutcome.userContinuation).toBe(true)
    expect(secondInteractionResult.debug.qualifiedInteractionOutcome?.provenance).toBe('observed')
    expect(secondInteractionResult.debug.decision.behaviorFeedbackInfluence?.applied).toBe(true)
    expect(secondInteractionResult.nextHistoricalSignals.totalInteractions).toBe(2)
    expect(secondInteractionResult.nextHistoricalSignals.reliableEvidenceCount).toBeGreaterThan(firstInteractionResult.nextHistoricalSignals.reliableEvidenceCount)
    expect(secondInteractionResult.debug.currentAdaptiveDecisionProfile).toEqual(firstInteractionResult.nextAdaptiveDecisionProfile)
    expect(secondInteractionResult.nextAdaptiveDecisionProfile.adaptationConfidence).toBeGreaterThanOrEqual(firstInteractionResult.nextAdaptiveDecisionProfile.adaptationConfidence)
    expect(secondInteractionResult.debug.currentPolicyProfile).toEqual(firstInteractionResult.nextPolicyProfile)
    expect(secondInteractionResult.debug.currentHistoricalSignals).toEqual(firstInteractionResult.nextHistoricalSignals)
    expect(secondInteractionResult.nextStrategyProfile.adaptationConfidence).toBeGreaterThan(firstInteractionResult.nextStrategyProfile.adaptationConfidence)
    expect(secondInteractionResult.debug.currentStrategyProfile).toEqual(firstInteractionResult.nextStrategyProfile)
    expect(secondInteractionResult.debug.previousTerminalAuthority).toBe(firstInteractionResult.debug.terminalAuthority)
    expect(secondInteractionResult.debug.terminalAuthorityShift).toBe('no-change')
    expect(secondInteractionResult.debug.authorityRegimeCorrelation).toEqual({
      previousRegime: 'forming',
      currentRegime: 'forming',
      regimeChanged: false,
      label: 'sem troca de autoridade, regime permaneceu em forming',
    })
    expect(secondInteractionResult.debug.correlationType).toBeUndefined()
    expect(secondInteractionResult.debug.structuralTransitionQuality).toBeUndefined()
    expect(secondInteractionResult.debug.structuralTransitionDirection).toBeUndefined()
    expect(secondInteractionResult.debug.structuralTransitionStability).toBeUndefined()
    expect(secondInteractionResult.debug.structuralTransitionMaturity).toBeUndefined()
    expect(secondInteractionResult.debug.falsePositiveGain).toBe(false)
    expect(secondInteractionResult.debug.falsePositiveCause).toBeUndefined()
    expect(secondInteractionResult.debug.causeCategory).toBeUndefined()
    expect(secondInteractionResult.debug.secondaryCauses).toEqual([])
    expect(secondInteractionResult.debug.causeRanking).toEqual([])
    expect(secondInteractionResult.debug.temporalCauseChain).toBeUndefined()
    expect(secondInteractionResult.debug.causeTimeline).toEqual([])
    expect(secondInteractionResult.debug.causeOriginTurn).toBeUndefined()
    expect(secondInteractionResult.debug.falsePositiveReason).toBeUndefined()
    expect(firstInteractionResult.debug.dominantEvidence).toEqual({
      signal: expect.any(String),
      weight: expect.any(Number),
    })
    expect(firstInteractionResult.debug.dominantReason).toEqual(expect.any(String))
    expect(firstInteractionResult.debug.adaptiveSovereigntyHistory).toEqual([
      expect.objectContaining({
        decisionSource: firstInteractionResult.debug.adaptiveDecisionCore.decisionSource,
        semanticZone: firstInteractionResult.debug.adaptiveDecisionCore.semanticProposal.semanticZone,
      }),
    ])
    expect(secondInteractionResult.debug.adaptiveSovereigntyHistory).toHaveLength(2)
    expect(secondInteractionResult.debug.adaptiveSovereigntyHistory[0]).toEqual(
      expect.objectContaining({
        decisionSource: firstInteractionResult.debug.adaptiveDecisionCore.decisionSource,
        semanticZone: firstInteractionResult.debug.adaptiveDecisionCore.semanticProposal.semanticZone,
      }),
    )
    expect(secondInteractionResult.debug.adaptiveSovereigntyHistory[1]).toEqual(
      expect.objectContaining({
        decisionSource: secondInteractionResult.debug.adaptiveDecisionCore.decisionSource,
        semanticZone: secondInteractionResult.debug.adaptiveDecisionCore.semanticProposal.semanticZone,
      }),
    )
  })

  it('exposes adaptive-core terminal authority when semantic authority is frozen', async () => {
    resetBrandSoulMemoryWriterRegistry()
    const presence = buildPresence()
    const currentState = deriveBrandSoulStateFromPublicPresence(presence, '2026-04-14T15:00:00.000Z')
    const memorySessionId = 'public-session:entity-1:user-2'

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:04:00.000Z',
      memorySessionId,
    })

    const result = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'mostra algo',
      currentState,
      currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile(),
      currentPolicyProfile: buildPolicyProfile(),
      currentStrategyProfile: buildStrategyProfile(),
      historicalSignals: {
        totalInteractions: 4,
        reliableEvidenceCount: 4,
        rollingSuccessRate: 0.72,
        rollingContinuationRate: 0.68,
        rollingEngagementDelta: 0.18,
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
        lastUpdatedAt: '2026-04-15T11:00:00.000Z',
      },
      now: '2026-04-14T15:05:00.000Z',
      memorySessionId,
    })

    expect(result.debug.adaptiveDecisionCore.decisionSource).toBe('adaptive-core')
    expect(result.debug.previousTerminalAuthority).toBe('heuristic-fallback')
    expect(result.debug.terminalAuthorityShift).toBe('heuristic-fallback -> adaptive-core')
    expect(result.debug.authorityRegimeCorrelation).toEqual({
      previousRegime: 'forming',
      currentRegime: 'forming',
      regimeChanged: false,
      label: 'heuristic-fallback -> adaptive-core sem mudanca de regime: forming',
    })
    expect(result.debug.correlationType).toBe('isolated-shift')
    expect(result.debug.structuralTransitionQuality).toBeUndefined()
    expect(result.debug.structuralTransitionDirection).toBeUndefined()
    expect(result.debug.structuralTransitionStability).toBeUndefined()
    expect(result.debug.structuralTransitionMaturity).toBeUndefined()
    expect(result.debug.falsePositiveGain).toBe(false)
    expect(result.debug.falsePositiveCause).toBeUndefined()
    expect(result.debug.causeCategory).toBeUndefined()
    expect(result.debug.secondaryCauses).toEqual([])
    expect(result.debug.causeRanking).toEqual([])
    expect(result.debug.temporalCauseChain).toBeUndefined()
    expect(result.debug.causeTimeline).toEqual([])
    expect(result.debug.causeOriginTurn).toBeUndefined()
    expect(result.debug.falsePositiveReason).toBeUndefined()
    expect(result.debug.terminalAuthority).toBe('adaptive-core')
    expect(result.debug.semanticFrozen).toBe(true)
    expect(result.debug.terminalReason).toContain('froze downstream rewrites')
  })

  it('classifies authority shift with regime change as a structural transition', async () => {
    resetBrandSoulMemoryWriterRegistry()
    const presence = buildPresence()
    const currentState = deriveBrandSoulStateFromPublicPresence(presence, '2026-04-14T15:00:00.000Z')
    const memorySessionId = 'public-session:entity-1:user-3'

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:01:00.000Z',
      memorySessionId,
    })

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:02:00.000Z',
      memorySessionId,
    })

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:03:00.000Z',
      memorySessionId,
    })

    const result = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'mostra algo',
      currentState,
      currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile(),
      currentPolicyProfile: buildPolicyProfile(),
      currentStrategyProfile: buildStrategyProfile(),
      historicalSignals: {
        totalInteractions: 4,
        reliableEvidenceCount: 4,
        rollingSuccessRate: 0.72,
        rollingContinuationRate: 0.68,
        rollingEngagementDelta: 0.18,
        actionOutcomes: {
          guide: {
            sampleSize: 3,
            successRate: 0.78,
            continuationRate: 0.74,
            averageEngagementDelta: 0.24,
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
        lastUpdatedAt: '2026-04-15T11:00:00.000Z',
      },
      now: '2026-04-14T15:04:00.000Z',
      memorySessionId,
    })

    expect(result.debug.previousTerminalAuthority).toBe('heuristic-fallback')
    expect(result.debug.terminalAuthorityShift).toBe('heuristic-fallback -> adaptive-core')
    expect(result.debug.authorityRegimeCorrelation).toEqual({
      previousRegime: 'fallback stable',
      currentRegime: 'transitioning',
      regimeChanged: true,
      label: 'heuristic-fallback -> adaptive-core com mudanca de regime: fallback stable -> transitioning',
    })
    expect(result.debug.correlationType).toBe('structural-transition')
    expect(result.debug.structuralTransitionQuality).toEqual({
      previousLabel: 'fallback stable',
      currentLabel: 'transitioning',
      label: 'fallback stable -> transitioning',
    })
    expect(result.debug.structuralTransitionDirection).toBe('quality-up')
    expect(result.debug.structuralTransitionStability).toEqual({
      previousStrength: 1,
      currentStrength: 2,
      label: '1 -> 2',
    })
    expect(result.debug.structuralTransitionMaturity).toBe('transient-gain')
    expect(result.debug.falsePositiveGain).toBe(false)
    expect(result.debug.falsePositiveCause).toBeUndefined()
    expect(result.debug.causeCategory).toBeUndefined()
    expect(result.debug.secondaryCauses).toEqual([])
    expect(result.debug.causeRanking).toEqual([])
    expect(result.debug.temporalCauseChain).toBeUndefined()
    expect(result.debug.causeTimeline).toEqual([])
    expect(result.debug.causeOriginTurn).toBeUndefined()
    expect(result.debug.falsePositiveReason).toBeUndefined()
  })

  it('classifies regressive structural transitions when authority shift degrades regime quality', async () => {
    resetBrandSoulMemoryWriterRegistry()
    const presence = buildPresence()
    const currentState = deriveBrandSoulStateFromPublicPresence(presence, '2026-04-14T15:00:00.000Z')
    const memorySessionId = 'public-session:entity-1:user-4'

    for (const timestamp of ['2026-04-14T15:01:00.000Z', '2026-04-14T15:02:00.000Z', '2026-04-14T15:03:00.000Z']) {
      await resolvePublicPresenceVisualFlow({
        presence,
        userMessage: 'mostra algo',
        currentState,
        currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile(),
        currentPolicyProfile: buildPolicyProfile(),
        currentStrategyProfile: buildStrategyProfile(),
        historicalSignals: {
          totalInteractions: 4,
          reliableEvidenceCount: 4,
          rollingSuccessRate: 0.72,
          rollingContinuationRate: 0.68,
          rollingEngagementDelta: 0.18,
          actionOutcomes: {
            guide: {
              sampleSize: 3,
              successRate: 0.78,
              continuationRate: 0.74,
              averageEngagementDelta: 0.24,
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
          lastUpdatedAt: '2026-04-15T11:00:00.000Z',
        },
        now: timestamp,
        memorySessionId,
      })
    }

    const result = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:04:00.000Z',
      memorySessionId,
    })

    expect(result.debug.previousTerminalAuthority).toBe('adaptive-core')
    expect(result.debug.terminalAuthorityShift).toBe('adaptive-core -> heuristic-fallback')
    expect(result.debug.authorityRegimeCorrelation).toEqual({
      previousRegime: 'adaptive stabilizing',
      currentRegime: 'transitioning',
      regimeChanged: true,
      label: 'adaptive-core -> heuristic-fallback com mudanca de regime: adaptive stabilizing -> transitioning',
    })
    expect(result.debug.correlationType).toBe('structural-transition')
    expect(result.debug.structuralTransitionQuality).toEqual({
      previousLabel: 'adaptive stabilizing / safe consolidated',
      currentLabel: 'transitioning',
      label: 'adaptive stabilizing / safe consolidated -> transitioning',
    })
    expect(result.debug.structuralTransitionDirection).toBe('quality-down')
    expect(result.debug.structuralTransitionStability).toEqual({
      previousStrength: 4,
      currentStrength: 2,
      label: '4 -> 2',
    })
    expect(result.debug.structuralTransitionMaturity).toBe('regressive')
    expect(result.debug.falsePositiveGain).toBe(false)
    expect(result.debug.falsePositiveCause).toBeUndefined()
    expect(result.debug.causeCategory).toBeUndefined()
    expect(result.debug.secondaryCauses).toEqual([])
    expect(result.debug.causeRanking).toEqual([])
    expect(result.debug.temporalCauseChain).toBeUndefined()
    expect(result.debug.causeTimeline).toEqual([])
    expect(result.debug.causeOriginTurn).toBeUndefined()
    expect(result.debug.falsePositiveReason).toBeUndefined()
  })

  it('flags a false positive gain when a transient structural gain is immediately reversed', async () => {
    resetBrandSoulMemoryWriterRegistry()
    const presence = buildPresence()
    const currentState = deriveBrandSoulStateFromPublicPresence(presence, '2026-04-14T15:00:00.000Z')
    const memorySessionId = 'public-session:entity-1:user-5'

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:01:00.000Z',
      memorySessionId,
    })

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:02:00.000Z',
      memorySessionId,
    })

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:03:00.000Z',
      memorySessionId,
    })

    await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'mostra algo',
      currentState,
      currentAdaptiveDecisionProfile: buildAdaptiveDecisionProfile(),
      currentPolicyProfile: buildPolicyProfile(),
      currentStrategyProfile: buildStrategyProfile(),
      historicalSignals: {
        totalInteractions: 4,
        reliableEvidenceCount: 4,
        rollingSuccessRate: 0.72,
        rollingContinuationRate: 0.68,
        rollingEngagementDelta: 0.18,
        actionOutcomes: {
          guide: {
            sampleSize: 3,
            successRate: 0.78,
            continuationRate: 0.74,
            averageEngagementDelta: 0.24,
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
        lastUpdatedAt: '2026-04-15T11:00:00.000Z',
      },
      now: '2026-04-14T15:04:00.000Z',
      memorySessionId,
    })

    const result = await resolvePublicPresenceVisualFlow({
      presence,
      userMessage: 'preciso de ajuda agora',
      currentState,
      now: '2026-04-14T15:05:00.000Z',
      memorySessionId,
    })

    expect(result.debug.terminalAuthorityShift).toBe('adaptive-core -> heuristic-fallback')
    expect(result.debug.structuralTransitionMaturity).toBeUndefined()
    expect(result.debug.falsePositiveGain).toBe(true)
    expect(result.debug.falsePositiveCause).toBe('safe zone was lost after the transient gain')
    expect(result.debug.causeCategory).toBe('safe-zone-loss')
    expect(result.debug.secondaryCauses).toEqual([
      'adaptive evidence weakened and fallback conditions took control',
      'intent/action coherence shifted away from the transient adaptive gain',
    ])
    expect(result.debug.causeRanking.slice(0, 3)).toEqual([
      {
        category: 'safe-zone-loss',
        cause: 'safe zone was lost after the transient gain',
        relevance: 1,
      },
      {
        category: 'consistency-drop',
        cause: 'adaptive evidence weakened and fallback conditions took control',
        relevance: 0.8,
      },
      {
        category: 'semantic-reversal',
        cause: 'intent/action coherence shifted away from the transient adaptive gain',
        relevance: 0.7,
      },
    ])
    expect(result.debug.temporalCauseChain).toEqual({
      classification: 'sequential-causes',
      rootCause: 'intent/action coherence shifted away from the transient adaptive gain',
      rootCategory: 'semantic-reversal',
      derivedCauses: [
        'safe zone was lost after the transient gain',
        'adaptive evidence weakened and fallback conditions took control',
        'terminal authority reverted from adaptive-core to heuristic-fallback',
      ],
      label: 't-1: semantic-reversal -> t: safe-zone-loss -> t: consistency-drop -> t: authority-reversal',
    })
    expect(result.debug.causeOriginTurn).toBe('t-1')
    expect(result.debug.causeTimeline.slice(0, 4)).toEqual([
      {
        turn: 't-1',
        category: 'semantic-reversal',
        cause: 'intent/action coherence shifted away from the transient adaptive gain',
        role: 'root-cause',
        relation: 'sequential-causes',
        relevance: 0.7,
      },
      {
        turn: 't',
        category: 'safe-zone-loss',
        cause: 'safe zone was lost after the transient gain',
        role: 'derived-causes',
        relation: 'sequential-causes',
        relevance: 1,
      },
      {
        turn: 't',
        category: 'consistency-drop',
        cause: 'adaptive evidence weakened and fallback conditions took control',
        role: 'derived-causes',
        relation: 'sequential-causes',
        relevance: 0.8,
      },
      {
        turn: 't',
        category: 'authority-reversal',
        cause: 'terminal authority reverted from adaptive-core to heuristic-fallback',
        role: 'derived-causes',
        relation: 'sequential-causes',
        relevance: 0.6,
      },
    ])
    expect(result.debug.falsePositiveReason).toBe('transient gain failed after leaving the safe semantic zone')
  })

  it('distinguishes sequential causes when the root cause starts before the final fallback turn', () => {
    const result = resolveFalsePositiveGain({
      previousHistory: [
        {
          observedAt: '2026-04-14T15:01:00.000Z',
          decisionSource: 'heuristic-fallback',
          semanticZone: 'safe',
          intent: 'support',
          action: 'support',
        },
        {
          observedAt: '2026-04-14T15:02:00.000Z',
          decisionSource: 'heuristic-fallback',
          semanticZone: 'safe',
          intent: 'support',
          action: 'support',
        },
        {
          observedAt: '2026-04-14T15:03:00.000Z',
          decisionSource: 'adaptive-core',
          semanticZone: 'critical',
          intent: 'product-discovery',
          action: 'guide',
        },
      ],
      currentHistory: [
        {
          observedAt: '2026-04-14T15:01:00.000Z',
          decisionSource: 'heuristic-fallback',
          semanticZone: 'safe',
          intent: 'support',
          action: 'support',
        },
        {
          observedAt: '2026-04-14T15:02:00.000Z',
          decisionSource: 'heuristic-fallback',
          semanticZone: 'safe',
          intent: 'support',
          action: 'support',
        },
        {
          observedAt: '2026-04-14T15:03:00.000Z',
          decisionSource: 'adaptive-core',
          semanticZone: 'critical',
          intent: 'product-discovery',
          action: 'guide',
        },
        {
          observedAt: '2026-04-14T15:04:00.000Z',
          decisionSource: 'heuristic-fallback',
          semanticZone: 'critical',
          intent: 'support',
          action: 'support',
        },
      ],
      terminalAuthorityShift: 'adaptive-core -> heuristic-fallback',
      currentFallbackConditions: [],
    })

    expect(result.falsePositiveGain).toBe(true)
    expect(result.falsePositiveCause).toBe('intent/action coherence shifted away from the transient adaptive gain')
    expect(result.causeCategory).toBe('semantic-reversal')
    expect(result.temporalCauseChain).toEqual({
      classification: 'sequential-causes',
      rootCause: 'intent/action coherence shifted away from the transient adaptive gain',
      rootCategory: 'semantic-reversal',
      derivedCauses: ['terminal authority reverted from adaptive-core to heuristic-fallback'],
      label: 't-1: semantic-reversal -> t: authority-reversal',
    })
    expect(result.causeOriginTurn).toBe('t-1')
    expect(result.causeTimeline).toEqual([
      {
        turn: 't-1',
        category: 'semantic-reversal',
        cause: 'intent/action coherence shifted away from the transient adaptive gain',
        role: 'root-cause',
        relation: 'sequential-causes',
        relevance: 1,
      },
      {
        turn: 't',
        category: 'authority-reversal',
        cause: 'terminal authority reverted from adaptive-core to heuristic-fallback',
        role: 'derived-causes',
        relation: 'sequential-causes',
        relevance: 0.6,
      },
    ])
  })

  it('derives a contained indicator for softer cognitive states', () => {
    const indicator = deriveCognitivePresenceIndicator({
      decision: {
        intent: 'support',
        action: 'support',
        responsePlan: {
          kind: 'policy',
          topic: 'troca',
          intentGoal: 'support-policy-clarity',
          requiredData: ['janela segura'],
        },
        statePatch: {},
        memoryCandidates: [],
        confidence: 0.88,
        memoryInfluence: {
          applied: false,
          influenceStrength: 0,
          signalsUsed: [],
          impact: {
            confidence: {
              before: 0.88,
              after: 0.88,
              delta: 0,
            },
          },
        },
      },
      visualState: {
        visualIntensity: 'soft',
        tensionLevel: 0.22,
        stability: 0.9,
        fieldSpread: 0.38,
        coreActivity: 0.34,
      },
    })

    expect(indicator.intentLabel).toBe('suporte')
    expect(indicator.actionLabel).toBe('amparo')
    expect(indicator.presenceLabel).toBe('presenca em contencao')
  })
})