import type { BrandSoulMemory } from '../contracts/BrandSoulMemory'
import type { BrandSoulMemoryPersistenceRecord } from './BrandSoulMemoryPersistenceRecord'
import type { BrandSoulMemoryRetentionKind } from '../services/resolveBrandSoulMemoryExpirationPolicy'

export type AdaptBrandSoulMemoryToPersistenceRecordOptions = {
  retentionKind: BrandSoulMemoryRetentionKind
}

export function adaptBrandSoulMemoryToPersistenceRecord(
  memory: BrandSoulMemory,
  options: AdaptBrandSoulMemoryToPersistenceRecordOptions,
): BrandSoulMemoryPersistenceRecord {
  return {
    memoryId: memory.id,
    schemaVersion: 1,
    memoryType: memory.type,
    source: memory.source,
    subject: memory.content.subject,
    signal: memory.content.signal,
    attributes: memory.content.attributes,
    tags: memory.content.tags ?? [],
    contextKey: memory.content.contextKey,
    relevanceScore: memory.relevanceScore,
    retentionKind: options.retentionKind,
    createdAt: memory.createdAt,
    expiresAt: memory.expiresAt,
  }
}