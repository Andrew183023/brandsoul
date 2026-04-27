import type { BrandArchetype, BrandCategory, ActionStyleAnswer, BrandStyleAnswer, LanguageStyleAnswer } from './personaArchetypes'
import type { VisualEssence } from './visualEssence'

export function buildPersonaVoiceProfile(args: {
  brandCategory?: BrandCategory
  brandArchetype?: BrandArchetype
  styleAnswers?: {
    brandStyle?: BrandStyleAnswer
    languageStyle?: LanguageStyleAnswer
    actionStyle?: ActionStyleAnswer
  }
  visualEssence?: VisualEssence
}) {
  const archetype = args.brandArchetype ?? args.styleAnswers?.brandStyle ?? args.brandCategory ?? 'signature'
  const language = args.styleAnswers?.languageStyle ?? 'clara'
  const action = args.styleAnswers?.actionStyle ?? 'presente'

  return {
    summary: `${archetype} com linguagem ${language} e postura ${action}.`,
    firstLine: 'Estou pronto para representar sua presença com clareza.',
    toneKeywords: [String(archetype), String(language), String(action)],
  }
}
