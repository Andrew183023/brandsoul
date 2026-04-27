export type BrandSoulMood =
  | 'calm'
  | 'focused'
  | 'curious'
  | 'welcoming'
  | 'urgent'
  | 'celebratory'
  | 'protective'

export type BrandSoulIntent =
  | 'observe'
  | 'assist'
  | 'welcome'
  | 'recommend'
  | 'convert'
  | 'support'
  | 'retain'

export type BrandSoulInteractionMode =
  | 'response'
  | 'sale'
  | 'support'
  | 'guidance'
  | 'retention'
  | 'presentation'

export type BrandSoulState = {
  currentMood: BrandSoulMood
  currentIntent: BrandSoulIntent
  currentFocus: string
  energyLevel: number
  interactionMode: BrandSoulInteractionMode
  lastUpdatedAt: string
}