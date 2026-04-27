import type { ExtractedShapeSource, ShapeBoundingBox, ShapePoint, ShapeSignature } from '../../../domain/shape/contracts/ProcessedShape'
import type { VisualArchetype } from '../../../domain/visual-archetype/contracts/VisualArchetype'

export type ArchetypeValidationFixture = {
  id: string
  label: string
  expectedBodyType: VisualArchetype['bodyType']
  summary: string
  inputTraits: string[]
  observationFocus: string[]
  logoPreview: string
  shapeSource: ExtractedShapeSource
}

function computeBoundingBox(points: ShapePoint[]): ShapeBoundingBox {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
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

function computeCentroid(points: ShapePoint[]): ShapePoint {
  const total = points.reduce(
    (accumulator, point) => ({ x: accumulator.x + point.x, y: accumulator.y + point.y }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

function toDataUri(points: ShapePoint[], accent: string) {
  const polygon = points.map((point) => `${point.x},${point.y}`).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="32" fill="#091019"/><polygon points="${polygon}" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="10" stroke-linejoin="round"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function createShapeSource(points: ShapePoint[], signature: ShapeSignature): ExtractedShapeSource {
  const boundingBox = computeBoundingBox(points)
  const centroid = computeCentroid(points)

  return {
    sourceType: 'svg',
    shapeData: {
      type: 'contour',
      points,
      boundingBox,
      centroid,
    },
    signature,
    debug: {
      contourPoints: points,
      centroid,
    },
  }
}

export const archetypeValidationFixtures: ArchetypeValidationFixture[] = [
  {
    id: 'simple-orbital',
    label: 'Simple orbital',
    expectedBodyType: 'orbital',
    summary: 'Marca simples e simétrica. Deve continuar claramente orbital sem colapsar em logo literal.',
    inputTraits: ['simple', 'symmetric'],
    observationFocus: ['reconhecimento imediato da categoria', 'se a curva continua forte em pausa'],
    logoPreview: toDataUri([
      { x: 120, y: 34 },
      { x: 176, y: 56 },
      { x: 202, y: 120 },
      { x: 178, y: 188 },
      { x: 120, y: 208 },
      { x: 62, y: 188 },
      { x: 38, y: 120 },
      { x: 64, y: 56 },
    ], '#ff9460'),
    shapeSource: createShapeSource(
      [
        { x: 120, y: 34 },
        { x: 176, y: 56 },
        { x: 202, y: 120 },
        { x: 178, y: 188 },
        { x: 120, y: 208 },
        { x: 62, y: 188 },
        { x: 38, y: 120 },
        { x: 64, y: 56 },
      ],
      {
        type: 'orbital',
        dominantAxis: 'radial',
        area: 14800,
        complexity: 0.32,
        curvature: 'high',
        curvatureRatio: 0.88,
        angularity: 0.14,
        circularity: 0.92,
        density: 0.76,
        symmetry: 0.9,
        symmetryHorizontal: 0.88,
        symmetryVertical: 0.92,
        massDistribution: 'concentrated',
        fragmentation: 0.06,
      },
    ),
  },
  {
    id: 'symmetric-linear',
    label: 'Symmetric linear',
    expectedBodyType: 'linear',
    summary: 'Corpo colunar e simétrico. Deve parecer axial, não um logo esticado.',
    inputTraits: ['simple', 'symmetric', 'vertical'],
    observationFocus: ['força axial/colunar', 'se a silhueta ainda depende demais do contorno original'],
    logoPreview: toDataUri([
      { x: 96, y: 24 },
      { x: 144, y: 24 },
      { x: 176, y: 72 },
      { x: 164, y: 204 },
      { x: 76, y: 204 },
      { x: 64, y: 72 },
    ], '#7cc8ff'),
    shapeSource: createShapeSource(
      [
        { x: 96, y: 24 },
        { x: 144, y: 24 },
        { x: 176, y: 72 },
        { x: 164, y: 204 },
        { x: 76, y: 204 },
        { x: 64, y: 72 },
      ],
      {
        type: 'linear',
        dominantAxis: 'vertical',
        area: 11200,
        complexity: 0.46,
        curvature: 'medium',
        curvatureRatio: 0.34,
        angularity: 0.58,
        circularity: 0.3,
        density: 0.68,
        symmetry: 0.86,
        symmetryHorizontal: 0.74,
        symmetryVertical: 0.92,
        massDistribution: 'concentrated',
        fragmentation: 0.12,
      },
    ),
  },
  {
    id: 'organic-asymmetric',
    label: 'Organic asymmetric',
    expectedBodyType: 'organic',
    summary: 'Curvatura viva e massa irregular. Deve preservar suavidade sem virar massa genérica.',
    inputTraits: ['complex', 'organic', 'asymmetric'],
    observationFocus: ['crescimento assimétrico', 'se a categoria continua orgânica sem perder presença'],
    logoPreview: toDataUri([
      { x: 56, y: 98 },
      { x: 88, y: 42 },
      { x: 146, y: 38 },
      { x: 196, y: 74 },
      { x: 184, y: 154 },
      { x: 132, y: 210 },
      { x: 74, y: 196 },
      { x: 42, y: 144 },
    ], '#7ef1b0'),
    shapeSource: createShapeSource(
      [
        { x: 56, y: 98 },
        { x: 88, y: 42 },
        { x: 146, y: 38 },
        { x: 196, y: 74 },
        { x: 184, y: 154 },
        { x: 132, y: 210 },
        { x: 74, y: 196 },
        { x: 42, y: 144 },
      ],
      {
        type: 'organico',
        dominantAxis: 'horizontal',
        area: 12600,
        complexity: 0.66,
        curvature: 'high',
        curvatureRatio: 0.78,
        angularity: 0.24,
        circularity: 0.62,
        density: 0.52,
        symmetry: 0.42,
        symmetryHorizontal: 0.36,
        symmetryVertical: 0.48,
        massDistribution: 'spread',
        fragmentation: 0.22,
      },
    ),
  },
  {
    id: 'complex-geometric',
    label: 'Complex geometric',
    expectedBodyType: 'geometric',
    summary: 'Geometria técnica e densa. Deve parecer categoria própria, não só polígono derivado do logo.',
    inputTraits: ['complex', 'geometric'],
    observationFocus: ['modularidade/arestas', 'canonicidade excessiva ou insuficiente'],
    logoPreview: toDataUri([
      { x: 118, y: 22 },
      { x: 180, y: 48 },
      { x: 214, y: 118 },
      { x: 188, y: 194 },
      { x: 120, y: 218 },
      { x: 54, y: 190 },
      { x: 30, y: 116 },
      { x: 58, y: 46 },
      { x: 120, y: 82 },
    ], '#c6b0ff'),
    shapeSource: createShapeSource(
      [
        { x: 118, y: 22 },
        { x: 180, y: 48 },
        { x: 214, y: 118 },
        { x: 188, y: 194 },
        { x: 120, y: 218 },
        { x: 54, y: 190 },
        { x: 30, y: 116 },
        { x: 58, y: 46 },
        { x: 120, y: 82 },
      ],
      {
        type: 'geometrico',
        dominantAxis: 'radial',
        area: 15400,
        complexity: 0.82,
        curvature: 'low',
        curvatureRatio: 0.22,
        angularity: 0.8,
        circularity: 0.28,
        density: 0.58,
        symmetry: 0.74,
        symmetryHorizontal: 0.7,
        symmetryVertical: 0.78,
        massDistribution: 'concentrated',
        fragmentation: 0.28,
      },
    ),
  },
  {
    id: 'fragmented-spread',
    label: 'Fragmented spread',
    expectedBodyType: 'fragmented',
    summary: 'Entrada quebrada e espalhada. Deve virar corpo fragmentado forte sem morrer em ruído.',
    inputTraits: ['fragmented', 'complex', 'spread'],
    observationFocus: ['múltiplos centros', 'se ainda parece variação do input cru'],
    logoPreview: toDataUri([
      { x: 34, y: 74 },
      { x: 112, y: 26 },
      { x: 182, y: 64 },
      { x: 150, y: 126 },
      { x: 202, y: 182 },
      { x: 112, y: 214 },
      { x: 38, y: 170 },
      { x: 72, y: 124 },
    ], '#ffb36c'),
    shapeSource: createShapeSource(
      [
        { x: 34, y: 74 },
        { x: 112, y: 26 },
        { x: 182, y: 64 },
        { x: 150, y: 126 },
        { x: 202, y: 182 },
        { x: 112, y: 214 },
        { x: 38, y: 170 },
        { x: 72, y: 124 },
      ],
      {
        type: 'fragmentado',
        dominantAxis: 'horizontal',
        area: 13800,
        complexity: 0.88,
        curvature: 'low',
        curvatureRatio: 0.18,
        angularity: 0.84,
        circularity: 0.16,
        density: 0.24,
        symmetry: 0.22,
        symmetryHorizontal: 0.24,
        symmetryVertical: 0.18,
        massDistribution: 'spread',
        fragmentation: 0.9,
      },
    ),
  },
]