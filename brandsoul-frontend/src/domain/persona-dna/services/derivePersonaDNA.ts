import type { BaseFormProfile } from '../../base-form/contracts/BaseFormProfile'
import type { VisualEssence } from '../../identity/contracts/VisualEssence'
import type { ShapeSignature } from '../../shape/contracts/ProcessedShape'
import type { PersonaDNA } from '../contracts/PersonaDNA'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveTemperament(args: {
  signature?: ShapeSignature
  baseForm: BaseFormProfile
  visualEssence?: VisualEssence
  stability: number
  wildness: number
}): PersonaDNA['temperament'] {
  const { signature, baseForm, visualEssence, stability, wildness } = args

  if (
    baseForm.family === 'flare' ||
    (visualEssence?.composition === 'centered' && visualEssence.intensity === 'vivid' && stability > 0.64 && (signature?.symmetry ?? 0.5) > 0.62)
  ) {
    return 'ritual'
  }

  if (wildness > 0.68 || (signature?.fragmentation ?? 0) > 0.62 || (signature?.angularity ?? 0) > 0.62) {
    return 'intense'
  }

  if (baseForm.family === 'lattice' || baseForm.family === 'shard' || baseForm.massDistribution === 'distributed') {
    return 'dynamic'
  }

  return stability > 0.58 ? 'calm' : 'dynamic'
}

export function derivePersonaDNA(args: {
  shapeSignature?: ShapeSignature
  baseFormProfile: BaseFormProfile
  visualEssence?: VisualEssence
}): PersonaDNA {
  const { shapeSignature: signature, baseFormProfile: baseForm, visualEssence } = args
  const symmetry = signature?.symmetry ?? 0.5
  const angularity = signature?.angularity ?? 0.42
  const fragmentation = signature?.fragmentation ?? 0.28
  const circularity = signature?.circularity ?? 0.5
  const concentrated = signature?.massDistribution === 'concentrated'
  const spread = signature?.massDistribution === 'spread'
  const structure = visualEssence?.structure

  const defensiveness = clamp(
    0.26 +
      (baseForm.bodyCompression > 0.46 ? 0.18 : 0) +
      baseForm.bodyCompression * 0.24 +
      (baseForm.edgeDiscipline === 'sharp' ? 0.16 : baseForm.edgeDiscipline === 'controlled' ? 0.08 : -0.04) +
      (concentrated ? 0.08 : 0) -
      (spread ? 0.08 : 0) -
      (visualEssence?.composition === 'spread' ? 0.06 : 0),
  )

  const charisma = clamp(
    0.34 +
      baseForm.openness * 0.2 +
      (baseForm.family === 'flare' ? 0.16 : baseForm.family === 'orb' ? 0.08 : 0) +
      (visualEssence?.contrast === 'high' ? 0.08 : 0) +
      (visualEssence?.intensity === 'vivid' ? 0.08 : 0) +
      (spread ? 0.08 : 0),
  )

  const stability = clamp(
    0.3 +
      symmetry * 0.24 +
      (baseForm.family === 'orb' ? 0.12 : baseForm.family === 'totem' ? 0.1 : 0) +
      (baseForm.edgeDiscipline === 'controlled' ? 0.08 : 0) +
      (concentrated ? 0.06 : 0) -
      fragmentation * 0.18 -
      (visualEssence?.intensity === 'vivid' ? 0.04 : 0),
  )

  const wildness = clamp(
    0.12 +
      fragmentation * 0.32 +
      angularity * 0.18 +
      (baseForm.family === 'shard' ? 0.16 : baseForm.family === 'lattice' ? 0.08 : 0) +
      (structure === 'organic' ? 0.06 : 0) +
      (visualEssence?.intensity === 'vivid' ? 0.08 : 0) -
      symmetry * 0.12,
  )

  const precision: PersonaDNA['precision'] =
    baseForm.edgeDiscipline === 'sharp' ||
    baseForm.edgeDiscipline === 'controlled' ||
    structure === 'angular' ||
    (visualEssence?.temperature === 'cool' && angularity > 0.46)
      ? 'precise'
      : structure === 'organic' || baseForm.edgeDiscipline === 'soft' || circularity > 0.74
        ? 'organic'
        : 'balanced'

  const expansion: PersonaDNA['expansion'] =
    baseForm.bodyCompression > 0.46 || concentrated
      ? 'compact'
      : baseForm.openness > 0.58 || spread || baseForm.massDistribution === 'distributed'
        ? 'expansive'
        : 'balanced'

  const presenceStyle: PersonaDNA['presenceStyle'] =
    charisma > 0.72 || (baseForm.family === 'totem' && stability > 0.6)
      ? 'dominant'
      : defensiveness > 0.68 && charisma < 0.48
        ? 'reserved'
        : 'balanced'

  return {
    temperament: resolveTemperament({ signature, baseForm, visualEssence, stability, wildness }),
    presenceStyle,
    precision,
    expansion,
    defensiveness,
    charisma,
    stability,
    wildness,
  }
}
