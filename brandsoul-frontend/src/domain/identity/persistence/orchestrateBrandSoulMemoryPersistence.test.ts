import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulMemoryDispatchOutcome } from './BrandSoulMemoryDispatchOutcome'
import type { BrandSoulMemoryWriter } from './BrandSoulMemoryWriter'
import { FailingBrandSoulMemoryWriter } from './FailingBrandSoulMemoryWriter'
import { InMemoryBrandSoulMemoryWriter } from './InMemoryBrandSoulMemoryWriter'
import {
  handleBrandSoulMemoryDispatchOutcome,
  orchestrateBrandSoulMemoryPersistence,
} from './orchestrateBrandSoulMemoryPersistence'

function buildSuccessOutcome(): BrandSoulMemoryDispatchOutcome {
  return {
    status: 'succeeded',
    attemptedCount: 2,
    writtenCount: 2,
    failedCount: 0,
    severity: 'none',
    reason: 'Memory persistence dispatch completed successfully',
    writtenMemoryIds: ['promotion-context:promo-1', 'product-interest:p-1'],
    shouldAudit: false,
    shouldContinueEntityInteraction: true,
  }
}

describe('handleBrandSoulMemoryDispatchOutcome', () => {
  it('interprets skipped dispatch as a stable no-op result', () => {
    expect(
      handleBrandSoulMemoryDispatchOutcome(
        {
          status: 'skipped',
          attemptedCount: 0,
          writtenCount: 0,
          failedCount: 0,
          severity: 'none',
          reason: 'No accepted memory persistence records were available for dispatch',
          writtenMemoryIds: [],
          shouldAudit: false,
          shouldContinueEntityInteraction: true,
        },
        {
          interactionLabel: 'public-entity-flow',
        },
      ),
    ).toEqual({
      status: 'no-op',
      summary: 'public-entity-flow: No accepted memory persistence records were available for dispatch',
      attemptedCount: 0,
      writtenCount: 0,
      failedCount: 0,
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
      dispatchOutcome: {
        status: 'skipped',
        attemptedCount: 0,
        writtenCount: 0,
        failedCount: 0,
        severity: 'none',
        reason: 'No accepted memory persistence records were available for dispatch',
        writtenMemoryIds: [],
        shouldAudit: false,
        shouldContinueEntityInteraction: true,
      },
    })
  })

  it('interprets succeeded dispatch as a completed persistence result', () => {
    expect(handleBrandSoulMemoryDispatchOutcome(buildSuccessOutcome())).toEqual({
      status: 'completed',
      summary: 'Persisted 2 memory records successfully',
      attemptedCount: 2,
      writtenCount: 2,
      failedCount: 0,
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
      dispatchOutcome: buildSuccessOutcome(),
    })
  })

  it('interprets degraded dispatch as a stable degraded orchestration result', () => {
    const degradedOutcome: BrandSoulMemoryDispatchOutcome = {
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
    }

    expect(
      handleBrandSoulMemoryDispatchOutcome(degradedOutcome, {
        interactionLabel: 'public-entity-flow',
      }),
    ).toEqual({
      status: 'degraded',
      summary:
        'public-entity-flow: Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
      attemptedCount: 1,
      writtenCount: 0,
      failedCount: 1,
      shouldAudit: true,
      shouldContinueEntityInteraction: true,
      dispatchOutcome: degradedOutcome,
    })
  })
})

describe('orchestrateBrandSoulMemoryPersistence', () => {
  it('orchestrates dispatch success into a stable completed result', async () => {
    const writer = new InMemoryBrandSoulMemoryWriter()

    await expect(
      orchestrateBrandSoulMemoryPersistence(
        writer,
        {
          persistenceRecords: [
            {
              memoryId: 'promotion-context:promo-1',
              schemaVersion: 1,
              memoryType: 'operational',
              source: 'system',
              subject: 'promotion-context',
              signal: 'active-promotion',
              attributes: {
                promotionId: 'promo-1',
              },
              tags: ['commerce', 'promotion'],
              contextKey: 'promotion:promo-1',
              relevanceScore: 0.72,
              retentionKind: 'expiring',
              createdAt: '2026-04-15T10:00:00.000Z',
              expiresAt: '2026-04-29T10:00:00.000Z',
            },
          ],
        },
        undefined,
        {
          interactionLabel: 'public-entity-flow',
        },
      ),
    ).resolves.toEqual({
      status: 'completed',
      summary: 'public-entity-flow: Persisted 1 memory record successfully',
      attemptedCount: 1,
      writtenCount: 1,
      failedCount: 0,
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
      dispatchOutcome: {
        status: 'succeeded',
        attemptedCount: 1,
        writtenCount: 1,
        failedCount: 0,
        severity: 'none',
        reason: 'Memory persistence dispatch completed successfully',
        writtenMemoryIds: ['promotion-context:promo-1'],
        shouldAudit: false,
        shouldContinueEntityInteraction: true,
      },
    })
  })

  it('orchestrates degraded dispatch outcomes without adding retry or telemetry behavior', async () => {
    await expect(
      orchestrateBrandSoulMemoryPersistence(
        new FailingBrandSoulMemoryWriter(),
        {
          persistenceRecords: [
            {
              memoryId: 'promotion-context:promo-1',
              schemaVersion: 1,
              memoryType: 'operational',
              source: 'system',
              subject: 'promotion-context',
              signal: 'active-promotion',
              attributes: {
                promotionId: 'promo-1',
              },
              tags: ['commerce', 'promotion'],
              contextKey: 'promotion:promo-1',
              relevanceScore: 0.72,
              retentionKind: 'expiring',
              createdAt: '2026-04-15T10:00:00.000Z',
              expiresAt: '2026-04-29T10:00:00.000Z',
            },
          ],
        },
        undefined,
        {
          interactionLabel: 'public-entity-flow',
        },
      ),
    ).resolves.toEqual({
      status: 'degraded',
      summary:
        'public-entity-flow: Persistence write failed at the boundary, but the entity response should continue because memory storage is a side-effect of the completed interaction',
      attemptedCount: 1,
      writtenCount: 0,
      failedCount: 1,
      shouldAudit: true,
      shouldContinueEntityInteraction: true,
      dispatchOutcome: {
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
      },
    })
  })

  it('keeps rethrow behavior when the dispatch policy requires it', async () => {
    const writer: BrandSoulMemoryWriter = {
      write: vi.fn().mockRejectedValue(new Error('unexpected dispatch failure')),
    }

    await expect(
      orchestrateBrandSoulMemoryPersistence(
        writer,
        {
          persistenceRecords: [
            {
              memoryId: 'promotion-context:promo-1',
              schemaVersion: 1,
              memoryType: 'operational',
              source: 'system',
              subject: 'promotion-context',
              signal: 'active-promotion',
              attributes: {
                promotionId: 'promo-1',
              },
              tags: ['commerce', 'promotion'],
              contextKey: 'promotion:promo-1',
              relevanceScore: 0.72,
              retentionKind: 'expiring',
              createdAt: '2026-04-15T10:00:00.000Z',
              expiresAt: '2026-04-29T10:00:00.000Z',
            },
          ],
        },
        {
          failurePhase: 'prepare-records',
        },
      ),
    ).rejects.toMatchObject({
      message: 'unexpected dispatch failure',
    })
  })
})