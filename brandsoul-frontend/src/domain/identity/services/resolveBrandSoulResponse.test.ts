import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import { FailingBrandSoulMemoryWriter } from '../persistence/FailingBrandSoulMemoryWriter'
import { InMemoryBrandSoulMemoryWriter } from '../persistence/InMemoryBrandSoulMemoryWriter'
import { resolveBrandSoulDecision, resolveBrandSoulResponse, resolveBrandSoulResponseWithMemoryPersistence } from './resolveBrandSoulResponse'

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
      adaptableTraits: [
        {
          trait: 'ritmo comercial',
          adaptationScope: 'campaign-driven',
        },
      ],
      identityRules: [
        {
          key: 'rule-1',
          description: 'sempre responder com clareza contextual',
        },
      ],
      guardrails: [
        {
          key: 'medical-advice',
          description: 'nao oferecer orientacao medica ou diagnostico',
          severity: 'hard',
        },
      ],
      visualSignature: {
        bodyMotif: 'coeso',
        coreMotif: 'focado',
        fieldMotif: 'contido',
        motionPrinciples: ['clareza', 'presenca'],
      },
    },
    state: {
      currentMood: 'calm',
      currentIntent: 'assist',
      currentFocus: 'acolhimento inicial',
      energyLevel: 0.6,
      interactionMode: 'response',
      lastUpdatedAt: '2026-04-14T10:00:00.000Z',
    },
    memory: [],
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
      activeCampaigns: [
        {
          id: 'camp-1',
          name: 'Aurora de Outono',
          goal: 'conversao',
          active: true,
        },
      ],
    },
  }
}

function buildConversionFirstContext(): BrandSoulContext {
  const context = buildContext()
  context.identity = {
    ...context.identity,
    brandName: 'Impulse Brand',
    essence: 'presenca comercial de conversao',
    tone: {
      primary: 'confident',
      modifiers: ['direct'],
    },
    relationalStyle: {
      primaryMode: 'seller',
      connectionIntent: 'conduzir a melhor oferta com objetividade',
      trustSignals: ['objetividade'],
    },
    commercialRole: 'seller',
    immutableTraits: ['assertiva', 'comercial'],
    identityRules: [
      {
        key: 'rule-1',
        description: 'priorizar conversao e curadoria de oferta',
      },
    ],
  }

  return context
}

