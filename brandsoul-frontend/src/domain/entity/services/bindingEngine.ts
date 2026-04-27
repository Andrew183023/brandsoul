export type EntityBindingState = {
  ownerId?: string
  createdAt: string
  bindingStrength: number
  attachmentLevel: 'cold' | 'warming' | 'warm' | 'strong'
  identityImprintScore: number
  continuityScore: number
  exclusivityScore: number
  lastInteractionAt?: string
  updatedAt: string
}

export function buildInitialBindingState(args: {
  manifestation?: { intensity?: string }
  createdAt: string
}): EntityBindingState {
  const baseStrength = args.manifestation?.intensity === 'cinematic'
    ? 0.42
    : args.manifestation?.intensity === 'soft'
      ? 0.24
      : 0.33

  return {
    createdAt: args.createdAt,
    bindingStrength: baseStrength,
    attachmentLevel: 'warming',
    identityImprintScore: 0.28,
    continuityScore: 0.24,
    exclusivityScore: 0.08,
    lastInteractionAt: args.createdAt,
    updatedAt: args.createdAt,
  }
}