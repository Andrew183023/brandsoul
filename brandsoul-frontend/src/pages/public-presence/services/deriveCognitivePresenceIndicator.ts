import type { BrandSoulDecision } from '../../../domain/identity/contracts/BrandSoulDecision'
import type { BrandSoulVisualState } from '../../../domain/identity/services/mapCognitiveToVisualState'

export type PublicPresenceCognitiveIndicator = {
  intentLabel: string
  actionLabel: string
  presenceLabel: string
}

function formatIntentLabel(intent: BrandSoulDecision['intent']) {
  switch (intent) {
    case 'promotion':
      return 'promo'
    case 'product-discovery':
      return 'curadoria'
    case 'purchase':
      return 'compra'
    case 'support':
      return 'suporte'
    case 'policy':
      return 'politica'
    case 'business-hours':
      return 'horario'
    case 'greeting':
      return 'acolhimento'
    case 'guardrail-blocked':
      return 'limite'
    case 'general':
    default:
      return 'presenca'
  }
}

function formatActionLabel(action: BrandSoulDecision['action']) {
  switch (action) {
    case 'sell':
      return 'conversao'
    case 'guide':
      return 'guia'
    case 'support':
      return 'amparo'
    case 'refuse':
      return 'resguardo'
    case 'inform':
    default:
      return 'clareza'
  }
}

export function deriveCognitivePresenceIndicator(args: {
  decision: BrandSoulDecision
  visualState: BrandSoulVisualState
}): PublicPresenceCognitiveIndicator {
  const { decision, visualState } = args
  const presenceLabel =
    visualState.visualIntensity === 'cinematic'
      ? 'presenca em expansao'
      : visualState.visualIntensity === 'soft'
        ? 'presenca em contencao'
        : visualState.stability >= 0.72
          ? 'presenca em equilibrio'
          : 'presenca em ajuste'

  return {
    intentLabel: formatIntentLabel(decision.intent),
    actionLabel: formatActionLabel(decision.action),
    presenceLabel,
  }
}