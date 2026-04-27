import type { BrandSoulContext } from '../../../domain/identity/contracts/BrandSoulContext'
import type { BrandSoulState } from '../../../domain/identity/contracts/BrandSoulState'
import type { PublicPresenceResponse } from '../../../domain/entity/contracts/PublicPresenceResponse'

export function buildBrandSoulContextFromPublicPresence(
  presence: PublicPresenceResponse,
  currentState: BrandSoulState,
): BrandSoulContext {
  return {
    identity: {
      id: presence.entity.id,
      brandName: presence.entity.name,
      essence: presence.entity.tagline ?? 'presenca publica guiada por estado vivo',
      tone: {
        primary: 'consultative',
        modifiers: ['warm'],
      },
      relationalStyle: {
        primaryMode: 'guide',
        connectionIntent: presence.relational.relationshipLabel,
        trustSignals: [presence.visual.presenceHealth.summary],
      },
      commercialRole: 'guide',
      immutableTraits: ['coerente', 'presente'],
      adaptableTraits: [
        {
          trait: 'ritmo relacional publico',
          adaptationScope: 'contextual',
        },
      ],
      identityRules: [
        {
          key: 'public-presence-consistency',
          description: 'responder com coerencia em relacao ao estado publico atual',
        },
      ],
      guardrails: [],
      visualSignature: {
        bodyMotif: 'coeso',
        coreMotif: 'atento',
        fieldMotif: 'relacional',
        motionPrinciples: ['continuidade', 'clareza'],
      },
    },
    state: currentState,
    memory: [],
    conversation: {
      lastMessages: [],
      detectedIntent: undefined,
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