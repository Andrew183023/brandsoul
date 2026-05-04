type JsonRecord = Record<string, unknown>

export type GlobalFeedVisibility = 'public' | 'private'

export type GlobalFeedItem = {
  id: string
  entityId: string
  ownerId?: string
  type: string
  content: JsonRecord
  timestamp: string
  relevanceScore: number
  visibility: GlobalFeedVisibility
}

export type PublishFeedItemInput = {
  id?: string
  entityId: string
  ownerId?: string
  type: string
  content: JsonRecord
  timestamp?: string
  relevanceScore?: number
  visibility?: GlobalFeedVisibility
}

export type FeedEvent = {
  entityId: string
  type: string
  timestamp: string
  payload: JsonRecord
}

export type FeedEntity = {
  id?: string
  social?: JsonRecord
  finalForm?: JsonRecord
  relational?: JsonRecord
}

export type PublishFromEventArgs = {
  event: FeedEvent
  entity?: FeedEntity
  ownerId?: string
}

export type SocialSignalInput = {
  entityId: string
  ownerId?: string
  type: string
  timestamp: string
  weight: number
  source?: string
}

type GlobalFeedRepositoryLike = {
  publishFeedItem(input: PublishFeedItemInput): Promise<GlobalFeedItem>
  getFeed(limit?: number): Promise<GlobalFeedItem[]>
  getPersonalizedFeed(ownerId: string, limit?: number): Promise<GlobalFeedItem[]>
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function mapEventTypeToFeedType(type: string): string | undefined {
  if (type === 'entity.created') return 'entity_created'
  if (type === 'birth.completed' || type === 'final.revealed' || type === 'entity.updated') return 'entity_evolved'
  if (type === 'export.downloaded') return 'export_generated'
  if (type === 'interaction.message' || type === 'interaction.click' || type === 'interaction.reply') {
    return 'interaction_happened'
  }
  if (type === 'share.triggered' || type === 'return.visit') return 'social_signal'
  return undefined
}

function computeEventRelevanceScore(event: FeedEvent, entity?: FeedEntity): number {
  const relational = asRecord(entity?.relational)
  const behaviorState = asRecord(relational.behaviorState)
  const binding = asRecord(relational.binding)
  const progression = asRecord(relational.progression)

  const base =
    readNumber(binding.bindingStrength) * 0.3 +
    readNumber(behaviorState.affinityScore) * 0.2 +
    Math.min(1, readNumber(progression.level) / 10) * 0.2

  if (event.type === 'share.triggered') return Math.min(1, 0.75 + base)
  if (event.type === 'export.downloaded') return Math.min(1, 0.68 + base)
  if (event.type === 'birth.completed' || event.type === 'final.revealed') return Math.min(1, 0.62 + base)
  if (event.type.startsWith('interaction.')) return Math.min(1, 0.55 + base)
  return Math.min(1, 0.45 + base)
}

function buildFeedContent(event: FeedEvent, entity?: FeedEntity): JsonRecord {
  const social = asRecord(entity?.social)
  const finalForm = asRecord(entity?.finalForm)
  const identity = asRecord(finalForm.identity)
  const name = readString(identity.name) ?? readString(social.publicName) ?? String(entity?.id ?? event.entityId)

  return {
    entityName: name,
    eventType: event.type,
    summary: readString(event.payload.summary) ?? `${name} generated ${event.type}`,
    source: readString(event.payload.source),
    target: readString(event.payload.target),
    channel: readString(event.payload.channel),
    exportType: readString(event.payload.exportType),
  }
}

export class GlobalFeedEngine {
  constructor(private readonly repository: GlobalFeedRepositoryLike) {}

  async publishFeedItem(input: PublishFeedItemInput): Promise<GlobalFeedItem> {
    return this.repository.publishFeedItem(input)
  }

  async publishFromEvent(args: PublishFromEventArgs): Promise<GlobalFeedItem | undefined> {
    const type = mapEventTypeToFeedType(args.event.type)
    if (!type) {
      return undefined
    }

    return this.publishFeedItem({
      entityId: args.event.entityId,
      ownerId: args.ownerId,
      type,
      content: buildFeedContent(args.event, args.entity),
      timestamp: args.event.timestamp,
      relevanceScore: computeEventRelevanceScore(args.event, args.entity),
      visibility: 'public',
    })
  }

  async getFeed(limit = 50): Promise<GlobalFeedItem[]> {
    return this.repository.getFeed(limit)
  }

  async getPersonalizedFeed(ownerId: string, limit = 50): Promise<GlobalFeedItem[]> {
    return this.repository.getPersonalizedFeed(ownerId, limit)
  }

  async publishFromSocialSignal(signal: SocialSignalInput): Promise<GlobalFeedItem | undefined> {
    if (signal.type === 'viewed') {
      return undefined
    }

    return this.publishFeedItem({
      entityId: signal.entityId,
      ownerId: signal.ownerId,
      type: 'social_signal',
      timestamp: signal.timestamp,
      relevanceScore: Math.max(0.45, signal.weight),
      content: {
        signalType: signal.type,
        summary: `Social proof updated: ${signal.type}.`,
        source: signal.source,
      },
      visibility: 'public',
    })
  }
}

export function createGlobalFeedEngine(repository: GlobalFeedRepositoryLike) {
  return new GlobalFeedEngine(repository)
}
