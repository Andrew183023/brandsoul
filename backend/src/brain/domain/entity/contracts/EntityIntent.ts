export type EntityIntentType = 'assist' | 'convert' | 'engage' | string

export type EntityIntent = {
  type: EntityIntentType
  confidence: number
  reason: string
  context?: {
    userIntent?: string
    journeyMoment?: string
    [key: string]: unknown
  }
}