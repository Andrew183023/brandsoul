import type { PowerOption, ToneOption } from './persona'

export type InteractionWindow = 'manha' | 'tarde' | 'noite'

export interface SparkMemory {
  conversation_count: number
  top_intents: string[]
  common_topics: string[]
  interaction_windows: InteractionWindow[]
  last_suggestions: string[]
  intent_counts: Record<string, number>
  topic_counts: Record<string, number>
}

export interface SparkMemoryPersonaKey {
  brandName: string
  tone: ToneOption
  power: PowerOption
  contextMode: 'customer' | 'admin'
  channelMode?: string
}

export interface SparkMemorySummary {
  top_intents: string[]
  interaction_windows: InteractionWindow[]
  common_topics: string[]
}

const MAX_TOP_INTENTS = 3
const MAX_COMMON_TOPICS = 5
const MAX_WINDOWS = 3
const MAX_SUGGESTIONS = 6

const intentTopicMap: Record<string, string[]> = {
  order: ['pedido', 'conversao'],
  reservation: ['agenda', 'reserva'],
  price: ['preco', 'oferta'],
  contact_action: ['contato', 'atendimento'],
  contact_info: ['contato', 'atendimento'],
  delivery: ['delivery', 'entrega'],
  business_hours: ['horario', 'atendimento'],
  service_region: ['regiao', 'atendimento'],
  brand_highlight: ['diferencial', 'posicionamento'],
  greeting: ['acolhimento'],
}

export function createEmptySparkMemory(): SparkMemory {
  return {
    conversation_count: 0,
    top_intents: [],
    common_topics: [],
    interaction_windows: [],
    last_suggestions: [],
    intent_counts: {},
    topic_counts: {},
  }
}

export function getSparkMemoryStorageKey(persona: SparkMemoryPersonaKey) {
  const personaKey = `${normalizeMemorySegment(persona.brandName)}_${normalizeMemorySegment(persona.tone)}_${normalizeMemorySegment(persona.power)}`

  if (persona.contextMode === 'admin') {
    return `brandsoul_memory_admin_${personaKey}`
  }

  return `brandsoul_memory_customer_${personaKey}_${normalizeMemorySegment(persona.channelMode ?? 'web')}`
}

export function loadSparkMemory(storageKey: string): SparkMemory {
  const rawMemory = window.localStorage.getItem(storageKey)
  if (!rawMemory) {
    return createEmptySparkMemory()
  }

  try {
    const parsedMemory = JSON.parse(rawMemory) as Partial<SparkMemory>
    return {
      conversation_count: normalizeCount(parsedMemory.conversation_count),
      top_intents: normalizeStringArray(parsedMemory.top_intents, MAX_TOP_INTENTS),
      common_topics: normalizeStringArray(parsedMemory.common_topics, MAX_COMMON_TOPICS),
      interaction_windows: normalizeWindowArray(parsedMemory.interaction_windows),
      last_suggestions: normalizeStringArray(parsedMemory.last_suggestions, MAX_SUGGESTIONS),
      intent_counts: normalizeCountRecord(parsedMemory.intent_counts),
      topic_counts: normalizeCountRecord(parsedMemory.topic_counts),
    }
  } catch {
    return createEmptySparkMemory()
  }
}

export function saveSparkMemory(storageKey: string, memory: SparkMemory) {
  window.localStorage.setItem(storageKey, JSON.stringify(memory))
}

export function incrementConversationCount(memory: SparkMemory): SparkMemory {
  return {
    ...memory,
    conversation_count: memory.conversation_count + 1,
  }
}

export function recordDetectedIntent(memory: SparkMemory, intent: string, message: string): SparkMemory {
  if (!intent || intent === 'unknown') {
    return updateCommonTopics(memory, inferTopicsFromMessage(message))
  }

  const nextIntentCounts = {
    ...memory.intent_counts,
    [intent]: (memory.intent_counts[intent] ?? 0) + 1,
  }

  const nextTopIntents = Object.entries(nextIntentCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_TOP_INTENTS)
    .map(([intentName]) => intentName)

  return updateCommonTopics(
    {
      ...memory,
      intent_counts: nextIntentCounts,
      top_intents: nextTopIntents,
    },
    [...(intentTopicMap[intent] ?? []), ...inferTopicsFromMessage(message)],
  )
}

export function recordInteractionWindow(memory: SparkMemory, date = new Date()): SparkMemory {
  const windowLabel = resolveInteractionWindow(date.getHours())
  return {
    ...memory,
    interaction_windows: mergeRecentValues(memory.interaction_windows, windowLabel, MAX_WINDOWS) as InteractionWindow[],
  }
}

