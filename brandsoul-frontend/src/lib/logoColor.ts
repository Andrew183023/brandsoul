const logoColorCache = new Map<string, string | undefined>()

function clampColorChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

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
        let redTotal = 0
        let greenTotal = 0
        let blueTotal = 0
        let visiblePixels = 0

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3]
          if (alpha < 24) {
            continue
          }

          redTotal += data[index]
          greenTotal += data[index + 1]
          blueTotal += data[index + 2]
          visiblePixels += 1
        }

        if (visiblePixels === 0) {
          resolve(undefined)
          return
        }

        resolve(rgbToHex(redTotal / visiblePixels, greenTotal / visiblePixels, blueTotal / visiblePixels))
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
