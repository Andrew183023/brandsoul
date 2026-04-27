import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { extractRelevantMemorySignals } from './extractRelevantMemorySignals'

describe('extractRelevantMemorySignals', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('extracts reinforced repeated intent signals from semantically repeated session memory', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'support-topic:2026-04-15T10:05:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.69,
        createdAt: '2026-04-15T10:05:00.000Z',
      },
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T09:00:00.000Z',
      },
    ]

    const result = extractRelevantMemorySignals(memory, 'preciso de suporte agora')

    expect(result.repeatedIntentSignals).toEqual([
      expect.objectContaining({
        memoryId: 'support-topic:2026-04-15T10:05:00.000Z',
        subject: 'support-context',
        signal: 'support-topic',
        evidence: 'reinforced-memory',
        occurrenceCount: 1,
      }),
    ])
    expect(result.repeatedIntentSignals[0]?.matchedTerms).toContain('suporte')
  })

  it('extracts strong preference signals using structured memory subject, signal, and attributes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'product-interest:p-1',
        value: 'Vestido Aurora',
        type: 'relational',
        relevanceScore: 0.82,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.91,
        createdAt: '2026-04-15T09:55:00.000Z',
      },
    ]

    const result = extractRelevantMemorySignals(memory, 'quero algo minimalista como o vestido aurora')

    expect(result.strongPreferenceSignals).toEqual([
      expect.objectContaining({
        memoryId: 'identity-inference:style-preference',
        subject: 'identity-profile',
        signal: 'identity-inference',
      }),
      expect.objectContaining({
        memoryId: 'product-interest:p-1',
        subject: 'customer-interest',
        signal: 'product-interest',
      }),
    ])
  })

  it('prioritizes recent context signals using relevance and recency without changing decision behavior', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'contextual-memory:session-1',
        value: 'cliente ainda comparando colecao atual',
        type: 'contextual',
        relevanceScore: 0.79,
        createdAt: '2026-04-15T10:05:00.000Z',
      },
      {
        key: 'conversation-focus:2026-04-14T10:00:00.000Z',
        value: 'comparando colecao atual',
        type: 'relational',
        relevanceScore: 0.58,
        createdAt: '2026-04-14T10:00:00.000Z',
      },
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-01T10:00:00.000Z',
      },
    ]

    const result = extractRelevantMemorySignals(memory, 'ainda estou comparando a colecao atual')

    expect(result.recentContextSignals[0]).toEqual(
      expect.objectContaining({
        memoryId: 'contextual-memory:session-1',
        subject: 'context-window',
        signal: 'contextual-memory',
      }),
    )
    expect(result.recentContextSignals[1]).toEqual(
      expect.objectContaining({
        memoryId: 'conversation-focus:2026-04-14T10:00:00.000Z',
        signal: 'conversation-focus',
      }),
    )
  })

  it('drops stale memory from recent context extraction when it is old against the current time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T10:10:00.000Z'))

    const memory: BrandSoulMemorySnapshot[] = [
      {
        key: 'support-topic:2026-01-15T10:00:00.000Z',
        value: 'support',
        type: 'relational',
        relevanceScore: 0.82,
        createdAt: '2026-01-15T10:00:00.000Z',
      },
    ]

    const result = extractRelevantMemorySignals(memory, 'isso continua')

    expect(result.recentContextSignals).toEqual([])
  })
})