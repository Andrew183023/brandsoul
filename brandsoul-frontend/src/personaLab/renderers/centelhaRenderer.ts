import { generateShapeFromLogo } from '../engine'
import { buildBaseRendererOutput, hasRealShapeSource, hasVisualBodyPlan, resolveVisualBodyAnchor, resolveVisualBodyCore } from './shared'
import type { PersonaRenderInput, PersonaRenderOutput } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return ''
  }

  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length]!
    const controlX = (point.x + next.x) / 2
    const controlY = (point.y + next.y) / 2

    if (index === 0) {
      return `M${point.x.toFixed(2)} ${point.y.toFixed(2)} Q${controlX.toFixed(2)} ${controlY.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
    }

    return `Q${controlX.toFixed(2)} ${controlY.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
  })

  return `${segments.join(' ')} Z`
}

export function centelhaRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const artDirection = input.manifestationSpec!.artDirection
  const behavior = input.manifestationSpec!.behavior
  const planCore = resolveVisualBodyCore(input)
  const planIgnitionPoint = resolveVisualBodyAnchor(input, 'emission', 0) ?? planCore?.position

  if (hasVisualBodyPlan(input)) {
    const emitterConfig = baseOutput.particles.emitterConfig
      ? {
          ...baseOutput.particles.emitterConfig,
          origin: planIgnitionPoint ?? baseOutput.particles.emitterConfig.origin,
          direction: {
            angle:
              planIgnitionPoint && planCore?.position
                ? -90 + Math.atan2(planIgnitionPoint.y - planCore.position.y, planIgnitionPoint.x - planCore.position.x) * (180 / Math.PI) * 0.18
                : -90,
            spread: behavior.birth === 'ignite-from-emission' ? 220 : 280,
          },
        }
      : undefined

    return {
      ...baseOutput,
      renderType: 'abstract-shape',
      particles: emitterConfig
        ? {
            ...baseOutput.particles,
            emitterConfig,
          }
        : baseOutput.particles,
      shapes: {
        ...baseOutput.shapes,
        dominantSymbol: undefined,
        usesLogoMask: false,
      },
    }
  }

  if (!hasRealShapeSource(input)) {
    return {
      ...baseOutput,
      shapes: {
        ...baseOutput.shapes,
        dominantSymbol: input.logoData.coreSymbol ?? input.logoData.mask ?? input.dominantSymbol,
        usesLogoMask: Boolean(input.logoData.coreSymbol ?? input.logoData.mask ?? input.dominantSymbol),
      },
    }
  }

  const generatedShape = generateShapeFromLogo(input.logoData, 'centelha', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const anchor = processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid
  const abstractedPoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const emissionPoints = processedShape?.emissionPoints ?? []
  const signature = processedShape?.signature
  const abstractionBoost = artDirection.abstractionLevel === 'high' ? 0.08 : artDirection.abstractionLevel === 'medium' ? 0.04 : 0
  const ignitionPoint = emissionPoints[0] ?? anchor
  const sparkPoints = abstractedPoints.map((point, index) => {
    const distanceToIgnition = ignitionPoint ? Math.hypot(point.x - ignitionPoint.x, point.y - ignitionPoint.y) : 32
    const ignitionBias = clamp(1 - distanceToIgnition / 120, 0.22, 1)
    const compression = 0.52 + ignitionBias * (artDirection.massDistribution.includes('compressed') ? 0.32 : 0.24) + abstractionBoost
    const asymmetry = (index % 2 === 0 ? 1 : -1) * ignitionBias * (signature?.curvature === 'high' ? 7 : 4)

    return {
      x: clamp((anchor?.x ?? 120) + (point.x - (anchor?.x ?? 120)) * compression + asymmetry, 18, 222),
      y: clamp((anchor?.y ?? 120) + (point.y - (anchor?.y ?? 120)) * (compression * 0.92) - ignitionBias * 6, 18, 222),
    }
  })
  const innerSparkPoints = sparkPoints.map((point, index) => ({
    x: clamp((anchor?.x ?? 120) + (point.x - (anchor?.x ?? 120)) * 0.56 + Math.sin(index * 0.7) * 1.5, 28, 212),
    y: clamp((anchor?.y ?? 120) + (point.y - (anchor?.y ?? 120)) * 0.56 + Math.cos(index * 0.5) * 1.5, 28, 212),
  }))
  const emitterConfig = baseOutput.particles.emitterConfig
    ? {
        ...baseOutput.particles.emitterConfig,
        origin: ignitionPoint ?? anchor ?? baseOutput.particles.emitterConfig.origin,
        direction: {
          angle:
            ignitionPoint && anchor
              ? -90 + Math.atan2(ignitionPoint.y - anchor.y, ignitionPoint.x - anchor.x) * (180 / Math.PI) * 0.18
              : -90,
          spread: behavior.birth === 'ignite-from-emission' ? (signature?.curvature === 'high' ? 240 : 180) : 280,
        },
      }
    : undefined

  return {
    ...baseOutput,
    renderType: 'abstract-shape',
    debugShape: generatedShape.processedShape
      ? {
          ...baseOutput.debugShape,
          processedShape: generatedShape.processedShape,
        }
      : baseOutput.debugShape,
    particles: emitterConfig
      ? {
          ...baseOutput.particles,
          emitterConfig,
        }
      : baseOutput.particles,
    shapes: {
      ...baseOutput.shapes,
      bodyPath: pointsToPath(sparkPoints),
      innerPath: pointsToPath(innerSparkPoints),
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
  }
}
