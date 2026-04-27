import { generateShapeFromLogo } from '../../../personaLab/engine'
import { pointsToPath } from '../../shape/analysis/shapeMetrics'
import { buildBaseRendererOutput, buildPlanMaterializedRendererOutput, hasRealShapeSource, hasVisualBodyPlan, resolveVisualBodyAnchor, resolveVisualBodyCore } from '../shared/rendererShared'
import { resolvePersonaDNAModulators } from '../../persona-dna/services/resolvePersonaDNAModulators'
import type { PersonaRenderInput, PersonaRenderOutput } from '../contracts/types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildCentelhaFallbackOutput(input: PersonaRenderInput, baseOutput: PersonaRenderOutput): PersonaRenderOutput {
  const artDirection = input.manifestationSpec!.artDirection
  const behavior = input.manifestationSpec!.behavior
  const generatedShape = generateShapeFromLogo(input.logoData, 'centelha', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const dnaModulators = resolvePersonaDNAModulators(input.preview.personaDNA)
  const anchor = processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid
  const abstractedPoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const emissionPoints = processedShape?.emissionPoints ?? []
  const signature = processedShape?.signature
  const abstractionBoost = artDirection.abstractionLevel === 'high' ? 0.08 : artDirection.abstractionLevel === 'medium' ? 0.04 : 0
  const ignitionPoint = emissionPoints[0] ?? anchor
  const compressionBias =
    signature?.massDistribution === 'concentrated'
      ? 0.08
      : signature?.massDistribution === 'spread'
        ? -0.05
        : 0
  const sparkPoints = abstractedPoints.map((point, index) => {
    const distanceToIgnition = ignitionPoint ? Math.hypot(point.x - ignitionPoint.x, point.y - ignitionPoint.y) : 32
    const ignitionBias = clamp(1 - distanceToIgnition / 120, 0.22, 1)
    const compression =
      0.52 +
      ignitionBias * (artDirection.massDistribution.includes('compressed') ? 0.32 : 0.24) +
      abstractionBoost +
      compressionBias +
      dnaModulators.containment * 0.08
    const asymmetry =
      (index % 2 === 0 ? 1 : -1) *
      ignitionBias *
      ((signature?.curvature === 'high' ? 7 : 4) + (signature?.fragmentation ?? 0) * 4 + dnaModulators.postureSpread * 20)

    return {
      x: clamp((anchor?.x ?? 120) + (point.x - (anchor?.x ?? 120)) * compression + asymmetry + dnaModulators.postureLean * 0.3, 18, 222),
      y: clamp((anchor?.y ?? 120) + (point.y - (anchor?.y ?? 120)) * (compression * 0.92) - ignitionBias * 6 + dnaModulators.postureLift, 18, 222),
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
          spread:
            behavior.birth === 'ignite-from-emission'
              ? (signature?.curvature === 'high' ? 240 : 180) + (signature?.massDistribution === 'spread' ? 28 : -12)
              + dnaModulators.particleDensityBias * 80
              : signature?.type === 'orbital'
                ? 320
                : 280,
        },
      }
    : undefined

  return {
    ...baseOutput,
    anatomySource: 'renderer-fallback',
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

export function centelhaRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const behavior = input.manifestationSpec!.behavior
  const planCore = resolveVisualBodyCore(input)
  const planIgnitionPoint = resolveVisualBodyAnchor(input, 'emission', 0) ?? planCore?.position

  if (hasVisualBodyPlan(input)) {
    return buildPlanMaterializedRendererOutput({
      baseOutput: {
        ...baseOutput,
        renderType: 'abstract-shape',
      },
      emitterOrigin: planIgnitionPoint,
      emitterDirection: {
        angle:
          planIgnitionPoint && planCore?.position
            ? -90 + Math.atan2(planIgnitionPoint.y - planCore.position.y, planIgnitionPoint.x - planCore.position.x) * (180 / Math.PI) * 0.18
            : -90,
        spread: behavior.birth === 'ignite-from-emission' ? 220 : 280,
      },
    })
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

  return buildCentelhaFallbackOutput(input, baseOutput)
}
