import { describe, expect, it } from 'vitest'

import type { PersonaLabPreview } from '../../domain/rendering/contracts/types'
import type { PersonaLabFinalPersona } from './finalPersonaBuilder'
import { buildSocialOutputConfig, buildSocialPreviewDataUrl } from './socialOutputs'

const preview: PersonaLabPreview = {
  id: 'preview-1',
  label: 'Centelha Viva',
  description: 'presença técnica precisa',
  archetype: 'technical',
  manifestationMode: 'robo-ia',
  manifestationVariant: 'premium-tech',
  baseFormProfile: {
    family: 'totem',
    spine: 'vertical',
    massDistribution: 'centered',
    edgeDiscipline: 'controlled',
    openness: 0.3,
    bodyCompression: 0.24,
    corePlacement: { x: 0.5, y: 0.42 },
  },
  personaDNA: {
    temperament: 'ritual',
    presenceStyle: 'dominant',
    precision: 'precise',
    expansion: 'balanced',
    defensiveness: 0.42,
    charisma: 0.86,
    stability: 0.8,
    wildness: 0.28,
  },
  silhouette: {
    bodyPath: 'M0 0Z',
    innerPath: 'M0 0Z',
    source: 'manifestation-fallback',
  },
  visualConfig: {
    accent: '#ff9460',
    secondary: '#6e86ff',
    shape: 'prism',
    motion: 'pulse',
    glow: 'focused',
    density: 'balanced',
  },
}

const finalPersona: PersonaLabFinalPersona = {
  name: 'Aster',
  archetype: 'Centelha Viva • presença técnica precisa',
  manifesto: 'Precisão, disciplina e presença pública.',
  openingLine: 'I’m Aster. I hold a precise public presence.',
  socialLine: 'Aster entra em presença pública com precisão contínua.',
  toneKeywords: ['preciso', 'claro'],
  namingRationale: 'Nome curto e técnico.',
}

describe('socialOutputs semantic export', () => {
  it('embeds semantic export language in the generated social SVG', () => {
    const dataUrl = buildSocialPreviewDataUrl({
      preview,
      finalPersona,
      config: buildSocialOutputConfig('post'),
    })

    const decodedSvg = decodeURIComponent(dataUrl.split(',')[1] ?? '')

    expect(decodedSvg).toContain('Aster entra em presença pública com precisão contínua.')
    expect(decodedSvg).toContain('ENTIDADE DE PRESENÇA AFIRMADA')
  })
})