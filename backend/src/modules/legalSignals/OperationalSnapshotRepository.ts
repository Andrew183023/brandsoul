import type { OperationalSnapshot } from './OperationalSnapshot.js'

function buildSnapshotKey(snapshot: Pick<OperationalSnapshot, 'tenantId' | 'entityId'>) {
  return `${snapshot.tenantId}|${snapshot.entityId}`
}

export class InMemoryOperationalSnapshotRepository {
  private readonly snapshots = new Map<string, OperationalSnapshot>()

  upsert(snapshot: OperationalSnapshot) {
    const key = buildSnapshotKey(snapshot)
    this.snapshots.set(key, snapshot)
    return snapshot
  }

  get(tenantId: number, entityId: string) {
    return this.snapshots.get(buildSnapshotKey({ tenantId, entityId })) ?? null
  }

  list() {
    return Array.from(this.snapshots.values()).sort((left, right) => {
      if (left.tenantId !== right.tenantId) {
        return left.tenantId - right.tenantId
      }

      return left.entityId.localeCompare(right.entityId)
    })
  }

  clear() {
    this.snapshots.clear()
  }
}

export function createOperationalSnapshotRepository() {
  return new InMemoryOperationalSnapshotRepository()
}
