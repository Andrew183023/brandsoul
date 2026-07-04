import type { RegionalProjection } from './RegionalIntelligence.js'

function buildRegionalProjectionKey(projection: Pick<RegionalProjection, 'tenantId' | 'entityId' | 'city'>) {
  return `${projection.tenantId}|${projection.entityId}|${projection.city}`
}

export class InMemoryRegionalIntelligenceRepository {
  private readonly projections = new Map<string, RegionalProjection>()

  upsert(projection: RegionalProjection) {
    this.projections.set(buildRegionalProjectionKey(projection), projection)
    return projection
  }

  upsertMany(projections: RegionalProjection[]) {
    return projections.map((projection) => this.upsert(projection))
  }

  get(tenantId: number, entityId: string, city: string) {
    return this.projections.get(buildRegionalProjectionKey({ tenantId, entityId, city })) ?? null
  }

  list() {
    return Array.from(this.projections.values()).sort((left, right) => {
      if (left.tenantId !== right.tenantId) {
        return left.tenantId - right.tenantId
      }
      if (left.entityId !== right.entityId) {
        return left.entityId.localeCompare(right.entityId)
      }
      return left.city.localeCompare(right.city)
    })
  }

  clear() {
    this.projections.clear()
  }
}

export function createRegionalIntelligenceRepository() {
  return new InMemoryRegionalIntelligenceRepository()
}
