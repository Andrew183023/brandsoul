type JsonRecord = Record<string, unknown>

export type EntityExportRecord = {
  id: string
  entityId: string
  format: string
  createdAt: string
  metadata: JsonRecord
  fileUrl?: string
}

export type LogExportInput = {
  id?: string
  entityId: string
  format: string
  createdAt?: string
  metadata?: JsonRecord
  fileUrl?: string
}

function createExportId() {
  return `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class EntityExportRepository {
  private readonly records = new Map<string, EntityExportRecord>()
  private readonly byEntityId = new Map<string, string[]>()

  constructor(_db?: unknown) {}

  async logExport(input: LogExportInput): Promise<EntityExportRecord> {
    const record: EntityExportRecord = {
      id: input.id ?? createExportId(),
      entityId: input.entityId,
      format: input.format,
      createdAt: input.createdAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
      fileUrl: input.fileUrl,
    }

    this.records.set(record.id, record)

    const ids = this.byEntityId.get(record.entityId) ?? []
    const nextIds = ids.filter((id) => id !== record.id)
    nextIds.unshift(record.id)
    nextIds.sort((left, right) => {
      const leftRecord = this.records.get(left)
      const rightRecord = this.records.get(right)
      return (rightRecord?.createdAt ?? '').localeCompare(leftRecord?.createdAt ?? '')
    })
    this.byEntityId.set(record.entityId, nextIds)

    return record
  }

  async getExports(entityId: string): Promise<EntityExportRecord[]> {
    const ids = this.byEntityId.get(entityId) ?? []
    return ids
      .map((id) => this.records.get(id))
      .filter((record): record is EntityExportRecord => Boolean(record))
  }

  async getExportById(entityId: string, exportId: string): Promise<EntityExportRecord | null> {
    const record = this.records.get(exportId)
    if (!record || record.entityId !== entityId) {
      return null
    }

    return record
  }
}

export function createEntityExportRepository(db?: unknown) {
  return new EntityExportRepository(db)
}
