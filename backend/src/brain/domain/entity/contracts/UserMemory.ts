export type UserMemoryPreference = {
  key: string
  value: string
  source: string
  confidence: number
  updatedAt: string
}

export type UserMemoryInteraction = {
  id: string
  type?: string
  summary?: string
  weight?: number
  occurredAt?: string
  [key: string]: unknown
}

export type UserMemory = {
  schemaVersion: 1
  lastInteractions: UserMemoryInteraction[]
  knownPreferences: UserMemoryPreference[]
  recentInterests: string[]
  recurringTopics: string[]
  memoryConfidence: number
  lastSeenAt: string
  lastActiveAt: string
  updatedAt: string
  [key: string]: unknown
}