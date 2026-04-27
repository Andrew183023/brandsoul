const logoColorCache = new Map<string, string | undefined>()
import { analyzeRasterPalette } from '../domain/identity/processing/rasterPalette'

export async function extractDominantLogoColor(imageSrc?: string): Promise<string | undefined> {
  if (!imageSrc?.trim()) {
    return undefined
  }

  if (logoColorCache.has(imageSrc)) {
    return logoColorCache.get(imageSrc)
  }

  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'

    const result = await new Promise<string | undefined>((resolve) => {
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })

        if (!context) {
          resolve(undefined)
          return
        }

        const sampleSize = 24
        canvas.width = sampleSize
        canvas.height = sampleSize
        context.drawImage(image, 0, 0, sampleSize, sampleSize)

        const { data } = context.getImageData(0, 0, sampleSize, sampleSize)
        const palette = analyzeRasterPalette({ data, width: sampleSize, height: sampleSize })

        if (!palette) {
          resolve(undefined)
          return
        }

        resolve(palette.primaryColor)
      }

      image.onerror = () => resolve(undefined)
      image.src = imageSrc
    })

    logoColorCache.set(imageSrc, result)
    return result
  } catch {
    logoColorCache.set(imageSrc, undefined)
    return undefined
  }
}
