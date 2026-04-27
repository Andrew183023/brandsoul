import { describe, expect, it } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { applyBrandSoulMemoryPolicy } from './applyBrandSoulMemoryPolicy'

function buildContext(memory: BrandSoulMemorySnapshot[] = []): Pick<BrandSoulContext, 'memory'> {
  return { memory }
}

describe('applyBrandSoulMemoryPolicy', () => {
  it('normalizes operational candidates and resolves expiration internally', () => {
    const result = applyBrandSoulMemoryPolicy(buildContext(), [
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
    ])

    expect(result.legacySnapshots).toEqual([
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
    ])
    expect(result.acceptedMemories[0]?.content.signal).toBe('active-promotion')
    expect(result.acceptedMemories[0]?.expiresAt).toBe('2026-04-29T10:00:00.000Z')
    expect(result.persistenceRecords).toEqual([
      {
        memoryId: 'promotion-context:promo-1',
        schemaVersion: 1,
        memoryType: 'operational',
        source: 'system',
        subject: 'promotion-context',
        signal: 'active-promotion',
        attributes: {
          promotionId: 'promo-1',
          promotionLabel: 'Semana da Aurora',
          observedValue: 'Semana da Aurora',
        },
        tags: ['commerce', 'promotion'],
        contextKey: 'promotion:promo-1',
        relevanceScore: 0.72,
        retentionKind: 'expiring',
        createdAt: '2026-04-15T10:00:00.000Z',
        expiresAt: '2026-04-29T10:00:00.000Z',
      },
    ])
    expect(result.rejectedMemories).toEqual([])
  })

  it('filters low-relevance conversational noise', () => {
    const result = applyBrandSoulMemoryPolicy(buildContext(), [
      {
        key: 'conversation-focus:2026-04-15T10:00:00.000Z',
        value: 'me fala qualquer coisa sobre a marca',
        type: 'relational',
        relevanceScore: 0.42,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
    ])

    expect(result.legacySnapshots).toEqual([])
    expect(result.acceptedMemories).toEqual([])
    expect(result.persistenceRecords).toEqual([])
    expect(result.rejectedMemories).toHaveLength(1)
    expect(result.rejectedMemories[0]?.candidate.key).toBe('conversation-focus:2026-04-15T10:00:00.000Z')
    expect(result.rejectedMemories[0]?.reasons).toEqual(['below-relevance-threshold'])
  })

  it('deduplicates candidates against memory already present in context', () => {
    const existingMemory: BrandSoulMemorySnapshot = {
      key: 'promotion-context:promo-1',
      value: 'Semana da Aurora',
      type: 'operational',
      relevanceScore: 0.72,
      createdAt: '2026-04-14T10:00:00.000Z',
    }

    const result = applyBrandSoulMemoryPolicy(buildContext([existingMemory]), [existingMemory])

    expect(result.legacySnapshots).toEqual([])
    expect(result.acceptedMemories).toEqual([])
    expect(result.persistenceRecords).toEqual([])
    expect(result.rejectedMemories).toHaveLength(1)
    expect(result.rejectedMemories[0]?.reasons).toEqual(['duplicate-memory-context'])
  })

  it('produces persistence records that can be handed to a sovereign writer boundary', () => {
    const result = applyBrandSoulMemoryPolicy(buildContext(), [
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.78,
        createdAt: '2026-04-15T11:00:00.000Z',
      },
    ])

    expect(result.persistenceRecords).toHaveLength(1)
    expect(result.persistenceRecords[0]?.memoryId).toBe('product-interest:p-1')
    expect(result.persistenceRecords[0]?.signal).toBe('product-interest')
  })
})