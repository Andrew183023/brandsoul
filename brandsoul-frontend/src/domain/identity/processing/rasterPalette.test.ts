import { describe, expect, it } from 'vitest'

import { analyzeRasterPalette } from './rasterPalette'

function paintPixel(data: Uint8ClampedArray, width: number, x: number, y: number, rgba: [number, number, number, number]) {
  const index = (y * width + x) * 4
  data[index] = rgba[0]
  data[index + 1] = rgba[1]
  data[index + 2] = rgba[2]
  data[index + 3] = rgba[3]
}

describe('analyzeRasterPalette', () => {
  it('prioritizes the central symbol over a large white background', () => {
    const width = 12
    const height = 12
    const data = new Uint8ClampedArray(width * height * 4)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        paintPixel(data, width, x, y, [248, 246, 242, 255])
      }
    }

    for (let y = 3; y < 9; y += 1) {
      for (let x = 4; x < 8; x += 1) {
        paintPixel(data, width, x, y, [208, 78, 40, 255])
      }
    }

    const palette = analyzeRasterPalette({ data, width, height })

    expect(palette?.primaryColor).toBe('#d04e28')
    expect(palette?.dominantZones[0]?.x).toBeCloseTo(0.5, 1)
    expect(palette?.dominantZones[0]?.y).toBeCloseTo(0.5, 1)
  })

  it('downweights anti-alias fringe and keeps support colors available', () => {
    const width = 10
    const height = 10
    const data = new Uint8ClampedArray(width * height * 4)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        paintPixel(data, width, x, y, [235, 235, 235, 255])
      }
    }

    for (let y = 2; y < 8; y += 1) {
      for (let x = 2; x < 8; x += 1) {
        paintPixel(data, width, x, y, [34, 99, 182, 255])
      }
    }

    for (let x = 1; x < 9; x += 1) {
      paintPixel(data, width, x, 1, [180, 190, 205, 110])
      paintPixel(data, width, x, 8, [180, 190, 205, 110])
    }

    const palette = analyzeRasterPalette({ data, width, height })

    expect(palette?.primaryColor).toBe('#2263b6')
    expect(palette?.energyColor).toBeDefined()
    expect(palette?.neutralColor).toBeDefined()
    expect(palette?.neutralColor).not.toBe('#ebebeb')
  })
})