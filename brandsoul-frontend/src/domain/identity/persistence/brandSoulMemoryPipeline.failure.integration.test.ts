import { describe, expect, it } from 'vitest'

import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { applyBrandSoulMemoryPolicy } from '../services/applyBrandSoulMemoryPolicy'
import { dispatchBrandSoulMemoryPersistence } from './dispatchBrandSoulMemoryPersistence'
import { FailingBrandSoulMemoryWriter } from './FailingBrandSoulMemoryWriter'

function buildContext(memory: BrandSoulMemorySnapshot[] = []): Pick<BrandSoulContext, 'memory'> {
  return { memory }
}

describe('BrandSoul memory pipeline failure integration', () => {
  it('keeps policy output intact when persistence dispatch fails', async () => {
    const policyResult = applyBrandSoulMemoryPolicy(buildContext(), [
      {
        key: 'promotion-context:promo-1',
        value: 'Semana da Aurora',
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
      {
        key: 'conversation-focus:2026-04-15T10:00:00.000Z',
        value: 'me fala qualquer coisa sobre a marca',
        type: 'relational',
        relevanceScore: 0.42,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
    ])

    expect(policyResult.acceptedMemories).toHaveLength(1)
    expect(policyResult.rejectedMemories).toHaveLength(1)
    expect(policyResult.persistenceRecords).toHaveLength(1)

    const persistenceSnapshotBeforeFailure = structuredClone(policyResult.persistenceRecords)

    await expect(
      dispatchBrandSoulMemoryPersistence(new FailingBrandSoulMemoryWriter(), {
        persistenceRecords: policyResult.persistenceRecords,
      }),
    ).resolves.toEqual({
      status: 'degraded',
      attemptedCount: 1,
      writtenCount: 0,
      failedCount: 1,
      severity: 'error',
      reason:
        'Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
      errorType: 'edge-error',
      handling: 'degrade',
      writtenMemoryIds: [],
      shouldAudit: true,
      shouldContinueEntityInteraction: true,
    })

    expect(policyResult.persistenceRecords).toEqual(persistenceSnapshotBeforeFailure)
    expect(policyResult.acceptedMemories[0]?.id).toBe('promotion-context:promo-1')
    expect(policyResult.rejectedMemories[0]?.reasons).toEqual(['below-relevance-threshold'])
  })

  it('keeps empty-batch dispatch safe even when failure testing exists elsewhere', async () => {
    await expect(
      dispatchBrandSoulMemoryPersistence(new FailingBrandSoulMemoryWriter(), {
        persistenceRecords: [],
      }),
    ).resolves.toEqual({
      status: 'skipped',
      attemptedCount: 0,
      writtenCount: 0,
      failedCount: 0,
      severity: 'none',
      reason: 'No accepted memory persistence records were available for dispatch',
      writtenMemoryIds: [],
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
    })
  })

  it('makes the dispatch failure observable for future audit via explicit degraded outcome', async () => {
    const policyResult = applyBrandSoulMemoryPolicy(buildContext(), [
      {
        key: 'identity-inference:style-preference',
        value: 'minimalista',
        type: 'identity',
        relevanceScore: 0.91,
        createdAt: '2026-04-15T10:00:00.000Z',
      },
    ])

    await expect(
      dispatchBrandSoulMemoryPersistence(new FailingBrandSoulMemoryWriter({ errorMessage: 'audit failure' }), {
        persistenceRecords: policyResult.persistenceRecords,
      }),
    ).resolves.toEqual({
      status: 'degraded',
      attemptedCount: 1,
      writtenCount: 0,
      failedCount: 1,
      severity: 'error',
      reason:
        'Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
      errorType: 'edge-error',
      handling: 'degrade',
      writtenMemoryIds: [],
      shouldAudit: true,
      shouldContinueEntityInteraction: true,
    })

    await expect(
      dispatchBrandSoulMemoryPersistence(
        new FailingBrandSoulMemoryWriter({ errorMessage: 'audit failure' }),
        {
          persistenceRecords: policyResult.persistenceRecords,
        },
        {
          executionMode: 'background-side-effect',
        },
      ),
    ).resolves.toEqual({
      status: 'degraded',
      attemptedCount: 1,
      writtenCount: 0,
      failedCount: 1,
      severity: 'error',
      reason: 'Persistence write failed in a background side-effect path and should remain audit-only until a retry strategy exists',
      errorType: 'edge-error',
      handling: 'audit-only',
      writtenMemoryIds: [],
      shouldAudit: true,
      shouldContinueEntityInteraction: true,
    })
  })
})