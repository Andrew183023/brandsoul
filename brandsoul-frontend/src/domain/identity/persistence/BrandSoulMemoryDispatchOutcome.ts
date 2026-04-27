import type {
  BrandSoulMemoryPersistenceErrorKind,
  BrandSoulMemoryPersistenceFailureHandling,
  BrandSoulMemoryPersistenceFailureSeverity,
} from './BrandSoulMemoryPersistenceFailurePolicy'

export type BrandSoulMemoryDispatchStatus = 'skipped' | 'succeeded' | 'degraded'

export type BrandSoulMemoryDispatchOutcome = {
  status: BrandSoulMemoryDispatchStatus
  attemptedCount: number
  writtenCount: number
  failedCount: number
  severity: BrandSoulMemoryPersistenceFailureSeverity | 'none'
  reason: string
  errorType?: BrandSoulMemoryPersistenceErrorKind
  handling?: BrandSoulMemoryPersistenceFailureHandling
  writtenMemoryIds: string[]
  shouldAudit: boolean
  shouldContinueEntityInteraction: boolean
}