type EntityAttachmentLevel = 'low' | 'medium' | 'high' | 'bonded'

type BindingEventName =
  | 'interaction.message'
  | 'return.visit'
  | 'export.downloaded'
  | 'share.triggered'
  | 'time_spent'
  | 'no_interaction'

export type EntityBindingState = {
  schemaVersion: 1
  ownerId?: string
  createdAt: string
  bindingStrength: number
  attachmentLevel: EntityAttachmentLevel
  identityImprintScore: number
  continuityScore: number
  exclusivityScore: number
  lastInteractionAt?: string
  updatedAt: string
}

export type BindingEventInput = {
  name: BindingEventName
  timestamp?: string
  weight?: number
  durationMs?: number
  continuityScore?: number
}

export type BuildInitialBindingStateInput = {
  ownerId?: string
  createdAt?: string
  manifestation?: {
    intensity?: 'soft' | 'balanced' | 'cinematic' | string
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

export function resolveAttachmentLevel(bindingStrength: number): EntityAttachmentLevel {
  if (bindingStrength >= 0.82) {
    return 'bonded'
  }
  if (bindingStrength >= 0.62) {
    return 'high'
  }
  if (bindingStrength >= 0.34) {
    return 'medium'
  }
  return 'low'
}

export const updateAttachmentLevel = resolveAttachmentLevel

function getBindingDelta(event: BindingEventInput) {
  const weight = clamp(event.weight ?? 1)
  const timeFactor = event.durationMs ? clamp(event.durationMs / 180_000, 0, 1.4) : 1

  switch (event.name) {
    case 'interaction.message':
      return 0.055 * weight
    case 'return.visit':
      return 0.11 * weight
    case 'export.downloaded':
      return 0.07 * weight
    case 'share.triggered':
      return 0.09 * weight
    case 'time_spent':
      return 0.026 * weight * timeFactor
    case 'no_interaction':
      return -0.018 * weight
    default:
      return 0
  }
}

export function computeBindingStrength(currentStrength: number, delta: number) {
  const current = clamp(currentStrength)

  if (delta < 0) {
    return clamp(current + delta * (0.35 + current * 0.65))
  }

  const remainingCapacity = Math.max(0, 1 - current)
  const slowdown = Math.max(0.16, remainingCapacity ** 1.35)
  return clamp(current + delta * slowdown)
}

export function updateBindingFromEvent(binding: EntityBindingState, event: BindingEventInput): EntityBindingState {
  const at = event.timestamp ?? new Date().toISOString()
  const delta = getBindingDelta(event)
  const continuityScore =
    typeof event.continuityScore === 'number'
      ? clamp(event.continuityScore)
      : binding.continuityScore
  const continuityLift = Math.max(0, continuityScore - binding.continuityScore) * 0.12
  const bindingStrength = computeBindingStrength(binding.bindingStrength, delta + continuityLift)
  const positiveDelta = Math.max(0, delta)
  const negativeDelta = Math.min(0, delta)

  return {
    ...binding,
    lastInteractionAt: event.name === 'no_interaction' ? binding.lastInteractionAt : at,
    bindingStrength,
    attachmentLevel: updateAttachmentLevel(bindingStrength),
    identityImprintScore: clamp(binding.identityImprintScore + positiveDelta * 0.32 + negativeDelta * 0.12),
    continuityScore: clamp(
      Math.max(
        continuityScore,
        binding.continuityScore +
          (event.name === 'return.visit' ? 0.055 : positiveDelta * 0.22) +
          negativeDelta * 0.32,
      ),
    ),
    exclusivityScore: clamp(
      binding.exclusivityScore +
        (event.name === 'share.triggered' ? 0.022 : positiveDelta * 0.08) +
        negativeDelta * 0.06,
    ),
    updatedAt: at,
  }
}

export function buildInitialBindingState(args?: BuildInitialBindingStateInput): EntityBindingState {
  const createdAt = args?.createdAt ?? new Date().toISOString()
  const imprintBoost =
    args?.manifestation?.intensity === 'cinematic'
      ? 0.04
      : args?.manifestation?.intensity === 'soft'
        ? -0.02
        : 0
  const identityImprintScore = clamp(0.22 + imprintBoost)
  const bindingStrength = clamp(0.16 + identityImprintScore * 0.18)

  return {
    schemaVersion: 1,
    ownerId: args?.ownerId,
    createdAt,
    bindingStrength,
    attachmentLevel: resolveAttachmentLevel(bindingStrength),
    identityImprintScore,
    continuityScore: 0.12,
    exclusivityScore: args?.ownerId ? 0.28 : 0.16,
    updatedAt: createdAt,
  }
}
