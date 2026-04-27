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

export function naturezaRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const artDirection = input.manifestationSpec!.artDirection
  const planBranchSeed = resolveVisualBodyAnchor(input, 'emission', 0) ?? resolveVisualBodyAnchor(input, 'edge', 0) ?? resolveVisualBodyCore(input)?.position

  if (hasVisualBodyPlan(input)) {
    const emitterConfig = baseOutput.particles.emitterConfig
      ? {
          ...baseOutput.particles.emitterConfig,
          origin: planBranchSeed ?? baseOutput.particles.emitterConfig.origin,
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

  const generatedShape = generateShapeFromLogo(input.logoData, 'natureza', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const sourcePoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const signature = processedShape?.signature
  const centroid = processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid ?? { x: 120, y: 120 }
  const branchSeeds = processedShape?.emissionPoints ?? []
  const outwardGrowth = artDirection.massDistribution.includes('outward') ? 1.12 : 1
  const asymmetryBoost = artDirection.texture.includes('organic') ? 1.16 : 1
  const branchPoints = distortShape(sourcePoints, 'organic').map((point, index) => {
    const seed = branchSeeds[index % Math.max(1, branchSeeds.length)] ?? point
    const branchDirectionX = point.x - centroid.x
    const branchDirectionY = point.y - centroid.y
    const growth = (0.14 + ((index % 3) * 0.06) + (signature?.curvature === 'high' ? 0.08 : 0.02)) * outwardGrowth

    return {
      x: clamp(point.x + branchDirectionX * growth + (seed.x - centroid.x) * 0.06 + Math.sin(index * 0.7) * 3 * asymmetryBoost, 18, 222),
      y: clamp(point.y + branchDirectionY * (growth + 0.04) - 8 - Math.cos(index * 0.45) * 4 * asymmetryBoost, 18, 222),
    }
  })
  const innerGrowth = sourcePoints.map((point, index) => ({
    x: clamp(centroid.x + (point.x - centroid.x) * 0.78 + Math.sin(index * 0.3) * 1.8, 24, 216),
    y: clamp(centroid.y + (point.y - centroid.y) * 0.78 - Math.cos(index * 0.25) * 2.2, 24, 216),
  }))
  const emitterConfig = baseOutput.particles.emitterConfig
    ? {
        ...baseOutput.particles.emitterConfig,
        origin: branchSeeds[0] ?? centroid ?? baseOutput.particles.emitterConfig.origin,
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
      bodyPath: pointsToPath(branchPoints),
      innerPath: pointsToPath(innerGrowth),
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
  }
}
