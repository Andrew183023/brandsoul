import type { BrandSoulDetectedIntent } from './BrandSoulDecision'

export type BrandSoulConversationMessageRole = 'user' | 'brandsoul' | 'system'

export type BrandSoulConversationMessage = {
  role: BrandSoulConversationMessageRole
  content: string
  createdAt: string
}

export type BrandSoulConversationContext = {
  lastMessages: BrandSoulConversationMessage[]
  detectedIntent?: BrandSoulDetectedIntent
  relevantMemoryKeys: string[]
}