export function recordSuggestionExposure(memory: SparkMemory, suggestions: string[]): SparkMemory {
  if (suggestions.length === 0) {
    return memory
  }

  return {
    ...memory,
    last_suggestions: mergeRecentValues(memory.last_suggestions, suggestions, MAX_SUGGESTIONS),
  }
}

export function recordSuggestionSelection(memory: SparkMemory, suggestion: string): SparkMemory {
  if (!suggestion.trim()) {
    return memory
  }

  return {
    ...updateCommonTopics(memory, inferTopicsFromMessage(suggestion)),
    last_suggestions: mergeRecentValues(memory.last_suggestions, suggestion, MAX_SUGGESTIONS),
  }
}

export function buildSparkMemorySummary(memory: SparkMemory): SparkMemorySummary | undefined {
  if (memory.top_intents.length === 0 && memory.interaction_windows.length === 0 && memory.common_topics.length === 0) {
    return undefined
  }

  return {
    top_intents: memory.top_intents.slice(0, MAX_TOP_INTENTS),
    interaction_windows: memory.interaction_windows.slice(0, MAX_WINDOWS),
    common_topics: memory.common_topics.slice(0, MAX_COMMON_TOPICS),
  }
}

export function hasMeaningfulSparkMemory(memory: SparkMemory) {
  return memory.conversation_count >= 3 || memory.top_intents.length >= 2
}

function updateCommonTopics(memory: SparkMemory, topics: string[]): SparkMemory {
  if (topics.length === 0) {
    return memory
  }

  const nextTopicCounts = { ...memory.topic_counts }
  for (const topic of topics) {
    if (!topic) {
      continue
    }

    nextTopicCounts[topic] = (nextTopicCounts[topic] ?? 0) + 1
  }

  const nextCommonTopics = Object.entries(nextTopicCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_COMMON_TOPICS)
    .map(([topic]) => topic)

  return {
    ...memory,
    topic_counts: nextTopicCounts,
    common_topics: nextCommonTopics,
  }
}

function inferTopicsFromMessage(message: string) {
  const normalizedMessage = normalizeMemorySegment(message)
  const topicMatches: string[] = []

  if (normalizedMessage.includes('delivery') || normalizedMessage.includes('entrega')) {
    topicMatches.push('delivery')
  }
  if (normalizedMessage.includes('promo') || normalizedMessage.includes('oferta')) {
    topicMatches.push('promocao')
  }
  if (normalizedMessage.includes('cliente') || normalizedMessage.includes('atendimento')) {
    topicMatches.push('atendimento')
  }
  if (normalizedMessage.includes('contato') || normalizedMessage.includes('whatsapp')) {
    topicMatches.push('contato')
  }
  if (normalizedMessage.includes('horario')) {
    topicMatches.push('horario')
  }
  if (normalizedMessage.includes('agenda') || normalizedMessage.includes('reserva')) {
    topicMatches.push('agenda')
  }
  if (normalizedMessage.includes('pedido') || normalizedMessage.includes('comprar')) {
    topicMatches.push('pedido')
  }
  if (normalizedMessage.includes('post') || normalizedMessage.includes('conteudo')) {
    topicMatches.push('conteudo')
  }

  return Array.from(new Set(topicMatches))
}

function resolveInteractionWindow(hour: number): InteractionWindow {
  if (hour < 12) {
    return 'manha'
  }

  if (hour < 18) {
    return 'tarde'
  }

  return 'noite'
}

function mergeRecentValues(currentValues: string[], nextValues: string | string[], limit: number) {
  const resolvedValues = Array.isArray(nextValues) ? nextValues : [nextValues]
  const trimmedValues = resolvedValues.map((value) => value.trim()).filter(Boolean)
  const nextSequence = [...trimmedValues, ...currentValues]
  return Array.from(new Set(nextSequence)).slice(0, limit)
}

function normalizeMemorySegment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeStringArray(values: unknown, limit: number) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeWindowArray(values: unknown) {
  return normalizeStringArray(values, MAX_WINDOWS).filter(
    (value): value is InteractionWindow => value === 'manha' || value === 'tarde' || value === 'noite',
  )
}

function normalizeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function normalizeCountRecord(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const entries = Object.entries(value as Record<string, unknown>)
  return Object.fromEntries(entries.filter(([, count]) => typeof count === 'number' && Number.isFinite(count) && count > 0)) as Record<
    string,
    number
  >
}
