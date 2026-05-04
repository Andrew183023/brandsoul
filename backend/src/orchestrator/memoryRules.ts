import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { RelationalMemoryState } from './relationalTypes.js'
import { registerMemoryInteraction, updateMemoryActivity } from '../brain/domain/entity/services/memoryEngine.js'

type MemoryEngineState = Parameters<typeof updateMemoryActivity>[0]

function parseTopics(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function parseWeight(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function parseSummary(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export function applyMemoryRules(memory: RelationalMemoryState, event: EntityEventLogRecord): RelationalMemoryState {
  const activeMemory = updateMemoryActivity(memory as MemoryEngineState, event.timestamp)

  if (event.type === 'interaction.registered') {
    return registerMemoryInteraction(activeMemory, {
      type: event.payload.interactionType === 'export' ? 'export' : event.payload.interactionType === 'return' ? 'return' : 'message',
      summary: parseSummary(event.payload.summary, 'Interaction registered.'),
      weight: parseWeight(event.payload.weight),
      occurredAt: event.timestamp,
      topics: parseTopics(event.payload.topics),
    })
  }

  if (event.type === 'return.visit.registered' || event.type === 'return_visit.registered') {
    return registerMemoryInteraction(activeMemory, {
      type: 'return',
      summary: parseSummary(event.payload.summary, 'Return visit registered.'),
      weight: parseWeight(event.payload.weight),
      occurredAt: event.timestamp,
      topics: parseTopics(event.payload.topics),
    })
  }

  if (event.type === 'share.registered') {
    return registerMemoryInteraction(activeMemory, {
      type: 'click',
      summary: parseSummary(event.payload.summary, 'Share registered.'),
      weight: parseWeight(event.payload.weight),
      occurredAt: event.timestamp,
      topics: parseTopics(event.payload.topics),
    })
  }

  return activeMemory
}