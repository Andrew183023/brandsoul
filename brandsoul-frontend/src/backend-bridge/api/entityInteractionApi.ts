import type { EntityRelationship } from '../../domain/entity/contracts/EntityRelationship'
import type { EntityToEntityInteractionType } from '../../domain/entity/contracts/EntityToEntityInteraction'
import { buildBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

export type PersistEntityInteractionInput = {
  sourceEntityId: string
  targetEntityId: string
  type: 'mention' | 'collaboration' | 'reaction' | 'suggestion'
  summary?: string
  body?: string
  topics?: string[]
  weight?: number
  commandId?: string
}

export type PersistEntityInteractionResponse = {
  status: 'ready'
  interaction: {
    sourceEntityId: string
    targetEntityId: string
    type: string
    summary: string
    timestamp: string
  }
  relationships: {
    sourceToTarget?: EntityRelationship
    targetToSource?: EntityRelationship
  }
  feedItem?: {
    entityId: string
    type: string
    content?: Record<string, unknown>
  }
}

export async function persistEntityInteraction(
  input: PersistEntityInteractionInput,
  baseUrl = getBackendBaseUrl(),
): Promise<PersistEntityInteractionResponse | undefined> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(input.sourceEntityId)}/interactions/entity`, {
    method: 'POST',
    headers: await buildBackendAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      targetEntityId: input.targetEntityId,
      type: input.type,
      summary: input.summary,
      body: input.body,
      topics: input.topics,
      weight: input.weight,
      commandId: input.commandId,
    }),
  })

  if (!response.ok) {
    return undefined
  }

  return response.json() as Promise<PersistEntityInteractionResponse>
}

export async function getEntityConnections(entityId: string, baseUrl = getBackendBaseUrl()): Promise<EntityRelationship[]> {
  const response = await fetch(`${baseUrl}/entity/${encodeURIComponent(entityId)}/connections`, {
    headers: await buildBackendAuthHeaders(),
  })
  if (!response.ok) {
    return []
  }

  const payload = await response.json() as { connections?: EntityRelationship[] }
  return payload.connections ?? []
}

export function normalizeEntityInteractionType(type?: EntityToEntityInteractionType): PersistEntityInteractionInput['type'] {
  if (type === 'collaboration') {
    return 'collaboration'
  }
  if (type === 'reaction' || type === 'influence') {
    return 'reaction'
  }
  if (type === 'suggestion' || type === 'signal') {
    return 'suggestion'
  }
  return 'mention'
}
