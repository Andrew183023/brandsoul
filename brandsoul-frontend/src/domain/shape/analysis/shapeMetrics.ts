type Point = {
  x: number
  y: number
}

type BoundingBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

type ShapeSignature = {
  type: string
  dominantAxis: string
  area: number
  complexity: number
  curvature: 'low' | 'medium' | 'high'
  curvatureRatio: number
  angularity: number
  circularity: number
  density: number
  symmetry: number
  symmetryHorizontal: number
  symmetryVertical: number
  massDistribution: 'concentrated' | 'spread'
  fragmentation: number
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

export function computeBoundingBox(points: Point[]): BoundingBox {
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
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

export function computeCentroid(points: Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  const total = points.reduce((accumulator, point) => ({
    x: accumulator.x + point.x,
    y: accumulator.y + point.y,
  }), { x: 0, y: 0 })

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

export function computePerceptualCentroid(points: Point[], signature?: { dominantAxis?: string; massDistribution?: string }): Point {
  const centroid = computeCentroid(points)
  const bounds = computeBoundingBox(points)
  const horizontalShift = signature?.massDistribution === 'spread' ? 0 : bounds.width * 0.02
  const verticalShift = signature?.dominantAxis === 'vertical' ? -bounds.height * 0.04 : 0

  return {
    x: centroid.x + horizontalShift,
    y: centroid.y + verticalShift,
  }
}

function polygonArea(points: Point[]) {
  if (points.length < 3) {
    return 0
  }

  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return Math.abs(area) / 2
}

function polygonPerimeter(points: Point[]) {
  if (points.length < 2) {
    return 0
  }

  let perimeter = 0
  for (let index = 0; index < points.length; index += 1) {
    perimeter += distance(points[index], points[(index + 1) % points.length])
  }
  return perimeter
}

function interiorTurnScore(points: Point[]) {
  if (points.length < 3) {
    return 0
  }

  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const first = Math.atan2(current.y - previous.y, current.x - previous.x)
    const second = Math.atan2(next.y - current.y, next.x - current.x)
    let delta = Math.abs(second - first)
    if (delta > Math.PI) {
      delta = Math.PI * 2 - delta
    }
    sum += delta / Math.PI
  }

  return sum / points.length
}

export function computeSymmetryScore(points: Point[], axis: 'horizontal' | 'vertical' | 'radial' = 'radial') {
  if (points.length === 0) {
    return 0
  }

  const centroid = computeCentroid(points)
  const bounds = computeBoundingBox(points)
  const tolerance = Math.max(bounds.width, bounds.height, 1)

  const reflectedDistances = points.map((point) => {
    const reflected = axis === 'horizontal'
      ? { x: point.x, y: centroid.y - (point.y - centroid.y) }
      : axis === 'vertical'
        ? { x: centroid.x - (point.x - centroid.x), y: point.y }
        : { x: centroid.x - (point.x - centroid.x), y: centroid.y - (point.y - centroid.y) }

    const nearest = points.reduce((best, candidate) => Math.min(best, distance(candidate, reflected)), Number.POSITIVE_INFINITY)
    return clamp(1 - nearest / tolerance)
  })

  return reflectedDistances.reduce((sum, value) => sum + value, 0) / reflectedDistances.length
}

export function computeSignature(points: Point[]): ShapeSignature {
  const bounds = computeBoundingBox(points)
  const area = polygonArea(points)
  const perimeter = polygonPerimeter(points)
  const circularity = perimeter > 0 ? clamp((4 * Math.PI * area) / (perimeter * perimeter)) : 0
  const angularity = clamp(interiorTurnScore(points) * 0.8)
  const curvatureRatio = clamp(1 - angularity * 0.75)
  const density = bounds.width > 0 && bounds.height > 0 ? clamp(area / (bounds.width * bounds.height)) : 0
  const symmetryHorizontal = computeSymmetryScore(points, 'horizontal')
  const symmetryVertical = computeSymmetryScore(points, 'vertical')
  const symmetry = computeSymmetryScore(points, 'radial')
  const complexity = clamp(points.length / 48)
  const centroid = computeCentroid(points)
  const averageRadius = points.length > 0
    ? points.reduce((sum, point) => sum + distance(point, centroid), 0) / points.length
    : 0
  const maxRadius = points.reduce((sum, point) => Math.max(sum, distance(point, centroid)), 0)
  const fragmentation = clamp((1 - density) * 0.55 + angularity * 0.45)

  return {
    type: circularity >= 0.78 ? 'orbital' : fragmentation >= 0.62 ? 'fragmentado' : angularity >= 0.58 ? 'geometrico' : 'organico',
    dominantAxis: bounds.height > bounds.width * 1.08 ? 'vertical' : bounds.width > bounds.height * 1.08 ? 'horizontal' : 'radial',
    area,
    complexity,
    curvature: curvatureRatio >= 0.7 ? 'high' : curvatureRatio >= 0.4 ? 'medium' : 'low',
    curvatureRatio,
    angularity,
    circularity,
    density,
    symmetry,
    symmetryHorizontal,
    symmetryVertical,
    massDistribution: maxRadius > 0 && averageRadius / maxRadius < 0.62 ? 'concentrated' : 'spread',
    fragmentation,
  }
}

export function simplifyPoints(points: Point[], tolerance = 2) {
  if (points.length <= 4) {
    return [...points]
  }

  const step = Math.max(1, Math.round(tolerance))
  const simplified = points.filter((_, index) => index % step === 0)
  return simplified.length >= 3 ? simplified : [...points]
}

export function chaikin(points: Point[], iterations = 1) {
  let current = [...points]
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (current.length < 2) {
      return current
    }

    const next: Point[] = []
    for (let index = 0; index < current.length; index += 1) {
      const left = current[index]
      const right = current[(index + 1) % current.length]
      next.push(
        { x: left.x * 0.75 + right.x * 0.25, y: left.y * 0.75 + right.y * 0.25 },
        { x: left.x * 0.25 + right.x * 0.75, y: left.y * 0.25 + right.y * 0.75 },
      )
    }
    current = next
  }
  return current
}

export function normalizePoints(points: Point[]) {
  if (points.length === 0) {
    return []
  }

  const bounds = computeBoundingBox(points)
  const scale = 180 / Math.max(bounds.width || 1, bounds.height || 1)
  const centroid = computeCentroid(points)

  return points.map((point) => ({
    x: 120 + (point.x - centroid.x) * scale,
    y: 120 + (point.y - centroid.y) * scale,
  }))
}

export function normalizePointSets(pointSets: Point[][]) {
  const allPoints = pointSets.flat()
  if (allPoints.length === 0) {
    return pointSets.map(() => [])
  }

  const bounds = computeBoundingBox(allPoints)
  const scale = 180 / Math.max(bounds.width || 1, bounds.height || 1)
  const centroid = computeCentroid(allPoints)

  return pointSets.map((points) => points.map((point) => ({
    x: 120 + (point.x - centroid.x) * scale,
    y: 120 + (point.y - centroid.y) * scale,
  })))
}

export function pointsToPath(points: Point[]) {
  if (points.length === 0) {
    return ''
  }

  const [first, ...rest] = points
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} Z`
}

export function buildEmissionPoints(points: Point[], centroid: Point, targetCount = 12) {
  if (points.length === 0) {
    return []
  }

  const step = Math.max(1, Math.floor(points.length / targetCount))
  return points
    .filter((_, index) => index % step === 0)
    .slice(0, targetCount)
    .map((point) => {
      const dx = point.x - centroid.x
      const dy = point.y - centroid.y
      return {
        x: point.x + dx * 0.12,
        y: point.y + dy * 0.12,
      }
    })
}