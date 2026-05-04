const MAX_INTERACTIONS = 12
const MAX_INTERESTS = 10
const MAX_TOPICS = 12

type MemoryPreferenceSource = 'explicit' | 'behavioral' | 'inferred' | string

export type MemoryPreference = {
  key: string
  value: string
  source: MemoryPreferenceSource
  confidence: number
  updatedAt: string
}

export type MemoryInteraction = {
  id: string
  type: string
  summary: string
  weight: number
  occurredAt: string
}

export type UserMemory = {
  schemaVersion: 1
  userId?: string
  displayLabel?: string
  knownPreferences: MemoryPreference[]
  lastInteractions: MemoryInteraction[]
  recentInterests: string[]
  recurringTopics: string[]
  memoryConfidence: number
  lastSeenAt: string
  lastActiveAt: string
  updatedAt: string
}

export type InitializeUserMemoryInput = {
  userId?: string
  displayLabel?: string
}

export type UpdateMemoryPreferenceInput = {
  key: string
  value: string
  source?: MemoryPreferenceSource
  confidence?: number
  observedAt?: string
}

export type RegisterMemoryInteractionInput = {
  type: string
  summary: string
  weight?: number
  occurredAt?: string
  topics?: string[]
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function uniqueLimited(values: string[], limit: number) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    const next = value.trim().toLowerCase()
    if (!next || seen.has(next)) {
      continue
    }

    seen.add(next)
    normalized.push(next)
  }

  return normalized.slice(0, limit)
}

function createInteractionId() {
  return `memory-interaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function countTopicRepetitions(topics: string[]) {
  return topics.reduce<Record<string, number>>((counts, topic) => {
    counts[topic] = (counts[topic] ?? 0) + 1
    return counts
  }, {})
}

function resolveRecurringTopics(memory: UserMemory, newTopics: string[]) {
  const allTopics = [...newTopics, ...memory.recentInterests, ...memory.recurringTopics]
  const repetitions = countTopicRepetitions(allTopics)
  const recurring = Object.entries(repetitions)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)

  return uniqueLimited([...recurring, ...memory.recurringTopics], MAX_TOPICS)
}

function resolveConfidence(memory: UserMemory, delta: number) {
  const repetitionBoost = memory.recurringTopics.length * 0.015
  const interactionBoost = Math.min(memory.lastInteractions.length, MAX_INTERACTIONS) * 0.006
  return clamp(memory.memoryConfidence + delta + repetitionBoost + interactionBoost)
}

export function initializeUserMemory(input?: InitializeUserMemoryInput): UserMemory {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    userId: input?.userId,
    displayLabel: input?.displayLabel,
    knownPreferences: [],
    lastInteractions: [],
    recentInterests: [],
    recurringTopics: [],
    memoryConfidence: 0,
    lastSeenAt: now,
    lastActiveAt: now,
    updatedAt: now,
  }
}

export function updateMemoryActivity(memory: UserMemory, at = new Date().toISOString()): UserMemory {
  return {
    ...memory,
    lastSeenAt: memory.lastSeenAt ?? at,
    lastActiveAt: at,
    updatedAt: at,
  }
}

export function updateMemoryPreference(memory: UserMemory, input: UpdateMemoryPreferenceInput): UserMemory {
  const updatedAt = input.observedAt ?? new Date().toISOString()
  const existing = memory.knownPreferences.find(
    (preference) => preference.key === input.key && preference.value === input.value,
  )

  const nextPreference: MemoryPreference = {
    key: input.key,
    value: input.value,
    source: input.source ?? existing?.source ?? 'inferred',
    confidence: clamp((existing?.confidence ?? 0.2) + (input.confidence ?? 0.16)),
    updatedAt,
  }

  const knownPreferences = [
    nextPreference,
    ...memory.knownPreferences.filter(
      (preference) => !(preference.key === input.key && preference.value === input.value),
    ),
  ].slice(0, 16)

  return {
    ...memory,
    knownPreferences,
    memoryConfidence: resolveConfidence(memory, 0.04),
    lastActiveAt: updatedAt,
    updatedAt,
  }
}

export function updateMemoryTopics(memory: UserMemory, topics: string[], at = new Date().toISOString()): UserMemory {
  const recentInterests = uniqueLimited([...topics, ...memory.recentInterests], MAX_INTERESTS)
  const recurringTopics = resolveRecurringTopics(memory, uniqueLimited(topics, MAX_TOPICS))

  return {
    ...memory,
    recentInterests,
    recurringTopics,
    memoryConfidence: resolveConfidence({ ...memory, recurringTopics }, topics.length > 0 ? 0.025 : 0),
    lastActiveAt: at,
    updatedAt: at,
  }
}

export function registerMemoryInteraction(memory: UserMemory, input: RegisterMemoryInteractionInput): UserMemory {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const interaction: MemoryInteraction = {
    id: createInteractionId(),
    type: input.type,
    summary: input.summary,
    weight: clamp(input.weight ?? 0.4),
    occurredAt,
  }

  const withInteraction: UserMemory = {
    ...memory,
    lastInteractions: [interaction, ...memory.lastInteractions].slice(0, MAX_INTERACTIONS),
    memoryConfidence: resolveConfidence(memory, interaction.weight * 0.05),
    lastActiveAt: occurredAt,
    updatedAt: occurredAt,
  }

  if (!input.topics?.length) {
    return withInteraction
  }

  return updateMemoryTopics(withInteraction, input.topics, occurredAt)
}

export function mergeUserMemory(base: UserMemory, incoming: UserMemory): UserMemory {
  const knownPreferences = [...incoming.knownPreferences, ...base.knownPreferences].reduce<MemoryPreference[]>(
    (preferences, preference) => {
      const existingIndex = preferences.findIndex(
        (candidate) => candidate.key === preference.key && candidate.value === preference.value,
      )

      if (existingIndex === -1) {
        return [...preferences, preference]
      }

      const existing = preferences[existingIndex]
      preferences[existingIndex] = existing.confidence >= preference.confidence ? existing : preference
      return preferences
    },
    [],
  )

  return {
    ...base,
    ...incoming,
    knownPreferences: knownPreferences.slice(0, 16),
    lastInteractions: [...incoming.lastInteractions, ...base.lastInteractions].slice(0, MAX_INTERACTIONS),
    recentInterests: uniqueLimited([...incoming.recentInterests, ...base.recentInterests], MAX_INTERESTS),
    recurringTopics: uniqueLimited([...incoming.recurringTopics, ...base.recurringTopics], MAX_TOPICS),
    memoryConfidence: Math.max(base.memoryConfidence, incoming.memoryConfidence),
    updatedAt: incoming.updatedAt ?? base.updatedAt,
  }
}
