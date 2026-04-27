import { distortShape, generateShapeFromLogo } from '../engine'
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

export function elementalRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const artDirection = input.manifestationSpec!.artDirection
  const planCore = resolveVisualBodyCore(input)
  const planEmissionAnchors = [
    resolveVisualBodyAnchor(input, 'emission', 0),
    resolveVisualBodyAnchor(input, 'emission', 1),
    resolveVisualBodyAnchor(input, 'emission', 2),
  ].filter((value): value is { x: number; y: number } => Boolean(value))

  if (hasVisualBodyPlan(input)) {
    const variant = input.preview.manifestationVariant
    const emitterOrigin =
      variant === 'agua'
        ? planEmissionAnchors[1] ?? planEmissionAnchors[0] ?? planCore?.position
        : variant === 'fogo'
          ? planEmissionAnchors[0] ?? planCore?.position
          : variant === 'terra'
            ? planCore?.position
              ? { x: planCore.position.x, y: planCore.position.y + 18 }
              : undefined
            : planEmissionAnchors.at(-1) ?? planCore?.position
    const particleDirection =
      variant === 'agua'
        ? { angle: 90, spread: 42 }
        : variant === 'fogo'
          ? { angle: -90, spread: 26 }
          : variant === 'terra'
            ? { angle: -92, spread: 20 }
            : { angle: 0, spread: 124 }
    const emitterConfig = baseOutput.particles.emitterConfig
      ? {
          ...baseOutput.particles.emitterConfig,
          origin: emitterOrigin ?? baseOutput.particles.emitterConfig.origin,
          direction: particleDirection,
        }
      : undefined

    return {
      ...baseOutput,
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
    return baseOutput
  }

  const generatedShape = generateShapeFromLogo(input.logoData, 'elemental', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const variant = input.preview.manifestationVariant
  const sourcePoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const emissionPoints = processedShape?.emissionPoints ?? []
  const centroid = processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid ?? { x: 120, y: 120 }
  const signature = processedShape?.signature
  const density = signature?.density ?? 0.5
  const complexity = signature?.complexity ?? 0.5
  const abstractionStrength = artDirection.abstractionLevel === 'high' ? 1.18 : artDirection.abstractionLevel === 'medium' ? 1 : 0.88
  const derivedPoints =
    variant === 'agua'
      ? sourcePoints.map((point, index) => {
          const distanceFromCenter = (point.x - centroid.x) / Math.max(24, processedShape?.abstractedGeometry.boundingBox.width ?? 96)
          return {
            x: clamp(point.x + Math.sin(index * 0.38 + point.y * 0.05) * (6 + complexity * 4) * abstractionStrength, 18, 222),
            y: clamp(point.y + distanceFromCenter * 5 + Math.cos(index * 0.24) * 2 * abstractionStrength, 18, 222),
          }
        })
      : variant === 'fogo'
        ? sourcePoints.map((point, index) => {
          const verticalBias = clamp((centroid.y - point.y) / 90, -0.24, 0.9)
            const heat = density * 18 + complexity * 10 + (artDirection.contrast.includes('contrast') ? density * 6 : 0)
            return {
              x: clamp(point.x + Math.sin(index * 0.72) * (4 + density * 5) * abstractionStrength, 18, 222),
              y: clamp(point.y - verticalBias * heat - 6, 18, 222),
            }
          })
        : variant === 'terra'
          ? distortShape(
              sourcePoints
                .filter((_, index) => index % 2 === 0)
                .map((point) => ({
                  x: point.x,
                  y: clamp(point.y + density * 10 + (point.y > centroid.y ? 10 : 0), 18, 222),
                })),
              'tech',
            )
          : sourcePoints
              .filter((_, index) => index % 2 === 0)
              .map((point, index) => ({
                x: clamp(point.x + (point.x - centroid.x) * 0.18 + Math.sin(index * 0.8) * 7, 18, 222),
                y: clamp(point.y + Math.cos(index * 0.44) * 5 - 2, 18, 222),
              }))
  const emitterOrigin =
    variant === 'agua'
      ? emissionPoints[1] ?? emissionPoints[0] ?? centroid
      : variant === 'fogo'
        ? emissionPoints[0] ?? centroid
        : variant === 'terra'
          ? centroid
            ? { x: centroid.x, y: centroid.y + 18 }
            : undefined
          : emissionPoints[emissionPoints.length - 1] ?? centroid
  const particleDirection =
    variant === 'agua'
      ? { angle: 90 + (signature?.dominantAxis === 'horizontal' ? 8 : -8), spread: 34 + complexity * 18 }
      : variant === 'fogo'
        ? { angle: -90, spread: 18 + complexity * 24 }
        : variant === 'terra'
          ? { angle: -92, spread: 18 + density * 14 }
          : { angle: signature?.dominantAxis === 'vertical' ? 14 : -12, spread: 120 + complexity * 40 }
  const innerPoints =
    variant === 'terra'
      ? derivedPoints.map((point) => ({
          x: clamp(centroid.x + (point.x - centroid.x) * 0.72, 24, 216),
          y: clamp(centroid.y + (point.y - centroid.y) * 0.72, 24, 216),
        }))
      : distortShape(
          derivedPoints.map((point) => ({
            x: clamp(centroid.x + (point.x - centroid.x) * 0.66, 24, 216),
            y: clamp(centroid.y + (point.y - centroid.y) * 0.66, 24, 216),
          })),
          variant === 'fogo' || variant === 'terra' ? 'tech' : 'fluid',
        )
  const emitterConfig = baseOutput.particles.emitterConfig
    ? {
        ...baseOutput.particles.emitterConfig,
        origin: emitterOrigin ?? baseOutput.particles.emitterConfig.origin,
        direction: particleDirection,
      }
    : undefined

  return {
    ...baseOutput,
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
      bodyPath: pointsToPath(derivedPoints),
      innerPath: pointsToPath(innerPoints),
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
  }
}
