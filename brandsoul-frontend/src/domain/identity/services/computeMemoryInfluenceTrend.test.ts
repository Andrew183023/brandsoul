import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { computeMemoryInfluenceTrend } from './computeMemoryInfluenceTrend'

describe('computeMemoryInfluenceTrend', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a dominant support trend from accumulated fresh support memory and ignores weak memory', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'support-topic:2026-04-15T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.78,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'support-topic:2026-04-14T09:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.74,
        createdAt: '2026-04-14T09:00:00.000Z',
      },
      {
        key: 'product-interest:p-weak',
        value: 'Produto Fraco',
        type: 'relational',
        relevanceScore: 0.18,
        createdAt: '2026-04-15T11:00:00.000Z',
      },
    ]

    const result = computeMemoryInfluenceTrend(memory)

    expect(result.dominantIntentTrend).toEqual({
      intent: 'support',
      score: expect.any(Number),
    })
    expect(result.supportBias).toBeGreaterThan(0.9)
    expect(result.explorationBias).toBe(0)
    expect(result.preferenceSignals).toEqual([])
  })

  it('accumulates preference and exploration signals with recency-aware weighting', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.86,
        createdAt: '2026-04-15T11:30:00.000Z',
      },
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.9,
        createdAt: '2026-04-14T12:00:00.000Z',
      },
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.73,
        createdAt: '2026-04-15T09:00:00.000Z',
      },
    ]

    const result = computeMemoryInfluenceTrend(memory)

    expect(result.dominantIntentTrend).toEqual({
      intent: 'product-discovery',
      score: expect.any(Number),
    })
    expect(result.preferenceSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memoryId: 'product-interest:p-1',
          signal: 'product-interest',
        }),
        expect.objectContaining({
          memoryId: 'identity-inference:style-preference',
          signal: 'identity-inference',
        }),
      ]),
    )
    expect(result.preferenceSignals).toHaveLength(2)
    expect(result.explorationBias).toBeGreaterThan(0.9)
    expect(result.supportBias).toBe(0)
  })

  it('applies recency decay so stale memory loses the trend against newer session memory', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'support-topic:2026-02-01T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.96,
        createdAt: '2026-02-01T10:00:00.000Z',
      },
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.68,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
    ]

    const result = computeMemoryInfluenceTrend(memory)

    expect(result.dominantIntentTrend).toEqual({
      intent: 'product-discovery',
      score: expect.any(Number),
    })
    expect(result.supportBias).toBe(0)
    expect(result.explorationBias).toBeGreaterThan(0.6)
  })

  it('returns a neutral trend when the session has no usable memory', () => {
    expect(computeMemoryInfluenceTrend([])).toEqual({
      dominantIntentTrend: null,
      preferenceSignals: [],
      supportBias: 0,
      explorationBias: 0,
    })
  })
})