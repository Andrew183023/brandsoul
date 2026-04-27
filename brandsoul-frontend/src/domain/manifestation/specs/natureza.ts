import type { ManifestationSpec } from '../contracts/ManifestationSpec'

const stages = [
  {
    id: 'seed',
    label: 'Seed',
    duration: 620,
    easing: 'ease-in-out' as const,
    emphasis: { origin: 0.76, shape: 0.24, core: 0.36, field: 0.48, particles: 0.18 },
    transforms: { originScale: 0.92, fieldScale: 0.9, particleBoost: 0.72 },
  },
  {
    id: 'sprout',
    label: 'Sprout',
    duration: 760,
    easing: 'ease-out' as const,
    emphasis: { origin: 0.46, shape: 0.72, core: 0.42, field: 0.78, particles: 0.4 },
    transforms: { shapeScale: 1.04, fieldScale: 1.12, particleBoost: 0.92, deform: 0.06 },
  },
  {
    id: 'bloom',
    label: 'Bloom',
    duration: 860,
    easing: 'ease-in-out' as const,
    emphasis: { origin: 0.34, shape: 0.84, core: 0.52, field: 0.88, particles: 0.52 },
    transforms: { shapeScale: 1.08, fieldScale: 1.16, particleBoost: 1.02, deform: 0.08 },
  },
  {
    id: 'stabilize',
    label: 'Stabilize',
    duration: 940,
    easing: 'ease-in-out' as const,
    emphasis: { origin: 0.3, shape: 0.68, core: 0.46, field: 0.8, particles: 0.34 },
    transforms: { fieldScale: 1.04, particleBoost: 0.78, deform: 0.03 },
  },
]

export const naturezaSpec: ManifestationSpec = {
  id: 'natureza',
  label: 'Natureza',
  description: 'Crescimento orgânico com expansão respirada.',
  artDirection: {
    contrast: 'medium',
    abstractionLevel: 'high',
    shapeRelation: 'germinates into organic canopy',
    massDistribution: 'growth outward bloom',
    texture: 'organic membrane',
    lightBehavior: 'breathing bloom',
    shapeFillStrategy: 'organic-field',
  },
  behavior: {
    idle: 'organic-breathe',
    hover: 'bloom-lift',
    birth: 'sprout-and-bloom',
    stabilize: 'organic-breathe',
  },
  birthTimeline: {
    stages,
    duration: stages.reduce((sum, stage) => sum + stage.duration, 0),
  },
  runtime: {
    defaultVisual: {
      accent: '#79c98a',
      secondarySource: 'secondary',
      shape: 'halo',
      motion: 'float',
      glow: 'soft',
      density: 'airy',
    },
    variantOverrides: {
      folhas: { visual: { shape: 'flare', density: 'balanced' } },
      semente: { visual: { shape: 'halo', glow: 'focused' } },
    },
  },
}