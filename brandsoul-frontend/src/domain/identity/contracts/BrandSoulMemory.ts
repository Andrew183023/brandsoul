import type { BrandSoulMemoryType } from './BrandSoulMemorySnapshot'

export type BrandSoulMemorySource = 'user' | 'system' | 'inference'

export type BrandSoulMemoryPrimitive = string | number | boolean | null

export type BrandSoulMemoryAttributeValue =
  | BrandSoulMemoryPrimitive
  | BrandSoulMemoryPrimitive[]
  | Record<string, BrandSoulMemoryPrimitive | BrandSoulMemoryPrimitive[]>

export type BrandSoulMemoryContent = {
  subject: string
  signal: string
  attributes: Record<string, BrandSoulMemoryAttributeValue>
  tags?: string[]
  contextKey?: string
}

export type BrandSoulMemory = {
  id: string
  type: BrandSoulMemoryType
  content: BrandSoulMemoryContent
  relevanceScore: number
  createdAt: string
  expiresAt?: string
  source: BrandSoulMemorySource
}