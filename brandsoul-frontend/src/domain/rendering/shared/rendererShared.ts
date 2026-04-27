import type { PersonaRenderInput, PersonaRenderOutput } from '../contracts/types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

type ResolvedSpecRuntime = {
  anatomyClassNames: string[]
  particleConfig?: PersonaRenderOutput['particles']
  styleVars: Record<string, string>
}

type VisualBodyPlanAnchorRole = 'core' | 'edge' | 'axis' | 'emission'

function resolveArtDirectionClasses(input: PersonaRenderInput) {
  const manifestationSpec = input.manifestationSpec!
  const { artDirection, behavior } = manifestationSpec

  const lightClass = artDirection.lightBehavior.includes('pulsing core')
    ? 'light-concentrated'
    : artDirection.lightBehavior.includes('physical light')
      ? 'light-physical'
      : artDirection.lightBehavior.includes('breathing bloom')
        ? 'light-organic'
        : 'light-technical'

  const massClass = artDirection.massDistribution.includes('centralized')
    ? 'mass-centralized'
    : artDirection.massDistribution.includes('material')
      ? 'mass-material'
      : artDirection.massDistribution.includes('growth')
        ? 'mass-growth'
        : 'mass-modular'

  const textureClass = artDirection.texture.includes('electric')
    ? 'texture-electric'
    : artDirection.texture.includes('elemental')
      ? 'texture-elemental'
      : artDirection.texture.includes('organic')
        ? 'texture-organic'
        : 'texture-technical'

  const contrastClass = artDirection.contrast.includes('high')
    ? 'contrast-high'
    : artDirection.contrast.includes('medium')
      ? 'contrast-medium'
      : 'contrast-variable'

  const relationClass = artDirection.shapeRelation.includes('compresses')
    ? 'shape-compressed'
    : artDirection.shapeRelation.includes('reincarnates')
      ? 'shape-reincarnated'
      : artDirection.shapeRelation.includes('germinates')
        ? 'shape-germinated'
        : 'shape-rebuilt'

  const rhythmClass =
    behavior.idle === 'pulse-breathe'
      ? 'rhythm-pulse'
      : behavior.idle === 'material-drift'
        ? 'rhythm-material'
        : behavior.idle === 'organic-breathe'
          ? 'rhythm-organic'
          : 'rhythm-mechanical'

  return [lightClass, massClass, textureClass, contrastClass, relationClass, rhythmClass]
}

function resolveArtDirectionVars(input: PersonaRenderInput) {
  const manifestationSpec = input.manifestationSpec!
  const { artDirection, behavior } = manifestationSpec
  const variant = input.preview.manifestationVariant

  if (input.preview.manifestationMode === 'centelha') {
    return {
      '--persona-lab-surface-blur': '0.2px',
      '--persona-lab-aura-softness': '0.84',
      '--persona-lab-aura-scale-factor': '0.9',
      '--persona-lab-field-noise-opacity': '0.52',
      '--persona-lab-shape-opacity-factor': '1',
      '--persona-lab-shape-rigidity': '0.78',
      '--persona-lab-core-size-factor': '0.76',
      '--persona-lab-core-presence': '1.12',
      '--persona-lab-line-opacity-factor': '0.68',
      '--persona-lab-particle-opacity-factor': '0.96',
      '--persona-lab-particle-size-factor': '0.82',
      '--persona-lab-hover-flare-factor': behavior.hover === 'flare-expand' ? '1.18' : '1',
    }
  }

  if (input.preview.manifestationMode === 'elemental') {
    return {
      '--persona-lab-surface-blur': variant === 'fogo' ? '0.5px' : variant === 'agua' ? '1.1px' : variant === 'terra' ? '0px' : '1.4px',
      '--persona-lab-aura-softness': variant === 'fogo' ? '0.72' : variant === 'agua' ? '1.08' : variant === 'terra' ? '0.58' : '1.16',
      '--persona-lab-aura-scale-factor': variant === 'terra' ? '0.92' : variant === 'ar' ? '1.12' : '1.02',
      '--persona-lab-field-noise-opacity': variant === 'fogo' ? '0.58' : variant === 'agua' ? '0.18' : variant === 'terra' ? '0.12' : '0.24',
      '--persona-lab-shape-opacity-factor': variant === 'ar' ? '0.74' : variant === 'agua' ? '0.84' : '0.94',
      '--persona-lab-shape-rigidity': variant === 'terra' ? '1.18' : variant === 'fogo' ? '0.94' : variant === 'agua' ? '0.62' : '0.4',
      '--persona-lab-core-size-factor': '0.54',
      '--persona-lab-core-presence': '0.46',
      '--persona-lab-line-opacity-factor': variant === 'terra' ? '0.54' : variant === 'agua' ? '0.42' : '0.8',
      '--persona-lab-particle-opacity-factor': variant === 'fogo' ? '1' : variant === 'agua' ? '0.7' : variant === 'terra' ? '0.62' : '0.42',
      '--persona-lab-particle-size-factor': variant === 'terra' ? '1.12' : variant === 'ar' ? '0.62' : '0.88',
      '--persona-lab-hover-flare-factor': '1',
    }
  }

  if (input.preview.manifestationMode === 'natureza') {
    return {
      '--persona-lab-surface-blur': '0.55px',
      '--persona-lab-aura-softness': '1.18',
      '--persona-lab-aura-scale-factor': '1.08',
      '--persona-lab-field-noise-opacity': '0.22',
      '--persona-lab-shape-opacity-factor': '0.92',
      '--persona-lab-shape-rigidity': artDirection.abstractionLevel === 'high' ? '0.44' : '0.58',
      '--persona-lab-core-size-factor': '0.5',
      '--persona-lab-core-presence': '0.34',
      '--persona-lab-line-opacity-factor': '0.38',
      '--persona-lab-particle-opacity-factor': '0.66',
      '--persona-lab-particle-size-factor': '0.76',
      '--persona-lab-hover-flare-factor': behavior.hover === 'bloom-lift' ? '1.06' : '1',
    }
  }

  return {
    '--persona-lab-surface-blur': '0px',
    '--persona-lab-aura-softness': '0.58',
    '--persona-lab-aura-scale-factor': '0.82',
    '--persona-lab-field-noise-opacity': '0.14',
    '--persona-lab-shape-opacity-factor': '0.94',
    '--persona-lab-shape-rigidity': '1.22',
    '--persona-lab-core-size-factor': '0.44',
    '--persona-lab-core-presence': '0.22',
    '--persona-lab-line-opacity-factor': '0.92',
    '--persona-lab-particle-opacity-factor': '0.58',
    '--persona-lab-particle-size-factor': '0.58',
    '--persona-lab-hover-flare-factor': behavior.hover === 'signal-boost' ? '1.12' : '1',
  }
}

