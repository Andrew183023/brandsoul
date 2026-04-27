import type { BrandSoulState } from '../../../domain/identity/contracts/BrandSoulState'
import type { PublicPresenceResponse } from '../../../domain/entity/contracts/PublicPresenceResponse'

function resolveMoodFromPresence(presence: PublicPresenceResponse): BrandSoulState['currentMood'] {
  if (presence.visual.presenceHealth.trend === 'expanding') {
    return 'celebratory'
  }

  if (presence.visual.presenceHealth.trend === 'forming') {
    return 'curious'
  }

  if (presence.visual.presenceHealth.trend === 'returning') {
    return 'focused'
  }

  if (presence.visual.presenceHealth.trend === 'cooling') {
    return 'protective'
  }

  return 'calm'
}

function resolveIntentFromPresence(presence: PublicPresenceResponse): BrandSoulState['currentIntent'] {
  if (presence.relational.tier === 'bonded') {
    return 'retain'
  }

  if (presence.relational.tier === 'engaged') {
    return 'recommend'
  }

  if (presence.cta.type === 'interact') {
    return 'assist'
  }

  if (presence.cta.type === 'follow') {
    return 'welcome'
  }

  return 'observe'
}

function resolveInteractionModeFromPresence(presence: PublicPresenceResponse): BrandSoulState['interactionMode'] {
  if (presence.cta.type === 'interact') {
    return 'response'
  }

  if (presence.cta.type === 'explore') {
    return 'guidance'
  }

  if (presence.cta.type === 'follow') {
    return 'retention'
  }

  return 'presentation'
}

function resolveEnergyFromPresence(presence: PublicPresenceResponse) {
  switch (presence.visual.presenceHealth.intensity) {
    case 'high':
      return 0.84
    case 'medium':
      return 0.58
    case 'low':
    default:
      return 0.32
  }
}

export function deriveBrandSoulStateFromPublicPresence(
  presence: PublicPresenceResponse,
  now = new Date().toISOString(),
): BrandSoulState {
  return {
    currentMood: resolveMoodFromPresence(presence),
    currentIntent: resolveIntentFromPresence(presence),
    currentFocus: presence.visual.presenceHealth.summary,
    energyLevel: resolveEnergyFromPresence(presence),
    interactionMode: resolveInteractionModeFromPresence(presence),
    lastUpdatedAt: now,
  }
}