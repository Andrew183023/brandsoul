import { describe, expect, it } from 'vitest'

import type { EntityProfile } from '../../entity/contracts/EntityProfile'
import type { BrandSoulVisualRuntimePatch } from '../contracts/BrandSoulVisualRuntimePatch'
import { buildVisualFinishPlan } from '../../materialization/services/buildVisualFinishPlan'
import type { TimelineState } from '../../orchestration/contracts/TimelineState'
import type { RenderOutput } from '../contracts/RenderOutput'
import { resolveRenderOutput } from './resolveRenderOutput'

const baseBrand = {
  logoPreview: 'data:image/png;base64,preview',
  visualEssence: {
    primaryColor: '#ff9460',
    secondaryColor: '#6e86ff',
    energyColor: '#ffbf8d',
    neutralColor: '#8d97aa',
    contrast: 'medium',
    saturation: 'medium',
    temperature: 'neutral',
    brightness: 0.5,
    structure: 'balanced',
    composition: 'centered',
    intensity: 'vivid',
    dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
  },
  shapeSource: {
    sourceType: 'svg',
    shapeData: {
      type: 'contour',
      points: [],
      boundingBox: { minX: 0, minY: 0, maxX: 120, maxY: 120, width: 120, height: 120 },
      centroid: { x: 60, y: 60 },
    },
    signature: {
      type: 'orbital',
      dominantAxis: 'radial',
      area: 7200,
      complexity: 0.44,
      curvature: 'high',
      curvatureRatio: 0.82,
      angularity: 0.18,
      circularity: 0.88,
      density: 0.7,
      symmetry: 0.84,
      symmetryHorizontal: 0.82,
      symmetryVertical: 0.86,
      massDistribution: 'concentrated',
      fragmentation: 0.12,
    },
    debug: {
      contourPoints: [],
      centroid: { x: 60, y: 60 },
    },
  },
} as const satisfies EntityProfile['brand']

function buildRuntimeRenderOutput(
  anatomySource: 'visual-body-plan' | 'renderer-fallback' | 'preview-body' | 'core-symbol' = 'renderer-fallback',
): RenderOutput {
  return {
    manifestationSpec: {} as RenderOutput['manifestationSpec'],
    anatomySource,
    renderType: 'abstract-shape',
    particles: {
      count: 12,
      emitterConfig: {
        origin: { x: 120, y: 120 },
        direction: { angle: -90, spread: 120 },
        spawnRate: 1,
        maxParticles: 24,
        lifetime: { min: 800, max: 1400 },
        color: ['#ff9460', '#6e86ff'],
        size: { min: 2, max: 4 },
        velocity: { min: 12, max: 24 },
        opacity: { start: 0.7, end: 0 },
      },
    },
    shapes: {
      bodyPath: 'M64 40 Q120 24 176 40 Q200 120 176 200 Q120 216 64 200 Q40 120 64 40 Z',
      innerPath: 'M88 72 Q120 60 152 72 Q168 120 152 168 Q120 180 88 168 Q72 120 88 72 Z',
      usesLogoMask: false,
    },
    animationConfig: {
      rootClassName: 'manifestation-mode-centelha manifestation-variant-fused-logo',
      styleVars: {
        '--persona-lab-accent': '#ff9460',
        '--persona-lab-secondary': '#6e86ff',
        '--persona-lab-energy': '#ffbf8d',
        '--persona-lab-neutral': '#8d97aa',
      },
    },
    anatomy: {
      layers: ['shape', 'core'],
      classNames: [],
    },
    debugShape: {
      readabilityScore: 82,
      silhouetteContrast: 'medium',
    },
  }
}

