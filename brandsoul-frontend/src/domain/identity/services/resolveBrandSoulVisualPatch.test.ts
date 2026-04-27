import { describe, expect, it } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulState } from '../contracts/BrandSoulState'
import { resolveBrandSoulVisualPatch } from './resolveBrandSoulVisualPatch'

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
      energyLevel: 0.36,
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

describe('resolveBrandSoulVisualPatch', () => {
  it('composes cognition and presence into a single sovereign result', () => {
    const currentState: BrandSoulState = {
      currentMood: 'urgent',
      currentIntent: 'convert',
      currentFocus: 'promocao ativa',
      energyLevel: 0.88,
      interactionMode: 'sale',
      lastUpdatedAt: '2026-04-14T12:00:00.000Z',
    }

    const result = resolveBrandSoulVisualPatch({
      context: buildContext(),
      userMessage: 'Tem alguma promocao agora?',
      currentState,
    })

    expect(result.decision.intent).toBe('promotion')
    expect(result.decision.action).toBe('sell')
    expect(result.visualState.visualIntensity).toBe('cinematic')
    expect(result.visualState.coreActivity).toBeGreaterThan(0.8)
    expect(result.runtimePatch.metadata?.decisionIntent).toBe('promotion')
    expect(result.runtimePatch.metadata?.derivedFromStateAt).toBe(currentState.lastUpdatedAt)
    expect((result.runtimePatch.core?.pulseMultiplier ?? 1)).toBeGreaterThan(1)
  })

  it('uses currentState as the presence source without changing cognitive resolution input', () => {
    const currentState: BrandSoulState = {
      currentMood: 'calm',
      currentIntent: 'support',
      currentFocus: 'politica de troca',
      energyLevel: 0.22,
      interactionMode: 'support',
      lastUpdatedAt: '2026-04-14T13:00:00.000Z',
    }

    const result = resolveBrandSoulVisualPatch({
      context: buildContext(),
      userMessage: 'Tem alguma promocao agora?',
      currentState,
    })

    expect(result.decision.intent).toBe('promotion')
    expect(result.decision.action).toBe('sell')
    expect(result.visualState.visualIntensity).toBe('balanced')
    expect(result.visualState.coreActivity).toBeLessThan(0.6)
    expect((result.runtimePatch.particles?.speedMultiplier ?? 1)).toBeLessThan(1.1)
  })
})