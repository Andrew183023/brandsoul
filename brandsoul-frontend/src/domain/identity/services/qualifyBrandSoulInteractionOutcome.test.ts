import { describe, expect, it } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import { qualifyBrandSoulInteractionOutcome, resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'

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
        trustSignals: ['clareza'],
      },
      commercialRole: 'consultant',
      immutableTraits: ['clara'],
      adaptableTraits: [],
      identityRules: [],
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
      currentFocus: 'acolhimento',
      energyLevel: 0.6,
      interactionMode: 'response',
      lastUpdatedAt: '2026-04-18T10:00:00.000Z',
    },
    memory: [],
    conversation: {
      lastMessages: [],
      relevantMemoryKeys: [],
    },
    commerce: {
      products: [],
      promotions: [],
      businessHours: [],
      policies: [],
      activeCampaigns: [],
    },
  }
}

describe('qualifyBrandSoulInteractionOutcome', () => {
  it('marks purely local heuristic outcomes as inferred with reduced weight', () => {
    const result = qualifyBrandSoulInteractionOutcome({
      rawInteractionOutcome: {
        interactionSuccess: 0.64,
        userContinuation: false,
        engagementDelta: 0.08,
        signalStrength: 0.52,
      },
      userMessage: 'oi',
      context: buildContext(),
      observedAt: '2026-04-18T10:05:00.000Z',
    })

    expect(result.provenance).toBe('inferred')
    expect(result.confidence).toBeLessThan(0.6)
    expect(resolveQualifiedInteractionOutcomeWeight(result)).toBeLessThan(0.3)
  })

  it('marks strong explicit evidence as observed or validated', () => {
    const observed = qualifyBrandSoulInteractionOutcome({
      rawInteractionOutcome: {
        interactionSuccess: 0.82,
        userContinuation: true,
        engagementDelta: 0.24,
        signalStrength: 0.74,
      },
      userMessage: 'isso faz sentido, continua',
      context: buildContext(),
      historicalSignals: {
        totalInteractions: 2,
        reliableEvidenceCount: 1,
        rollingSuccessRate: 0.6,
        rollingContinuationRate: 0.6,
        rollingEngagementDelta: 0.1,
        actionOutcomes: {},
        intentOutcomes: {},
        lastUpdatedAt: '2026-04-18T10:00:00.000Z',
      },
      observedAt: '2026-04-18T10:05:00.000Z',
    })
    const validated = qualifyBrandSoulInteractionOutcome({
      rawInteractionOutcome: {
        interactionSuccess: 0.91,
        userContinuation: true,
        engagementDelta: 0.3,
        signalStrength: 0.8,
      },
      userMessage: 'ok',
      context: buildContext(),
      explicitFeedback: {
        manualValidation: true,
        responseAccepted: true,
      },
      observedAt: '2026-04-18T10:06:00.000Z',
    })

    expect(observed.provenance).toBe('observed')
    expect(observed.evidence.userContinuationObserved).toBe(true)
    expect(validated.provenance).toBe('validated')
    expect(validated.confidence).toBeGreaterThan(observed.confidence)
    expect(resolveQualifiedInteractionOutcomeWeight(validated)).toBeGreaterThan(resolveQualifiedInteractionOutcomeWeight(observed))
  })
})