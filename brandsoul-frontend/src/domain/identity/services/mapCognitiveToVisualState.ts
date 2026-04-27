type ManifestationIntensity = 'soft' | 'balanced' | 'cinematic'
import type { BrandSoulActionType, BrandSoulDetectedIntent } from '../contracts/BrandSoulDecision'
import type { BrandSoulState } from '../contracts/BrandSoulState'

export type BrandSoulVisualState = {
  visualIntensity: ManifestationIntensity
  tensionLevel: number
  stability: number
  fieldSpread: number
  coreActivity: number
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveMoodTension(state: BrandSoulState) {
  switch (state.currentMood) {
    case 'urgent':
      return 0.9
    case 'protective':
      return 0.82
    case 'focused':
      return 0.68
    case 'celebratory':
      return 0.62
    case 'curious':
      return 0.52
    case 'welcoming':
      return 0.36
    case 'calm':
    default:
      return 0.24
  }
}

function resolveIntentDrive(state: BrandSoulState) {
  switch (state.currentIntent) {
    case 'convert':
      return 0.88
    case 'retain':
      return 0.72
    case 'recommend':
      return 0.66
    case 'support':
      return 0.42
    case 'welcome':
      return 0.38
    case 'assist':
      return 0.44
    case 'observe':
    default:
      return 0.22
  }
}

function resolveActionPressure(actionType: BrandSoulActionType) {
  switch (actionType) {
    case 'sell':
      return 0.22
    case 'guide':
      return 0.12
    case 'support':
      return -0.08
    case 'refuse':
      return 0.18
    case 'inform':
    default:
      return 0
  }
}

function resolveIntentSpread(intent: BrandSoulDetectedIntent, actionType: BrandSoulActionType) {
  if (intent === 'promotion' || intent === 'purchase') {
    return 0.84
  }
  if (intent === 'product-discovery') {
    return 0.72
  }
  if (intent === 'support' || intent === 'policy') {
    return 0.44
  }
  if (intent === 'guardrail-blocked' || actionType === 'refuse') {
    return 0.34
  }
  if (intent === 'greeting') {
    return 0.58
  }
  return 0.52
}

function resolveStabilityBase(state: BrandSoulState, actionType: BrandSoulActionType) {
  const moodStability =
    state.currentMood === 'calm'
      ? 0.84
      : state.currentMood === 'welcoming'
        ? 0.76
        : state.currentMood === 'focused'
          ? 0.72
          : state.currentMood === 'protective'
            ? 0.68
            : state.currentMood === 'urgent'
              ? 0.42
              : 0.58

  const modeAdjustment =
    state.interactionMode === 'support'
      ? 0.08
      : state.interactionMode === 'sale'
        ? -0.04
        : state.interactionMode === 'guidance'
          ? 0.02
          : 0

  const actionAdjustment = actionType === 'refuse' ? 0.06 : 0

  return clamp(moodStability + modeAdjustment + actionAdjustment)
}

function resolveVisualIntensity(tensionLevel: number, coreActivity: number, stability: number): ManifestationIntensity {
  if (tensionLevel >= 0.72 || coreActivity >= 0.78) {
    return 'cinematic'
  }

  if (stability >= 0.74 && tensionLevel <= 0.34 && coreActivity <= 0.46) {
    return 'soft'
  }

  return 'balanced'
}

export function mapCognitiveToVisualState(
  state: BrandSoulState,
  detectedIntent: BrandSoulDetectedIntent,
  actionType: BrandSoulActionType,
): BrandSoulVisualState {
  const moodTension = resolveMoodTension(state)
  const intentDrive = resolveIntentDrive(state)
  const actionPressure = resolveActionPressure(actionType)
  const tensionLevel = clamp(moodTension * 0.54 + intentDrive * 0.28 + state.energyLevel * 0.18 + actionPressure)
  const stability = resolveStabilityBase(state, actionType)
  const fieldSpread = clamp(resolveIntentSpread(detectedIntent, actionType) * 0.76 + state.energyLevel * 0.18 + (1 - stability) * 0.12, 0.24, 0.94)
  const coreActivity = clamp(state.energyLevel * 0.46 + intentDrive * 0.34 + tensionLevel * 0.2)

  return {
    visualIntensity: resolveVisualIntensity(tensionLevel, coreActivity, stability),
    tensionLevel,
    stability,
    fieldSpread,
    coreActivity,
  }
}
