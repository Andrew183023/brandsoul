import type { CoreSymbolBounds, CoreSymbolSelection } from '../contracts/CoreSymbolSelection'
import { rasterizeSvgPreview } from '../../shape/extraction/svgNormalization'
import { detectSupportedLogoFileFormat } from '../../../lib/media'

function calculateLuminance(red: number, green: number, blue: number) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

type ConnectedComponent = {
  pixels: Array<{ x: number; y: number }>
  area: number
  bounds: CoreSymbolBounds
  centroid: { x: number; y: number }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildBounds(points: Array<{ x: number; y: number }>, size: number): CoreSymbolBounds {
  let minX = size
  let minY = size
  let maxX = 0
  let maxY = 0

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  }
}

function extractConnectedComponents(alphaMask: Uint8ClampedArray, size: number) {
  const visited = new Uint8Array(size * size)
  const components: ConnectedComponent[] = []

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const startIndex = y * size + x
      if (visited[startIndex] || alphaMask[startIndex] === 0) {
        continue
      }

      const queue = [{ x, y }]
      const pixels: Array<{ x: number; y: number }> = []
      visited[startIndex] = 1

      for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
        const current = queue[queueIndex]!
        pixels.push(current)

        const neighbors = [
          { x: current.x - 1, y: current.y },
          { x: current.x + 1, y: current.y },
          { x: current.x, y: current.y - 1 },
          { x: current.x, y: current.y + 1 },
        ]

        for (const neighbor of neighbors) {
          if (neighbor.x < 0 || neighbor.x >= size || neighbor.y < 0 || neighbor.y >= size) {
            continue
          }

          const neighborIndex = neighbor.y * size + neighbor.x
          if (visited[neighborIndex] || alphaMask[neighborIndex] === 0) {
            continue
          }

          visited[neighborIndex] = 1
          queue.push(neighbor)
        }
      }

      if (pixels.length < 18) {
        continue
      }

      const bounds = buildBounds(pixels, size)
      const centroid = pixels.reduce(
        (accumulator, pixel) => ({
          x: accumulator.x + pixel.x,
          y: accumulator.y + pixel.y,
        }),
        { x: 0, y: 0 },
      )

      components.push({
        pixels,
        area: pixels.length,
        bounds,
        centroid: {
          x: centroid.x / pixels.length,
          y: centroid.y / pixels.length,
        },
      })
    }
  }

  return components
}

function estimatePerimeter(component: ConnectedComponent, alphaMask: Uint8ClampedArray, size: number) {
  let perimeter = 0

  for (const pixel of component.pixels) {
    const neighbors = [
      { x: pixel.x - 1, y: pixel.y },
      { x: pixel.x + 1, y: pixel.y },
      { x: pixel.x, y: pixel.y - 1 },
      { x: pixel.x, y: pixel.y + 1 },
    ]

    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.x >= size || neighbor.y < 0 || neighbor.y >= size) {
        perimeter += 1
        continue
      }

      const neighborIndex = neighbor.y * size + neighbor.x
      if (alphaMask[neighborIndex] === 0) {
        perimeter += 1
      }
    }
  }

  return perimeter
}

function scoreComponent(component: ConnectedComponent, components: ConnectedComponent[], alphaMask: Uint8ClampedArray, size: number) {
  const totalArea = components.reduce((sum, entry) => sum + entry.area, 0)
  const areaScore = component.area / Math.max(1, totalArea)
  const compactness = component.area / Math.max(1, component.bounds.width * component.bounds.height)
  const aspectRatio = component.bounds.width / Math.max(1, component.bounds.height)
  const aspectScore = aspectRatio > 2.8 ? 0.18 : aspectRatio > 2.1 ? 0.32 : aspectRatio > 1.55 ? 0.58 : 0.84
  const centerDistance = Math.hypot(component.centroid.x - size / 2, component.centroid.y - size / 2) / (size * 0.72)
  const centralityScore = 1 - clamp(centerDistance, 0, 1)
  const perimeter = estimatePerimeter(component, alphaMask, size)
  const structuralScore = clamp(perimeter / Math.max(1, component.area * 1.2), 0.12, 1)

  let nearestDistance = size
  for (const entry of components) {
    if (entry === component) {
      continue
    }

    const distance = Math.hypot(component.centroid.x - entry.centroid.x, component.centroid.y - entry.centroid.y)
    nearestDistance = Math.min(nearestDistance, distance)
  }
  const separationScore = components.length <= 1 ? 0.42 : clamp(nearestDistance / size, 0.08, 1)

  return areaScore * 0.28 + compactness * 0.24 + aspectScore * 0.18 + structuralScore * 0.16 + separationScore * 0.08 + centralityScore * 0.06
}

