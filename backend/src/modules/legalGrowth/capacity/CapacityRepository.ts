import type { CapacityProjection } from './CapacityProjection.js'

type StoredCapacityProjection = {
  officeId: string
  projections: CapacityProjection[]
  savedAt: string
}

function compareStoredCapacity(left: StoredCapacityProjection, right: StoredCapacityProjection) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryCapacityRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredCapacityProjection[]>()

  save(record: StoredCapacityProjection) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredCapacity)
    this.projectionsByOfficeId.set(record.officeId, current)
    return record
  }

  getLatestByOfficeId(officeId: string) {
    return this.projectionsByOfficeId.get(officeId)?.[0] ?? null
  }

  listByOfficeId(officeId: string) {
    return [...(this.projectionsByOfficeId.get(officeId) ?? [])]
  }
}

export function createCapacityRepository() {
  return new InMemoryCapacityRepository()
}