export function hasVisualBodyPlan(input: PersonaRenderInput) {
  return Boolean(input.preview.visualBodyPlan?.bodyPath)
}

export function resolveVisualBodyAnchor(input: PersonaRenderInput, role: VisualBodyPlanAnchorRole, index = 0) {
  const anchors = input.preview.visualBodyPlan?.structure.anchors ?? []
  return anchors.filter((anchor) => anchor.role === role)[index]?.point
}

export function resolveVisualBodyCore(input: PersonaRenderInput) {
  return input.preview.visualBodyPlan?.core
}

export function resolveVisualBodyFraming(input: PersonaRenderInput) {
  return input.preview.visualBodyPlan?.silhouette.boundingBox ?? input.preview.silhouette.framing
}

export function resolveVisualBodyLegibility(input: PersonaRenderInput) {
  return input.preview.visualBodyPlan?.silhouette.legibility ?? input.preview.silhouette.legibility
}

export function resolveRendererBodyPaths(input: PersonaRenderInput) {
  if (hasVisualBodyPlan(input)) {
    return {
      bodyPath: input.preview.visualBodyPlan!.bodyPath,
      innerPath: input.preview.visualBodyPlan!.innerPath ?? input.innerPath,
    }
  }

  return {
    bodyPath: input.bodyPath,
    innerPath: input.innerPath,
  }
}

export function resolveRendererAnatomySource(input: PersonaRenderInput): PersonaRenderOutput['anatomySource'] {
  if (hasVisualBodyPlan(input)) {
    return 'visual-body-plan'
  }

  if (input.usesLogoMask) {
    return 'core-symbol'
  }

  return 'preview-body'
}

