import type { RecommendationProjection } from './RecommendationProjection.js'

type StoredRecommendationProjection = {
  officeId: string
  projections: RecommendationProjection[]
  savedAt: string
}

function compareStoredRecommendations(left: StoredRecommendationProjection, right: StoredRecommendationProjection) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryRecommendationRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredRecommendationProjection[]>()

  save(record: StoredRecommendationProjection) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredRecommendations)
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

export function createRecommendationRepository() {
  return new InMemoryRecommendationRepository()
}