function cropWindowScore(
  alphaMask: Uint8ClampedArray,
  size: number,
  bounds: CoreSymbolBounds,
  sourceCenter: { x: number; y: number },
) {
  const maxDimension = Math.max(bounds.width, bounds.height)
  const windowSize = clamp(Math.round(Math.max(bounds.height * 1.18, maxDimension * 0.28)), 72, 170)
  const step = Math.max(8, Math.round(windowSize / 7))
  let best:
    | {
        score: number
        bounds: CoreSymbolBounds
      }
    | undefined

  for (let sourceY = Math.max(0, bounds.minY - Math.round(windowSize * 0.18)); sourceY <= Math.min(size - windowSize, bounds.maxY); sourceY += step) {
    for (let sourceX = Math.max(0, bounds.minX - Math.round(windowSize * 0.18)); sourceX <= Math.min(size - windowSize, bounds.maxX); sourceX += step) {
      let occupied = 0
      let edgeCount = 0

      for (let y = sourceY; y < sourceY + windowSize; y += 1) {
        for (let x = sourceX; x < sourceX + windowSize; x += 1) {
          const index = y * size + x
          if (alphaMask[index] === 0) {
            continue
          }

          occupied += 1
          const right = x + 1 < size ? alphaMask[y * size + x + 1] : 0
          const bottom = y + 1 < size ? alphaMask[(y + 1) * size + x] : 0
          if (right === 0 || bottom === 0) {
            edgeCount += 1
          }
        }
      }

      if (occupied < windowSize * windowSize * 0.06) {
        continue
      }

      const occupancyScore = occupied / (windowSize * windowSize)
      const edgeScore = edgeCount / Math.max(1, occupied)
      const centerX = sourceX + windowSize / 2
      const centerY = sourceY + windowSize / 2
      const centerDistance = Math.hypot(centerX - sourceCenter.x, centerY - sourceCenter.y) / size
      const centralityScore = 1 - clamp(centerDistance, 0, 1)
      const score = occupancyScore * 0.52 + edgeScore * 0.34 + centralityScore * 0.14

      if (!best || score > best.score) {
        best = {
          score,
          bounds: {
            minX: sourceX,
            minY: sourceY,
            maxX: sourceX + windowSize,
            maxY: sourceY + windowSize,
            width: windowSize,
            height: windowSize,
          },
        }
      }
    }
  }

  return best
}

function renderSymbolCrop(
  sourceCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement,
  bounds: CoreSymbolBounds,
  blurAmount = 0.35,
) {
  const size = outputCanvas.width
  const outputContext = outputCanvas.getContext('2d')

  if (!outputContext) {
    return undefined
  }

  const cropSize = Math.max(bounds.width, bounds.height)
  const sourceX = clamp(bounds.minX - Math.round((cropSize - bounds.width) / 2), 0, sourceCanvas.width - cropSize)
  const sourceY = clamp(bounds.minY - Math.round((cropSize - bounds.height) / 2), 0, sourceCanvas.height - cropSize)

  outputContext.clearRect(0, 0, size, size)
  outputContext.imageSmoothingEnabled = true
  outputContext.filter = `blur(${blurAmount}px)`
  outputContext.drawImage(sourceCanvas, sourceX, sourceY, cropSize, cropSize, size * 0.18, size * 0.16, size * 0.64, size * 0.68)

  return outputCanvas.toDataURL('image/png')
}

