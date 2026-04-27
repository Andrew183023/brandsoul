import { describe, expect, it } from 'vitest'

import { applyLogoExtraction } from './personaLabActions'
import { initialLabState } from './personaLabStore'

describe('applyLogoExtraction', () => {
  it('resets downstream manifestation state when a new logo is uploaded', () => {
    const previousState = {
      ...initialLabState,
      input: {
        ...initialLabState.input,
        logoPreview: 'data:image/png;base64,old',
        manifestationMode: 'centelha' as const,
        manifestationVariant: 'fused-logo',
      },
      previews: [{ id: 'preview-1' } as never],
      selectedPreviewId: 'preview-1',
      entityProfile: { id: 'entity-1' } as never,
      finalPersona: { identityName: 'Centelha' } as never,
    }

    const nextState = applyLogoExtraction(previousState, {
      logoPreview: 'data:image/png;base64,new',
      shapeSource: undefined,
    })

    expect(nextState.input.logoPreview).toBe('data:image/png;base64,new')
    expect(nextState.input.manifestationMode).toBeUndefined()
    expect(nextState.input.manifestationVariant).toBeUndefined()
    expect(nextState.previews).toEqual([])
    expect(nextState.selectedPreviewId).toBeUndefined()
    expect(nextState.entityProfile).toBeUndefined()
    expect(nextState.finalPersona).toBeUndefined()
  })
})