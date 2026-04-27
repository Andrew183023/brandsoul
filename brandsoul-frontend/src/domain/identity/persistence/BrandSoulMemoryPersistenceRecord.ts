import type { BrandSoulMemoryAttributeValue, BrandSoulMemorySource } from '../contracts/BrandSoulMemory'
import type { BrandSoulMemoryType } from '../contracts/BrandSoulMemorySnapshot'
import type { BrandSoulMemoryRetentionKind } from '../services/resolveBrandSoulMemoryExpirationPolicy'

export type BrandSoulMemoryPersistenceRecord = {
  memoryId: string
  schemaVersion: 1
  memoryType: BrandSoulMemoryType
  source: BrandSoulMemorySource
  subject: string
  signal: string
  attributes: Record<string, BrandSoulMemoryAttributeValue>
  tags: string[]
  contextKey?: string
  relevanceScore: number
  retentionKind: BrandSoulMemoryRetentionKind
  createdAt: string
  expiresAt?: string
}