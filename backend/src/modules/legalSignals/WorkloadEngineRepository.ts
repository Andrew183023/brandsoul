import type { ProfessionalWorkloadProjection } from './WorkloadEngine.js'

function buildWorkloadProjectionKey(projection: Pick<ProfessionalWorkloadProjection, 'tenantId' | 'entityId' | 'professionalId'>) {
  return `${projection.tenantId}|${projection.entityId}|${projection.professionalId}`
}

export class InMemoryWorkloadEngineRepository {
  private readonly projections = new Map<string, ProfessionalWorkloadProjection>()

  upsert(projection: ProfessionalWorkloadProjection) {
    this.projections.set(buildWorkloadProjectionKey(projection), projection)
    return projection
  }

  upsertMany(projections: ProfessionalWorkloadProjection[]) {
    return projections.map((projection) => this.upsert(projection))
  }

  get(tenantId: number, entityId: string, professionalId: string) {
    return this.projections.get(buildWorkloadProjectionKey({ tenantId, entityId, professionalId })) ?? null
  }

  list() {
    return Array.from(this.projections.values()).sort((left, right) => {
      if (left.tenantId !== right.tenantId) {
        return left.tenantId - right.tenantId
      }
      if (left.entityId !== right.entityId) {
        return left.entityId.localeCompare(right.entityId)
      }
      return left.professionalId.localeCompare(right.professionalId)
    })
  }

  clear() {
    this.projections.clear()
  }
}

export function createWorkloadEngineRepository() {
  return new InMemoryWorkloadEngineRepository()
}
