import type { PersonaDNA } from '../contracts/PersonaDNA'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export type PersonaEmergenceProfile = {
  pauseDurationMs: number
  particleFadeDurationMs: number
  particleTravelDurationMs: number
  segmentReleaseDurationMs: number
  envelopeDelayMs: number
  coreRevealDurationMs: number
  corePulseDurationMs: number
}

export type PersonaIdleProfile = {
  breathMultiplier: number
  microTensionMultiplier: number
  coreOscillationMultiplier: number
  fieldAttachmentMultiplier: number
  particleActivityMultiplier: number
  particleDispersionMultiplier: number
  rhythmSpeedMultiplier: number
  predictability: number
}

export type PersonaSemanticsProfile = {
  emergence: PersonaEmergenceProfile
  idle: PersonaIdleProfile
}

export function resolvePersonaSemantics(personaDNA?: PersonaDNA): PersonaSemanticsProfile {
  const stability = clamp(personaDNA?.stability ?? 0.62, 0, 1)
  const charisma = clamp(personaDNA?.charisma ?? 0.58, 0, 1)

  let pauseDuration = 190 + (stability - 0.5) * 34 - (charisma - 0.5) * 26
  let particleFadeDuration = 175 + (stability - 0.5) * 30 - (charisma - 0.5) * 18
  let particleTravelDuration = 2120 + (stability - 0.5) * 260 - (charisma - 0.5) * 220
  let segmentReleaseDuration = 180 + (stability - 0.5) * 26
  let envelopeDelay = 110 + stability * 26
  let coreRevealDuration = 172 + charisma * 24
  let corePulseDuration = 1040 - charisma * 110 + stability * 70

  let breathMultiplier = clamp(0.98 + stability * 0.14 - charisma * 0.05, 0.9, 1.12)
  let microTensionMultiplier = clamp(0.94 + charisma * 0.2 - stability * 0.08, 0.88, 1.16)
  let coreOscillationMultiplier = clamp(0.92 + charisma * 0.14 - stability * 0.12, 0.84, 1.14)
  let fieldAttachmentMultiplier = clamp(0.96 + stability * 0.18 - charisma * 0.04, 0.9, 1.18)
  let particleActivityMultiplier = clamp(0.9 + charisma * 0.22 - stability * 0.08, 0.82, 1.18)
  let particleDispersionMultiplier = clamp(0.94 + charisma * 0.12 - stability * 0.18, 0.82, 1.16)
  let rhythmSpeedMultiplier = clamp(0.96 + charisma * 0.08 - stability * 0.06, 0.9, 1.08)
  let predictability = clamp(0.5 + stability * 0.34 - charisma * 0.08, 0.38, 0.86)

  switch (personaDNA?.temperament) {
    case 'calm':
      pauseDuration += 24
      particleFadeDuration += 18
      particleTravelDuration += 180
      segmentReleaseDuration += 14
      envelopeDelay += 16
      coreRevealDuration += 12
      corePulseDuration += 70
      breathMultiplier *= 1.08
      microTensionMultiplier *= 0.9
      coreOscillationMultiplier *= 0.9
      fieldAttachmentMultiplier *= 1.06
      particleActivityMultiplier *= 0.88
      particleDispersionMultiplier *= 0.9
      rhythmSpeedMultiplier *= 0.92
      predictability = clamp(predictability + 0.08, 0.38, 0.94)
      break
    case 'intense':
      pauseDuration -= 24
      particleFadeDuration -= 14
      particleTravelDuration -= 170
      segmentReleaseDuration -= 14
      envelopeDelay -= 20
      coreRevealDuration -= 10
      corePulseDuration -= 80
      breathMultiplier *= 0.94
      microTensionMultiplier *= 1.12
      coreOscillationMultiplier *= 1.08
      fieldAttachmentMultiplier *= 0.96
      particleActivityMultiplier *= 1.14
      particleDispersionMultiplier *= 1.08
      rhythmSpeedMultiplier *= 1.08
      predictability = clamp(predictability - 0.06, 0.32, 0.9)
      break
    case 'ritual':
      pauseDuration += 18
      particleFadeDuration += 12
      particleTravelDuration += 120
      segmentReleaseDuration += 8
      envelopeDelay += 24
      coreRevealDuration += 18
      corePulseDuration += 90
      breathMultiplier *= 1.02
      microTensionMultiplier *= 0.96
      coreOscillationMultiplier *= 0.94
      fieldAttachmentMultiplier *= 1.08
      particleActivityMultiplier *= 0.94
      particleDispersionMultiplier *= 0.9
      rhythmSpeedMultiplier *= 0.95
      predictability = clamp(predictability + 0.14, 0.38, 0.96)
      break
    default:
      break
  }

  switch (personaDNA?.presenceStyle) {
    case 'reserved':
      pauseDuration += 12
      particleFadeDuration += 10
      envelopeDelay += 14
      coreRevealDuration += 8
      breathMultiplier *= 1.04
      microTensionMultiplier *= 0.94
      coreOscillationMultiplier *= 0.93
      fieldAttachmentMultiplier *= 1.04
      particleActivityMultiplier *= 0.92
      particleDispersionMultiplier *= 0.9
      rhythmSpeedMultiplier *= 0.95
      predictability = clamp(predictability + 0.06, 0.38, 0.96)
      break
    case 'dominant':
      pauseDuration -= 10
      particleFadeDuration -= 8
      particleTravelDuration -= 120
      envelopeDelay -= 12
      coreRevealDuration -= 8
      corePulseDuration -= 50
      breathMultiplier *= 0.96
      microTensionMultiplier *= 1.06
      coreOscillationMultiplier *= 1.04
      fieldAttachmentMultiplier *= 0.98
      particleActivityMultiplier *= 1.08
      particleDispersionMultiplier *= 1.06
      rhythmSpeedMultiplier *= 1.04
      predictability = clamp(predictability - 0.04, 0.32, 0.9)
      break
    default:
      break
  }

  pauseDuration = clamp(pauseDuration, 150, 250)
  particleFadeDuration = clamp(particleFadeDuration, 150, 240)
  particleTravelDuration = clamp(particleTravelDuration, 1840, 2400)
  segmentReleaseDuration = clamp(segmentReleaseDuration, 150, 240)
  envelopeDelay = clamp(envelopeDelay, 80, 170)
  coreRevealDuration = clamp(coreRevealDuration, 150, 230)
  corePulseDuration = clamp(corePulseDuration, 920, 1180)

  return {
    emergence: {
      pauseDurationMs: pauseDuration,
      particleFadeDurationMs: particleFadeDuration,
      particleTravelDurationMs: particleTravelDuration,
      segmentReleaseDurationMs: segmentReleaseDuration,
      envelopeDelayMs: envelopeDelay,
      coreRevealDurationMs: coreRevealDuration,
      corePulseDurationMs: corePulseDuration,
    },
    idle: {
      breathMultiplier: clamp(breathMultiplier, 0.88, 1.18),
      microTensionMultiplier: clamp(microTensionMultiplier, 0.82, 1.22),
      coreOscillationMultiplier: clamp(coreOscillationMultiplier, 0.82, 1.18),
      fieldAttachmentMultiplier: clamp(fieldAttachmentMultiplier, 0.88, 1.2),
      particleActivityMultiplier: clamp(particleActivityMultiplier, 0.8, 1.2),
      particleDispersionMultiplier: clamp(particleDispersionMultiplier, 0.82, 1.18),
      rhythmSpeedMultiplier: clamp(rhythmSpeedMultiplier, 0.86, 1.12),
      predictability: clamp(predictability, 0.32, 0.96),
    },
  }
}