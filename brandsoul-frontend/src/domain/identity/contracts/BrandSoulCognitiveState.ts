export type BrandSoulCognitiveMode = 'exploration' | 'support' | 'conversion' | 'neutral'

export type BrandSoulCognitiveDrive = 'assist' | 'sell' | 'explore' | 'clarify'

export type BrandSoulCognitiveState = {
  currentMode: BrandSoulCognitiveMode
  tensionLevel: number
  focusLevel: number
  engagementLevel: number
  dominantDrive: BrandSoulCognitiveDrive
  stability: number
  adaptationMomentum: number
  lastStateUpdateAt: string
}