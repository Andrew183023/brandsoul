import { distortShape, generateShapeFromLogo } from '../engine'
import { buildBaseRendererOutput, hasRealShapeSource, hasVisualBodyPlan, resolveVisualBodyAnchor, resolveVisualBodyCore, resolveVisualBodyFraming } from './shared'
import type { PersonaRenderInput, PersonaRenderOutput } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function segmentPoints(points: Array<{ x: number; y: number }>, gridSize: number, dominantAxis: 'horizontal' | 'vertical' | 'radial') {
  return points.map((point, index) => {
    const xBias = dominantAxis === 'vertical' ? 0.6 : 1
    const yBias = dominantAxis === 'horizontal' ? 0.6 : 1
    return {
      x: Math.round((point.x + (index % 2 === 0 ? gridSize * 0.2 : -gridSize * 0.1) * xBias) / gridSize) * gridSize,
      y: Math.round((point.y + (index % 3 === 0 ? gridSize * 0.2 : -gridSize * 0.1) * yBias) / gridSize) * gridSize,
    }
  })
}

export function roboRenderer(input: PersonaRenderInput): PersonaRenderOutput {
  const baseOutput = buildBaseRendererOutput(input)
  const artDirection = input.manifestationSpec!.artDirection
  const behavior = input.manifestationSpec!.behavior
  const planFraming = resolveVisualBodyFraming(input)
  const planScanAnchor = resolveVisualBodyAnchor(input, 'emission', 0) ?? resolveVisualBodyAnchor(input, 'edge', 0) ?? resolveVisualBodyCore(input)?.position

  if (hasVisualBodyPlan(input)) {
    const emitterConfig = baseOutput.particles.emitterConfig
      ? {
          ...baseOutput.particles,
          emitterConfig: {
            ...baseOutput.particles.emitterConfig,
            origin: planScanAnchor ?? baseOutput.particles.emitterConfig.origin,
            direction: behavior.birth === 'scan-and-assemble' ? { angle: 0, spread: 96 } : baseOutput.particles.emitterConfig.direction,
          },
        }
      : undefined

    return {
      ...baseOutput,
      particles: emitterConfig ?? baseOutput.particles,
      shapes: {
        ...baseOutput.shapes,
        innerPath:
          baseOutput.shapes.innerPath ||
          (planFraming
            ? `M${planFraming.minX + 8} ${planFraming.minY + planFraming.height * 0.22} L${planFraming.maxX - 8} ${planFraming.minY + planFraming.height * 0.22}`
            : baseOutput.shapes.innerPath),
        dominantSymbol: undefined,
        usesLogoMask: false,
      },
    }
  }

  if (!hasRealShapeSource(input)) {
    return baseOutput
  }

  const generatedShape = generateShapeFromLogo(input.logoData, 'robo-ia', input.preview.manifestationVariant)
  const processedShape = generatedShape.processedShape
  const signature = processedShape?.signature
  const sourcePoints = processedShape?.abstractedGeometry.points ?? generatedShape.points
  const gridSizeBase = signature?.dominantAxis === 'vertical' ? 16 : signature?.dominantAxis === 'horizontal' ? 14 : 12
  const gridSize = artDirection.massDistribution.includes('grid') ? gridSizeBase : Math.max(10, gridSizeBase - 2)
  const alignedPoints = segmentPoints(distortShape(sourcePoints, 'tech'), gridSize, signature?.dominantAxis ?? 'radial')
  const bounds = processedShape?.abstractedGeometry.boundingBox ?? generatedShape.bounds
  const x1 = bounds.minX + bounds.width * 0.24
  const x2 = bounds.minX + bounds.width * 0.52
  const x3 = bounds.minX + bounds.width * 0.76
  const y1 = bounds.minY + bounds.height * 0.22
  const y2 = bounds.minY + bounds.height * 0.48
  const y3 = bounds.minY + bounds.height * 0.74
  const scanAnchors = (processedShape?.emissionPoints ?? []).slice(0, 4)
  const blockPath = `M${alignedPoints.map((point, index) => `${index === 0 ? '' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} Z`
  const innerGridPath = `M${bounds.minX + 8} ${y1} L${bounds.maxX - 8} ${y1}
    M${bounds.minX + 4} ${y2} L${bounds.maxX - 4} ${y2}
    M${bounds.minX + 8} ${y3} L${bounds.maxX - 8} ${y3}
    M${x1} ${bounds.minY + 8} L${x1} ${bounds.maxY - 8}
    M${x2} ${bounds.minY + 8} L${x2} ${bounds.maxY - 8}
    M${x3} ${bounds.minY + 8} L${x3} ${bounds.maxY - 8}
    ${scanAnchors
      .map((point) => `M${clamp(point.x - 10, bounds.minX, bounds.maxX)} ${point.y.toFixed(2)} L${clamp(point.x + 10, bounds.minX, bounds.maxX)} ${point.y.toFixed(2)}`)
      .join(' ')}`
  const emitterConfig = baseOutput.particles.emitterConfig
    ? {
        ...baseOutput.particles.emitterConfig,
        origin: scanAnchors[0] ?? processedShape?.debug.perceptualCentroid ?? processedShape?.abstractedGeometry.centroid ?? baseOutput.particles.emitterConfig.origin,
        direction: behavior.birth === 'scan-and-assemble' ? { angle: 0, spread: 96 } : baseOutput.particles.emitterConfig.direction,
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
      bodyPath: blockPath,
      innerPath: innerGridPath,
      dominantSymbol: undefined,
      usesLogoMask: false,
    },
  }
}
