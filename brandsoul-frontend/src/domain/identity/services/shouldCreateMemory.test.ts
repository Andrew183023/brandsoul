import { describe, expect, it } from 'vitest'

import type { BrandSoulMemory } from '../contracts/BrandSoulMemory'
import { resolveBrandSoulMemoryExpirationPolicy } from './resolveBrandSoulMemoryExpirationPolicy'
import { evaluateBrandSoulMemoryCandidate, shouldCreateMemory } from './shouldCreateMemory'

describe('shouldCreateMemory', () => {
  it('stores structured relational signals with enough relevance', () => {
    expect(
      shouldCreateMemory({
        type: 'relational',
        source: 'user',
        relevanceScore: 0.74,
        content: {
          subject: 'customer-interest',
          signal: 'product-interest',
          attributes: {
            productId: 'p-1',
            category: 'moda',
          },
        },
      }),
    ).toBe(true)
  })

  it('rejects raw log-like payloads even with high relevance', () => {
    expect(
      shouldCreateMemory({
        type: 'contextual',
        source: 'system',
        relevanceScore: 0.91,
        isRawLog: true,
        contextActive: true,
        content: {
          subject: 'conversation-turn',
          signal: 'raw-message',
          attributes: {
            message: 'quero saber se tem promocao hoje',
          },
        },
      }),
    ).toBe(false)
  })

  it('rejects low-confidence inferred identity memories', () => {
    expect(
      shouldCreateMemory({
        type: 'identity',
        source: 'inference',
        relevanceScore: 0.8,
        content: {
          subject: 'brand-preference',
          signal: 'style-affinity',
          attributes: {
            palette: ['neutral', 'earth'],
          },
        },
      }),
    ).toBe(false)
  })

  it('requires an active context for contextual memory', () => {
    expect(
      shouldCreateMemory({
        type: 'contextual',
        source: 'system',
        relevanceScore: 0.88,
        content: {
          subject: 'campaign-window',
          signal: 'campaign-focus',
          attributes: {
            campaignId: 'camp-1',
          },
          contextKey: 'campaign:camp-1',
        },
        contextActive: false,
      }),
    ).toBe(false)
  })

  it('exposes rejection reasons for internal audit without changing the boolean facade', () => {
    expect(
      evaluateBrandSoulMemoryCandidate({
        type: 'relational',
        source: 'system',
        relevanceScore: 0.4,
        isDuplicate: true,
        duplicateSource: 'batch',
        content: {
          subject: 'conversation-context',
          signal: 'conversation-focus',
          attributes: {
            focus: 'quero saber qualquer coisa',
          },
        },
      }),
    ).toEqual({
      accepted: false,
      reasons: ['duplicate-memory-batch', 'below-relevance-threshold'],
    })
  })
})

describe('resolveBrandSoulMemoryExpirationPolicy', () => {
  const createdAt = '2026-04-14T12:00:00.000Z'

  it('keeps sovereign identity memory permanent when it is explicit', () => {
    const memory: BrandSoulMemory = {
      id: 'memory-identity-1',
      type: 'identity',
      source: 'user',
      relevanceScore: 0.96,
      createdAt,
      content: {
        subject: 'customer-profile',
        signal: 'declared-preference',
        attributes: {
          size: 'm',
        },
      },
    }

    expect(resolveBrandSoulMemoryExpirationPolicy(memory)).toEqual({
      retentionKind: 'permanent',
      reason: 'identity memories are sovereign and should persist unless explicitly revised',
    })
  })

  it('expires operational memory on a short business window', () => {
    const memory: BrandSoulMemory = {
      id: 'memory-operational-1',
      type: 'operational',
      source: 'system',
      relevanceScore: 0.81,
      createdAt,
      content: {
        subject: 'promotion-context',
        signal: 'active-offer',
        attributes: {
          promotionId: 'promo-1',
        },
      },
    }

    expect(resolveBrandSoulMemoryExpirationPolicy(memory)).toEqual({
      retentionKind: 'expiring',
      expiresAt: '2026-04-28T12:00:00.000Z',
      reason: 'operational memories age quickly because they reflect campaigns, offers, and temporary business conditions',
    })
  })

  it('treats contextual memory as context-dependent', () => {
    const memory: BrandSoulMemory = {
      id: 'memory-contextual-1',
      type: 'contextual',
      source: 'system',
      relevanceScore: 0.79,
      createdAt,
      content: {
        subject: 'conversation-window',
        signal: 'current-need',
        attributes: {
          topic: 'troca',
        },
        contextKey: 'conversation:active',
      },
    }

    expect(resolveBrandSoulMemoryExpirationPolicy(memory)).toEqual({
      retentionKind: 'context-dependent',
      expiresAt: '2026-04-14T18:00:00.000Z',
      reason: 'contextual memories exist only while the current conversation, session, or campaign context remains active',
    })
  })
})