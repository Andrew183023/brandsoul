export type ParsedPixiColor = {
  color: number
  alpha: number
}

const PIXI_COLOR_FALLBACK: ParsedPixiColor = {
  color: 0xffffff,
  alpha: 1,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function channelToByte(value: string) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return 255
  }

  return Math.round(clamp(parsed, 0, 255))
}

function parseHexColor(input: string): ParsedPixiColor | undefined {
  const normalized = input.trim().replace('#', '')
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized)) {
    return undefined
  }

  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized
  const color = Number.parseInt(expanded, 16)

  return Number.isFinite(color)
    ? {
        color,
        alpha: 1,
      }
    : undefined
}

function parseRgbColor(input: string): ParsedPixiColor | undefined {
  const match = input.trim().match(/^rgba?\(([^)]+)\)$/i)
  if (!match) {
    return undefined
  }

  const parts = match[1]!.split(',').map((part) => part.trim())
  if (parts.length < 3) {
    return undefined
  }

  const red = channelToByte(parts[0]!)
  const green = channelToByte(parts[1]!)
  const blue = channelToByte(parts[2]!)
  const alpha = parts[3] !== undefined ? clamp(Number.parseFloat(parts[3]!), 0, 1) : 1

  return {
    color: (red << 16) + (green << 8) + blue,
    alpha: Number.isFinite(alpha) ? alpha : 1,
  }
}

export function parsePixiColor(input?: string): ParsedPixiColor {
  if (!input) {
    return PIXI_COLOR_FALLBACK
  }

  return parseHexColor(input) ?? parseRgbColor(input) ?? PIXI_COLOR_FALLBACK
}