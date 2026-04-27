import type { ProcessedShape, ShapeBoundingBox, ShapePoint } from '../domain/shape/contracts/ProcessedShape'

export type ParticleEmitterConfig = {
  origin: { x: number; y: number }
  direction?: {
    angle: number
    spread: number
  }
}

function computeBounds(points: ShapePoint[]): ShapeBoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function buildFallbackPoints(): ShapePoint[] {
  return [
    { x: 72, y: 34 },
    { x: 168, y: 40 },
    { x: 192, y: 120 },
    { x: 162, y: 204 },
    { x: 78, y: 210 },
    { x: 42, y: 118 },
  ]
}

export function distortShape(points: ShapePoint[], flavor: 'fluid' | 'organic' | 'tech'): ShapePoint[] {
  if (flavor === 'tech') {
    return points.map((point) => ({
      x: Math.round(point.x / 6) * 6,
      y: Math.round(point.y / 6) * 6,
    }))
  }

  return points.map((point, index) => ({
    x: point.x + Math.sin(index * (flavor === 'organic' ? 0.45 : 0.3)) * (flavor === 'organic' ? 3 : 2),
    y: point.y + Math.cos(index * (flavor === 'organic' ? 0.35 : 0.22)) * (flavor === 'organic' ? 3 : 2),
  }))
}

export function generateShapeFromLogo(
  logoData: {
    shapeSource?: {
      shapeData?: {
        points?: ShapePoint[]
        boundingBox?: ShapeBoundingBox
      }
    }
  },
  _mode: string,
  _variant?: string,
): {
  points: ShapePoint[]
  bounds: ShapeBoundingBox
  processedShape?: ProcessedShape
} {
  const points = logoData.shapeSource?.shapeData?.points ?? buildFallbackPoints()
  const bounds = logoData.shapeSource?.shapeData?.boundingBox ?? computeBounds(points)

  return {
    points,
    bounds,
    processedShape: undefined,
  }
}