describe('resolveBrandSoulResponse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates an internal decision before rendering final text', () => {
    const decision = resolveBrandSoulDecision(buildContext(), 'Tem alguma promocao agora?')

    expect(decision.intent).toBe('promotion')
    expect(decision.action).toBe('sell')
    expect(decision.responsePlan.kind).toBe('promotion')
    expect(decision.responsePlan.topic).toBe('Semana da Aurora')
    expect(decision.responsePlan.intentGoal).toBe('highlight-active-promotion')
    expect(decision.statePatch.currentIntent).toBe('convert')
    expect(decision.memoryCandidates[0]?.key).toBe('promotion-context:promo-1')
    expect(decision.confidence).toBeGreaterThan(0.9)
    expect(decision.memoryInfluence).toEqual({
      applied: false,
      influenceStrength: 0,
      signalsUsed: [],
      impact: {
        confidence: {
          before: decision.confidence,
          after: decision.confidence,
          delta: 0,
        },
      },
    })
  })

  it('uses commerce context to resolve a promotional sales response', () => {
    const result = resolveBrandSoulResponse(buildContext(), 'Tem alguma promocao agora?')

    expect(result.detectedIntent).toBe('promotion')
    expect(result.actionType).toBe('sell')
    expect(result.responseText).toContain('Semana da Aurora')
    expect(result.stateUpdate.currentIntent).toBe('convert')
    expect(result.memoryToStore[0]?.key).toBe('promotion-context:promo-1')
  })

  it('blocks responses that collide with a hard guardrail', () => {
    const result = resolveBrandSoulResponse(buildContext(), 'Voce pode me dar um diagnostico medico?')

    expect(result.detectedIntent).toBe('guardrail-blocked')
    expect(result.actionType).toBe('refuse')
    expect(result.responseText).toContain('Nao posso orientar alem do limite definido pela identidade desta centelha')
    expect(result.stateUpdate.currentMood).toBe('protective')
  })

  it('filters low-relevance conversational memory noise through the sovereign memory policy', () => {
    const decision = resolveBrandSoulDecision(buildContext(), 'Me conta algo sobre a marca')

    expect(decision.intent).toBe('general')
    expect(decision.action).toBe('inform')
    expect(decision.memoryCandidates).toEqual([])
  })

  it('deduplicates candidate memory already present in context', () => {
    const context = buildContext()
    context.memory = [
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ]

    const decision = resolveBrandSoulDecision(context, 'Tem alguma promocao agora?')

    expect(decision.intent).toBe('promotion')
    expect(decision.memoryCandidates).toEqual([])
  })

  it('increases confidence when repeated product-interest memory reinforces the same intent', () => {
    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'Quais produtos voce tem da Aurora?')

    const contextWithMemory = buildContext()
    contextWithMemory.memory = [
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.82,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ]

    const memoryBiasedDecision = resolveBrandSoulDecision(contextWithMemory, 'Quais produtos voce tem da Aurora?')

    expect(baselineDecision.intent).toBe('product-discovery')
    expect(memoryBiasedDecision.intent).toBe('product-discovery')
    expect(memoryBiasedDecision.action).toBe('guide')
    expect(memoryBiasedDecision.confidence).toBeGreaterThan(baselineDecision.confidence)
    expect(memoryBiasedDecision.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(memoryBiasedDecision.memoryInfluence.impact.confidence.delta).toBeLessThanOrEqual(0.3)
    expect(memoryBiasedDecision.memoryInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      signalsUsed: [
        expect.objectContaining({
          category: 'repeated-intent',
          memoryId: 'product-interest:p-1',
          signal: 'product-interest',
        }),
        expect.objectContaining({
          category: 'strong-preference',
          memoryId: 'product-interest:p-1',
          signal: 'product-interest',
        }),
      ],
      impact: {
        confidence: {
          before: baselineDecision.confidence,
          after: memoryBiasedDecision.confidence,
          delta: expect.any(Number),
        },
        intent: undefined,
        action: undefined,
      },
    })
  })

  it('prioritizes support when recent support memory meets a continuation signal', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'isso continua')

    const contextWithRecurringSupport = buildContext()
    contextWithRecurringSupport.memory = [
      {
        key: 'support-topic:2026-04-14T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.69,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ]

    const memoryBiasedDecision = resolveBrandSoulDecision(contextWithRecurringSupport, 'isso continua')

    expect(baselineDecision.intent).toBe('general')
    expect(baselineDecision.action).toBe('inform')
    expect(memoryBiasedDecision.intent).toBe('support')
    expect(memoryBiasedDecision.action).toBe('support')
    expect(memoryBiasedDecision.confidence).toBeGreaterThan(baselineDecision.confidence)
    expect(memoryBiasedDecision.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(memoryBiasedDecision.memoryInfluence.impact.confidence.delta).toBeLessThanOrEqual(0.3)
    expect(memoryBiasedDecision.memoryInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      signalsUsed: [
        expect.objectContaining({
          category: 'recent-context',
          memoryId: 'support-topic:2026-04-14T10:00:00.000Z',
          signal: 'support-topic',
        }),
      ],
      impact: {
        confidence: {
          before: baselineDecision.confidence,
          after: memoryBiasedDecision.confidence,
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
  })

  it('uses clear preference memory to redirect a generic request toward guided product discovery', () => {
    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'algo minimalista para mim')

    const contextWithPreferenceMemory = buildContext()
    contextWithPreferenceMemory.memory = [
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.91,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ]

    const memoryBiasedDecision = resolveBrandSoulDecision(contextWithPreferenceMemory, 'algo minimalista para mim')

    expect(baselineDecision.intent).toBe('general')
    expect(baselineDecision.action).toBe('inform')
    expect(memoryBiasedDecision.intent).toBe('product-discovery')
    expect(memoryBiasedDecision.action).toBe('guide')
    expect(memoryBiasedDecision.confidence).toBeGreaterThan(baselineDecision.confidence)
    expect(memoryBiasedDecision.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(memoryBiasedDecision.memoryInfluence.impact.confidence.delta).toBeLessThanOrEqual(0.3)
    expect(memoryBiasedDecision.memoryInfluence).toEqual({
      applied: true,
      influenceStrength: expect.any(Number),
      signalsUsed: [
        expect.objectContaining({
          category: 'strong-preference',
          memoryId: 'identity-inference:style-preference',
          signal: 'identity-inference',
        }),
      ],
      impact: {
        confidence: {
          before: baselineDecision.confidence,
          after: memoryBiasedDecision.confidence,
          delta: expect.any(Number),
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
  })

  it('uses accumulated exploration trend to prioritize guided product discovery over time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'me mostra algo')

    const contextWithAccumulatedExplorationMemory = buildContext()
    contextWithAccumulatedExplorationMemory.memory = [
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.67,
        createdAt: '2026-04-15T09:45:00.000Z',
      },
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.7,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T08:30:00.000Z',
      },
    ]

    const decisionWithTrendBias = resolveBrandSoulDecision(contextWithAccumulatedExplorationMemory, 'me mostra algo')

    expect(baselineDecision.intent).toBe('general')
    expect(baselineDecision.action).toBe('inform')
    expect(decisionWithTrendBias.intent).toBe('product-discovery')
    expect(decisionWithTrendBias.action).toBe('guide')
    expect(decisionWithTrendBias.responsePlan.kind).toBe('product')
    expect(decisionWithTrendBias.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(decisionWithTrendBias.memoryInfluence.impact.confidence.delta).toBeLessThanOrEqual(0.5)
    expect(decisionWithTrendBias.memoryInfluence.signalsUsed).toEqual([
      expect.objectContaining({
        category: 'persistent-trend',
        memoryId: 'trend:intent:product-discovery',
        signal: 'product-discovery',
      }),
    ])
    expect(decisionWithTrendBias.memoryInfluence.impact.intent).toEqual({
      before: 'general',
      after: 'product-discovery',
    })
    expect(decisionWithTrendBias.memoryInfluence.impact.action).toEqual({
      before: 'inform',
      after: 'guide',
    })
  })

  it('uses accumulated support trend to prioritize support continuity over time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'isso continua')

    const contextWithAccumulatedSupportMemory = buildContext()
    contextWithAccumulatedSupportMemory.memory = [
      {
        key: 'support-topic:2026-04-10T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.58,
        createdAt: '2026-04-10T10:00:00.000Z',
      },
      {
        key: 'support-topic:2026-04-09T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.59,
        createdAt: '2026-04-09T10:00:00.000Z',
      },
    ]

    const decisionWithTrendBias = resolveBrandSoulDecision(contextWithAccumulatedSupportMemory, 'isso continua')

    expect(baselineDecision.intent).toBe('general')
    expect(baselineDecision.action).toBe('inform')
    expect(decisionWithTrendBias.intent).toBe('support')
    expect(decisionWithTrendBias.action).toBe('support')
    expect(decisionWithTrendBias.responsePlan.kind).toBe('policy')
    expect(decisionWithTrendBias.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(decisionWithTrendBias.memoryInfluence.signalsUsed).toEqual([
      expect.objectContaining({
        category: 'persistent-trend',
        memoryId: 'trend:intent:support',
        signal: 'support',
      }),
    ])
    expect(decisionWithTrendBias.memoryInfluence.impact.intent).toEqual({
      before: 'general',
      after: 'support',
    })
    expect(decisionWithTrendBias.memoryInfluence.impact.action).toEqual({
      before: 'inform',
      after: 'support',
    })
  })

  it('uses derived product preferences to prioritize commercial guidance and preferred product planning', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'me mostra algo')

    const contextWithDerivedProductPreference = buildContext()
    contextWithDerivedProductPreference.memory = [
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
    ]

    const decision = resolveBrandSoulDecision(contextWithDerivedProductPreference, 'me mostra algo')

    expect(baselineDecision.intent).toBe('general')
    expect(decision.intent).toBe('product-discovery')
    expect(decision.action).toBe('guide')
    expect(decision.responsePlan.kind).toBe('product')
    expect(decision.responsePlan.topic).toBe('Vestido Aurora')
    expect(decision.responsePlan.optionalCloseStyle).toBe('explore-promotion')
    expect(decision.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(decision.memoryInfluence.signalsUsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'derived-preference',
          signal: 'most-consulted-product',
        }),
        expect.objectContaining({
          category: 'derived-preference',
          signal: 'preferred-category',
        }),
      ]),
    )
  })

  it('uses derived support preference to prioritize a clearer support-oriented response for ambiguous help requests', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const baselineDecision = resolveBrandSoulDecision(buildContext(), 'me explica melhor')

    const contextWithDerivedSupportPreference = buildContext()
    contextWithDerivedSupportPreference.memory = [
      {
        key: 'support-topic:2026-04-15T09:40:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.55,
        createdAt: '2026-04-15T09:40:00.000Z',
      },
      {
        key: 'support-topic:2026-04-14T11:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.55,
        createdAt: '2026-04-14T11:00:00.000Z',
      },
    ]

    const decision = resolveBrandSoulDecision(contextWithDerivedSupportPreference, 'me explica melhor')

    expect(baselineDecision.intent).toBe('general')
    expect(decision.intent).toBe('support')
    expect(decision.action).toBe('support')
    expect(decision.responsePlan.kind).toBe('policy')
    expect(decision.responsePlan.optionalCloseStyle).toBe('safe-guidance')
    expect(decision.memoryInfluence.influenceStrength).toBeLessThanOrEqual(0.5)
    expect(decision.memoryInfluence.signalsUsed).toEqual([
      expect.objectContaining({
        category: 'derived-preference',
        signal: 'dominant-interaction',
      }),
    ])
  })

  it('blocks memory-driven support drift when it conflicts with the base persona', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const contextWithConflictingSupportMemory = buildConversionFirstContext()
    contextWithConflictingSupportMemory.memory = [
      {
        key: 'support-topic:2026-04-15T09:40:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.55,
        createdAt: '2026-04-15T09:40:00.000Z',
      },
      {
        key: 'support-topic:2026-04-14T11:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.55,
        createdAt: '2026-04-14T11:00:00.000Z',
      },
    ]

    const decision = resolveBrandSoulDecision(contextWithConflictingSupportMemory, 'me explica melhor')

    expect(decision.intent).toBe('general')
    expect(decision.action).toBe('inform')
    expect(decision.responsePlan.kind).toBe('general')
    expect(decision.responsePlan.optionalCloseStyle).toBe('contextual-clarity')
    expect(decision.memoryInfluence.applied).toBe(false)
  })

  it('does not let memory overwrite a critical current input intent', () => {
    const contextWithPreferenceMemory = buildContext()
    contextWithPreferenceMemory.memory = [
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.91,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ]

    const decision = resolveBrandSoulDecision(contextWithPreferenceMemory, 'preciso de ajuda agora')

    expect(decision.intent).toBe('support')
    expect(decision.action).toBe('support')
    expect(decision.memoryInfluence).toEqual({
      applied: false,
      influenceStrength: 0,
      signalsUsed: [],
      impact: {
        confidence: {
          before: decision.confidence,
          after: decision.confidence,
          delta: 0,
        },
      },
    })
  })

  it('does not let stale memory control an ambiguous current turn', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const contextWithStaleSupportMemory = buildContext()
    contextWithStaleSupportMemory.memory = [
      {
        key: 'support-topic:2026-01-15T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.82,
        createdAt: '2026-01-15T10:00:00.000Z',
      },
    ]

    const decision = resolveBrandSoulDecision(contextWithStaleSupportMemory, 'isso continua')

    expect(decision.intent).toBe('general')
    expect(decision.action).toBe('inform')
    expect(decision.memoryInfluence.applied).toBe(false)
  })

  it('runs the real memory persistence subflow after the cognitive decision without changing the response facade', async () => {
    const writer = new InMemoryBrandSoulMemoryWriter()

    await expect(
      resolveBrandSoulResponseWithMemoryPersistence({
        context: buildContext(),
        userMessage: 'Tem alguma promocao agora?',
        memoryWriter: writer,
        orchestrationContext: {
          interactionLabel: 'brand-response',
        },
      }),
    ).resolves.toEqual({
      responseText: 'Vou te orientar com clareza. Semana da Aurora: 15% off. Vou aproximar a conversa da proxima acao.',
      detectedIntent: 'promotion',
      actionType: 'sell',
      stateUpdate: {
        currentMood: 'focused',
        currentIntent: 'convert',
        currentFocus: 'Semana da Aurora',
        interactionMode: 'sale',
        energyLevel: 0.6599999999999999,
        lastUpdatedAt: expect.any(String),
      },
      memoryToStore: [
        {
          key: 'promotion-context:promo-1',
          value: 'Semana da Aurora',
          type: 'operational',
          relevanceScore: 0.72,
          createdAt: expect.any(String),
        },
      ],
      memoryPersistence: {
        status: 'completed',
        summary: 'brand-response: Persisted 1 memory record successfully',
        attemptedCount: 1,
        writtenCount: 1,
        failedCount: 0,
        shouldAudit: false,
        shouldContinueEntityInteraction: true,
        dispatchOutcome: {
          status: 'succeeded',
          attemptedCount: 1,
          writtenCount: 1,
          failedCount: 0,
          severity: 'none',
          reason: 'Memory persistence dispatch completed successfully',
          writtenMemoryIds: ['promotion-context:promo-1'],
          shouldAudit: false,
          shouldContinueEntityInteraction: true,
        },
      },
    })

    expect(writer.getByMemoryId('promotion-context:promo-1')).toHaveLength(1)
  })

  it('keeps the interaction response stable when real memory persistence degrades at the boundary', async () => {
    await expect(
      resolveBrandSoulResponseWithMemoryPersistence({
        context: buildContext(),
        userMessage: 'Tem alguma promocao agora?',
        memoryWriter: new FailingBrandSoulMemoryWriter(),
        orchestrationContext: {
          interactionLabel: 'brand-response',
        },
      }),
    ).resolves.toEqual({
      responseText: 'Vou te orientar com clareza. Semana da Aurora: 15% off. Vou aproximar a conversa da proxima acao.',
      detectedIntent: 'promotion',
      actionType: 'sell',
      stateUpdate: {
        currentMood: 'focused',
        currentIntent: 'convert',
        currentFocus: 'Semana da Aurora',
        interactionMode: 'sale',
        energyLevel: 0.6599999999999999,
        lastUpdatedAt: expect.any(String),
      },
      memoryToStore: [
        {
          key: 'promotion-context:promo-1',
          value: 'Semana da Aurora',
          type: 'operational',
          relevanceScore: 0.72,
          createdAt: expect.any(String),
        },
      ],
      memoryPersistence: {
        status: 'degraded',
        summary:
          'brand-response: Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
        attemptedCount: 1,
        writtenCount: 0,
        failedCount: 1,
        shouldAudit: true,
        shouldContinueEntityInteraction: true,
        dispatchOutcome: {
          status: 'degraded',
          attemptedCount: 1,
          writtenCount: 0,
          failedCount: 1,
          severity: 'error',
          reason:
            'Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
          errorType: 'edge-error',
          handling: 'degrade',
          writtenMemoryIds: [],
          shouldAudit: true,
          shouldContinueEntityInteraction: true,
        },
      },
    })
  })
})