function buildEntityProfile(overrides?: Partial<EntityProfile>): EntityProfile {
  const baseProfile = {
    id: 'entity-1',
    schemaVersion: 1,
    source: 'frontend-local',
    brand: baseBrand,
    context: {
      brandCategory: 'other',
      styleAnswers: {},
    },
    palette: {
      primary: '#ff9460',
      secondary: '#6e86ff',
      contrast: 'medium',
    },
    social: {} as EntityProfile['social'],
    export: {} as EntityProfile['export'],
    manifestation: {
      mode: 'centelha',
      variant: 'fused-logo',
      intensity: 'balanced',
      spec: {} as EntityProfile['manifestation']['spec'],
      artDirection: {
        shapeRelation: 'symbolic',
        massDistribution: 'compressed-core',
        abstractionLevel: 'medium',
        shapeFillStrategy: 'solid',
        contrast: 'high',
        texture: 'luminous',
        lightBehavior: 'focused',
        rhythm: 'pulse',
        prohibitions: [],
        successReading: 'clear silhouette',
      },
      behavior: {} as EntityProfile['manifestation']['behavior'],
      birthTimeline: {
        steps: [],
        duration: 2400,
        stages: [],
      },
    },
    personaDNA: {
      temperament: 'calm',
      presenceStyle: 'balanced',
      precision: 'balanced',
      expansion: 'balanced',
      defensiveness: 0.38,
      charisma: 0.52,
      stability: 0.68,
      wildness: 0.24,
    },
    visualArchetype: {
      bodyType: 'orbital',
      constructionStyle: 'energy-based',
      silhouetteStrategy: 'exaggerate',
      corePlacement: 'centered',
      visualLanguage: 'minimal',
      structureProfile: {
        axisEmphasis: 'radial',
        massFrame: 'compact',
        cohesion: 0.78,
        rigidity: 0.44,
        openness: 0.48,
      },
      silhouetteProfile: {
        preservation: 0.52,
        exaggeration: 0.64,
        reconstruction: 0.22,
        edgeEmphasis: 0.58,
      },
      surfaceProfile: {
        surfaceBehavior: 'smooth',
        textureIntensity: 0.28,
        contrastBias: 0.56,
      },
    },
    visualBodyPlan: {
      bodyPath: 'M64 40 Q120 24 176 40 Q200 120 176 200 Q120 216 64 200 Q40 120 64 40 Z',
      innerPath: 'M88 72 Q120 60 152 72 Q168 120 152 168 Q120 180 88 168 Q72 120 88 72 Z',
      core: {
        position: { x: 120, y: 114 },
        radius: 18,
        intensity: 0.68,
      },
      structure: {
        anchors: [{ id: 'core', point: { x: 120, y: 114 }, role: 'core', weight: 1 }],
        segments: [],
        cavities: [{ id: 'primary', center: { x: 120, y: 114 }, radiusX: 14, radiusY: 14, weight: 0.8 }],
      },
      silhouette: {
        strategy: 'exaggerate',
        envelopePath: 'M64 40 Q120 24 176 40 Q200 120 176 200 Q120 216 64 200 Q40 120 64 40 Z',
        boundingBox: { minX: 40, minY: 24, maxX: 200, maxY: 216, width: 160, height: 192 },
        legibility: 0.78,
      },
    },
    morphology: {
      source: 'shape-intelligence',
      shapeRelation: 'symbolic',
      massDistribution: 'compressed-core',
      abstractionLevel: 'medium',
      fillStrategy: 'solid',
      baseForm: {
        family: 'orb',
        spine: 'radial',
        massDistribution: 'centered',
        edgeDiscipline: 'controlled',
        openness: 0.42,
        bodyCompression: 0.2,
        corePlacement: { x: 0.5, y: 0.48 },
      },
      edgeStrength: 0.72,
      silhouetteClarity: 'medium',
      typographicProtection: false,
      axis: 'radial',
      symmetry: 'radial',
      structuralComplexity: 0.46,
      coreZones: [],
      fieldRelation: {
        mask: 'shape-bound',
        spread: 0.52,
        adhesion: 0.64,
      },
      anchors: [],
      emissionPoints: [],
      processedShape: undefined,
    },
    behavior: {
      birth: { speed: 1.18 } as EntityProfile['behavior']['birth'],
      idle: {} as EntityProfile['behavior']['idle'],
      hover: {} as EntityProfile['behavior']['hover'],
      stabilize: { speed: 0.92 } as EntityProfile['behavior']['stabilize'],
      rhythm: { base: 'pulse', pulse: 0.8, speed: 1, variance: 0.16 } as EntityProfile['behavior']['rhythm'],
      intensityRules: [],
    },
    relational: {} as EntityProfile['relational'],
    finalForm: {
      intensity: 'balanced',
      edgeStrength: 0.74,
      shape: { opacity: 1, deformation: 0.08 } as EntityProfile['finalForm']['shape'],
      core: { opacity: 0.64, intensity: 0.7, internalPresence: 0.58, blur: 0.28 } as EntityProfile['finalForm']['core'],
      field: { opacity: 0.58, intensity: 0.62, spread: 1 } as EntityProfile['finalForm']['field'],
      particles: { opacity: 0.64, size: 1, intensity: 0.82, spread: 1, budget: 'medium' } as EntityProfile['finalForm']['particles'],
      layerVisibility: {},
    } as EntityProfile['finalForm'],
    metadata: {
      createdAt: new Date().toISOString(),
    },
  } satisfies Omit<EntityProfile, 'visualFinishPlan'>

  const merged: EntityProfile = {
    ...baseProfile,
    ...overrides,
    visualArchetype: overrides?.visualArchetype ?? baseProfile.visualArchetype,
    visualBodyPlan: overrides?.visualBodyPlan ?? baseProfile.visualBodyPlan,
    visualFinishPlan: overrides?.visualFinishPlan ?? buildVisualFinishPlan({
      visualArchetype: overrides?.visualArchetype ?? baseProfile.visualArchetype,
      visualBodyPlan: overrides?.visualBodyPlan ?? baseProfile.visualBodyPlan,
    }),
  }

  return {
    ...merged,
    visualFinishPlan: overrides?.visualFinishPlan ?? buildVisualFinishPlan({
      visualArchetype: merged.visualArchetype,
      visualBodyPlan: merged.visualBodyPlan,
    }),
  }
}

