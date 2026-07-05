import type { GrowthScoreProjection } from './GrowthScoreProjection.js'

type StoredGrowthScoreProjection = {
  officeId: string
  projections: GrowthScoreProjection[]
  savedAt: string
}

function compareStoredGrowthScores(left: StoredGrowthScoreProjection, right: StoredGrowthScoreProjection) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryGrowthScoreRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredGrowthScoreProjection[]>()

  save(record: StoredGrowthScoreProjection) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredGrowthScores)
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

export function createGrowthScoreRepository() {
  return new InMemoryGrowthScoreRepository()
}
