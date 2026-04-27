import type { ManifestationSpec } from '../contracts/ManifestationSpec'

const stages = [
  {
    id: 'scan',
    label: 'Scan',
    duration: 420,
    easing: 'linear' as const,
    emphasis: { origin: 0.82, shape: 0.18, core: 0.4, field: 0.26, particles: 0.12 },
    transforms: { originScale: 0.88, particleBoost: 0.64 },
  },
  {
    id: 'assemble',
    label: 'Assemble',
    duration: 560,
    easing: 'ease-out' as const,
    emphasis: { origin: 0.5, shape: 0.74, core: 0.62, field: 0.38, particles: 0.32 },
    transforms: { shapeScale: 1.04, coreScale: 1.06, particleBoost: 0.9, deform: 0.04 },
  },
  {
    id: 'stabilize',
    label: 'Stabilize',
    duration: 620,
    easing: 'ease-in-out' as const,
    emphasis: { origin: 0.4, shape: 0.66, core: 0.7, field: 0.32, particles: 0.22 },
    transforms: { shapeScale: 1, coreScale: 1.02, particleBoost: 0.74, deform: 0.01 },
  },
]

export const roboSpec: ManifestationSpec = {
  id: 'robo-ia',
  label: 'Robo IA',
  description: 'Sinal técnico modular com presença controlada.',
  artDirection: {
    contrast: 'high',
    abstractionLevel: 'low',
    shapeRelation: 'rebuilds through modular segments',
    massDistribution: 'grid modular mass',
    texture: 'technical signal mesh',
    lightBehavior: 'technical signal sweep',
    shapeFillStrategy: 'segmented-core',
  },
  behavior: {
    idle: 'signal-hum',
    hover: 'signal-boost',
    birth: 'scan-and-assemble',
    stabilize: 'signal-hum',
  },
  birthTimeline: {
    stages,
    duration: stages.reduce((sum, stage) => sum + stage.duration, 0),
  },
  runtime: {
    defaultVisual: {
      accent: '#6e86ff',
      secondarySource: 'primary',
      shape: 'prism',
      motion: 'drift',
      glow: 'focused',
      density: 'compact',
    },
    variantOverrides: {
      'premium-tech': { visual: { glow: 'bold', density: 'compact' } },
      default: { visual: { glow: 'focused' } },
    },
  },
}