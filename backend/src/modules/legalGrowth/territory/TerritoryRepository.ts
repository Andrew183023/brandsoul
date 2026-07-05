import type { TerritoryProjection } from './TerritoryProjection.js'

type StoredTerritoryProjection = {
  officeId: string
  projections: TerritoryProjection[]
  savedAt: string
}

function compareStoredTerritory(left: StoredTerritoryProjection, right: StoredTerritoryProjection) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryTerritoryRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredTerritoryProjection[]>()

  save(record: StoredTerritoryProjection) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredTerritory)
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

export function createTerritoryRepository() {
  return new InMemoryTerritoryRepository()
}
