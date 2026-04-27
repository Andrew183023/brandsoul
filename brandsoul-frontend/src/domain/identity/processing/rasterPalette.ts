type RgbColor = {
  red: number
  green: number
  blue: number
}

type ColorBucket = {
  weight: number
  red: number
  green: number
  blue: number
  saturationWeight: number
  luminanceWeight: number
  centerWeight: number
  backgroundWeight: number
}

export type RasterPaletteAnalysis = {
  primaryColor: string
  secondaryColor: string
  energyColor: string
  neutralColor: string
  averageLuminance: number
  averageSaturation: number
  averageHue: number
  dominantZones: Array<{
    x: number
    y: number
    weight: number
  }>
  aspectRatio: number
  edgeBias: number
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => clampChannel(value).toString(16).padStart(2, '0')).join('')}`
}

function calculateLuminance(red: number, green: number, blue: number) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let hue = 0
  let saturation = 0
  const lightness = (max + min) / 2

  if (max !== min) {
    const difference = max - min
    saturation = lightness > 0.5 ? difference / (2 - max - min) : difference / (max + min)

    switch (max) {
      case r:
        hue = (g - b) / difference + (g < b ? 6 : 0)
        break
      case g:
        hue = (b - r) / difference + 2
        break
      default:
        hue = (r - g) / difference + 4
        break
    }

    hue /= 6
  }

  return { hue: hue * 360, saturation, lightness }
}

function hueToRgb(p: number, q: number, t: number) {
  let normalized = t
  if (normalized < 0) {
    normalized += 1
  }
  if (normalized > 1) {
    normalized -= 1
  }
  if (normalized < 1 / 6) {
    return p + (q - p) * 6 * normalized
  }
  if (normalized < 1 / 2) {
    return q
  }
  if (normalized < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalized) * 6
  }
  return p
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360

  if (saturation === 0) {
    const channel = clampChannel(lightness * 255)
    return { red: channel, green: channel, blue: channel }
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q

  return {
    red: clampChannel(hueToRgb(p, q, normalizedHue + 1 / 3) * 255),
    green: clampChannel(hueToRgb(p, q, normalizedHue) * 255),
    blue: clampChannel(hueToRgb(p, q, normalizedHue - 1 / 3) * 255),
  }
}

function mixColors(left: RgbColor, right: RgbColor, ratio: number): RgbColor {
  const weight = clamp(ratio)
  return {
    red: clampChannel(left.red * (1 - weight) + right.red * weight),
    green: clampChannel(left.green * (1 - weight) + right.green * weight),
    blue: clampChannel(left.blue * (1 - weight) + right.blue * weight),
  }
}

function colorDistance(left: RgbColor, right: RgbColor) {
  return Math.hypot(left.red - right.red, left.green - right.green, left.blue - right.blue)
}

function quantizeKey(red: number, green: number, blue: number) {
  return `${Math.round(red / 24)}-${Math.round(green / 24)}-${Math.round(blue / 24)}`
}

function readBucketColor(bucket: ColorBucket): RgbColor {
  const divisor = Math.max(bucket.weight, 0.0001)
  return {
    red: bucket.red / divisor,
    green: bucket.green / divisor,
    blue: bucket.blue / divisor,
  }
}

function boostEnergyColor(color: RgbColor): RgbColor {
  const { hue, saturation, lightness } = rgbToHsl(color.red, color.green, color.blue)
  return hslToRgb(hue, clamp(Math.max(saturation, 0.42) + 0.18, 0, 0.94), clamp(lightness + 0.04, 0.18, 0.78))
}

function softenNeutralColor(color: RgbColor): RgbColor {
  const { hue, saturation, lightness } = rgbToHsl(color.red, color.green, color.blue)
  return hslToRgb(hue, clamp(saturation * 0.24, 0.06, 0.2), clamp(lightness, 0.24, 0.72))
}

function dedupeColors(colors: string[]) {
  return [...new Set(colors)]
}

export function analyzeRasterPalette(args: {
  data: Uint8ClampedArray
  width: number
  height: number
}): RasterPaletteAnalysis | undefined {
  const { data, width, height } = args
  const totalPixels = width * height
  if (!data.length || totalPixels === 0) {
    return undefined
  }

  const borderBuckets = new Map<string, ColorBucket>()
  const borderBand = Math.max(2, Math.round(Math.min(width, height) * 0.08))
  let borderWeightTotal = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const borderDistance = Math.min(x, y, width - 1 - x, height - 1 - y)
      if (borderDistance > borderBand) {
        continue
      }

      const index = (y * width + x) * 4
      const alphaWeight = clamp((data[index + 3] / 255 - 0.12) / 0.88)
      if (alphaWeight <= 0) {
        continue
      }

      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      const { saturation } = rgbToHsl(red, green, blue)
      const bucketWeight = alphaWeight * (saturation < 0.16 ? 1.15 : 0.85)
      const bucketKey = quantizeKey(red, green, blue)
      const bucket = borderBuckets.get(bucketKey)
      if (bucket) {
        bucket.weight += bucketWeight
        bucket.red += red * bucketWeight
        bucket.green += green * bucketWeight
        bucket.blue += blue * bucketWeight
      } else {
        borderBuckets.set(bucketKey, {
          weight: bucketWeight,
          red: red * bucketWeight,
          green: green * bucketWeight,
          blue: blue * bucketWeight,
          saturationWeight: 0,
          luminanceWeight: 0,
          centerWeight: 0,
          backgroundWeight: 0,
        })
      }
      borderWeightTotal += bucketWeight
    }
  }

  const backgroundBucket = [...borderBuckets.values()].sort((left, right) => right.weight - left.weight)[0]
  const backgroundColor = backgroundBucket && borderWeightTotal > 6 ? readBucketColor(backgroundBucket) : undefined
  const colorBuckets = new Map<string, ColorBucket>()
  const gridWeights = Array.from({ length: 9 }, () => 0)
  let weightedLuminanceTotal = 0
  let weightedSaturationTotal = 0
  let hueX = 0
  let hueY = 0
  let totalWeight = 0
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let centroidX = 0
  let centroidY = 0
  let horizontalEdgeTotal = 0
  let verticalEdgeTotal = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3] / 255
      const alphaWeight = Math.pow(clamp((alpha - 0.14) / 0.86), 1.6)
      if (alphaWeight <= 0) {
        continue
      }

      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      const { hue, saturation } = rgbToHsl(red, green, blue)
      const luminance = calculateLuminance(red, green, blue)
      const centerDistance = Math.hypot((x + 0.5 - width / 2) / (width / 2), (y + 0.5 - height / 2) / (height / 2))
      const centerWeight = 0.42 + clamp(1 - centerDistance) * 0.96
      const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y) / Math.max(1, Math.min(width, height) / 2)
      const edgeWeight = 0.28 + clamp(edgeDistance) * 0.92
      const antiAliasPenalty = alpha < 0.94 && saturation < 0.22 ? 0.42 : 1
      const neutralPenalty =
        saturation < 0.08
          ? 0.1
          : saturation < 0.16
            ? 0.24
            : saturation < 0.26
              ? 0.56
              : 1
      const luminancePenalty = luminance > 0.95 || luminance < 0.05 ? 0.28 : luminance > 0.9 || luminance < 0.1 ? 0.54 : 1
      const backgroundSimilarity = backgroundColor ? 1 - clamp(colorDistance({ red, green, blue }, backgroundColor) / 260) : 0
      const backgroundPenalty =
        backgroundSimilarity > 0.92
          ? edgeDistance < 0.36
            ? 0.06
            : 0.16
          : backgroundSimilarity > 0.76
            ? edgeDistance < 0.4
              ? 0.18
              : 0.42
            : 1

      const weight = alphaWeight * centerWeight * edgeWeight * antiAliasPenalty * neutralPenalty * luminancePenalty * backgroundPenalty
      if (weight <= 0.002) {
        continue
      }

      const bucketKey = quantizeKey(red, green, blue)
      const bucket = colorBuckets.get(bucketKey)
      if (bucket) {
        bucket.weight += weight
        bucket.red += red * weight
        bucket.green += green * weight
        bucket.blue += blue * weight
        bucket.saturationWeight += saturation * weight
        bucket.luminanceWeight += luminance * weight
        bucket.centerWeight += centerWeight * weight
        bucket.backgroundWeight += backgroundSimilarity * weight
      } else {
        colorBuckets.set(bucketKey, {
          weight,
          red: red * weight,
          green: green * weight,
          blue: blue * weight,
          saturationWeight: saturation * weight,
          luminanceWeight: luminance * weight,
          centerWeight: centerWeight * weight,
          backgroundWeight: backgroundSimilarity * weight,
        })
      }

      const gridX = Math.min(2, Math.floor((x / width) * 3))
      const gridY = Math.min(2, Math.floor((y / height) * 3))
      const hueRadians = (hue * Math.PI) / 180

      weightedLuminanceTotal += luminance * weight
      weightedSaturationTotal += saturation * weight
      hueX += Math.cos(hueRadians) * weight
      hueY += Math.sin(hueRadians) * weight
      centroidX += x * weight
      centroidY += y * weight
      gridWeights[gridY * 3 + gridX] += weight
      totalWeight += weight
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      if (x < width - 1) {
        const nextIndex = index + 4
        horizontalEdgeTotal +=
          (Math.abs(red - data[nextIndex]) + Math.abs(green - data[nextIndex + 1]) + Math.abs(blue - data[nextIndex + 2])) * weight
      }

      if (y < height - 1) {
        const nextIndex = index + width * 4
        verticalEdgeTotal +=
          (Math.abs(red - data[nextIndex]) + Math.abs(green - data[nextIndex + 1]) + Math.abs(blue - data[nextIndex + 2])) * weight
      }
    }
  }

  if (totalWeight <= 0 || colorBuckets.size === 0) {
    return undefined
  }

  const bucketCandidates = [...colorBuckets.values()]
    .map((bucket) => {
      const color = readBucketColor(bucket)
      const averageSaturation = bucket.saturationWeight / Math.max(bucket.weight, 0.0001)
      const averageLuminance = bucket.luminanceWeight / Math.max(bucket.weight, 0.0001)
      const backgroundSimilarity = bucket.backgroundWeight / Math.max(bucket.weight, 0.0001)
      const centerShare = bucket.centerWeight / Math.max(bucket.weight, 0.0001)
      return {
        bucket,
        color,
        averageSaturation,
        averageLuminance,
        backgroundSimilarity,
        centerShare,
        score:
          bucket.weight *
          (0.68 + averageSaturation * 0.92 + centerShare * 0.24) *
          (1 - backgroundSimilarity * 0.82),
      }
    })
    .sort((left, right) => right.score - left.score)

  const primaryCandidate =
    bucketCandidates.find((candidate) => candidate.averageSaturation > 0.18 && candidate.backgroundSimilarity < 0.78) ??
    bucketCandidates[0]

  if (!primaryCandidate) {
    return undefined
  }

  const primaryColor = rgbToHex(primaryCandidate.color.red, primaryCandidate.color.green, primaryCandidate.color.blue)
  const secondaryCandidate =
    bucketCandidates
      .filter((candidate) => candidate !== primaryCandidate)
      .map((candidate) => ({
        ...candidate,
        separation: clamp(colorDistance(candidate.color, primaryCandidate.color) / 220),
      }))
      .sort(
        (left, right) =>
          right.bucket.weight * (0.54 + right.separation * 0.96 + right.averageSaturation * 0.44) -
          left.bucket.weight * (0.54 + left.separation * 0.96 + left.averageSaturation * 0.44),
      )[0] ?? primaryCandidate

  const secondaryColor = rgbToHex(secondaryCandidate.color.red, secondaryCandidate.color.green, secondaryCandidate.color.blue)
  const energyCandidate =
    bucketCandidates
      .filter((candidate) => colorDistance(candidate.color, primaryCandidate.color) > 22)
      .sort(
        (left, right) =>
          right.averageSaturation * right.bucket.weight * (0.62 + right.centerShare * 0.28) -
          left.averageSaturation * left.bucket.weight * (0.62 + left.centerShare * 0.28),
      )[0] ?? secondaryCandidate

  const energySource = energyCandidate.averageSaturation > 0.28
    ? energyCandidate.color
    : boostEnergyColor(mixColors(primaryCandidate.color, secondaryCandidate.color, 0.32))
  const energyColor = rgbToHex(energySource.red, energySource.green, energySource.blue)

  const neutralCandidate =
    bucketCandidates
      .filter(
        (candidate) =>
          candidate.averageSaturation < 0.24 &&
          candidate.averageLuminance > 0.16 &&
          candidate.averageLuminance < 0.82 &&
          candidate.backgroundSimilarity < 0.78,
      )
      .sort((left, right) => right.bucket.weight - left.bucket.weight)[0]

  const neutralSource = neutralCandidate
    ? neutralCandidate.color
    : softenNeutralColor(mixColors(primaryCandidate.color, secondaryCandidate.color, 0.5))
  const neutralColor = rgbToHex(neutralSource.red, neutralSource.green, neutralSource.blue)

  const averageLuminance = weightedLuminanceTotal / totalWeight
  const averageSaturation = weightedSaturationTotal / totalWeight
  const averageHue = ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360
  const centroidNormalizedX = centroidX / totalWeight / width
  const centroidNormalizedY = centroidY / totalWeight / height
  const normalizedZones = gridWeights
    .map((weight, index) => ({
      x: ((index % 3) + 0.5) / 3,
      y: (Math.floor(index / 3) + 0.5) / 3,
      weight: weight / totalWeight,
    }))
    .filter((zone) => zone.weight > 0.08)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3)

  const widthSpan = Math.max(1, maxX - minX)
  const heightSpan = Math.max(1, maxY - minY)

  return {
    primaryColor,
    secondaryColor,
    energyColor: dedupeColors([energyColor, secondaryColor, primaryColor])[0] ?? secondaryColor,
    neutralColor: dedupeColors([neutralColor, secondaryColor, primaryColor])[0] ?? secondaryColor,
    averageLuminance,
    averageSaturation,
    averageHue,
    dominantZones:
      normalizedZones.length > 0
        ? normalizedZones
        : [{ x: centroidNormalizedX || 0.5, y: centroidNormalizedY || 0.5, weight: 1 }],
    aspectRatio: heightSpan / widthSpan,
    edgeBias: verticalEdgeTotal / Math.max(1, horizontalEdgeTotal),
  }
}