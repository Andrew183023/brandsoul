import type { BrandSoulMemory, BrandSoulMemorySource } from '../contracts/BrandSoulMemory'
import type { BrandSoulMemorySnapshot, BrandSoulMemoryValue } from '../contracts/BrandSoulMemorySnapshot'

function asStructuredValue(value: BrandSoulMemoryValue) {
  if (Array.isArray(value)) {
    return value
  }

  if (value && typeof value === 'object') {
    return value
  }

  return value
}

function parseMemoryKey(key: string) {
  const [prefix, reference] = key.split(':', 2)
  return {
    prefix,
    reference,
  }
}

export function normalizeBrandSoulMemoryCandidate(candidate: BrandSoulMemorySnapshot, source: BrandSoulMemorySource = 'system'): BrandSoulMemory {
  const { prefix, reference } = parseMemoryKey(candidate.key)

  if (prefix === 'identity-inference') {
    return {
      id: candidate.key,
      type: candidate.type,
      source: 'inference',
      relevanceScore: candidate.relevanceScore,
      createdAt: candidate.createdAt,
      content: {
        subject: 'identity-profile',
        signal: 'identity-inference',
        attributes: {
          inferredTrait: reference ?? candidate.key,
          inferredValue: asStructuredValue(candidate.value),
        },
        tags: ['identity', 'inference'],
      },
    }
  }

  if (prefix === 'contextual-memory') {
    return {
      id: candidate.key,
      type: candidate.type,
      source,
      relevanceScore: candidate.relevanceScore,
      createdAt: candidate.createdAt,
      content: {
        subject: 'context-window',
        signal: 'contextual-memory',
        attributes: {
          contextLabel: typeof candidate.value === 'string' ? candidate.value : JSON.stringify(candidate.value),
          observedValue: asStructuredValue(candidate.value),
        },
        tags: ['context'],
        contextKey: reference ? `context:${reference}` : 'context:active',
      },
    }
  }

  if (prefix === 'product-interest') {
    return {
      id: candidate.key,
      type: candidate.type,
      source,
      relevanceScore: candidate.relevanceScore,
      createdAt: candidate.createdAt,
      content: {
        subject: 'customer-interest',
        signal: 'product-interest',
        attributes: {
          productId: reference ?? candidate.key,
          productLabel: typeof candidate.value === 'string' ? candidate.value : JSON.stringify(candidate.value),
          observedValue: asStructuredValue(candidate.value),
        },
        tags: ['commerce', 'product'],
      },
    }
  }

  if (prefix === 'promotion-context') {
    return {
      id: candidate.key,
      type: candidate.type,
      source,
      relevanceScore: candidate.relevanceScore,
      createdAt: candidate.createdAt,
      content: {
        subject: 'promotion-context',
        signal: 'active-promotion',
        attributes: {
          promotionId: reference ?? candidate.key,
          promotionLabel: typeof candidate.value === 'string' ? candidate.value : JSON.stringify(candidate.value),
          observedValue: asStructuredValue(candidate.value),
        },
        tags: ['commerce', 'promotion'],
        contextKey: reference ? `promotion:${reference}` : 'promotion:active',
      },
    }
  }

  if (prefix === 'support-topic') {
    return {
      id: candidate.key,
      type: candidate.type,
      source,
      relevanceScore: candidate.relevanceScore,
      createdAt: candidate.createdAt,
      content: {
        subject: 'support-context',
        signal: 'support-topic',
        attributes: {
          topic: asStructuredValue(candidate.value),
        },
        tags: ['support'],
        contextKey: 'conversation:support',
      },
    }
  }

  if (prefix === 'conversation-focus') {
    return {
      id: candidate.key,
      type: candidate.type,
      source,
      relevanceScore: candidate.relevanceScore,
      createdAt: candidate.createdAt,
      content: {
        subject: 'conversation-context',
        signal: 'conversation-focus',
        attributes: {
          focus: asStructuredValue(candidate.value),
        },
        tags: ['conversation'],
        contextKey: 'conversation:active',
      },
    }
  }

  return {
    id: candidate.key,
    type: candidate.type,
    source,
    relevanceScore: candidate.relevanceScore,
    createdAt: candidate.createdAt,
    content: {
      subject: candidate.type,
      signal: prefix || 'memory-signal',
      attributes: {
        reference: reference ?? candidate.key,
        observedValue: asStructuredValue(candidate.value),
      },
    },
  }
}