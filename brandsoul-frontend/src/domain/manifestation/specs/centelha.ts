import type { ManifestationSpec } from '../contracts/ManifestationSpec'

const silhouette = {
  bodyPath: 'M120 18C147 18 171 33 183 58C194 82 193 109 186 133C178 160 167 188 142 203C117 218 82 216 60 197C38 178 31 149 34 122C37 96 53 77 68 60C83 42 92 18 120 18Z',
  innerPath: 'M120 50C136 50 148 58 154 72C160 85 159 99 154 113C149 127 142 142 129 149C115 157 95 156 83 148C70 140 65 125 66 111C67 97 76 87 86 78C95 67 103 50 120 50Z',
}

const birthTimeline = {
  stages: [
    {
      id: 'seed',
      label: 'Seed',
      duration: 560,
      easing: 'ease-in-out' as const,
      emphasis: { origin: 0.82, shape: 0.28, core: 0.72, field: 0.3, particles: 0.2 },
      transforms: { originScale: 0.86, coreScale: 0.92, particleBoost: 0.7 },
    },
    {
      id: 'gather',
      label: 'Gather',
      duration: 620,
      easing: 'ease-in-out' as const,
      emphasis: { origin: 0.64, shape: 0.54, core: 0.78, field: 0.48, particles: 0.42 },
      transforms: { shapeScale: 0.94, fieldScale: 0.92, particleBoost: 0.92, deform: 0.04 },
    },
    {
      id: 'ignite',
      label: 'Ignite',
      duration: 700,
      easing: 'ease-out' as const,
      emphasis: { origin: 0.34, shape: 0.82, core: 0.94, field: 0.7, particles: 0.88 },
      transforms: { shapeScale: 1.08, coreScale: 1.12, fieldScale: 1.06, particleBoost: 1.08, deform: 0.1 },
    },
    {
      id: 'flare',
      label: 'Flare',
      duration: 520,
      easing: 'ease-out' as const,
      emphasis: { origin: 0.26, shape: 0.78, core: 0.9, field: 0.76, particles: 0.82 },
      transforms: { shapeScale: 1.12, coreScale: 1.14, fieldScale: 1.08, particleBoost: 1.14, deform: 0.14 },
    },
    {
      id: 'stabilize',
      label: 'Stabilize',
      duration: 820,
      easing: 'ease-in-out' as const,
      emphasis: { origin: 0.4, shape: 0.72, core: 0.86, field: 0.64, particles: 0.38 },
      transforms: { shapeScale: 1, coreScale: 1.04, fieldScale: 1.02, particleBoost: 0.82, deform: 0.02 },
    },
  ],
}

export const centelhaSpec: ManifestationSpec = {
  id: 'centelha',
  label: 'Centelha',
  description: 'Presenca concentrada, luminosa e responsiva.',
  artDirection: {
    contrast: 'high',
    abstractionLevel: 'medium',
    shapeRelation: 'compresses around the ignition core',
    massDistribution: 'centralized compressed field',
    texture: 'electric glow',
    lightBehavior: 'pulsing core with flare',
    shapeFillStrategy: 'core-glow',
  },
  behavior: {
    idle: 'pulse-breathe',
    hover: 'flare-expand',
    birth: 'ignite-from-emission',
    stabilize: 'pulse-breathe',
  },
  birthTimeline: {
    ...birthTimeline,
    duration: birthTimeline.stages.reduce((sum, stage) => sum + stage.duration, 0),
  },
  runtime: {
    defaultVisual: {
      accent: '#ff9460',
      secondarySource: 'secondary',
      shape: 'flare',
      motion: 'pulse',
      glow: 'bold',
      density: 'balanced',
    },
    variantOverrides: {
      'fused-logo': {
        visual: { shape: 'flare', glow: 'focused' },
        silhouette,
      },
      'living-glow': {
        visual: { shape: 'halo', glow: 'bold', motion: 'float' },
        silhouette,
      },
      'inspired-shape': {
        visual: { shape: 'prism', glow: 'soft', density: 'airy' },
        silhouette,
      },
    },
  },
}