import type { JsonObject } from './entityProfile.js'

export type SocialSignalType = 'viewed' | 'interacted' | 'exported' | 'shared' | 'followed'

export type SocialSignalRecord = {
  id: string
  entityId: string
  ownerId?: string
  type: SocialSignalType
  timestamp: string
  weight: number
  source?: string
  actorId?: string
  metadata: JsonObject
}

export type SocialSignalAggregate = {
  entityId?: string
  total: number
  strongestType?: SocialSignalType
  counts: Record<SocialSignalType, number>
  weightedCounts: Record<SocialSignalType, number>
}