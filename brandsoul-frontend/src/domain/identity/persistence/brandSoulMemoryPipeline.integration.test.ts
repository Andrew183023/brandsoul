import { describe, expect, it } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { applyBrandSoulMemoryPolicy } from '../services/applyBrandSoulMemoryPolicy'
import { dispatchBrandSoulMemoryPersistence } from './dispatchBrandSoulMemoryPersistence'
import { InMemoryBrandSoulMemoryWriter } from './InMemoryBrandSoulMemoryWriter'

function buildContext(memory: BrandSoulMemorySnapshot[] = []): Pick<BrandSoulContext, 'memory'> {
  return { memory }
}

describe('BrandSoul memory pipeline integration', () => {
  it('runs candidate to policy to dispatch to in-memory writer with accepted, rejected, contextual, inferred identity, and deduplicated cases', async () => {
    const existingMemory: BrandSoulMemorySnapshot = {
      key: 'promotion-context:promo-existing',
      value: 'Oferta Existente',
      type: 'operational',
      relevanceScore: 0.72,
      createdAt: '2026-04-14T09:00:00.000Z',
    }

    const candidates: BrandSoulMemorySnapshot[] = [
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'conversation-focus:2026-04-15T10:00:00.000Z',
        value: 'me fala qualquer coisa sobre a marca',
        type: 'relational',
        relevanceScore: 0.42,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'contextual-memory:session-1',
        value: 'cliente ainda comparando colecao atual',
        type: 'contextual',
        relevanceScore: 0.79,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.91,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'promotion-context:promo-existing',
        value: 'Oferta Existente',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.78,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.78,
        createdAt: '2026-04-15T10:01:00.000Z',
      },
    ]

    const policyResult = applyBrandSoulMemoryPolicy(buildContext([existingMemory]), candidates)

    expect(policyResult.acceptedMemories).toHaveLength(4)
    expect(policyResult.rejectedMemories).toHaveLength(3)
    expect(policyResult.persistenceRecords).toHaveLength(4)
    expect(policyResult.legacySnapshots).toHaveLength(4)

    expect(policyResult.acceptedMemories.map((memory) => memory.id)).toEqual([
      'promotion-context:promo-1',
      'contextual-memory:session-1',
      'identity-inference:style-preference',
      'product-interest:p-1',
    ])

    expect(policyResult.rejectedMemories.map((entry) => ({ key: entry.candidate.key, reasons: entry.reasons }))).toEqual([
      {
        key: 'conversation-focus:2026-04-15T10:00:00.000Z',
        reasons: ['below-relevance-threshold'],
      },
      {
        key: 'promotion-context:promo-existing',
        reasons: ['duplicate-memory-context'],
      },
      {
        key: 'product-interest:p-1',
        reasons: ['duplicate-memory-batch'],
      },
    ])

    const contextualRecord = policyResult.persistenceRecords.find((record) => record.memoryId === 'contextual-memory:session-1')
    expect(contextualRecord).toEqual({
      memoryId: 'contextual-memory:session-1',
      schemaVersion: 1,
      memoryType: 'contextual',
      source: 'system',
      subject: 'context-window',
      signal: 'contextual-memory',
      attributes: {
        contextLabel: 'cliente ainda comparando colecao atual',
        observedValue: 'cliente ainda comparando colecao atual',
      },
      tags: ['context'],
      contextKey: 'context:session-1',
      relevanceScore: 0.79,
      retentionKind: 'context-dependent',
      createdAt: '2026-04-15T10:00:00.000Z',
      expiresAt: '2026-04-15T16:00:00.000Z',
    })

    const inferredIdentityRecord = policyResult.persistenceRecords.find(
      (record) => record.memoryId === 'identity-inference:style-preference',
    )
    expect(inferredIdentityRecord).toEqual({
      memoryId: 'identity-inference:style-preference',
      schemaVersion: 1,
      memoryType: 'identity',
      source: 'inference',
      subject: 'identity-profile',
      signal: 'identity-inference',
      attributes: {
        inferredTrait: 'style-preference',
        inferredValue: 'minimalista',
      },
      tags: ['identity', 'inference'],
      relevanceScore: 0.91,
      retentionKind: 'expiring',
      createdAt: '2026-04-15T10:00:00.000Z',
      expiresAt: '2026-05-15T10:00:00.000Z',
    })

    const writer = new InMemoryBrandSoulMemoryWriter()
    const dispatchResult = await dispatchBrandSoulMemoryPersistence(writer, {
      persistenceRecords: policyResult.persistenceRecords,
    })

    expect(dispatchResult).toEqual({
      status: 'succeeded',
      attemptedCount: 4,
      writtenCount: 4,
      failedCount: 0,
      severity: 'none',
      reason: 'Memory persistence dispatch completed successfully',
      writtenMemoryIds: [
        'promotion-context:promo-1',
        'contextual-memory:session-1',
        'identity-inference:style-preference',
        'product-interest:p-1',
      ],
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
    })

    expect(writer.getAll()).toEqual(policyResult.persistenceRecords)
    expect(writer.getByMemoryId('identity-inference:style-preference')).toEqual([inferredIdentityRecord!])
  })
})