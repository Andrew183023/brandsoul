import type { ManifestationSpec } from '../../manifestation/contracts/ManifestationSpec'
import type { PersonaDNA } from '../contracts/PersonaDNA'
import { resolvePersonaDNAModulators } from './resolvePersonaDNAModulators'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

type BirthTimeline = ManifestationSpec['birthTimeline']
type BirthStage = BirthTimeline['stages'][number]
type StageRole = 'arrival' | 'gather' | 'peak' | 'reveal' | 'stabilize'

function resolveStageRole(stage: BirthStage, index: number, total: number): StageRole {
  if (index === 0) {
    return 'arrival'
  }

  if (index === total - 1) {
    return 'stabilize'
  }

  if (/ignite|flare|dominate|bloom|assemble|materialize/i.test(stage.id)) {
    return 'peak'
  }

  if (/gather|seed|scan|dissolve|sprout|segment/i.test(stage.id)) {
    return 'gather'
  }

  return index >= total - 2 ? 'reveal' : 'gather'
}

function durationMultiplierForRole(role: StageRole, personaDNA: PersonaDNA) {
  switch (personaDNA.temperament) {
    case 'calm':
      return role === 'arrival' ? 1.1 : role === 'gather' ? 1.12 : role === 'peak' ? 0.96 : role === 'stabilize' ? 1.18 : 1.04
    case 'intense':
      return role === 'arrival' ? 0.9 : role === 'gather' ? 0.86 : role === 'peak' ? 1.04 : role === 'stabilize' ? 0.92 : 0.96
    case 'dynamic':
      return role === 'arrival' ? 0.96 : role === 'gather' ? 0.92 : role === 'peak' ? 1.02 : role === 'stabilize' ? 0.94 : 1.08
    case 'ritual':
      return role === 'arrival' ? 1.16 : role === 'gather' ? 1.12 : role === 'peak' ? 1 : role === 'stabilize' ? 1.14 : 1.06
  }
}

function easingForRole(stage: BirthStage, role: StageRole, personaDNA: PersonaDNA): BirthStage['easing'] {
  if (personaDNA.temperament === 'ritual' || personaDNA.temperament === 'calm') {
    return role === 'peak' ? 'ease-out' : 'ease-in-out'
  }

  if (personaDNA.temperament === 'intense') {
    return role === 'arrival' || role === 'gather' ? 'ease-out' : stage.easing
  }

  if (personaDNA.temperament === 'dynamic' && role === 'arrival') {
    return 'linear'
  }

  return stage.easing
}

function modulateEmphasis(stage: BirthStage, role: StageRole, personaDNA: PersonaDNA) {
  const modulators = resolvePersonaDNAModulators(personaDNA)
  const dominantPayoff = personaDNA.presenceStyle === 'dominant' && (role === 'peak' || role === 'stabilize') ? 0.08 : 0
  const reservedContainment = personaDNA.presenceStyle === 'reserved' && (role === 'peak' || role === 'stabilize') ? -0.06 : 0
  const calmDiscipline = personaDNA.temperament === 'calm' || personaDNA.temperament === 'ritual' ? -0.08 : 0
  const intenseBoost = personaDNA.temperament === 'intense' ? 0.1 : 0
  const dynamicField = personaDNA.temperament === 'dynamic' ? 0.08 : 0

  return {
    origin: clamp(stage.emphasis.origin + (role === 'arrival' ? personaDNA.stability * 0.04 : 0), 0, 1),
    shape: clamp(stage.emphasis.shape + (role !== 'arrival' ? personaDNA.charisma * 0.08 : 0) + dominantPayoff * 0.6, 0, 1),
    core: clamp(stage.emphasis.core + personaDNA.charisma * 0.1 + intenseBoost + dominantPayoff - reservedContainment * 0.4, 0, 1),
    field: clamp(stage.emphasis.field + modulators.fieldSpreadBias * 0.5 + dynamicField + dominantPayoff * 0.4 + reservedContainment, 0, 1),
    particles: clamp(stage.emphasis.particles + personaDNA.wildness * 0.14 + intenseBoost + calmDiscipline + reservedContainment, 0, 1),
  }
}

function modulateTransforms(stage: BirthStage, role: StageRole, personaDNA: PersonaDNA): NonNullable<BirthStage['transforms']> {
  const transforms = stage.transforms ?? {}
  const modulators = resolvePersonaDNAModulators(personaDNA)
  const dominantPayoff = personaDNA.presenceStyle === 'dominant' && (role === 'peak' || role === 'stabilize') ? 0.06 : 0
  const reservedPayoff = personaDNA.presenceStyle === 'reserved' && role === 'stabilize' ? -0.04 : 0
  const ritualControl = personaDNA.temperament === 'ritual' ? -0.06 : 0
  const calmControl = personaDNA.temperament === 'calm' ? -0.04 : 0
  const dynamicVariance = personaDNA.temperament === 'dynamic' ? 0.06 : 0
  const intenseCollapse = personaDNA.temperament === 'intense' && role !== 'stabilize' ? 0.08 : 0

  return {
    originScale: clamp((transforms.originScale ?? 1) + (role === 'arrival' ? personaDNA.stability * 0.04 : 0), 0.48, 1.24),
    originRotation: clamp((transforms.originRotation ?? 0) + dynamicVariance * 0.6 - (personaDNA.temperament === 'ritual' ? 0.03 : 0), -0.24, 0.24),
    shapeScale: clamp((transforms.shapeScale ?? 1) + modulators.postureSpread * 0.12 + dominantPayoff + reservedPayoff, 0.82, 1.18),
    coreScale: clamp((transforms.coreScale ?? 1) + modulators.coreRadiusBias * 0.4 + dominantPayoff - reservedPayoff * 0.3, 0.68, 1.26),
    fieldScale: clamp((transforms.fieldScale ?? 1) + modulators.fieldSpreadBias * 0.48 + (personaDNA.expansion === 'expansive' ? 0.06 : 0) + reservedPayoff, 0.72, 1.24),
    particleBoost: clamp((transforms.particleBoost ?? 1) + modulators.particleDensityBias * 0.8 + dynamicVariance + intenseCollapse + calmControl + ritualControl, 0.42, 1.6),
    deform: clamp((transforms.deform ?? 0) + personaDNA.wildness * 0.08 + dynamicVariance + intenseCollapse + calmControl + ritualControl, 0, 0.32),
  }
}

export function modulateBirthTimeline(args: {
  birthTimeline: BirthTimeline
  personaDNA: PersonaDNA
}): BirthTimeline {
  const stages = args.birthTimeline.stages.map((stage, index, allStages) => {
    const role = resolveStageRole(stage, index, allStages.length)
    const duration = Math.round(stage.duration * durationMultiplierForRole(role, args.personaDNA))

    return {
      ...stage,
      duration,
      easing: easingForRole(stage, role, args.personaDNA),
      emphasis: modulateEmphasis(stage, role, args.personaDNA),
      transforms: modulateTransforms(stage, role, args.personaDNA),
    }
  })

  return {
    ...args.birthTimeline,
    stages,
    duration: stages.reduce((total, stage) => total + stage.duration, 0),
  }
}