function buildTimelineState(id: string, index: number, overallProgress: number, stageProgress: number): TimelineState {
  return {
    id,
    index,
    overallProgress,
    stageProgress,
    active: true,
    originOpacity: 1,
    originScale: 1,
    originRotation: 0,
    shapeOpacity: 1,
    shapeScale: 1,
    shapeDeform: 0,
    coreOpacity: 1,
    coreScale: 1,
    coreFlare: 1,
    fieldOpacity: 1,
    fieldScale: 1,
    particleOpacity: 1,
    particleBoost: 1,
  }
}

describe('resolveRenderOutput degraded visuals', () => {
  it('dampens field and particles while reinforcing silhouette and core for weak raster shapes', () => {
    const strong = resolveRenderOutput(buildEntityProfile())
    const degraded = resolveRenderOutput(
      buildEntityProfile({
        brand: {
          ...baseBrand,
          shapeSource: {
            ...baseBrand.shapeSource,
            sourceType: 'raster',
            signature: {
              ...baseBrand.shapeSource.signature,
              type: 'fragmentado',
              density: 0.22,
              symmetry: 0.24,
              symmetryHorizontal: 0.22,
              symmetryVertical: 0.26,
              circularity: 0.22,
              fragmentation: 0.84,
            },
          },
        },
      }),
    )

    expect(degraded.shape.edgeWidth).toBeGreaterThan(strong.shape.edgeWidth)
    expect(degraded.core.radius).toBeGreaterThan(strong.core.radius)
    expect(degraded.field.accentAlpha).toBeLessThan(strong.field.accentAlpha)
    expect(degraded.particles.alpha).toBeLessThan(strong.particles.alpha)
    expect(degraded.particles.densityMultiplier).toBeLessThan(strong.particles.densityMultiplier)
    expect(strong.composition.secondary).toBe('#ffbf8d')
    expect(strong.composition.neutral).toBe('#8d97aa')
  })

  it('uses VisualBodyPlan anatomy to modulate nucleus, emitter origin and field framing only when anatomy is sovereign', () => {
    const visualBodyPlanEntity = buildEntityProfile({
      runtime: {
        renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
      },
      visualBodyPlan: {
        bodyPath: 'M44 30 Q120 16 196 38 Q214 118 186 206 Q120 224 54 198 Q22 118 44 30 Z',
        innerPath: 'M76 64 Q120 50 164 70 Q178 118 156 174 Q120 188 82 170 Q64 120 76 64 Z',
        core: {
          position: { x: 142, y: 96 },
          radius: 26,
          intensity: 0.92,
        },
        structure: {
          anchors: [
            { id: 'core', point: { x: 142, y: 96 }, role: 'core', weight: 1 },
            { id: 'emit-1', point: { x: 182, y: 76 }, role: 'emission', weight: 0.94 },
            { id: 'edge-1', point: { x: 54, y: 124 }, role: 'edge', weight: 0.72 },
          ],
          segments: [],
          cavities: [],
        },
        silhouette: {
          strategy: 'exaggerate',
          envelopePath: 'M44 30 Q120 16 196 38 Q214 118 186 206 Q120 224 54 198 Q22 118 44 30 Z',
          boundingBox: { minX: 22, minY: 16, maxX: 214, maxY: 224, width: 192, height: 208 },
          legibility: 0.88,
        },
      },
    })

    const fallbackEntity = buildEntityProfile({
      runtime: {
        renderOutput: buildRuntimeRenderOutput('renderer-fallback'),
      },
      visualBodyPlan: visualBodyPlanEntity.visualBodyPlan,
    })

    const anatomical = resolveRenderOutput(visualBodyPlanEntity)
    const fallback = resolveRenderOutput(fallbackEntity)

    expect(anatomical.anatomy.source).toBe('visual-body-plan')
    expect(anatomical.anatomy.emissionOrigin).toEqual({ x: 182, y: 76 })
    expect(anatomical.particles.emitterConfig?.origin).toEqual({ x: 182, y: 76 })
    expect(anatomical.core.radius).toBeGreaterThan(fallback.core.radius)
    expect(anatomical.field.spread).toBeLessThan(fallback.field.spread)
    expect(anatomical.core.offsetX).toBeGreaterThan(0)
    expect(anatomical.core.offsetY).toBeLessThan(0)
    expect(fallback.particles.emitterConfig?.origin).toEqual({ x: 120, y: 120 })
    expect(fallback.anatomy.source).toBe('renderer-fallback')
    expect(fallback.anatomy.silhouette).toBeUndefined()
  })

  it('uses legibility to increase or dampen runtime noise when anatomy comes from the visual body plan', () => {
    const baseProfile = buildEntityProfile()
    const highLegibility = resolveRenderOutput(
      buildEntityProfile({
        runtime: {
          renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
        },
        visualBodyPlan: {
          ...baseProfile.visualBodyPlan,
          silhouette: {
            ...baseProfile.visualBodyPlan.silhouette,
            legibility: 0.92,
          },
        },
      }),
    )

    const lowLegibility = resolveRenderOutput(
      buildEntityProfile({
        runtime: {
          renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
        },
        visualBodyPlan: {
          ...baseProfile.visualBodyPlan,
          silhouette: {
            ...baseProfile.visualBodyPlan.silhouette,
            legibility: 0.28,
          },
        },
      }),
    )

    expect(highLegibility.field.detailAlpha).toBeGreaterThan(lowLegibility.field.detailAlpha)
    expect(highLegibility.particles.alpha).toBeGreaterThan(lowLegibility.particles.alpha)
    expect(highLegibility.particles.spread).toBeLessThan(lowLegibility.particles.spread)
    expect(highLegibility.anatomy.silhouette?.legibility).toBe(0.92)
  })

  it('uses anatomical anchors, segments, cavities and core to steer birth staging over time', () => {
    const entity = buildEntityProfile({
      runtime: {
        renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
      },
      visualBodyPlan: {
        bodyPath: 'M36 28 Q116 12 202 42 Q220 126 182 214 Q116 228 48 196 Q18 118 36 28 Z',
        innerPath: 'M76 62 Q122 50 170 72 Q180 122 156 176 Q120 190 78 170 Q64 120 76 62 Z',
        core: {
          position: { x: 132, y: 112 },
          radius: 24,
          intensity: 0.88,
        },
        structure: {
          anchors: [
            { id: 'core', point: { x: 132, y: 112 }, role: 'core', weight: 1 },
            { id: 'emit-0', point: { x: 190, y: 74 }, role: 'emission', weight: 0.96 },
            { id: 'emit-1', point: { x: 58, y: 142 }, role: 'emission', weight: 0.74 },
            { id: 'axis-0', point: { x: 148, y: 82 }, role: 'axis', weight: 0.82 },
          ],
          segments: [
            { id: 'seg-0', from: { x: 190, y: 74 }, to: { x: 160, y: 98 }, weight: 0.92 },
            { id: 'seg-1', from: { x: 58, y: 142 }, to: { x: 122, y: 132 }, weight: 0.7 },
            { id: 'seg-2', from: { x: 148, y: 82 }, to: { x: 138, y: 108 }, weight: 0.86 },
          ],
          cavities: [
            { id: 'void-0', center: { x: 104, y: 144 }, radiusX: 16, radiusY: 12, weight: 0.66 },
          ],
        },
        silhouette: {
          strategy: 'reconstruct',
          envelopePath: 'M36 28 Q116 12 202 42 Q220 126 182 214 Q116 228 48 196 Q18 118 36 28 Z',
          boundingBox: { minX: 18, minY: 12, maxX: 220, maxY: 228, width: 202, height: 216 },
          legibility: 0.84,
        },
      },
    })

    const origin = resolveRenderOutput(entity, {
      timelineState: buildTimelineState('gather', 1, 0.22, 0.46),
      timelineProgress: 0.22,
    })
    const formation = resolveRenderOutput(entity, {
      timelineState: buildTimelineState('align', 3, 0.58, 0.54),
      timelineProgress: 0.58,
    })
    const stabilize = resolveRenderOutput(entity, {
      timelineState: buildTimelineState('stabilize', 4, 0.92, 0.44),
      timelineProgress: 0.92,
    })

    expect(origin.particles.emitterConfig?.origin).toEqual({ x: 190, y: 74 })
    expect(formation.particles.emitterConfig?.origin).toEqual(formation.anatomy.convergencePoint)
    expect(stabilize.particles.emitterConfig?.origin).toEqual({ x: 132, y: 112 })
    expect(formation.particles.densityMultiplier).toBeGreaterThan(origin.particles.densityMultiplier)
    expect(formation.field.detailAlpha).toBeGreaterThan(origin.field.detailAlpha)
    expect(stabilize.particles.spread).toBeLessThan(origin.particles.spread)
    expect(formation.anatomy.segmentCount).toBe(3)
    expect(formation.anatomy.cavityCount).toBe(1)
  })

  it('keeps idle behavior tied to anatomy stability versus dispersion across body plans', () => {
    const linear = resolveRenderOutput(
      buildEntityProfile({
        runtime: {
          renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
        },
        visualArchetype: {
          ...buildEntityProfile().visualArchetype,
          bodyType: 'linear',
        },
        visualBodyPlan: {
          ...buildEntityProfile().visualBodyPlan,
          core: {
            position: { x: 120, y: 112 },
            radius: 20,
            intensity: 0.82,
          },
          structure: {
            anchors: [
              { id: 'core', point: { x: 120, y: 112 }, role: 'core', weight: 1 },
              { id: 'axis-top', point: { x: 120, y: 54 }, role: 'axis', weight: 0.92 },
              { id: 'axis-mid', point: { x: 120, y: 98 }, role: 'axis', weight: 0.88 },
              { id: 'axis-bottom', point: { x: 120, y: 176 }, role: 'axis', weight: 0.9 },
              { id: 'edge-left', point: { x: 82, y: 118 }, role: 'edge', weight: 0.54 },
              { id: 'edge-right', point: { x: 158, y: 118 }, role: 'edge', weight: 0.54 },
            ],
            segments: [
              { id: 'col-0', from: { x: 120, y: 54 }, to: { x: 120, y: 98 }, weight: 0.94 },
              { id: 'col-1', from: { x: 120, y: 98 }, to: { x: 120, y: 176 }, weight: 0.92 },
              { id: 'rib-0', from: { x: 120, y: 112 }, to: { x: 82, y: 118 }, weight: 0.58 },
              { id: 'rib-1', from: { x: 120, y: 112 }, to: { x: 158, y: 118 }, weight: 0.58 },
            ],
            cavities: [{ id: 'core-column', center: { x: 120, y: 112 }, radiusX: 10, radiusY: 28, weight: 0.78 }],
          },
        },
      }),
    )

    const fragmented = resolveRenderOutput(
      buildEntityProfile({
        runtime: {
          renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
        },
        visualArchetype: {
          ...buildEntityProfile().visualArchetype,
          bodyType: 'fragmented',
        },
        visualBodyPlan: {
          ...buildEntityProfile().visualBodyPlan,
          core: {
            position: { x: 142, y: 96 },
            radius: 18,
            intensity: 0.74,
          },
          structure: {
            anchors: [
              { id: 'core', point: { x: 142, y: 96 }, role: 'core', weight: 1 },
              { id: 'emit-0', point: { x: 188, y: 72 }, role: 'emission', weight: 0.92 },
              { id: 'emit-1', point: { x: 62, y: 124 }, role: 'emission', weight: 0.86 },
              { id: 'edge-0', point: { x: 84, y: 188 }, role: 'edge', weight: 0.72 },
              { id: 'edge-1', point: { x: 176, y: 180 }, role: 'edge', weight: 0.68 },
            ],
            segments: [
              { id: 'frag-0', from: { x: 188, y: 72 }, to: { x: 158, y: 110 }, weight: 0.54 },
              { id: 'frag-1', from: { x: 62, y: 124 }, to: { x: 118, y: 136 }, weight: 0.5 },
            ],
            cavities: [
              { id: 'void-0', center: { x: 92, y: 160 }, radiusX: 18, radiusY: 14, weight: 0.64 },
              { id: 'void-1', center: { x: 158, y: 146 }, radiusX: 16, radiusY: 14, weight: 0.58 },
              { id: 'void-2', center: { x: 128, y: 88 }, radiusX: 12, radiusY: 10, weight: 0.52 },
            ],
          },
          silhouette: {
            ...buildEntityProfile().visualBodyPlan.silhouette,
            boundingBox: { minX: 40, minY: 24, maxX: 204, maxY: 220, width: 164, height: 196 },
            legibility: 0.62,
          },
        },
      }),
    )

    expect(linear.anatomy.stability ?? 0).toBeGreaterThan(fragmented.anatomy.stability ?? 0)
    expect(fragmented.anatomy.dispersion ?? 0).toBeGreaterThan(linear.anatomy.dispersion ?? 0)
    expect(linear.field.detailAlpha).toBeGreaterThan(fragmented.field.detailAlpha)
    expect(fragmented.particles.spread).toBeGreaterThan(linear.particles.spread)
  })

  it('keeps idle core, field and particles aligned with the same PersonaDNA semantics used by core emergence', () => {
    const anatomyDrivenRuntime = {
      runtime: {
        renderOutput: buildRuntimeRenderOutput('visual-body-plan'),
      },
      visualBodyPlan: {
        ...buildEntityProfile().visualBodyPlan,
        core: {
          position: { x: 124, y: 108 },
          radius: 20,
          intensity: 0.84,
        },
        structure: {
          anchors: [
            { id: 'core', point: { x: 124, y: 108 }, role: 'core', weight: 1 },
            { id: 'axis-top', point: { x: 124, y: 58 }, role: 'axis', weight: 0.88 },
            { id: 'axis-bottom', point: { x: 124, y: 168 }, role: 'axis', weight: 0.86 },
            { id: 'edge-left', point: { x: 74, y: 116 }, role: 'edge', weight: 0.62 },
            { id: 'edge-right', point: { x: 174, y: 114 }, role: 'edge', weight: 0.62 },
          ],
          segments: [
            { id: 'spine-0', from: { x: 124, y: 58 }, to: { x: 124, y: 108 }, weight: 0.9 },
            { id: 'spine-1', from: { x: 124, y: 108 }, to: { x: 124, y: 168 }, weight: 0.9 },
            { id: 'rib-0', from: { x: 124, y: 108 }, to: { x: 74, y: 116 }, weight: 0.56 },
            { id: 'rib-1', from: { x: 124, y: 108 }, to: { x: 174, y: 114 }, weight: 0.56 },
          ],
          cavities: [{ id: 'core-channel', center: { x: 124, y: 110 }, radiusX: 12, radiusY: 24, weight: 0.72 }],
        },
      },
    } satisfies Partial<EntityProfile>

    const calmReserved = resolveRenderOutput(
      buildEntityProfile({
        ...anatomyDrivenRuntime,
        personaDNA: {
          ...buildEntityProfile().personaDNA,
          temperament: 'calm',
          presenceStyle: 'reserved',
          stability: 0.86,
          charisma: 0.34,
          wildness: 0.12,
        },
      }),
    )

    const intenseDominant = resolveRenderOutput(
      buildEntityProfile({
        ...anatomyDrivenRuntime,
        personaDNA: {
          ...buildEntityProfile().personaDNA,
          temperament: 'intense',
          presenceStyle: 'dominant',
          stability: 0.42,
          charisma: 0.9,
          wildness: 0.72,
        },
      }),
    )

    const ritualBalanced = resolveRenderOutput(
      buildEntityProfile({
        ...anatomyDrivenRuntime,
        personaDNA: {
          ...buildEntityProfile().personaDNA,
          temperament: 'ritual',
          presenceStyle: 'balanced',
          stability: 0.82,
          charisma: 0.58,
          wildness: 0.2,
        },
      }),
    )

    expect(calmReserved.shape.rhythmSpeed).toBeLessThan(intenseDominant.shape.rhythmSpeed)
    expect(calmReserved.core.rhythmSpeed).toBeLessThan(intenseDominant.core.rhythmSpeed)
    expect(calmReserved.field.spread).toBeLessThan(intenseDominant.field.spread)
    expect(calmReserved.particles.alpha).toBeLessThan(intenseDominant.particles.alpha)
    expect(calmReserved.particles.spread).toBeLessThan(intenseDominant.particles.spread)
    expect(intenseDominant.core.detailAlpha).toBeGreaterThan(calmReserved.core.detailAlpha)
    expect(ritualBalanced.field.rhythmSpeed).toBeLessThan(intenseDominant.field.rhythmSpeed)
    expect(ritualBalanced.particles.spread).toBeLessThan(intenseDominant.particles.spread)
    expect(ritualBalanced.core.rhythmSpeed).toBeLessThan(intenseDominant.core.rhythmSpeed)
  })

  it('applies a visual runtime patch as incremental modulation over the sovereign render output', () => {
    const entity = buildEntityProfile()
    const baseline = resolveRenderOutput(entity)
    const patch: BrandSoulVisualRuntimePatch = {
      core: {
        pulseMultiplier: 1.18,
        accentAlphaMultiplier: 1.1,
      },
      field: {
        spreadMultiplier: 0.88,
        detailAlphaMultiplier: 1.12,
      },
      shape: {
        edgeWidthMultiplier: 1.08,
      },
      particles: {
        densityMultiplier: 0.92,
      },
      metadata: {
        source: 'brandsoul-cognition',
        decisionIntent: 'promotion',
        actionType: 'sell',
        confidence: 0.94,
        visualIntensity: 'cinematic',
      },
    }

    const modulated = resolveRenderOutput(entity, { visualRuntimePatch: patch })

    expect(modulated.core.pulse).toBeGreaterThan(baseline.core.pulse)
    expect(modulated.core.accentAlpha).toBeGreaterThan(baseline.core.accentAlpha)
    expect(modulated.field.spread).toBeLessThan(baseline.field.spread)
    expect(modulated.field.detailAlpha).toBeGreaterThan(baseline.field.detailAlpha)
    expect(modulated.shape.edgeWidth).toBeGreaterThan(baseline.shape.edgeWidth)
    expect(modulated.particles.densityMultiplier).toBeLessThan(baseline.particles.densityMultiplier)
    expect(modulated.composition.intensity).toBe('cinematic')
    expect(modulated.modulation?.brandSoulRuntimePatch?.applicationPoint).toBe('resolve-render-output')
  })
})