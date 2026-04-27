import { distortShape, generateShapeFromLogo } from '../../../personaLab/engine'
import { pointsToPath } from '../../shape/analysis/shapeMetrics'
import { buildBaseRendererOutput, buildPlanMaterializedRendererOutput, hasRealShapeSource, hasVisualBodyPlan, resolveVisualBodyAnchor, resolveVisualBodyCore } from '../shared/rendererShared'
import { resolvePersonaDNAModulators } from '../../persona-dna/services/resolvePersonaDNAModulators'
import type { PersonaRenderInput, PersonaRenderOutput } from '../contracts/types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildElementalFallbackOutput(input: PersonaRenderInput, baseOutput: PersonaRenderOutput): PersonaRenderOutput {
  const artDirection = input.manifestationSpec!.artDirection
  const generatedShape = generateShapeFromLogo(input.logoData, 'elemental', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const dnaModulators = resolvePersonaDNAModulators(input.preview.personaDNA)
  const variant = input.preview.manifestationVariant
  const sourcePoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const emissionPoints = processedShape?.emissionPoints ?? []
  const centroid = processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid ?? { x: 120, y: 120 }
  const signature = processedShape?.signature
  const density = signature?.density ?? 0.5
  const complexity = signature?.complexity ?? 0.5
  const abstractionStrength = artDirection.abstractionLevel === 'high' ? 1.18 : artDirection.abstractionLevel === 'medium' ? 1 : 0.88
  const spreadBias = (signature?.massDistribution === 'spread' ? 1.08 : 0.94) + dnaModulators.postureSpread * 0.18
  const derivedPoints =
    variant === 'agua'
      ? sourcePoints.map((point, index) => {
          const distanceFromCenter = (point.x - centroid.x) / Math.max(24, processedShape?.abstractedGeometry.boundingBox.width ?? 96)
          return {
            x: clamp(point.x + Math.sin(index * 0.38 + point.y * 0.05) * (6 + complexity * 4) * abstractionStrength * spreadBias + dnaModulators.postureLean * 0.18, 18, 222),
            y: clamp(point.y + distanceFromCenter * 5 + Math.cos(index * 0.24) * 2 * abstractionStrength + dnaModulators.postureLift, 18, 222),
          }
        })
      : variant === 'fogo'
        ? sourcePoints.map((point, index) => {
            const verticalBias = clamp((centroid.y - point.y) / 90, -0.24, 0.9)
            const heat = density * 18 + complexity * 10 + (artDirection.contrast.includes('contrast') ? density * 6 : 0) + (signature?.fragmentation ?? 0) * 10
            return {
              x: clamp(point.x + Math.sin(index * 0.72) * (4 + density * 5) * abstractionStrength + dnaModulators.postureLean * 0.22, 18, 222),
              y: clamp(point.y - verticalBias * heat - 6 + dnaModulators.postureLift, 18, 222),
            }
          })
        : variant === 'terra'
          ? distortShape(
              sourcePoints
                .filter((_, index) => index % 2 === 0)
                .map((point) => ({
                  x: point.x,
                  y: clamp(point.y + density * 10 + (point.y > centroid.y ? 10 : 0) + dnaModulators.postureLift, 18, 222),
                })),
              'tech',
            )
          : sourcePoints
              .filter((_, index) => index % 2 === 0)
              .map((point, index) => ({
                x: clamp(point.x + (point.x - centroid.x) * (0.18 + dnaModulators.postureSpread * 0.2) + Math.sin(index * 0.8) * 7, 18, 222),
                y: clamp(point.y + Math.cos(index * 0.44) * 5 - 2 + dnaModulators.postureLift, 18, 222),
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
      ? { angle: 90 + (signature?.dominantAxis === 'horizontal' ? 8 : -8), spread: 34 + complexity * 18 + (signature?.massDistribution === 'spread' ? 16 : -6) }
      : variant === 'fogo'
        ? { angle: -90, spread: 18 + complexity * 24 + (signature?.fragmentation ?? 0) * 18 }
        : variant === 'terra'
          ? { angle: -92, spread: 18 + density * 14 - (signature?.symmetry ?? 0.5) * 8 + dnaModulators.particleDensityBias * 60 }
          : { angle: signature?.dominantAxis === 'vertical' ? 14 : -12, spread: 120 + complexity * 40 + (signature?.type === 'radial' ? 26 : 0) + dnaModulators.particleDensityBias * 90 }
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
    anatomySource: 'renderer-fallback',
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

export function elementalRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const planCore = resolveVisualBodyCore(input)
  const planEmissionAnchors = [
    resolveVisualBodyAnchor(input, 'emission', 0),
    resolveVisualBodyAnchor(input, 'emission', 1),
    resolveVisualBodyAnchor(input, 'emission', 2),
  ].filter((value): value is { x: number; y: number } => Boolean(value))

  if (hasVisualBodyPlan(input)) {
    const variant = input.preview.manifestationVariant
    return buildPlanMaterializedRendererOutput({
      baseOutput,
      emitterOrigin:
        variant === 'agua'
          ? planEmissionAnchors[1] ?? planEmissionAnchors[0] ?? planCore?.position
          : variant === 'fogo'
            ? planEmissionAnchors[0] ?? planCore?.position
            : variant === 'terra'
              ? planCore?.position
                ? { x: planCore.position.x, y: planCore.position.y + 18 }
                : undefined
              : planEmissionAnchors.at(-1) ?? planCore?.position,
      emitterDirection:
        variant === 'agua'
          ? { angle: 90, spread: 42 }
          : variant === 'fogo'
            ? { angle: -90, spread: 26 }
            : variant === 'terra'
              ? { angle: -92, spread: 20 }
              : { angle: 0, spread: 124 },
    })
  }

  if (!hasRealShapeSource(input)) {
    return baseOutput
  }

  return buildElementalFallbackOutput(input, baseOutput)
}
