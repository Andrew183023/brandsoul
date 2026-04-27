import { describe, expect, it } from 'vitest'

import { detectSupportedLogoFileFormat, isSvgImageSource } from './media'

describe('media logo format detection', () => {
  it('accepts svg, png and jpg by extension when MIME is missing or inconsistent', () => {
    expect(detectSupportedLogoFileFormat({ name: 'brand-mark.svg', type: '' })).toBe('svg')
    expect(detectSupportedLogoFileFormat({ name: 'seal.png', type: 'application/octet-stream' })).toBe('png')
    expect(detectSupportedLogoFileFormat({ name: 'wordmark.jpeg', type: 'image/pjpeg' })).toBe('jpg')
  })

  it('detects svg sources from markup and data urls', () => {
    expect(isSvgImageSource('<svg viewBox="0 0 10 10"></svg>')).toBe(true)
    expect(isSvgImageSource('data:image/svg+xml;charset=utf-8,%3Csvg%20viewBox%3D%220%200%2010%2010%22%3E%3C%2Fsvg%3E')).toBe(true)
    expect(isSvgImageSource('data:image/png;base64,abc123')).toBe(false)
  })
})