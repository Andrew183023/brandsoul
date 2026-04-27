import type { BrandSoulMemorySnapshot } from './BrandSoulMemorySnapshot'
import type { BrandSoulState } from './BrandSoulState'

export type BrandSoulDetectedIntent =
  | 'business-hours'
  | 'promotion'
  | 'product-discovery'
  | 'policy'
  | 'purchase'
  | 'support'
  | 'greeting'
  | 'general'
  | 'guardrail-blocked'

export type BrandSoulActionType = 'inform' | 'sell' | 'guide' | 'support' | 'refuse'

export type BrandSoulResponsePlanKind =
  | 'guardrail'
  | 'business-hours'
  | 'promotion'
  | 'product'
  | 'policy'
  | 'greeting'
  | 'general'

export type BrandSoulResponseIntentGoal =
  | 'respect-guardrail-boundary'
  | 'inform-operating-window'
  | 'highlight-active-promotion'
  | 'guide-product-selection'
  | 'support-policy-clarity'
  | 'open-conversation'
  | 'continue-contextual-guidance'

export type BrandSoulResponseCloseStyle =
  | 'safe-guidance'
  | 'offer-assistance'
  | 'explore-promotion'
  | 'guide-choice'
  | 'open-dialogue'
  | 'contextual-clarity'

export type BrandSoulResponsePlan = {
  kind: BrandSoulResponsePlanKind
  topic: string
  intentGoal: BrandSoulResponseIntentGoal
  requiredData: string[]
  constraints?: string[]
  optionalCloseStyle?: BrandSoulResponseCloseStyle
}

export type BrandSoulMemoryInfluenceSignalCategory = 'repeated-intent' | 'strong-preference' | 'recent-context' | 'persistent-trend' | 'derived-preference'

export type BrandSoulMemoryInfluenceSignalUse = {
  category: BrandSoulMemoryInfluenceSignalCategory
  memoryId: string
  subject: string
  signal: string
  matchedTerms: string[]
  priorityScore: number
}

export type BrandSoulMemoryInfluenceImpact = {
  confidence: {
    before: number
    after: number
    delta: number
  }
  intent?: {
    before: BrandSoulDetectedIntent
    after: BrandSoulDetectedIntent
  }
  action?: {
    before: BrandSoulActionType
    after: BrandSoulActionType
  }
}

export type BrandSoulMemoryInfluence = {
  applied: boolean
  influenceStrength: number
  signalsUsed: BrandSoulMemoryInfluenceSignalUse[]
  impact: BrandSoulMemoryInfluenceImpact
}

export type BrandSoulCognitiveStateInfluenceSignalCategory =
  | 'mode'
  | 'drive'
  | 'tension'
  | 'focus'
  | 'engagement'
  | 'stability'
  | 'adaptation-momentum'

export type BrandSoulCognitiveStateInfluenceSignalUse = {
  category: BrandSoulCognitiveStateInfluenceSignalCategory
  signal: string
  stateValue: string | number
  influenceScore: number
}

export type BrandSoulCognitiveStateInfluenceImpact = {
  confidence: {
    before: number
    after: number
    delta: number
  }
  intent?: {
    before: BrandSoulDetectedIntent
    after: BrandSoulDetectedIntent
  }
  action?: {
    before: BrandSoulActionType
    after: BrandSoulActionType
  }
  responsePlanStyle?: {
    before?: BrandSoulResponseCloseStyle
    after?: BrandSoulResponseCloseStyle
  }
}

export type BrandSoulCognitiveStateInfluence = {
  applied: boolean
  influenceStrength: number
  signalsUsed: BrandSoulCognitiveStateInfluenceSignalUse[]
  impact: BrandSoulCognitiveStateInfluenceImpact
}

export type BrandSoulBehaviorFeedbackInfluenceSignal =
  | 'interaction-success'
  | 'user-continuation'
  | 'engagement-delta'
  | 'signal-strength'

export type BrandSoulBehaviorFeedbackInfluenceSignalUse = {
  signal: BrandSoulBehaviorFeedbackInfluenceSignal
  value: boolean | number
  influenceScore: number
}

export type BrandSoulBehaviorFeedbackInfluenceImpact = {
  focusLevel: {
    before: number
    after: number
    delta: number
  }
  engagementLevel: {
    before: number
    after: number
    delta: number
  }
  stability: {
    before: number
    after: number
    delta: number
  }
  adaptationMomentum: {
    before: number
    after: number
    delta: number
  }
}

export type BrandSoulBehaviorFeedbackInfluence = {
  applied: boolean
  influenceStrength: number
  outcomeSignalsUsed: BrandSoulBehaviorFeedbackInfluenceSignalUse[]
  impact: BrandSoulBehaviorFeedbackInfluenceImpact
}

export type BrandSoulDecision = {
  intent: BrandSoulDetectedIntent
  action: BrandSoulActionType
  responsePlan: BrandSoulResponsePlan
  statePatch: Partial<BrandSoulState>
  memoryCandidates: BrandSoulMemorySnapshot[]
  confidence: number
  memoryInfluence: BrandSoulMemoryInfluence
  cognitiveStateInfluence?: BrandSoulCognitiveStateInfluence
  behaviorFeedbackInfluence?: BrandSoulBehaviorFeedbackInfluence
}