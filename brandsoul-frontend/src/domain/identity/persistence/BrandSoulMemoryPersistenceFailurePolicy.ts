import { BrandSoulMemoryPersistenceWriteError } from './BrandSoulMemoryPersistenceWriteError'

export type BrandSoulMemoryPersistenceErrorKind = 'domain-error' | 'edge-error'

export type BrandSoulMemoryPersistenceFailureHandling = 'rethrow' | 'degrade' | 'audit-only'

export type BrandSoulMemoryPersistenceFlowImpact = 'continue-entity-interaction' | 'interrupt-entity-interaction'

export type BrandSoulMemoryPersistenceFailurePhase = 'prepare-records' | 'dispatch-write' | 'post-write-audit'

export type BrandSoulMemoryPersistenceExecutionMode = 'primary-response' | 'background-side-effect'

export type BrandSoulMemoryPersistenceFailureSeverity = 'warning' | 'error' | 'critical'

export type BrandSoulMemoryPersistenceFailurePolicyContext = {
  phase: BrandSoulMemoryPersistenceFailurePhase
  executionMode: BrandSoulMemoryPersistenceExecutionMode
  acceptedRecordCount: number
}

export type BrandSoulMemoryPersistenceFailurePolicy = {
  errorKind: BrandSoulMemoryPersistenceErrorKind
  handling: BrandSoulMemoryPersistenceFailureHandling
  flowImpact: BrandSoulMemoryPersistenceFlowImpact
  shouldContinueEntityInteraction: boolean
  shouldAudit: boolean
  severity: BrandSoulMemoryPersistenceFailureSeverity
  rationale: string
}

export function resolveBrandSoulMemoryPersistenceFailurePolicy(
  error: unknown,
  context: BrandSoulMemoryPersistenceFailurePolicyContext,
): BrandSoulMemoryPersistenceFailurePolicy {
  const isEdgeWriteFailure = error instanceof BrandSoulMemoryPersistenceWriteError

  if (isEdgeWriteFailure) {
    const shouldDegrade = context.executionMode === 'primary-response'

    return {
      errorKind: 'edge-error',
      handling: shouldDegrade ? 'degrade' : 'audit-only',
      flowImpact: 'continue-entity-interaction',
      shouldContinueEntityInteraction: true,
      shouldAudit: true,
      severity: context.acceptedRecordCount > 0 ? 'error' : 'warning',
      rationale:
        context.executionMode === 'primary-response'
          ? 'Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction'
          : 'Persistence write failed in a background side-effect path and should remain audit-only until a retry strategy exists',
    }
  }

  return {
    errorKind: 'domain-error',
    handling: 'rethrow',
    flowImpact: 'interrupt-entity-interaction',
    shouldContinueEntityInteraction: false,
    shouldAudit: true,
    severity: 'critical',
    rationale:
      context.phase === 'prepare-records'
        ? 'A domain-level failure during persistence preparation indicates a contract breach and must be repropagated'
        : 'An unexpected failure outside the known persistence boundary must be repropagated until the system can classify it safely',
  }
}