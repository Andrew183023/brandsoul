import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import { getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'

type ReplayRow = {
  replay_result_id: string
  replay_fingerprint: string | null
  semantic_intent_id: string
  mutation_lineage_hash: string
  result_shape_hash: string
  payload_snapshot: string
  semantic_integrity: 'verified' | 'partial' | 'invalid'
  replay_result_state: 'original' | 'hydrated' | 'reconstructed' | 'fallback-safe' | 'invalid'
  lineage_hash: string
  created_at: string
}

type InternalReplayQuarantineBody = {
  replayFingerprint?: string
  reason?: string
}

type LegalBetaApp = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
  }
}

function isInternalReplayQuarantineEnabled() {
  const renderDeployMode = (process.env.RENDER_DEPLOY_MODE ?? '').trim().toLowerCase()
  const nodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase()
  return renderDeployMode !== 'production' || nodeEnv !== 'production'
}

function readInternalAdminToken() {
  return (process.env.INTERNAL_ADMIN_TOKEN ?? '').trim()
}

function collectIntentIds(rows: ReplayRow[]) {
  return [...new Set(rows.map((row) => row.semantic_intent_id))]
}

function collectFingerprints(rows: ReplayRow[]) {
  return [...new Set(rows.map((row) => row.replay_fingerprint).filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

function invalidateReplayEquivalentCacheByFingerprint(replayFingerprint: string) {
  try {
    const executor = getSemanticMutationExecutor() as unknown as {
      replayEquivalentCache?: Map<string, { effect?: { replayFingerprint?: string | null } }>
    }
    const cache = executor.replayEquivalentCache
    if (!cache) {
      return {
        cacheInvalidated: false,
        removedEntries: 0,
        strategy: 'executor_cache_unavailable',
      }
    }

    let removedEntries = 0
    for (const [cacheKey, cachedMutation] of cache.entries()) {
      if (cachedMutation?.effect?.replayFingerprint === replayFingerprint) {
        cache.delete(cacheKey)
        removedEntries += 1
      }
    }

    return {
      cacheInvalidated: removedEntries > 0,
      removedEntries,
      strategy: removedEntries > 0 ? 'in_memory_cache_delete' : 'restart_or_redeploy_clears_cache',
    }
  } catch {
    return {
      cacheInvalidated: false,
      removedEntries: 0,
      strategy: 'restart_or_redeploy_clears_cache',
    }
  }
}

async function quarantineReplayRowsForPostgres(app: FastifyInstance, rows: ReplayRow[]) {
  const legalApp = app as LegalBetaApp
  const ids = rows.map((row) => row.replay_result_id)
  if (ids.length === 0) {
    return 0
  }

  const placeholders = ids.map(() => '?').join(', ')
  const result = await legalApp.backendContext.connection.run(
    `
      UPDATE flowmind_semantic_replay_result
      SET semantic_integrity = 'invalid',
          replay_result_state = 'invalid'
      WHERE replay_result_id IN (${placeholders})
    `,
    ...ids,
  )

  return Number(result.changes ?? 0)
}

async function quarantineReplayRowsForSqlite(app: FastifyInstance, rows: ReplayRow[]) {
  const legalApp = app as LegalBetaApp
  let inserted = 0

  for (const row of rows) {
    await legalApp.backendContext.connection.run(
      `
        INSERT INTO flowmind_semantic_replay_result (
          replay_result_id,
          replay_fingerprint,
          semantic_intent_id,
          mutation_lineage_hash,
          result_shape_hash,
          payload_snapshot,
          semantic_integrity,
          replay_result_state,
          lineage_hash,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      `quarantine:${row.replay_result_id}:${randomUUID()}`,
      row.replay_fingerprint,
      row.semantic_intent_id,
      row.mutation_lineage_hash,
      row.result_shape_hash,
      row.payload_snapshot,
      'invalid',
      'invalid',
      row.lineage_hash,
      new Date().toISOString(),
    )
    inserted += 1
  }

  return inserted
}

export async function registerLegalBetaInternalReplayAdminRoutes(app: FastifyInstance) {
  if (!isInternalReplayQuarantineEnabled()) {
    return
  }

  app.post<{ Body: InternalReplayQuarantineBody }>('/internal/admin/replay/quarantine', async (request, reply) => {
    const configuredToken = readInternalAdminToken()
    const requestTokenHeader = request.headers['x-internal-admin-token']
    const requestToken = Array.isArray(requestTokenHeader) ? requestTokenHeader[0] : requestTokenHeader
    const replayFingerprint = request.body?.replayFingerprint?.trim()
    const reason = request.body?.reason?.trim() ?? ''
    const legalApp = app as LegalBetaApp

    if (!configuredToken || requestToken !== configuredToken) {
      return reply.status(401).send({
        error: 'internal_admin_unauthorized',
      })
    }

    if (!replayFingerprint || reason.length === 0) {
      return reply.status(400).send({
        error: 'invalid_replay_quarantine_request',
      })
    }

    const matchedRows = await legalApp.backendContext.connection.all<ReplayRow[]>(
      `
        SELECT replay_result_id, replay_fingerprint, semantic_intent_id, mutation_lineage_hash, result_shape_hash,
               payload_snapshot, semantic_integrity, replay_result_state, lineage_hash, created_at
        FROM flowmind_semantic_replay_result
        WHERE replay_fingerprint = ?
        ORDER BY created_at ASC
      `,
      replayFingerprint,
    )

    const affectedIntentIds = collectIntentIds(matchedRows)
    const replayFingerprints = collectFingerprints(matchedRows)
    const cacheResult = invalidateReplayEquivalentCacheByFingerprint(replayFingerprint)

    let quarantinedRows = 0
    if (matchedRows.length > 0) {
      quarantinedRows = legalApp.backendContext.connection.dialect === 'postgres'
        ? await quarantineReplayRowsForPostgres(app, matchedRows)
        : await quarantineReplayRowsForSqlite(app, matchedRows)
    }

    app.log.warn({
      event: 'internal.replay.quarantine',
      replayFingerprint,
      reason,
      matchedRows: matchedRows.length,
      quarantinedRows,
      affectedIntentIds,
      replayFingerprints,
      cacheInvalidated: cacheResult.cacheInvalidated,
      cacheEntriesRemoved: cacheResult.removedEntries,
      cacheStrategy: cacheResult.strategy,
      metadataUpdated: false,
    }, 'Internal replay quarantine action executed')

    return reply.send({
      matchedRows: matchedRows.length,
      quarantinedRows,
      replayFingerprints,
      affectedIntentIds,
      cacheInvalidated: cacheResult.cacheInvalidated,
      cacheEntriesRemoved: cacheResult.removedEntries,
      cacheStrategy: cacheResult.strategy,
    })
  })
}
