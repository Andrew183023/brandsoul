import type { BrandSoulMemoryPersistenceRecord } from './BrandSoulMemoryPersistenceRecord'
import type {
  BrandSoulMemoryPersistenceExecutionMode,
  BrandSoulMemoryPersistenceFailurePhase,
} from './BrandSoulMemoryPersistenceFailurePolicy'
import type { BrandSoulMemoryWriter } from './BrandSoulMemoryWriter'
import type { BrandSoulMemoryDispatchOutcome } from './BrandSoulMemoryDispatchOutcome'
import { resolveBrandSoulMemoryPersistenceFailurePolicy } from './BrandSoulMemoryPersistenceFailurePolicy'
import { BrandSoulMemoryPersistenceWriteError } from './BrandSoulMemoryPersistenceWriteError'

export type BrandSoulMemoryPersistenceEnvelope = {
  persistenceRecords: BrandSoulMemoryPersistenceRecord[]
}

export type BrandSoulMemoryDispatchOptions = {
  executionMode?: BrandSoulMemoryPersistenceExecutionMode
  failurePhase?: BrandSoulMemoryPersistenceFailurePhase
}

export async function dispatchBrandSoulMemoryPersistence(
  writer: BrandSoulMemoryWriter,
  envelope: BrandSoulMemoryPersistenceEnvelope,
  options?: BrandSoulMemoryDispatchOptions,
): Promise<BrandSoulMemoryDispatchOutcome> {
  if (envelope.persistenceRecords.length === 0) {
    return {
      status: 'skipped',
      attemptedCount: 0,
      writtenCount: 0,
      failedCount: 0,
      severity: 'none',
      reason: 'No accepted memory persistence records were available for dispatch',
      writtenMemoryIds: [],
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
    }
  }

  try {
    const writeResult = await writer.write({
      records: envelope.persistenceRecords,
    })

    return {
      status: 'succeeded',
      attemptedCount: writeResult.attemptedCount,
      writtenCount: writeResult.writtenCount,
      failedCount: writeResult.attemptedCount - writeResult.writtenCount,
      severity: 'none',
      reason: 'Memory persistence dispatch completed successfully',
      writtenMemoryIds: writeResult.writtenMemoryIds,
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
    }
  } catch (error) {
    const failurePhase = options?.failurePhase ?? 'dispatch-write'
    const normalizedError =
      error instanceof BrandSoulMemoryPersistenceWriteError
        ? error
        : new BrandSoulMemoryPersistenceWriteError('BrandSoul memory persistence dispatch failed', {
            attemptedCount: envelope.persistenceRecords.length,
            attemptedMemoryIds: envelope.persistenceRecords.map((record) => record.memoryId),
            cause: error,
          })

    const policyError = failurePhase === 'dispatch-write' || failurePhase === 'post-write-audit' ? normalizedError : error

    const failurePolicy = resolveBrandSoulMemoryPersistenceFailurePolicy(policyError, {
      phase: failurePhase,
      executionMode: options?.executionMode ?? 'primary-response',
      acceptedRecordCount: envelope.persistenceRecords.length,
    })

    if (failurePolicy.handling === 'rethrow') {
      throw policyError
    }

    return {
      status: 'degraded',
      attemptedCount: normalizedError.attemptedCount,
      writtenCount: 0,
      failedCount: normalizedError.attemptedCount,
      severity: failurePolicy.severity,
      reason: failurePolicy.rationale,
      errorType: failurePolicy.errorKind,
      handling: failurePolicy.handling,
      writtenMemoryIds: [],
      shouldAudit: failurePolicy.shouldAudit,
      shouldContinueEntityInteraction: failurePolicy.shouldContinueEntityInteraction,
    }
  }
}