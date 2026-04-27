import { distortShape, generateShapeFromLogo } from '../../../personaLab/engine'
import { pointsToPath } from '../../shape/analysis/shapeMetrics'
import { buildBaseRendererOutput, buildPlanMaterializedRendererOutput, hasRealShapeSource, hasVisualBodyPlan, resolveVisualBodyAnchor, resolveVisualBodyCore } from '../shared/rendererShared'
import { resolvePersonaDNAModulators } from '../../persona-dna/services/resolvePersonaDNAModulators'
import type { PersonaRenderInput, PersonaRenderOutput } from '../contracts/types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildNaturezaFallbackOutput(input: PersonaRenderInput, baseOutput: PersonaRenderOutput): PersonaRenderOutput {
  const artDirection = input.manifestationSpec!.artDirection
  const generatedShape = generateShapeFromLogo(input.logoData, 'natureza', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const dnaModulators = resolvePersonaDNAModulators(input.preview.personaDNA)
  const sourcePoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const signature = processedShape?.signature
  const centroid = processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid ?? { x: 120, y: 120 }
  const branchSeeds = processedShape?.emissionPoints ?? []
  const outwardGrowth = (artDirection.massDistribution.includes('outward') ? 1.12 : 1) + dnaModulators.postureSpread * 0.18
  const asymmetryBoost = artDirection.texture.includes('organic') ? 1.16 : 1
  const growthBias = signature?.massDistribution === 'spread' ? 1.08 : 0.94
  const branchPoints = distortShape(sourcePoints, 'organic').map((point, index) => {
    const seed = branchSeeds[index % Math.max(1, branchSeeds.length)] ?? point
    const branchDirectionX = point.x - centroid.x
    const branchDirectionY = point.y - centroid.y
    const growth =
      (0.14 + ((index % 3) * 0.06) + (signature?.curvature === 'high' ? 0.08 : 0.02) + (signature?.curvatureRatio ?? 0.5) * 0.05) *
      outwardGrowth *
      growthBias

    return {
      x: clamp(point.x + branchDirectionX * growth + (seed.x - centroid.x) * 0.06 + Math.sin(index * 0.7) * 3 * asymmetryBoost + dnaModulators.postureLean * 0.18, 18, 222),
      y: clamp(point.y + branchDirectionY * (growth + 0.04) - 8 - Math.cos(index * 0.45) * 4 * asymmetryBoost + dnaModulators.postureLift, 18, 222),
    }
  })
  const innerGrowth = sourcePoints.map((point, index) => ({
    x: clamp(centroid.x + (point.x - centroid.x) * 0.78 + Math.sin(index * 0.3) * 1.8, 24, 216),
    y: clamp(centroid.y + (point.y - centroid.y) * 0.78 - Math.cos(index * 0.25) * 2.2 + dnaModulators.postureLift * 0.4, 24, 216),
  }))
  const emitterConfig = baseOutput.particles.emitterConfig
    ? {
        ...baseOutput.particles.emitterConfig,
        origin: branchSeeds[0] ?? centroid ?? baseOutput.particles.emitterConfig.origin,
        direction: {
          angle: signature?.dominantAxis === 'vertical' ? -86 : signature?.dominantAxis === 'horizontal' ? 12 : -32,
          spread: 84 + (signature?.massDistribution === 'spread' ? 26 : 10) + (signature?.fragmentation ?? 0) * 12 + dnaModulators.particleDensityBias * 80,
        },
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
      bodyPath: pointsToPath(branchPoints),
      innerPath: pointsToPath(innerGrowth),
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
  }
}

export function naturezaRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const planBranchSeed = resolveVisualBodyAnchor(input, 'emission', 0) ?? resolveVisualBodyAnchor(input, 'edge', 0) ?? resolveVisualBodyCore(input)?.position

  if (hasVisualBodyPlan(input)) {
    return buildPlanMaterializedRendererOutput({
      baseOutput,
      emitterOrigin: planBranchSeed,
      emitterDirection: {
        angle: -86,
        spread: 98,
      },
    })
  }

  if (!hasRealShapeSource(input)) {
    return baseOutput
  }

  return buildNaturezaFallbackOutput(input, baseOutput)
}
