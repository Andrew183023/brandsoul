import { buildFinalPersona } from '../../../persona-lab/core/finalPersonaBuilder'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import { buildManifestationPreview } from '../../../domain/manifestation/services/previewBuilder'
import type { ManifestationMode } from '../../../domain/rendering/contracts/types'
import type { PersonaLabInput, PersonaLabState } from './personaLabStore'

export function applyLogoExtraction(
  state: PersonaLabState,
  inputPatch: Partial<PersonaLabInput>,
): PersonaLabState {
  return {
    ...state,
    input: {
      ...state.input,
      manifestationMode: undefined,
      manifestationVariant: undefined,
      ...inputPatch,
    },
    previews: [],
    selectedPreviewId: undefined,
    entityProfile: undefined,
    finalPersona: undefined,
  }
}

export function selectManifestationMode(
  state: PersonaLabState,
  manifestationMode: ManifestationMode,
): PersonaLabState {
  return {
    ...state,
    input: {
      ...state.input,
      manifestationMode,
      manifestationVariant: undefined,
    },
  }
}

export function selectManifestationVariant(
  state: PersonaLabState,
  manifestationVariant: string,
): PersonaLabState {
  const nextInput = {
    ...state.input,
    manifestationVariant,
  }
  const preview = buildManifestationPreview({
    ...nextInput,
    shapeSource: nextInput.shapeSource,
  })

  return {
    ...state,
    input: nextInput,
    previews: preview ? [preview] : [],
    selectedPreviewId: preview?.id,
  }
}

export function finalizePersona(state: PersonaLabState) {
  const selectedPreview = state.previews.find((preview) => preview.id === state.selectedPreviewId)
  if (!selectedPreview) {
    return state
  }

  return {
    ...state,
    finalPersona:
      state.entityProfile?.finalForm.identity ??
      buildFinalPersona(selectedPreview, {
        brandCategory: state.input.brandCategory,
        styleAnswers: state.input.styleAnswers,
        visualEssence: state.input.visualEssence,
      }),
  }
}

export function applyEntityProfile(
  state: PersonaLabState,
  entityProfile: EntityProfile,
): PersonaLabState {
  return {
    ...state,
    entityProfile,
    finalPersona: entityProfile.finalForm.identity ?? state.finalPersona,
  }
}

export function hydrateStateFromEntityProfile(
  state: PersonaLabState,
  entityProfile: EntityProfile,
): PersonaLabState {
  const preview = buildManifestationPreview({
    manifestationMode: entityProfile.manifestation.mode,
    manifestationVariant: entityProfile.manifestation.variant,
    visualEssence: entityProfile.brand.visualEssence,
    palette: entityProfile.palette,
    shapeSource: entityProfile.brand.shapeSource,
    processedShape: entityProfile.morphology.processedShape,
    baseFormProfile: entityProfile.morphology.baseForm,
    personaDNA: entityProfile.personaDNA,
    visualBodyPlan: entityProfile.visualBodyPlan,
    visualFinishPlan: entityProfile.visualFinishPlan,
  })

  return {
    ...state,
    input: {
      ...state.input,
      logoPreview: entityProfile.brand.logoPreview,
      logoMask: entityProfile.brand.logoMask,
      coreSymbol: entityProfile.brand.coreSymbol,
      shapeSource: entityProfile.brand.shapeSource,
      manifestationMode: entityProfile.manifestation.mode as ManifestationMode,
      manifestationVariant: entityProfile.manifestation.variant,
      brandCategory: entityProfile.context.brandCategory,
      visualEssence: entityProfile.brand.visualEssence,
      styleAnswers: entityProfile.context.styleAnswers,
      palette: entityProfile.palette,
    },
    previews: preview ? [preview] : state.previews,
    selectedPreviewId: preview?.id ?? state.selectedPreviewId,
    entityProfile,
    finalPersona: entityProfile.finalForm.identity ?? state.finalPersona,
  }
}
