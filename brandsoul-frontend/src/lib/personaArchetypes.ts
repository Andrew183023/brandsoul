export type BrandArchetype = string
export type BrandCategory = string
export type BrandStyleAnswer = string
export type LanguageStyleAnswer = string
export type ActionStyleAnswer = string

export function getPersonaArchetypeConfig(
  brandCategory?: BrandCategory,
  styleAnswers?: {
    brandStyle?: BrandStyleAnswer
    languageStyle?: LanguageStyleAnswer
    actionStyle?: ActionStyleAnswer
  },
) {
  const archetype = styleAnswers?.brandStyle ?? brandCategory ?? 'signature'

  return {
    archetype,
    auraOpacity: 0.18,
    auraScale: 1,
    glowBlur: 28,
    glowStrength: 0.72,
    bodyScale: 1,
    bodyRotate: 0,
    bodySkew: 0,
    bodyBreathScale: 1.02,
    motionDuration: 6,
    motionAmplitude: 1,
    coreScale: 1,
    coreOpacity: 0.92,
    hoverScale: 1.03,
    hoverGlowBoost: 1.08,
  }
}
