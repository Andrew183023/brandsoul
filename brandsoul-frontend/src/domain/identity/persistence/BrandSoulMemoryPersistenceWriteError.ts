export class BrandSoulMemoryPersistenceWriteError extends Error {
  readonly attemptedCount: number
  readonly attemptedMemoryIds: string[]
  readonly cause?: unknown

  constructor(message: string, options: { attemptedCount: number; attemptedMemoryIds: string[]; cause?: unknown }) {
    super(message)
    this.name = 'BrandSoulMemoryPersistenceWriteError'
    this.attemptedCount = options.attemptedCount
    this.attemptedMemoryIds = options.attemptedMemoryIds
    this.cause = options.cause
  }
}