import type { LandingIntelligenceProjection } from './LandingIntelligenceTypes.js'

type StoredLandingIntelligence = {
  officeId: string
  projections: LandingIntelligenceProjection[]
  savedAt: string
}

function compareStoredLanding(left: StoredLandingIntelligence, right: StoredLandingIntelligence) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryLandingIntelligenceRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredLandingIntelligence[]>()

  save(record: StoredLandingIntelligence) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredLanding)
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

export function createLandingIntelligenceRepository() {
  return new InMemoryLandingIntelligenceRepository()
}
