export type BrandSoulTone =
  | 'formal'
  | 'direct'
  | 'welcoming'
  | 'warm'
  | 'playful'
  | 'ritual'
  | 'confident'
  | 'consultative'

export type BrandSoulRelationalMode =
  | 'host'
  | 'guide'
  | 'companion'
  | 'advisor'
  | 'guardian'
  | 'seller'

export type BrandSoulCommercialRole =
  | 'seller'
  | 'consultant'
  | 'guide'
  | 'curator'
  | 'concierge'
  | 'educator'

export type BrandSoulTraitAdaptationScope = 'contextual' | 'seasonal' | 'campaign-driven'

export type BrandSoulIdentityRule = {
  key: string
  description: string
  rationale?: string
}

export type BrandSoulGuardrailSeverity = 'hard' | 'soft'

export type BrandSoulGuardrail = {
  key: string
  description: string
  severity: BrandSoulGuardrailSeverity
}

export type BrandSoulAdaptableTrait = {
  trait: string
  adaptationScope: BrandSoulTraitAdaptationScope
  adaptationGuidance?: string
}

export type BrandSoulToneProfile = {
  primary: BrandSoulTone
  modifiers: BrandSoulTone[]
}

export type BrandSoulRelationalStyle = {
  primaryMode: BrandSoulRelationalMode
  connectionIntent: string
  trustSignals: string[]
}

export type BrandSoulVisualSignature = {
  archetypeHint?: string
  bodyMotif: string
  coreMotif: string
  fieldMotif: string
  motionPrinciples: string[]
  colorIntent?: string
}

export type BrandSoulIdentityProfile = {
  id: string
  brandName: string
  essence: string
  tone: BrandSoulToneProfile
  relationalStyle: BrandSoulRelationalStyle
  commercialRole: BrandSoulCommercialRole
  immutableTraits: string[]
  adaptableTraits: BrandSoulAdaptableTrait[]
  identityRules: BrandSoulIdentityRule[]
  guardrails: BrandSoulGuardrail[]
  visualSignature: BrandSoulVisualSignature
}