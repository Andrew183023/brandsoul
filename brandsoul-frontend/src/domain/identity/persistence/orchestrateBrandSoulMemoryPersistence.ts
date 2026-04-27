import type { BrandSoulMemoryDispatchOutcome } from './BrandSoulMemoryDispatchOutcome'
import type { BrandSoulMemoryPersistenceEnvelope, BrandSoulMemoryDispatchOptions } from './dispatchBrandSoulMemoryPersistence'
import { dispatchBrandSoulMemoryPersistence } from './dispatchBrandSoulMemoryPersistence'
import type { BrandSoulMemoryWriter } from './BrandSoulMemoryWriter'

export type BrandSoulMemoryPersistenceOrchestrationStatus = 'no-op' | 'completed' | 'degraded'

export type BrandSoulMemoryPersistenceOrchestrationContext = {
  interactionLabel?: string
}

export type BrandSoulMemoryPersistenceOrchestrationResult = {
  status: BrandSoulMemoryPersistenceOrchestrationStatus
  summary: string
  attemptedCount: number
  writtenCount: number
  failedCount: number
  shouldAudit: boolean
  shouldContinueEntityInteraction: boolean
  dispatchOutcome: BrandSoulMemoryDispatchOutcome
}

function buildInteractionPrefix(context?: BrandSoulMemoryPersistenceOrchestrationContext) {
  return context?.interactionLabel ? `${context.interactionLabel}: ` : ''
}

export function handleBrandSoulMemoryDispatchOutcome(
  outcome: BrandSoulMemoryDispatchOutcome,
  context?: BrandSoulMemoryPersistenceOrchestrationContext,
): BrandSoulMemoryPersistenceOrchestrationResult {
  const prefix = buildInteractionPrefix(context)

  if (outcome.status === 'skipped') {
    return {
      status: 'no-op',
      summary: `${prefix}${outcome.reason}`,
      attemptedCount: outcome.attemptedCount,
      writtenCount: outcome.writtenCount,
      failedCount: outcome.failedCount,
      shouldAudit: outcome.shouldAudit,
      shouldContinueEntityInteraction: outcome.shouldContinueEntityInteraction,
      dispatchOutcome: outcome,
    }
  }

  if (outcome.status === 'succeeded') {
    return {
      status: 'completed',
      summary: `${prefix}Persisted ${outcome.writtenCount} memory record${outcome.writtenCount === 1 ? '' : 's'} successfully`,
      attemptedCount: outcome.attemptedCount,
      writtenCount: outcome.writtenCount,
      failedCount: outcome.failedCount,
      shouldAudit: outcome.shouldAudit,
      shouldContinueEntityInteraction: outcome.shouldContinueEntityInteraction,
      dispatchOutcome: outcome,
    }
  }

  return {
    status: 'degraded',
    summary: `${prefix}${outcome.reason}`,
    attemptedCount: outcome.attemptedCount,
    writtenCount: outcome.writtenCount,
    failedCount: outcome.failedCount,
    shouldAudit: outcome.shouldAudit,
    shouldContinueEntityInteraction: outcome.shouldContinueEntityInteraction,
    dispatchOutcome: outcome,
  }
}

export async function orchestrateBrandSoulMemoryPersistence(
  writer: BrandSoulMemoryWriter,
  envelope: BrandSoulMemoryPersistenceEnvelope,
  dispatchOptions?: BrandSoulMemoryDispatchOptions,
  context?: BrandSoulMemoryPersistenceOrchestrationContext,
) {
  const dispatchOutcome = await dispatchBrandSoulMemoryPersistence(writer, envelope, dispatchOptions)

  return handleBrandSoulMemoryDispatchOutcome(dispatchOutcome, context)
}