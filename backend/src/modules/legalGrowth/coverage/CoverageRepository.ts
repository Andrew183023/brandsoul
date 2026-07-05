import type { CoverageProjection } from './CoverageProjection.js'

type StoredCoverageProjection = {
  officeId: string
  projections: CoverageProjection[]
  savedAt: string
}

function compareStoredCoverage(left: StoredCoverageProjection, right: StoredCoverageProjection) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryCoverageRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredCoverageProjection[]>()

  save(record: StoredCoverageProjection) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredCoverage)
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

export function createCoverageRepository() {
  return new InMemoryCoverageRepository()
}
