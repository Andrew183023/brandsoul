import type { ManifestationSpec } from '../contracts/ManifestationSpec'

function createElementalSpec(): ManifestationSpec {
  const stages = [
    {
      id: 'gather',
      label: 'Gather',
      duration: 520,
      easing: 'ease-in-out' as const,
      emphasis: { origin: 0.7, shape: 0.42, core: 0.48, field: 0.62, particles: 0.34 },
      transforms: { fieldScale: 0.94, particleBoost: 0.8 },
    },
    {
      id: 'materialize',
      label: 'Materialize',
      duration: 700,
      easing: 'ease-out' as const,
      emphasis: { origin: 0.42, shape: 0.8, core: 0.56, field: 0.82, particles: 0.54 },
      transforms: { shapeScale: 1.06, fieldScale: 1.08, particleBoost: 1.02, deform: 0.08 },
    },
    {
      id: 'stabilize',
      label: 'Stabilize',
      duration: 760,
      easing: 'ease-in-out' as const,
      emphasis: { origin: 0.4, shape: 0.68, core: 0.5, field: 0.74, particles: 0.36 },
      transforms: { fieldScale: 1.02, particleBoost: 0.84, deform: 0.02 },
    },
  ]

  return {
    id: 'elemental',
    label: 'Elemental',
    description: 'Materia viva orientada por campo e contraste.',
    artDirection: {
      contrast: 'medium',
      abstractionLevel: 'medium',
      shapeRelation: 'reincarnates through elemental drift',
      massDistribution: 'material field with directional spread',
      texture: 'elemental layers',
      lightBehavior: 'physical light in motion',
      shapeFillStrategy: 'layered-field',
    },
    behavior: {
      idle: 'material-drift',
      hover: 'flare-expand',
      birth: 'materialize-field',
      stabilize: 'material-drift',
    },
    birthTimeline: {
      stages,
      duration: stages.reduce((sum, stage) => sum + stage.duration, 0),
    },
    runtime: {
      defaultVisual: {
        accent: '#ff9460',
        secondarySource: 'secondary',
        shape: 'prism',
        motion: 'drift',
        glow: 'soft',
        density: 'balanced',
      },
      variantOverrides: {
        fogo: { visual: { glow: 'bold' } },
        agua: { visual: { motion: 'float', density: 'airy' } },
        terra: { visual: { shape: 'prism', density: 'compact' } },
        ar: { visual: { shape: 'halo', density: 'airy' } },
      },
    },
  }
}

export const elementalSpec = createElementalSpec()