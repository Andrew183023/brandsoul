import { describe, expect, it } from 'vitest'

import { centelhaSpec } from '../../manifestation/specs/centelha'
import { modulateBirthTimeline } from './modulateBirthTimeline'

describe('modulateBirthTimeline', () => {
  it('makes calm births longer and more stable than intense births', () => {
    const calm = modulateBirthTimeline({
      birthTimeline: centelhaSpec.birthTimeline,
      personaDNA: {
        temperament: 'calm',
        presenceStyle: 'balanced',
        precision: 'balanced',
        expansion: 'balanced',
        defensiveness: 0.44,
        charisma: 0.52,
        stability: 0.84,
        wildness: 0.16,
      },
    })

    const intense = modulateBirthTimeline({
      birthTimeline: centelhaSpec.birthTimeline,
      personaDNA: {
        temperament: 'intense',
        presenceStyle: 'dominant',
        precision: 'precise',
        expansion: 'expansive',
        defensiveness: 0.28,
        charisma: 0.74,
        stability: 0.34,
        wildness: 0.82,
      },
    })

    expect(calm.duration).toBeGreaterThan(intense.duration)
    expect(calm.stages.at(-1)?.duration).toBeGreaterThan(intense.stages.at(-1)?.duration ?? 0)
    expect(intense.stages.find((stage) => stage.id === 'ignite')?.transforms?.particleBoost).toBeGreaterThan(
      calm.stages.find((stage) => stage.id === 'ignite')?.transforms?.particleBoost ?? 0,
    )
    expect(intense.stages.find((stage) => stage.id === 'flare')?.transforms?.deform).toBeGreaterThan(
      calm.stages.find((stage) => stage.id === 'flare')?.transforms?.deform ?? 0,
    )
  })

  it('makes dominant payoffs more imposing and reserved payoffs more contained', () => {
    const dominant = modulateBirthTimeline({
      birthTimeline: centelhaSpec.birthTimeline,
      personaDNA: {
        temperament: 'ritual',
        presenceStyle: 'dominant',
        precision: 'balanced',
        expansion: 'balanced',
        defensiveness: 0.32,
        charisma: 0.82,
        stability: 0.72,
        wildness: 0.28,
      },
    })

    const reserved = modulateBirthTimeline({
      birthTimeline: centelhaSpec.birthTimeline,
      personaDNA: {
        temperament: 'ritual',
        presenceStyle: 'reserved',
        precision: 'balanced',
        expansion: 'compact',
        defensiveness: 0.78,
        charisma: 0.3,
        stability: 0.8,
        wildness: 0.12,
      },
    })

    expect(dominant.stages.at(-1)?.transforms?.coreScale).toBeGreaterThan(reserved.stages.at(-1)?.transforms?.coreScale ?? 0)
    expect(dominant.stages.at(-1)?.transforms?.shapeScale).toBeGreaterThan(reserved.stages.at(-1)?.transforms?.shapeScale ?? 0)
    expect(reserved.stages.at(-1)?.emphasis.particles).toBeLessThan(dominant.stages.at(-1)?.emphasis.particles ?? 0)
  })
})