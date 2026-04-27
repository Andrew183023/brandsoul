import { describe, expect, it } from 'vitest'

import { parsePixiColor } from './color'

describe('parsePixiColor', () => {
  it('parses hex colors safely', () => {
    expect(parsePixiColor('#6e86ff')).toEqual({ color: 0x6e86ff, alpha: 1 })
    expect(parsePixiColor('#fff')).toEqual({ color: 0xffffff, alpha: 1 })
  })

  it('parses rgb and rgba colors for Pixi fill usage', () => {
    expect(parsePixiColor('rgb(255, 176, 0)')).toEqual({ color: 0xffb000, alpha: 1 })
    expect(parsePixiColor('rgba(255,255,255,0.95)')).toEqual({ color: 0xffffff, alpha: 0.95 })
  })

  it('falls back to white for invalid colors', () => {
    expect(parsePixiColor('not-a-color')).toEqual({ color: 0xffffff, alpha: 1 })
  })
})