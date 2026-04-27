import type { VisualEssence, VisualContrast, VisualComposition, VisualIntensity, VisualSaturation, VisualStructure, VisualTemperature } from '../contracts/VisualEssence'
import { analyzeRasterPalette } from './rasterPalette'

function defaultVisualEssence(): VisualEssence {
  return {
    primaryColor: '#ff9460',
    secondaryColor: '#6e86ff',
    energyColor: '#ffc18e',
    neutralColor: '#8f99ad',
    contrast: 'medium',
    saturation: 'medium',
    temperature: 'neutral',
    brightness: 0.5,
    structure: 'balanced',
    composition: 'centered',
    intensity: 'vivid',
    dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
  }
}

export async function analyzeVisualEssence(imageSource: string): Promise<VisualEssence> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 72
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (!context) {
        resolve(defaultVisualEssence())
        return
      }

      context.drawImage(image, 0, 0, size, size)
      const { data } = context.getImageData(0, 0, size, size)
      const palette = analyzeRasterPalette({ data, width: size, height: size })

      if (!palette) {
        resolve(defaultVisualEssence())
        return
      }

      const contrast: VisualContrast = palette.averageLuminance > 0.72 ? 'low' : palette.averageLuminance > 0.42 ? 'medium' : 'high'
      const saturation: VisualSaturation = palette.averageSaturation > 0.58 ? 'high' : palette.averageSaturation > 0.28 ? 'medium' : 'low'
      const temperature: VisualTemperature =
        (palette.averageHue >= 0 && palette.averageHue <= 60) || palette.averageHue >= 320
          ? 'warm'
          : palette.averageHue >= 150 && palette.averageHue <= 260
            ? 'cool'
            : 'neutral'
      const structure: VisualStructure = palette.edgeBias > 1.26 ? 'angular' : palette.edgeBias < 0.88 ? 'organic' : 'balanced'
      const composition: VisualComposition =
        palette.aspectRatio > 1.25
          ? 'vertical'
          : palette.dominantZones[0] && Math.abs(palette.dominantZones[0].x - 0.5) < 0.12 && Math.abs(palette.dominantZones[0].y - 0.5) < 0.14
            ? 'centered'
            : 'spread'
      const intensity: VisualIntensity =
        palette.averageSaturation > 0.62 || contrast === 'high'
          ? 'strong'
          : palette.averageSaturation > 0.34 || palette.averageLuminance < 0.36
            ? 'vivid'
            : 'soft'

      resolve({
        primaryColor: palette.primaryColor,
        secondaryColor: palette.secondaryColor,
        energyColor: palette.energyColor,
        neutralColor: palette.neutralColor,
        contrast,
        saturation,
        temperature,
        brightness: palette.averageLuminance,
        structure,
        composition,
        intensity,
        dominantZones: palette.dominantZones,
      })
    }

    image.onerror = () => resolve(defaultVisualEssence())
    image.src = imageSource
  })
}