export async function extractLogoMask({
  file,
  imageSource,
}: {
  file: File
  imageSource: string
}): Promise<string | undefined> {
  if (detectSupportedLogoFileFormat(file) === 'svg') {
    return rasterizeSvgPreview(imageSource, 256)
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 256
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (!context) {
        resolve(undefined)
        return
      }

      context.clearRect(0, 0, size, size)
      context.drawImage(image, 0, 0, size, size)
      const imageData = context.getImageData(0, 0, size, size)
      const { data } = imageData

      let borderRed = 0
      let borderGreen = 0
      let borderBlue = 0
      let borderCount = 0

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (x > 8 && x < size - 9 && y > 8 && y < size - 9) {
            continue
          }

          const index = (y * size + x) * 4
          borderRed += data[index]
          borderGreen += data[index + 1]
          borderBlue += data[index + 2]
          borderCount += 1
        }
      }

      const backgroundRed = borderCount > 0 ? borderRed / borderCount : 12
      const backgroundGreen = borderCount > 0 ? borderGreen / borderCount : 12
      const backgroundBlue = borderCount > 0 ? borderBlue / borderCount : 18
      const backgroundLuminance = calculateLuminance(backgroundRed, backgroundGreen, backgroundBlue)

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index]
        const green = data[index + 1]
        const blue = data[index + 2]
        const alpha = data[index + 3]

        const distance = Math.hypot(red - backgroundRed, green - backgroundGreen, blue - backgroundBlue)
        const luminance = calculateLuminance(red, green, blue)
        const standsOut = distance > 44 || Math.abs(luminance - backgroundLuminance) > 0.16
        const opaque = alpha > 50 && standsOut

        data[index] = 255
        data[index + 1] = 255
        data[index + 2] = 255
        data[index + 3] = opaque ? 255 : 0
      }

      context.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => resolve(undefined)
    image.src = imageSource
  })
}

export async function extractCoreSymbol({
  maskSource,
}: {
  maskSource: string
}): Promise<CoreSymbolSelection> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const sourceCanvas = document.createElement('canvas')
      const size = 256
      sourceCanvas.width = size
      sourceCanvas.height = size
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })

      if (!sourceContext) {
        resolve({})
        return
      }

      sourceContext.clearRect(0, 0, size, size)
      sourceContext.drawImage(image, 0, 0, size, size)
      const { data } = sourceContext.getImageData(0, 0, size, size)

      const alphaMask = new Uint8ClampedArray(size * size)
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const index = (y * size + x) * 4
          alphaMask[y * size + x] = data[index + 3] > 40 ? 1 : 0
        }
      }

      const components = extractConnectedComponents(alphaMask, size)
      if (!components.length) {
        resolve({
          symbolSource: maskSource,
          debug: {
            strategy: 'fallback-full-mask',
            candidateCount: 0,
            chosenScore: 0,
            chosenBounds: {
              minX: 0,
              minY: 0,
              maxX: size,
              maxY: size,
              width: size,
              height: size,
            },
          },
        })
        return
      }

      const rankedComponents = components
        .map((component) => ({
          component,
          score: scoreComponent(component, components, alphaMask, size),
        }))
        .sort((left, right) => right.score - left.score)

      const bestCandidate = rankedComponents[0]!
      const candidateBounds = bestCandidate.component.bounds
      const candidateAspect = candidateBounds.width / Math.max(1, candidateBounds.height)
      const shouldWindowWordmark = components.length === 1 && candidateAspect > 2.2

      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = size
      outputCanvas.height = size

      const selectedWindow = shouldWindowWordmark
        ? cropWindowScore(alphaMask, size, candidateBounds, bestCandidate.component.centroid)
        : undefined

      const chosenBounds = selectedWindow?.bounds ?? candidateBounds
      const symbolSource = renderSymbolCrop(sourceCanvas, outputCanvas, chosenBounds, shouldWindowWordmark ? 0.2 : 0.35) ?? maskSource

      resolve({
        symbolSource,
        debug: {
          strategy: selectedWindow ? 'windowed-wordmark' : 'component',
          candidateCount: components.length,
          chosenScore: selectedWindow?.score ?? bestCandidate.score,
          chosenBounds,
        },
      })
    }

    image.onerror = () => resolve({})
    image.src = maskSource
  })
}
