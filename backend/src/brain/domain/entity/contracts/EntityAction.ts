export type EntityActionType =
  | 'sendMessage'
  | 'askQuestion'
  | 'triggerExport'
  | 'suggestProduct'
  | 'suggestDiscovery'
  | 'triggerEvent'
  | 'updateMemory'
  | 'entityInteraction'
  | 'recommendDiscovery'
  | 'scheduleReturnPrompt'
  | 'observeContext'
  | string

export type EntityIntentType = 'assist' | 'convert' | 'engage' | string

export type EntityAction = {
  schemaVersion?: 1
  entityId: string
  type: EntityActionType
  priority: 'low' | 'medium' | 'high'
  confidence: number
  createdAt: string
  source: {
    intent: EntityIntentType | string
    strategy?: string
    userIntent?: string
    journeyMoment?: string
    [key: string]: unknown
  }
  payload: {
    message?: string
    question?: string
    suggestion?: string
    eventName?: string
    interactionType?: string
    targetEntityName?: string
    targetEntityId?: string
    memoryKey?: string
    memoryValue?: string
    metadata?: Record<string, unknown>
    [key: string]: unknown
  }
}