import type { BrandArchetype, BrandCategory, ActionStyleAnswer, BrandStyleAnswer, LanguageStyleAnswer } from './personaArchetypes'
import type { VisualEssence } from './visualEssence'

export function buildPersonaName(args: {
  brandCategory?: BrandCategory
  brandArchetype?: BrandArchetype
  styleAnswers?: {
    brandStyle?: BrandStyleAnswer
    languageStyle?: LanguageStyleAnswer
    actionStyle?: ActionStyleAnswer
  }
  visualEssence?: VisualEssence
  voiceProfile?: {
    summary?: string
  }
}) {
  const nameSeed = args.brandArchetype ?? args.brandCategory ?? args.styleAnswers?.brandStyle ?? 'Persona'
  const normalized = String(nameSeed)
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return {
    name: normalized || 'Persona',
    rationale: args.voiceProfile?.summary ?? 'Nome derivado do arquétipo ativo.',
  }
}
