import type { GrowthSnapshot } from './GrowthSnapshot.js'

function compareSnapshots(left: GrowthSnapshot, right: GrowthSnapshot) {
  if (left.generatedAt !== right.generatedAt) {
    return right.generatedAt.localeCompare(left.generatedAt)
  }

  if (left.tenantId !== right.tenantId) {
    return left.tenantId - right.tenantId
  }

  return left.officeId.localeCompare(right.officeId)
}

export class InMemoryGrowthRepository {
  private readonly snapshotsByOfficeId = new Map<string, GrowthSnapshot[]>()

  save(snapshot: GrowthSnapshot) {
    const existing = this.snapshotsByOfficeId.get(snapshot.officeId) ?? []
    existing.push(snapshot)
    existing.sort(compareSnapshots)
    this.snapshotsByOfficeId.set(snapshot.officeId, existing)
    return snapshot
  }

  getLatestByOfficeId(officeId: string) {
    return this.snapshotsByOfficeId.get(officeId)?.[0] ?? null
  }

  listByOfficeId(officeId: string) {
    return [...(this.snapshotsByOfficeId.get(officeId) ?? [])]
  }
}

export function createGrowthRepository() {
  return new InMemoryGrowthRepository()
}
