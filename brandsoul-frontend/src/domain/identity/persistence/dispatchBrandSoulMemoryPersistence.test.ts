import { describe, expect, it, vi } from 'vitest'

import type { BrandSoulMemoryWriter } from './BrandSoulMemoryWriter'
import { FailingBrandSoulMemoryWriter } from './FailingBrandSoulMemoryWriter'
import { dispatchBrandSoulMemoryPersistence } from './dispatchBrandSoulMemoryPersistence'

describe('dispatchBrandSoulMemoryPersistence', () => {
  it('does not call the writer when there are no persistence records', async () => {
    const writer: BrandSoulMemoryWriter = {
      write: vi.fn().mockResolvedValue({
        attemptedCount: 0,
        writtenCount: 0,
        skippedCount: 0,
        writtenMemoryIds: [],
      }),
    }

    await expect(
      dispatchBrandSoulMemoryPersistence(writer, {
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

    expect(writer.write).not.toHaveBeenCalled()
  })

  it('forwards accepted persistence records through the sovereign writer interface', async () => {
    const writer: BrandSoulMemoryWriter = {
      write: vi.fn().mockResolvedValue({
        attemptedCount: 1,
        writtenCount: 1,
        skippedCount: 0,
        writtenMemoryIds: ['promotion-context:promo-1'],
      }),
    }

    await expect(
      dispatchBrandSoulMemoryPersistence(writer, {
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
      }),
    ).resolves.toEqual({
      status: 'succeeded',
      attemptedCount: 1,
      writtenCount: 1,
      failedCount: 0,
      severity: 'none',
      reason: 'Memory persistence dispatch completed successfully',
      writtenMemoryIds: ['promotion-context:promo-1'],
      shouldAudit: false,
      shouldContinueEntityInteraction: true,
    })

    expect(writer.write).toHaveBeenCalledWith({
      records: [
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
    })
  })

  it('returns a degraded outcome for total writer failure in the primary response path', async () => {
    const writer = new FailingBrandSoulMemoryWriter({
      errorMessage: 'writer exploded',
    })

    await expect(
      dispatchBrandSoulMemoryPersistence(writer, {
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
  })

  it('keeps the possibility of rethrow when the failure policy requires it', async () => {
    const writer: BrandSoulMemoryWriter = {
      write: vi.fn().mockRejectedValue(new Error('unexpected dispatch failure')),
    }

    await expect(
      dispatchBrandSoulMemoryPersistence(
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

    await dispatchBrandSoulMemoryPersistence(
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
    ).catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('unexpected dispatch failure')
    })
  })
})