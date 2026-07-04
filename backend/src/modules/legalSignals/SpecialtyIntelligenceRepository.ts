import type { SpecialtyProjection } from './SpecialtyIntelligence.js'

function buildSpecialtyProjectionKey(projection: Pick<SpecialtyProjection, 'tenantId' | 'entityId' | 'practiceArea'>) {
  return `${projection.tenantId}|${projection.entityId}|${projection.practiceArea}`
}

export class InMemorySpecialtyIntelligenceRepository {
  private readonly projections = new Map<string, SpecialtyProjection>()

  upsert(projection: SpecialtyProjection) {
    this.projections.set(buildSpecialtyProjectionKey(projection), projection)
    return projection
  }

  upsertMany(projections: SpecialtyProjection[]) {
    return projections.map((projection) => this.upsert(projection))
  }

  get(tenantId: number, entityId: string, practiceArea: string) {
    return this.projections.get(buildSpecialtyProjectionKey({ tenantId, entityId, practiceArea })) ?? null
  }

  list() {
    return Array.from(this.projections.values()).sort((left, right) => {
      if (left.tenantId !== right.tenantId) {
        return left.tenantId - right.tenantId
      }
      if (left.entityId !== right.entityId) {
        return left.entityId.localeCompare(right.entityId)
      }
      return left.practiceArea.localeCompare(right.practiceArea)
    })
  }

  clear() {
    this.projections.clear()
  }
}

export function createSpecialtyIntelligenceRepository() {
  return new InMemorySpecialtyIntelligenceRepository()
}
