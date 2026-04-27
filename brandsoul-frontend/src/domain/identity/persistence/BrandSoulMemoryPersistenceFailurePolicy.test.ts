import { describe, expect, it } from 'vitest'

import { BrandSoulMemoryPersistenceWriteError } from './BrandSoulMemoryPersistenceWriteError'
import { resolveBrandSoulMemoryPersistenceFailurePolicy } from './BrandSoulMemoryPersistenceFailurePolicy'

describe('resolveBrandSoulMemoryPersistenceFailurePolicy', () => {
  it('degrades edge write failures during the primary response flow while keeping the entity interaction alive', () => {
    const error = new BrandSoulMemoryPersistenceWriteError('dispatch failed', {
      attemptedCount: 2,
      attemptedMemoryIds: ['promotion-context:promo-1', 'product-interest:p-1'],
      cause: new Error('writer offline'),
    })

    expect(
      resolveBrandSoulMemoryPersistenceFailurePolicy(error, {
        phase: 'dispatch-write',
        executionMode: 'primary-response',
        acceptedRecordCount: 2,
      }),
    ).toEqual({
      errorKind: 'edge-error',
      handling: 'degrade',
      flowImpact: 'continue-entity-interaction',
      shouldContinueEntityInteraction: true,
      shouldAudit: true,
      severity: 'error',
      rationale:
        'Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
    })
  })

  it('keeps edge write failures audit-only in a background side-effect path', () => {
    const error = new BrandSoulMemoryPersistenceWriteError('dispatch failed', {
      attemptedCount: 1,
      attemptedMemoryIds: ['identity-inference:style-preference'],
      cause: new Error('writer offline'),
    })

    expect(
      resolveBrandSoulMemoryPersistenceFailurePolicy(error, {
        phase: 'dispatch-write',
        executionMode: 'background-side-effect',
        acceptedRecordCount: 1,
      }),
    ).toEqual({
      errorKind: 'edge-error',
      handling: 'audit-only',
      flowImpact: 'continue-entity-interaction',
      shouldContinueEntityInteraction: true,
      shouldAudit: true,
      severity: 'error',
      rationale:
        'Persistence write failed in a background side-effect path and should remain audit-only until a retry strategy exists',
    })
  })

  it('repropagates domain-level preparation failures because they indicate a contract breach', () => {
    expect(
      resolveBrandSoulMemoryPersistenceFailurePolicy(new Error('invalid persistence record'), {
        phase: 'prepare-records',
        executionMode: 'primary-response',
        acceptedRecordCount: 1,
      }),
    ).toEqual({
      errorKind: 'domain-error',
      handling: 'rethrow',
      flowImpact: 'interrupt-entity-interaction',
      shouldContinueEntityInteraction: false,
      shouldAudit: true,
      severity: 'critical',
      rationale: 'A domain-level failure during persistence preparation indicates a contract breach and must be repropagated',
    })
  })

  it('still classifies edge failures with no accepted records as non-blocking and auditable', () => {
    const error = new BrandSoulMemoryPersistenceWriteError('dispatch failed', {
      attemptedCount: 0,
      attemptedMemoryIds: [],
      cause: new Error('writer offline'),
    })

    expect(
      resolveBrandSoulMemoryPersistenceFailurePolicy(error, {
        phase: 'post-write-audit',
        executionMode: 'background-side-effect',
        acceptedRecordCount: 0,
      }),
    ).toEqual({
      errorKind: 'edge-error',
      handling: 'audit-only',
      flowImpact: 'continue-entity-interaction',
      shouldContinueEntityInteraction: true,
      shouldAudit: true,
      severity: 'warning',
      rationale:
        'Persistence write failed in a background side-effect path and should remain audit-only until a retry strategy exists',
    })
  })
})