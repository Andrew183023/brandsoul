import { describe, expect, it } from 'vitest'

import { dispatchBrandSoulMemoryPersistence } from './dispatchBrandSoulMemoryPersistence'
import { InMemoryBrandSoulMemoryWriter } from './InMemoryBrandSoulMemoryWriter'

function buildRecord(memoryId: string) {
  return {
    memoryId,
    schemaVersion: 1 as const,
    memoryType: 'operational' as const,
    source: 'system' as const,
    subject: 'promotion-context',
    signal: 'active-promotion',
    attributes: {
      promotionId: memoryId.split(':')[1] ?? memoryId,
    },
    tags: ['commerce', 'promotion'],
    contextKey: `promotion:${memoryId.split(':')[1] ?? memoryId}`,
    relevanceScore: 0.72,
    retentionKind: 'expiring' as const,
    createdAt: '2026-04-15T10:00:00.000Z',
    expiresAt: '2026-04-29T10:00:00.000Z',
  }
}

function buildSupportRecord(memoryId: string, createdAt: string, relevanceScore = 0.64) {
  return {
    memoryId,
    schemaVersion: 1 as const,
    memoryType: 'relational' as const,
    source: 'system' as const,
    subject: 'support-context',
    signal: 'support-topic',
    attributes: {
      topic: 'support',
    },
    tags: ['support'],
    contextKey: 'conversation:support',
    relevanceScore,
    retentionKind: 'context-dependent' as const,
    createdAt,
    expiresAt: '2026-05-15T10:00:00.000Z',
  }
}

describe('InMemoryBrandSoulMemoryWriter', () => {
  it('stores persistence records in memory and exposes them for inspection', async () => {
    const writer = new InMemoryBrandSoulMemoryWriter()

    await expect(
      writer.write({
        records: [buildRecord('promotion-context:promo-1')],
      }),
    ).resolves.toEqual({
      attemptedCount: 1,
      writtenCount: 1,
      skippedCount: 0,
      writtenMemoryIds: ['promotion-context:promo-1'],
    })

    expect(writer.getAll()).toEqual([buildRecord('promotion-context:promo-1')])
    expect(writer.getByMemoryId('promotion-context:promo-1')).toEqual([buildRecord('promotion-context:promo-1')])
  })

  it('supports the dispatcher flow without requiring a real database', async () => {
    const writer = new InMemoryBrandSoulMemoryWriter()

    await expect(
      dispatchBrandSoulMemoryPersistence(writer, {
        persistenceRecords: [buildRecord('promotion-context:promo-1'), buildRecord('promotion-context:promo-2')],
      }),
    ).resolves.toEqual({
      status: 'succeeded',
      attemptedCount: 2,
      writtenCount: 2,
      failedCount: 0,
      severity: 'none',
      reason: 'Memory persistence dispatch completed successfully',
      writtenMemoryIds: ['promotion-context:promo-1', 'promotion-context:promo-2'],
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
    })

    expect(writer.getAll()).toEqual([buildRecord('promotion-context:promo-1'), buildRecord('promotion-context:promo-2')])
  })

  it('returns defensive copies from inspection helpers', async () => {
    const writer = new InMemoryBrandSoulMemoryWriter()

    await writer.write({
      records: [buildRecord('promotion-context:promo-1')],
    })

    const stored = writer.getAll()
    stored[0]!.attributes.promotionId = 'mutated'
    stored[0]!.tags.push('mutated')

    expect(writer.getAll()).toEqual([buildRecord('promotion-context:promo-1')])
  })

  it('merges semantically equivalent session memories instead of multiplying records', async () => {
    const writer = new InMemoryBrandSoulMemoryWriter()

    await expect(
      writer.write({
        records: [
          buildSupportRecord('support-topic:2026-04-15T10:00:00.000Z', '2026-04-15T10:00:00.000Z', 0.64),
          buildSupportRecord('support-topic:2026-04-15T10:05:00.000Z', '2026-04-15T10:05:00.000Z', 0.66),
        ],
      }),
    ).resolves.toEqual({
      attemptedCount: 2,
      writtenCount: 2,
      skippedCount: 0,
      writtenMemoryIds: ['support-topic:2026-04-15T10:00:00.000Z', 'support-topic:2026-04-15T10:00:00.000Z'],
    })

    expect(writer.getAll()).toEqual([
      expect.objectContaining({
        memoryId: 'support-topic:2026-04-15T10:00:00.000Z',
        subject: 'support-context',
        signal: 'support-topic',
        createdAt: '2026-04-15T10:05:00.000Z',
      }),
    ])
    expect(writer.getAll()[0]?.relevanceScore).toBeCloseTo(0.71, 10)
    expect(writer.getLastWriteSemanticMergeAuditEvents()).toEqual([
      {
        originalMemoryId: 'support-topic:2026-04-15T10:05:00.000Z',
        mergedIntoMemoryId: 'support-topic:2026-04-15T10:00:00.000Z',
        reason: 'same subject and signal, same context key, shared attributes: topic',
        similarityMatch: {
          subjectMatched: true,
          signalMatched: true,
          contextKeyMatched: true,
          sharedAttributes: ['topic'],
        },
      },
    ])
    expect(writer.getSemanticMergeAuditLog()).toHaveLength(1)
  })
})