import type { ActionStyleAnswer, BrandCategory, BrandStyleAnswer, LanguageStyleAnswer } from '../../../lib/personaArchetypes'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import type { ManifestationIntensity, ManifestationMode, PersonaLabPreview } from '../../../domain/rendering/contracts/types'
import type { CoreSymbolDebug } from '../../../domain/identity/contracts/CoreSymbolSelection'
import type { PersonaLabFinalPersona } from '../../../persona-lab/core/finalPersonaBuilder'
import type { ExtractedShapeSource } from '../../../domain/shape/contracts/ProcessedShape'
import type { VisualEssence } from '../../../lib/visualEssence'

export type PersonaLabStage =
  | 'upload'
  | 'manifestation'
  | 'variant'
  | 'fusion'
  | 'birth'
  | 'final'

export type PersonaBirthState = 'building' | 'transition' | 'final'

export type PersonaLabRuntimeDebugState = {
  showComparison: boolean
  showArchetypeValidation: boolean
  showShapeCompare: boolean
  shapeOnlyMode: boolean
  showField: boolean
  showParticles: boolean
  showCore: boolean
  showDebug: boolean
  liteEffects: boolean
}

export type PixiPerfScenario = 'combined' | 'field-only' | 'particles-only'

export interface PersonaLabInput {
  logoFile?: File
  logoPreview?: string
  logoMask?: string
  coreSymbol?: string
  coreSymbolDebug?: CoreSymbolDebug
  shapeSource?: ExtractedShapeSource
  manifestationMode?: ManifestationMode
  manifestationVariant?: string
  brandCategory?: BrandCategory
  visualEssence?: VisualEssence
  styleAnswers: {
    brandStyle?: BrandStyleAnswer
    languageStyle?: LanguageStyleAnswer
    actionStyle?: ActionStyleAnswer
  }
  palette: {
    primary: string
    secondary?: string
    contrast: 'high' | 'medium' | 'low'
  }
}

export interface PersonaLabState {
  input: PersonaLabInput
  previews: PersonaLabPreview[]
  selectedPreviewId?: string
  finalPersona?: PersonaLabFinalPersona
  entityProfile?: EntityProfile
}

export const initialLabState: PersonaLabState = {
  input: {
    logoFile: undefined,
    logoPreview: undefined,
    logoMask: undefined,
    coreSymbol: undefined,
    coreSymbolDebug: undefined,
    shapeSource: undefined,
    manifestationMode: undefined,
    manifestationVariant: undefined,
    visualEssence: undefined,
    brandCategory: 'other',
    styleAnswers: {},
    palette: {
      primary: '#ff9460',
      secondary: '#6e86ff',
      contrast: 'medium',
    },
  },
  previews: [],
  selectedPreviewId: undefined,
  finalPersona: undefined,
  entityProfile: undefined,
}

export const initialRuntimeDebugState: PersonaLabRuntimeDebugState = {
  showComparison: false,
  showArchetypeValidation: false,
  showShapeCompare: false,
  shapeOnlyMode: false,
  showField: true,
  showParticles: true,
  showCore: true,
  showDebug: false,
  liteEffects: false,
}

export const comparisonVariantByMode: Record<ManifestationMode, string> = {
  centelha: 'fused-logo',
  elemental: 'fogo',
  natureza: 'arvore',
  'robo-ia': 'elegante',
}

export const manifestationIntensityLevels: ManifestationIntensity[] = ['soft', 'balanced', 'cinematic']
