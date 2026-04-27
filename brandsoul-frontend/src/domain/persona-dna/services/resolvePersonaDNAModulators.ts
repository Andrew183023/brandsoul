import type { PersonaDNA } from '../contracts/PersonaDNA'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export type PersonaDNAModulators = {
  cadenceMultiplier: number
  containment: number
  fieldAttachment: number
  fieldSpreadBias: number
  coreRadiusBias: number
  corePulseBias: number
  postureLift: number
  postureLean: number
  postureSpread: number
  particleDensityBias: number
  particleSpeedBias: number
  shapeRigidityBias: number
}

export function resolvePersonaDNAModulators(personaDNA: PersonaDNA): PersonaDNAModulators {
  const temperamentCadence =
    personaDNA.temperament === 'intense'
      ? 1.14
      : personaDNA.temperament === 'dynamic'
        ? 1.08
        : personaDNA.temperament === 'ritual'
          ? 0.94
          : 0.88

  const presenceLift =
    personaDNA.presenceStyle === 'dominant'
      ? -4
      : personaDNA.presenceStyle === 'reserved'
        ? 3
        : 0

  const precisionRigidity =
    personaDNA.precision === 'precise'
      ? 0.24
      : personaDNA.precision === 'organic'
        ? -0.18
        : 0

  const expansionSpread =
    personaDNA.expansion === 'expansive'
      ? 0.12
      : personaDNA.expansion === 'compact'
        ? -0.1
        : 0

  return {
    cadenceMultiplier: clamp(temperamentCadence + personaDNA.wildness * 0.12 - personaDNA.stability * 0.08, 0.72, 1.32),
    containment: clamp(0.42 + personaDNA.defensiveness * 0.34 + personaDNA.stability * 0.18 - personaDNA.wildness * 0.2, 0.18, 0.92),
    fieldAttachment: clamp(
      0.36 + personaDNA.defensiveness * 0.3 + personaDNA.stability * 0.14 - (personaDNA.expansion === 'expansive' ? 0.04 : 0),
      0.18,
      0.88,
    ),
    fieldSpreadBias: expansionSpread + personaDNA.charisma * 0.04 - personaDNA.defensiveness * 0.06,
    coreRadiusBias: clamp(personaDNA.charisma * 0.16 + (personaDNA.presenceStyle === 'dominant' ? 0.08 : 0), 0, 0.22),
    corePulseBias: clamp(personaDNA.wildness * 0.16 + (personaDNA.temperament === 'ritual' ? 0.04 : 0), 0, 0.24),
    postureLift: presenceLift + (personaDNA.expansion === 'expansive' ? -2 : personaDNA.expansion === 'compact' ? 1.5 : 0),
    postureLean: (personaDNA.wildness - personaDNA.stability) * 6,
    postureSpread: expansionSpread + personaDNA.charisma * 0.08 - personaDNA.defensiveness * 0.05,
    particleDensityBias: clamp(personaDNA.wildness * 0.18 + personaDNA.charisma * 0.08 - personaDNA.defensiveness * 0.12, -0.12, 0.22),
    particleSpeedBias: clamp(personaDNA.wildness * 0.16 + (personaDNA.temperament === 'dynamic' ? 0.06 : 0) - personaDNA.stability * 0.08, -0.08, 0.22),
    shapeRigidityBias: precisionRigidity + personaDNA.stability * 0.08 - personaDNA.wildness * 0.06,
  }
}
