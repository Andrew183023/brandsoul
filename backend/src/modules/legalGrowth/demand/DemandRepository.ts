import type { DemandProjection } from './DemandProjection.js'

type StoredDemandProjection = {
  officeId: string
  projection: DemandProjection
  savedAt: string
}

function compareStoredProjections(left: StoredDemandProjection, right: StoredDemandProjection) {
  if (left.savedAt !== right.savedAt) {
    return right.savedAt.localeCompare(left.savedAt)
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryDemandRepository {
  private readonly projectionsByOfficeId = new Map<string, StoredDemandProjection[]>()

  save(args: StoredDemandProjection) {
    const current = this.projectionsByOfficeId.get(args.officeId) ?? []
    current.push(args)
    current.sort(compareStoredProjections)
    this.projectionsByOfficeId.set(args.officeId, current)
    return args
  }

  getLatestByOfficeId(officeId: string) {
    return this.projectionsByOfficeId.get(officeId)?.[0] ?? null
  }

  listByOfficeId(officeId: string) {
    return [...(this.projectionsByOfficeId.get(officeId) ?? [])]
  }
}

export function createDemandRepository() {
  return new InMemoryDemandRepository()
}
