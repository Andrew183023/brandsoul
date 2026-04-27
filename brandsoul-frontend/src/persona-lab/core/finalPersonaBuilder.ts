import { buildPersonaName } from '../../lib/personaNaming'
import { buildPersonaVoiceProfile } from '../../lib/personaVoice'
import { getPersonaArchetypeConfig } from '../../lib/personaArchetypes'
import type { EntityFinalIdentity } from '../../domain/entity/contracts/EntityFinalForm'
import type { PersonaLabPreview } from '../../domain/rendering/contracts/types'
import { getSocialExportModel } from './ritualCopy'

export interface FinalPersonaIdentityInput {
  brandCategory?: import('../../lib/personaArchetypes').BrandCategory
  styleAnswers: {
    brandStyle?: import('../../lib/personaArchetypes').BrandStyleAnswer
    languageStyle?: import('../../lib/personaArchetypes').LanguageStyleAnswer
    actionStyle?: import('../../lib/personaArchetypes').ActionStyleAnswer
  }
  visualEssence?: import('../../lib/visualEssence').VisualEssence
}

export type PersonaLabFinalPersona = EntityFinalIdentity

function getModeSocialLine(preview: PersonaLabPreview, publicName: string) {
  return getSocialExportModel({
    mode: preview.manifestationMode,
    variant: preview.manifestationVariant,
    publicName,
    previewLabel: preview.label,
    previewDescription: preview.description,
    personaDNA: preview.personaDNA,
    format: 'post',
  }).headline
}

export function buildFinalPersona(
  preview: PersonaLabPreview,
  input: FinalPersonaIdentityInput,
): PersonaLabFinalPersona {
  const archetypeConfig = getPersonaArchetypeConfig(input.brandCategory, input.styleAnswers)
  const voiceProfile = buildPersonaVoiceProfile({
    brandCategory: input.brandCategory,
    brandArchetype: archetypeConfig.archetype,
    styleAnswers: input.styleAnswers,
    visualEssence: input.visualEssence,
  })
  const namingProfile = buildPersonaName({
    brandCategory: input.brandCategory,
    brandArchetype: archetypeConfig.archetype,
    styleAnswers: input.styleAnswers,
    visualEssence: input.visualEssence,
    voiceProfile,
  })

  return {
    name: namingProfile.name,
    archetype: `${preview.label} • ${preview.description}`,
    manifesto: voiceProfile.summary,
    openingLine: `I’m ${namingProfile.name}. ${voiceProfile.firstLine}`,
    socialLine: getModeSocialLine(preview, namingProfile.name),
    toneKeywords: voiceProfile.toneKeywords,
    namingRationale: namingProfile.rationale,
  }
}
