import type { PersonaRenderInput, PersonaRenderOutput } from '../contracts/types'

function resolveEmitterOrigin(input: PersonaRenderInput) {
  const anchors = input.preview.visualBodyPlan?.structure.anchors ?? []

  return anchors.find((anchor) => anchor.role === 'emission')?.point
    ?? input.preview.visualBodyPlan?.core.position
    ?? input.preview.silhouette.core
}

export function resolvePersonaRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const emitterOrigin = resolveEmitterOrigin(input)

  return {
    manifestationSpec: input.manifestationSpec ?? {
      id: input.preview.manifestationMode,
      label: input.preview.label,
      description: input.preview.description,
      artDirection: {
        contrast: 'medium',
        abstractionLevel: 'medium',
        shapeRelation: 'visual-body-plan',
        massDistribution: 'plan-driven',
        texture: 'plan-driven',
        lightBehavior: 'plan-driven',
        shapeFillStrategy: 'plan-driven',
      },
      behavior: {
        idle: 'plan-driven',
        hover: 'plan-driven',
        birth: 'plan-driven',
        stabilize: 'plan-driven',
      },
      birthTimeline: {
        duration: 0,
        stages: [],
      },
      runtime: {
        defaultVisual: input.preview.visualConfig,
      },
    },
    anatomySource: input.preview.visualBodyPlan ? 'visual-body-plan' : 'preview-body',
    particles: {
      count: 0,
      emitterConfig: emitterOrigin
        ? {
            origin: { x: emitterOrigin.x, y: emitterOrigin.y },
          }
        : undefined,
    },
    shapes: {
      bodyPath: input.preview.visualBodyPlan?.bodyPath ?? input.bodyPath,
      innerPath: input.preview.visualBodyPlan?.innerPath ?? input.innerPath,
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
    animationConfig: {
      rootClassName: `mode-${input.preview.manifestationMode}`,
      styleVars: input.styleVars,
    },
    anatomy: {
      layers: [],
      classNames: [],
    },
    renderType: 'abstract-shape',
  }
}
