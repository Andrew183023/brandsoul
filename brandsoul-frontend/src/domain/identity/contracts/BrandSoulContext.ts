import type { BrandSoulCommerceContext } from './BrandSoulCommerceContext'
import type { BrandSoulConversationContext } from './BrandSoulConversationContext'
import type { BrandSoulIdentityProfile } from './BrandSoulIdentityProfile'
import type { BrandSoulMemorySnapshot } from './BrandSoulMemorySnapshot'
import type { BrandSoulState } from './BrandSoulState'

export type BrandSoulContext = {
  identity: BrandSoulIdentityProfile
  state: BrandSoulState
  memory: BrandSoulMemorySnapshot[]
  conversation: BrandSoulConversationContext
  commerce: BrandSoulCommerceContext
}