export function buildPlanMaterializedRendererOutput(args: {
  baseOutput: PersonaRenderOutput
  emitterOrigin?: { x: number; y: number }
  emitterDirection?: { angle: number; spread: number }
  innerPath?: string
}): PersonaRenderOutput {
  const emitterConfig = args.baseOutput.particles.emitterConfig
    ? {
        ...args.baseOutput.particles.emitterConfig,
        origin: args.emitterOrigin ?? args.baseOutput.particles.emitterConfig.origin,
        direction: args.emitterDirection ?? args.baseOutput.particles.emitterConfig.direction,
      }
    : undefined

  return {
    ...args.baseOutput,
    anatomySource: 'visual-body-plan',
    particles: emitterConfig
      ? {
          ...args.baseOutput.particles,
          emitterConfig,
        }
      : args.baseOutput.particles,
    shapes: {
      ...args.baseOutput.shapes,
      innerPath: args.innerPath ?? args.baseOutput.shapes.innerPath,
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
  }
}

export function resolveSpecRuntime(input: PersonaRenderInput): ResolvedSpecRuntime {
  const manifestationSpec = input.manifestationSpec!
  const variantOverride = manifestationSpec.runtime.variantOverrides?.[input.preview.manifestationVariant]
  const anatomyClassNames = variantOverride?.anatomyClassNames ?? manifestationSpec.runtime.anatomyClassNames
  const particleConfig = variantOverride?.particleByIntensity?.[input.intensity] ?? manifestationSpec.runtime.particleByIntensity?.[input.intensity]
  const intensityStyleVars = manifestationSpec.runtime.styleVarsByIntensity[input.intensity] ?? {}
  const variantStyleVars = variantOverride?.styleVarsByIntensity?.[input.intensity] ?? {}

  return {
    anatomyClassNames,
    particleConfig,
    styleVars: {
      ...input.styleVars,
      '--persona-lab-body-legibility': (resolveVisualBodyLegibility(input) ?? 0.6).toString(),
      '--persona-lab-body-frame-width': (resolveVisualBodyFraming(input)?.width ?? 240).toString(),
      '--persona-lab-body-frame-height': (resolveVisualBodyFraming(input)?.height ?? 240).toString(),
      '--persona-lab-body-core-radius': (resolveVisualBodyCore(input)?.radius ?? input.preview.silhouette.core?.radius ?? 18).toString(),
      '--persona-lab-spec-glow': manifestationSpec.lighting.glow.toString(),
      '--persona-lab-spec-contrast': manifestationSpec.lighting.contrast.toString(),
      '--persona-lab-spec-motion-speed': manifestationSpec.motion.speed.toString(),
      '--persona-lab-spec-particle-density': manifestationSpec.particleSystem.density.toString(),
      '--persona-lab-spec-abstraction': manifestationSpec.artDirection.abstractionLevel === 'low' ? '0.72' : manifestationSpec.artDirection.abstractionLevel === 'medium' ? '1' : '1.18',
      ...resolveArtDirectionVars(input),
      ...intensityStyleVars,
      ...variantStyleVars,
    },
  }
}

export function buildBaseRendererOutput(input: PersonaRenderInput): PersonaRenderOutput {
  const manifestationSpec = input.manifestationSpec!
  const { preview, variant, intensity, usesLogoMask, dominantSymbol } = input
  const resolvedRuntime = resolveSpecRuntime(input)
  const resolvedBody = resolveRendererBodyPaths(input)

  const classNames = [
    'persona-lab-preview-visual',
    `variant-${variant}`,
    `concept-${preview.id}`,
    `mode-${preview.manifestationMode}`,
    `manifestation-variant-${preview.manifestationVariant}`,
    manifestationSpec.runtime.rendererClassName,
    `archetype-${preview.archetype}`,
    `density-${preview.visualConfig.density}`,
    `motion-${preview.visualConfig.motion}`,
    `glow-${preview.visualConfig.glow}`,
    `ritual-intensity-${intensity}`,
    `art-abstraction-${manifestationSpec.artDirection.abstractionLevel}`,
    `behavior-idle-${manifestationSpec.behavior.idle}`,
    `behavior-hover-${manifestationSpec.behavior.hover}`,
    `behavior-stabilize-${manifestationSpec.behavior.stabilize}`,
    ...resolveArtDirectionClasses(input),
    usesLogoMask ? 'uses-core-symbol' : 'uses-abstract-shape',
    ...resolvedRuntime.anatomyClassNames,
  ]

  return {
    manifestationSpec,
    anatomySource: resolveRendererAnatomySource(input),
    renderType: usesLogoMask ? 'core-symbol' : 'abstract-shape',
    particles: resolvedRuntime.particleConfig ?? { count: 0 },
    shapes: {
      bodyPath: resolvedBody.bodyPath,
      innerPath: resolvedBody.innerPath,
      dominantSymbol,
      usesLogoMask,
    },
    animationConfig: {
      rootClassName: classNames.join(' '),
      styleVars: resolvedRuntime.styleVars,
    },
    anatomy: {
      layers: manifestationSpec.anatomy.layers,
      classNames: resolvedRuntime.anatomyClassNames,
    },
    debugShape: input.logoData.shapeSource
      ? {
          sourceSignature: input.logoData.shapeSource.signature,
          silhouetteContrast:
            input.logoData.shapeSource.signature.curvature === 'low' && input.logoData.shapeSource.signature.density < 0.42
              ? 'medium'
              : input.logoData.shapeSource.signature.density < 0.28
                ? 'low'
                : 'high',
          readabilityScore: Number(
            (
              clamp(
                input.logoData.shapeSource.signature.density * 0.34 +
                  input.logoData.shapeSource.signature.complexity * 0.26 +
                  (input.logoData.shapeSource.signature.curvature === 'low'
                    ? 0.18
                    : input.logoData.shapeSource.signature.curvature === 'medium'
                      ? 0.14
                      : 0.1) +
                  (input.manifestationSpec?.lighting.contrast ?? 0.6) * 0.22,
                0.12,
                1,
              ) * 100
            ).toFixed(0),
          ),
        }
      : undefined,
  }
}

export function hasRealShapeSource(input: PersonaRenderInput) {
  return Boolean(input.logoData.shapeSource)
}
