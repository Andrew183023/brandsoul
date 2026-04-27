import { describe, expect, it } from 'vitest'

import type { BrandSoulMemory } from '../contracts/BrandSoulMemory'
import { adaptBrandSoulMemoryToPersistenceRecord } from './adaptBrandSoulMemoryToPersistenceRecord'

describe('adaptBrandSoulMemoryToPersistenceRecord', () => {
  it('creates an explicit persistence record separate from the sovereign domain memory', () => {
    const memory: BrandSoulMemory = {
      id: 'product-interest:p-1',
      type: 'relational',
      source: 'system',
      relevanceScore: 0.78,
      createdAt: '2026-04-15T12:00:00.000Z',
      expiresAt: '2026-05-15T12:00:00.000Z',
      content: {
        subject: 'customer-interest',
        signal: 'product-interest',
        attributes: {
          productId: 'p-1',
          productLabel: 'Vestido Aurora',
        },
        tags: ['commerce', 'product'],
        contextKey: 'catalog:active',
      },
    }

    expect(
      adaptBrandSoulMemoryToPersistenceRecord(memory, {
        retentionKind: 'context-dependent',
      }),
    ).toEqual({
      memoryId: 'product-interest:p-1',
      schemaVersion: 1,
      memoryType: 'relational',
      source: 'system',
      subject: 'customer-interest',
      signal: 'product-interest',
      attributes: {
        productId: 'p-1',
        productLabel: 'Vestido Aurora',
      },
      tags: ['commerce', 'product'],
      contextKey: 'catalog:active',
      relevanceScore: 0.78,
      retentionKind: 'context-dependent',
      createdAt: '2026-04-15T12:00:00.000Z',
      expiresAt: '2026-05-15T12:00:00.000Z',
    })
  })
})