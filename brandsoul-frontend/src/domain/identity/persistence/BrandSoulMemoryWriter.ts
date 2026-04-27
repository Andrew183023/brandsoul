import type { BrandSoulMemoryPersistenceRecord } from './BrandSoulMemoryPersistenceRecord'

export type BrandSoulMemoryWriteRequest = {
  records: BrandSoulMemoryPersistenceRecord[]
}

export type BrandSoulMemoryWriteResult = {
  attemptedCount: number
  writtenCount: number
  skippedCount: number
  writtenMemoryIds: string[]
}

export interface BrandSoulMemoryWriter {
  write(request: BrandSoulMemoryWriteRequest): Promise<BrandSoulMemoryWriteResult>
}