import { describe, expect, it } from 'vitest'

import type { PersonaDNA } from '../../../domain/persona-dna/contracts/PersonaDNA'
import { getBirthActNarrative, getBirthSignalLines, getFinalPresenceModel, getFusionRitualModel, getManifestationBirthMessages, getManifestationFinalQuote, getSocialExportModel } from './ritualCopy'

function buildPersonaDNA(overrides?: Partial<PersonaDNA>): PersonaDNA {
  return {
    temperament: 'dynamic',
    presenceStyle: 'balanced',
    precision: 'balanced',
    expansion: 'balanced',
    defensiveness: 0.4,
    charisma: 0.62,
    stability: 0.58,
    wildness: 0.36,
    ...overrides,
  }
}

describe('ritualCopy PersonaDNA narrative', () => {
  it('adapts the act narrative to an intense dominant DNA', () => {
    const narrative = getBirthActNarrative({
      act: 'incarnation',
      stageId: 'flare',
      personaDNA: buildPersonaDNA({ temperament: 'intense', presenceStyle: 'dominant', precision: 'precise' }),
    })

    expect(narrative.eyebrow).toContain('Pressão')
    expect(narrative.title).toContain('autoridade visual')
    expect(narrative.detail).toContain('autoridade')
  })

  it('generates calm structural feedback and tone lines', () => {
    const messages = getManifestationBirthMessages(
      'robo-ia',
      'fused-logo',
      buildPersonaDNA({ temperament: 'calm', presenceStyle: 'reserved', precision: 'precise' }),
    )
    const [toneLine, progressLine] = getBirthSignalLines({
      personaDNA: buildPersonaDNA({ temperament: 'calm', presenceStyle: 'reserved', precision: 'precise' }),
      stageId: 'scan',
      progress: 0.5,
    })

    expect(messages[1]).toContain('disciplina e recorte')
    expect(toneLine).toBe('Ritual estável e reservado')
    expect(progressLine).toContain('estágio scan')
    expect(progressLine).toContain('50%')
  })

  it('uses PersonaDNA to specialize the final quote', () => {
    const quote = getManifestationFinalQuote('natureza', buildPersonaDNA({ temperament: 'ritual', presenceStyle: 'balanced' }))

    expect(quote).toBe('Your entity now enters the world with composed intention.')
  })

  it('builds a calm and reserved fusion with high containment', () => {
    const fusion = getFusionRitualModel({
      mode: 'natureza',
      variant: 'folhas',
      intensity: 'soft',
      personaDNA: buildPersonaDNA({ temperament: 'calm', presenceStyle: 'reserved', precision: 'precise', stability: 0.82, defensiveness: 0.72 }),
    })

    expect(fusion.eyebrow).toBe('Fusão estável')
    expect(fusion.title).toContain('suavidade')
    expect(fusion.detail).toContain('contenção')
    expect(Number(fusion.styleVars['--persona-lab-fusion-rhythm'])).toBeGreaterThan(1)
    expect(Number(fusion.styleVars['--persona-lab-fusion-containment'])).toBeGreaterThan(0.7)
  })

  it('builds an intense dominant fusion with faster cadence and stronger core presence', () => {
    const fusion = getFusionRitualModel({
      mode: 'elemental',
      variant: 'fogo',
      intensity: 'cinematic',
      personaDNA: buildPersonaDNA({ temperament: 'intense', presenceStyle: 'dominant', precision: 'precise', charisma: 0.88, wildness: 0.74 }),
    })

    expect(fusion.eyebrow).toBe('Fusão de pressão')
    expect(fusion.title).toContain('afirma presença')
    expect(fusion.signals[0]).toContain('rápido')
    expect(Number(fusion.styleVars['--persona-lab-fusion-rhythm'])).toBeLessThan(1)
    expect(Number(fusion.styleVars['--persona-lab-fusion-core-presence'])).toBeGreaterThan(0.7)
  })

  it('builds a calm reserved final presence with stronger containment than occupancy', () => {
    const finalPresence = getFinalPresenceModel({
      mode: 'natureza',
      personaDNA: buildPersonaDNA({ temperament: 'calm', presenceStyle: 'reserved', precision: 'precise', stability: 0.84, defensiveness: 0.74 }),
      finalForm: {
        presenceMode: 'final-stabilize',
        locked: true,
        intensity: 'soft',
        silhouetteClarity: 'high',
        edgeStrength: 0.84,
        smearReduction: 0.9,
        shape: { opacity: 1, scale: 0.98, blur: 0, intensity: 0.88, deformation: 0.04, edgeContrast: 0.82 },
        core: { opacity: 0.62, scale: 0.82, blur: 0.16, intensity: 0.68, internalPresence: 0.8 },
        field: { opacity: 0.28, scale: 0.68, blur: 0.52, intensity: 0.32, spread: 0.36 },
        particles: { opacity: 0.18, scale: 0.66, blur: 0, intensity: 0.24, budget: 'low', spread: 0.24, size: 0.42 },
      },
    })

    expect(finalPresence.eyebrow).toBe('Presença contida')
    expect(finalPresence.title).toContain('estabilidade')
    expect(finalPresence.signals[0]).toContain('contenção')
    expect(Number(finalPresence.styleVars['--persona-lab-final-containment'])).toBeGreaterThan(Number(finalPresence.styleVars['--persona-lab-final-occupancy']))
  })

  it('builds an intense dominant final presence with strong nucleus and occupancy', () => {
    const finalPresence = getFinalPresenceModel({
      mode: 'elemental',
      personaDNA: buildPersonaDNA({ temperament: 'intense', presenceStyle: 'dominant', precision: 'precise', charisma: 0.9, wildness: 0.78 }),
      finalForm: {
        presenceMode: 'reveal-lock',
        locked: true,
        intensity: 'cinematic',
        silhouetteClarity: 'medium',
        edgeStrength: 0.8,
        smearReduction: 0.74,
        shape: { opacity: 1, scale: 1.02, blur: 0.04, intensity: 1.08, deformation: 0.14, edgeContrast: 0.76 },
        core: { opacity: 0.66, scale: 0.84, blur: 0.16, intensity: 0.84, internalPresence: 0.88 },
        field: { opacity: 0.34, scale: 0.68, blur: 0.52, intensity: 0.46, spread: 0.62 },
        particles: { opacity: 0.28, scale: 0.66, blur: 0, intensity: 0.36, budget: 'medium', spread: 0.4, size: 0.56 },
      },
    })

    expect(finalPresence.eyebrow).toBe('Presença afirmada')
    expect(finalPresence.title).toContain('presença forte')
    expect(finalPresence.signals[2]).toContain('dominante')
    expect(Number(finalPresence.styleVars['--persona-lab-final-core-presence'])).toBeGreaterThan(0.7)
    expect(Number(finalPresence.styleVars['--persona-lab-final-occupancy'])).toBeGreaterThan(0.7)
  })

  it('builds a semantic social export model from final presence data', () => {
    const socialExport = getSocialExportModel({
      mode: 'robo-ia',
      variant: 'premium-tech',
      publicName: 'Aster',
      handle: '@aster',
      personaDNA: buildPersonaDNA({ temperament: 'ritual', presenceStyle: 'dominant', precision: 'precise', charisma: 0.84, stability: 0.8 }),
      finalForm: {
        presenceMode: 'reveal-lock',
        locked: true,
        intensity: 'cinematic',
        silhouetteClarity: 'high',
        edgeStrength: 0.88,
        smearReduction: 0.82,
        shape: { opacity: 1, scale: 1, blur: 0, intensity: 1.08, deformation: 0.06, edgeContrast: 0.86 },
        core: { opacity: 0.66, scale: 0.84, blur: 0.16, intensity: 0.82, internalPresence: 0.88 },
        field: { opacity: 0.32, scale: 0.68, blur: 0.52, intensity: 0.44, spread: 0.58 },
        particles: { opacity: 0.18, scale: 0.66, blur: 0, intensity: 0.28, budget: 'low', spread: 0.22, size: 0.44 },
      },
      format: 'post',
    })

    expect(socialExport.headline).toContain('Aster entra em presença pública')
    expect(socialExport.entityType).toBe('entidade de presença afirmada')
    expect(socialExport.intensityLabel).toContain('alta')
    expect(socialExport.signatureText).toContain('disciplina')
  })
})