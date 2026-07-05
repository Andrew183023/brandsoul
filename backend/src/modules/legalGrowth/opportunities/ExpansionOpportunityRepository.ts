import type { ExpansionOpportunityProjection } from './ExpansionOpportunityProjection.js'

type StoredExpansionOpportunityProjection = {
  officeId: string
  projections: ExpansionOpportunityProjection[]
  savedAt: string
}

function compareStoredOpportunities(
  left: StoredExpansionOpportunityProjection,
  right: StoredExpansionOpportunityProjection,
) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryExpansionOpportunityRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredExpansionOpportunityProjection[]>()

  save(record: StoredExpansionOpportunityProjection) {
    const current = this.projectionsByOfficeId.get(record.officeId) ?? []
    current.push(record)
    current.sort(compareStoredOpportunities)
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

export function createExpansionOpportunityRepository() {
  return new InMemoryExpansionOpportunityRepository()
}
