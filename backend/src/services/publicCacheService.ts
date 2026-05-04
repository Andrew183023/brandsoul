type CacheEntry<TValue> = {
  value: TValue
  expiresAt: number
}

export class PublicCacheService {
  private readonly cache = new Map<string, CacheEntry<unknown>>()

  get<TValue>(key: string): TValue | undefined {
    const entry = this.cache.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value as TValue
  }

  set<TValue>(key: string, value: TValue, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  async getOrSet<TValue>(key: string, ttlMs: number, factory: () => Promise<TValue> | TValue): Promise<TValue> {
    const cached = this.get<TValue>(key)
    if (cached !== undefined) {
      return cached
    }

    const value = await factory()
    this.set(key, value, ttlMs)
    return value
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }
}

export function createPublicCacheService() {
  return new PublicCacheService()
}
