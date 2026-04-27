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

function createFeedItemId() {
  return `gfeed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampScore(value: number) {
  return Math.min(1, Math.max(0, value))
}

function sortFeed(left: GlobalFeedItem, right: GlobalFeedItem) {
  const byTimestamp = right.timestamp.localeCompare(left.timestamp)
  if (byTimestamp !== 0) {
    return byTimestamp
  }

  return right.relevanceScore - left.relevanceScore
}

export class GlobalFeedRepository {
  private readonly items = new Map<string, GlobalFeedItem>()

  constructor(_db?: unknown) {}

  async publishFeedItem(input: PublishFeedItemInput): Promise<GlobalFeedItem> {
    const item: GlobalFeedItem = {
      id: input.id ?? createFeedItemId(),
      entityId: input.entityId,
      ownerId: input.ownerId,
      type: input.type,
      content: input.content,
      timestamp: input.timestamp ?? new Date().toISOString(),
      relevanceScore: clampScore(input.relevanceScore ?? 0.5),
      visibility: input.visibility ?? 'public',
    }

    this.items.set(item.id, item)
    return item
  }

  async getFeed(limit = 50): Promise<GlobalFeedItem[]> {
    return Array.from(this.items.values())
      .sort(sortFeed)
      .slice(0, limit)
  }

  async getPersonalizedFeed(ownerId: string, limit = 50): Promise<GlobalFeedItem[]> {
    return Array.from(this.items.values())
      .filter((item) => item.ownerId === ownerId || item.visibility === 'public')
      .sort((left, right) => {
        const leftPriority = left.ownerId === ownerId ? 0 : 1
        const rightPriority = right.ownerId === ownerId ? 0 : 1
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority
        }

        const byRelevance = right.relevanceScore - left.relevanceScore
        if (byRelevance !== 0) {
          return byRelevance
        }

        return right.timestamp.localeCompare(left.timestamp)
      })
      .slice(0, limit)
  }
}

export function createGlobalFeedRepository(db?: unknown) {
  return new GlobalFeedRepository(db)
}
