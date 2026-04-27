import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { deriveBrandSoulPreferences } from './deriveBrandSoulPreferences'

describe('deriveBrandSoulPreferences', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives explicit preferences from clear repeated product and category behavior', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.84,
        createdAt: '2026-04-15T11:30:00.000Z',
      },
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.8,
        createdAt: '2026-04-14T14:00:00.000Z',
      },
      {
        key: 'product-interest:p-2',
        value: { name: 'Bolsa Nebula', category: 'acessorios' },
        type: 'relational',
        relevanceScore: 0.34,
        createdAt: '2026-04-15T11:00:00.000Z',
      },
    ]

    const result = deriveBrandSoulPreferences(memory)

    expect(result.preferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'most-consulted-product',
          value: 'Vestido Aurora',
          score: expect.any(Number),
          confidence: expect.any(Number),
        }),
        expect.objectContaining({
          kind: 'preferred-category',
          value: 'moda',
          score: expect.any(Number),
          confidence: expect.any(Number),
        }),
        expect.objectContaining({
          kind: 'dominant-interaction',
          value: 'explore',
          score: expect.any(Number),
          confidence: expect.any(Number),
        }),
      ]),
    )
  })

  it('derives dominant interaction when support repetition is clearly stronger than explore noise', () => {
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
        key: 'support-topic:2026-04-14T16:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.74,
        createdAt: '2026-04-14T16:00:00.000Z',
      },
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.24,
        createdAt: '2026-04-15T11:45:00.000Z',
      },
    ]

    const result = deriveBrandSoulPreferences(memory)

    expect(result.preferences).toContainEqual(
      expect.objectContaining({
        kind: 'dominant-interaction',
        value: 'support',
      }),
    )
    expect(result.preferences.find((preference) => preference.kind === 'most-consulted-product')).toBeUndefined()
  })

  it('ignores noise and does not derive preferences without clear repetition', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.48,
        createdAt: '2026-04-15T11:30:00.000Z',
      },
      {
        key: 'product-interest:p-2',
        value: { name: 'Bolsa Nebula', category: 'acessorios' },
        type: 'relational',
        relevanceScore: 0.46,
        createdAt: '2026-04-15T11:00:00.000Z',
      },
      {
        key: 'support-topic:2026-04-15T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.32,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
    ]

    expect(deriveBrandSoulPreferences(memory)).toEqual({
      preferences: [],
    })
  })

  it('lets stale repeated behavior lose preference status over time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.88,
        createdAt: '2026-02-01T10:00:00.000Z',
      },
      {
        key: 'product-interest:p-1',
        value: { name: 'Vestido Aurora', category: 'moda' },
        type: 'relational',
        relevanceScore: 0.86,
        createdAt: '2026-02-02T10:00:00.000Z',
      },
    ]

    expect(deriveBrandSoulPreferences(memory)).toEqual({
      preferences: [],
    })
  })
})