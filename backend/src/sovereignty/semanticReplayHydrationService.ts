import { createHash } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ObservabilityService } from '../services/observabilityService.js'
import type { SovereignPersistenceCoordinationService } from './sovereignPersistenceCoordinationService.js'

export type CanonicalReplayResult<T> = {
  replayEquivalent: boolean
  replayResultState:
    | 'original'
    | 'hydrated'
    | 'reconstructed'
    | 'fallback-safe'
    | 'invalid'
  semanticIntegrity:
    | 'verified'
    | 'partial'
    | 'invalid'
  lineageHash: string
  replayFingerprint?: string
  canonicalShapeVerified: boolean
  payload: T
}

export type CanonicalReplayShapeVerification<T> = {
  canonicalShapeVerified: boolean
  semanticIntegrity: 'verified' | 'partial' | 'invalid'
  issues: string[]
  normalizedPayload?: T
}

export type ReplayShapeContract = {
  requiredFields?: string[]
  iterableFields?: string[]
  allowNullPayload?: boolean
}

type PersistedReplayRow = {
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

export type RestoreCanonicalReplayArgs<T> = {
  semanticIntentId: string
  mutationLineageHash: string
  lineageHash: string
  replayFingerprint?: string
  replayEquivalent: boolean
  payloadCandidate?: unknown
  candidateSource?: 'execution' | 'cache' | 'persisted'
  contract?: ReplayShapeContract
  shapeVerifier?: (payload: unknown) => CanonicalReplayShapeVerification<T>
  hydrate?: (payload: unknown) => Promise<T | null> | T | null
  reconstruct?: (context: {
    semanticIntentId: string
    replayFingerprint?: string
    lineageHash: string
    mutationLineageHash: string
    latestPersistedPayload: unknown | null
  }) => Promise<T | null> | T | null
  fallbackFactory?: (context: {
    semanticIntentId: string
    replayFingerprint?: string
    lineageHash: string
    mutationLineageHash: string
  }) => T
}

type SemanticReplayHydrationServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  persistenceCoordination?: SovereignPersistenceCoordinationService
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

function hashValue(value: unknown): string {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

function extractShape(value: unknown): unknown {
  if (value === null) {
    return { type: 'null' }
  }

  if (Array.isArray(value)) {
    const itemShapes = value
      .map((entry) => stableStringify(extractShape(entry)))
      .sort((left, right) => left.localeCompare(right))
    return {
      type: 'array',
      itemShapes,
    }
  }

  if (typeof value !== 'object') {
    return {
      type: typeof value,
    }
  }

  const keys = Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right))
  const fields = keys.reduce<Record<string, unknown>>((accumulator, key) => {
    accumulator[key] = extractShape((value as Record<string, unknown>)[key])
    return accumulator
  }, {})

  return {
    type: 'object',
    keys,
    fields,
  }
}

function resolvePathValue(payload: unknown, path: string): unknown {
  const parts = path
    .split('.')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  let cursor = payload

  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[part]
  }

  return cursor
}

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

function parsePayloadSnapshot(raw: string | null | undefined): unknown | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function defaultFallback(candidate: unknown): unknown {
  if (Array.isArray(candidate)) {
    return []
  }

  if (candidate && typeof candidate === 'object') {
    return {}
  }

  return {}
}

export function buildReplayResultShapeHash(args: {
  payload: unknown
  semanticIntentId: string
  replayFingerprint?: string
}): string {
  return hashValue({
    payloadShape: extractShape(args.payload),
    semanticIntentId: args.semanticIntentId,
    replayFingerprint: args.replayFingerprint ?? null,
  })
}

export function verifyCanonicalReplayShape<T>(payload: unknown, contract: ReplayShapeContract = {}): CanonicalReplayShapeVerification<T> {
  const issues: string[] = []
  if (!contract.allowNullPayload && isNil(payload)) {
    issues.push('payload_is_null')
  }

  for (const fieldPath of contract.requiredFields ?? []) {
    const value = resolvePathValue(payload, fieldPath)
    if (isNil(value)) {
      issues.push(`missing_required_field:${fieldPath}`)
    }
  }

  for (const fieldPath of contract.iterableFields ?? []) {
    const value = resolvePathValue(payload, fieldPath)
    if (!Array.isArray(value)) {
      issues.push(`iterable_contract_violation:${fieldPath}`)
    }
  }

  const canonicalShapeVerified = issues.length === 0
  return {
    canonicalShapeVerified,
    semanticIntegrity: canonicalShapeVerified ? 'verified' : 'invalid',
    issues,
    normalizedPayload: canonicalShapeVerified ? (payload as T) : undefined,
  }
}

export class SemanticReplayHydrationService {
  constructor(private readonly options: SemanticReplayHydrationServiceOptions) {}

  async restoreCanonicalReplayResult<T>(args: RestoreCanonicalReplayArgs<T>): Promise<CanonicalReplayResult<T>> {
    const verifier = args.shapeVerifier
      ?? ((payload: unknown) => verifyCanonicalReplayShape<T>(payload, args.contract))

    const persisted = await this.getLatestPersistedResult({
      semanticIntentId: args.semanticIntentId,
      replayFingerprint: args.replayFingerprint,
    })
    const persistedPayload = parsePayloadSnapshot(persisted?.payload_snapshot)
    let candidate = args.payloadCandidate ?? persistedPayload

    const initialVerification = verifier(candidate)
    if (initialVerification.canonicalShapeVerified) {
      const payload = (initialVerification.normalizedPayload ?? candidate) as T
      const canonical: CanonicalReplayResult<T> = {
        replayEquivalent: args.replayEquivalent,
        replayResultState: args.candidateSource === 'execution' ? 'original' : 'hydrated',
        semanticIntegrity: initialVerification.semanticIntegrity,
        lineageHash: args.lineageHash,
        replayFingerprint: args.replayFingerprint,
        canonicalShapeVerified: true,
        payload,
      }
      await this.persistCanonicalReplayResult({
        semanticIntentId: args.semanticIntentId,
        mutationLineageHash: args.mutationLineageHash,
        replayFingerprint: args.replayFingerprint,
        canonicalResult: canonical,
      })
      return canonical
    }

    this.options.observability?.incrementMetric('semantic_replay_shape_mismatch_total')
    this.options.logger?.warn({
      event: 'semantic-replay.shape-invalid',
      semanticIntentId: args.semanticIntentId,
      replayFingerprint: args.replayFingerprint,
      issues: initialVerification.issues,
    }, 'Canonical replay shape invalid')

    if (args.hydrate) {
      const hydratedPayload = await args.hydrate(candidate)
      const hydratedVerification = verifier(hydratedPayload)
      if (hydratedVerification.canonicalShapeVerified) {
        this.options.observability?.incrementMetric('semantic_replay_hydration_total')
        const canonical: CanonicalReplayResult<T> = {
          replayEquivalent: args.replayEquivalent,
          replayResultState: 'hydrated',
          semanticIntegrity: hydratedVerification.semanticIntegrity,
          lineageHash: args.lineageHash,
          replayFingerprint: args.replayFingerprint,
          canonicalShapeVerified: true,
          payload: (hydratedVerification.normalizedPayload ?? hydratedPayload) as T,
        }
        await this.persistCanonicalReplayResult({
          semanticIntentId: args.semanticIntentId,
          mutationLineageHash: args.mutationLineageHash,
          replayFingerprint: args.replayFingerprint,
          canonicalResult: canonical,
        })
        this.options.logger?.info({
          event: 'semantic-replay.hydration-succeeded',
          semanticIntentId: args.semanticIntentId,
          replayFingerprint: args.replayFingerprint,
        }, 'Replay hydration succeeded')
        return canonical
      }
    }

    if (args.reconstruct) {
      const reconstructedPayload = await args.reconstruct({
        semanticIntentId: args.semanticIntentId,
        replayFingerprint: args.replayFingerprint,
        lineageHash: args.lineageHash,
        mutationLineageHash: args.mutationLineageHash,
        latestPersistedPayload: persistedPayload,
      })
      const reconstructedVerification = verifier(reconstructedPayload)
      if (reconstructedVerification.canonicalShapeVerified) {
        this.options.observability?.incrementMetric('semantic_replay_reconstruction_total')
        const canonical: CanonicalReplayResult<T> = {
          replayEquivalent: args.replayEquivalent,
          replayResultState: 'reconstructed',
          semanticIntegrity: reconstructedVerification.semanticIntegrity,
          lineageHash: args.lineageHash,
          replayFingerprint: args.replayFingerprint,
          canonicalShapeVerified: true,
          payload: (reconstructedVerification.normalizedPayload ?? reconstructedPayload) as T,
        }
        await this.persistCanonicalReplayResult({
          semanticIntentId: args.semanticIntentId,
          mutationLineageHash: args.mutationLineageHash,
          replayFingerprint: args.replayFingerprint,
          canonicalResult: canonical,
        })
        this.options.logger?.warn({
          event: 'semantic-replay.reconstruction-used',
          semanticIntentId: args.semanticIntentId,
          replayFingerprint: args.replayFingerprint,
        }, 'Replay reconstruction used')
        return canonical
      }
    }

    const fallbackPayload = args.fallbackFactory
      ? args.fallbackFactory({
        semanticIntentId: args.semanticIntentId,
        replayFingerprint: args.replayFingerprint,
        lineageHash: args.lineageHash,
        mutationLineageHash: args.mutationLineageHash,
      })
      : (defaultFallback(candidate) as T)
    const fallbackVerification = verifier(fallbackPayload)

    const fallbackCanonical: CanonicalReplayResult<T> = {
      replayEquivalent: args.replayEquivalent,
      replayResultState: fallbackVerification.canonicalShapeVerified ? 'fallback-safe' : 'invalid',
      semanticIntegrity: fallbackVerification.canonicalShapeVerified ? 'partial' : 'invalid',
      lineageHash: args.lineageHash,
      replayFingerprint: args.replayFingerprint,
      canonicalShapeVerified: fallbackVerification.canonicalShapeVerified,
      payload: (fallbackVerification.normalizedPayload ?? fallbackPayload) as T,
    }
    await this.persistCanonicalReplayResult({
      semanticIntentId: args.semanticIntentId,
      mutationLineageHash: args.mutationLineageHash,
      replayFingerprint: args.replayFingerprint,
      canonicalResult: fallbackCanonical,
    })

    if (fallbackCanonical.replayResultState === 'fallback-safe') {
      this.options.observability?.incrementMetric('semantic_replay_fallback_total')
      this.options.logger?.warn({
        event: 'semantic-replay.fallback-safe',
        semanticIntentId: args.semanticIntentId,
        replayFingerprint: args.replayFingerprint,
      }, 'Replay fallback-safe result used')
    } else {
      this.options.observability?.incrementMetric('semantic_replay_invalid_total')
      this.options.logger?.error({
        event: 'semantic-replay.invalid',
        semanticIntentId: args.semanticIntentId,
        replayFingerprint: args.replayFingerprint,
        issues: fallbackVerification.issues,
      }, 'Replay fallback result remained invalid')
    }

    return fallbackCanonical
  }

  async getStatus() {
    const row = await this.options.db.get<{
      total: number
      reconstructed_total: number
      fallback_total: number
      invalid_total: number
      mismatch_total: number
      canonical_total: number
      adaptive_hydrated_total: number
    }>(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN replay_result_state = 'reconstructed' THEN 1 ELSE 0 END) AS reconstructed_total,
          SUM(CASE WHEN replay_result_state = 'fallback-safe' THEN 1 ELSE 0 END) AS fallback_total,
          SUM(CASE WHEN replay_result_state = 'invalid' OR semantic_integrity = 'invalid' THEN 1 ELSE 0 END) AS invalid_total,
          SUM(CASE WHEN replay_result_state = 'invalid' THEN 1 ELSE 0 END) AS mismatch_total,
          SUM(CASE WHEN replay_result_state IN ('original', 'hydrated', 'reconstructed') THEN 1 ELSE 0 END) AS canonical_total,
          SUM(CASE
            WHEN semantic_intent_id LIKE '%adaptive-evidence%'
              AND replay_result_state IN ('hydrated', 'reconstructed', 'fallback-safe')
            THEN 1
            ELSE 0
          END) AS adaptive_hydrated_total
        FROM flowmind_semantic_replay_result
      `,
    )

    const total = Number(row?.total ?? 0)
    const canonicalCoverage = total === 0
      ? 0
      : Number(((Number(row?.canonical_total ?? 0) / total) * 100).toFixed(2))
    const invalidReplayCount = Number(row?.invalid_total ?? 0)
    const fallbackReplayCount = Number(row?.fallback_total ?? 0)

    return {
      semanticReplayIntegrity: invalidReplayCount === 0
        ? (fallbackReplayCount > 0 ? 'partial' : 'verified')
        : 'invalid',
      canonicalReplayCoverage: canonicalCoverage,
      reconstructedReplayCount: Number(row?.reconstructed_total ?? 0),
      fallbackReplayCount,
      invalidReplayCount,
      replayShapeMismatchCount: Number(row?.mismatch_total ?? 0),
      adaptiveEvidenceHydrationState: Number(row?.adaptive_hydrated_total ?? 0) > 0
        ? 'active'
        : 'idle',
    }
  }

  private async getLatestPersistedResult(args: {
    semanticIntentId: string
    replayFingerprint?: string
  }): Promise<PersistedReplayRow | null> {
    const replaySpecific = args.replayFingerprint
      ? await this.options.db.get<PersistedReplayRow>(
        `
          SELECT *
          FROM flowmind_semantic_replay_result
          WHERE semantic_intent_id = ?
            AND replay_fingerprint = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        `,
        args.semanticIntentId,
        args.replayFingerprint,
      )
      : null

    if (replaySpecific) {
      return replaySpecific
    }

    const latest = await this.options.db.get<PersistedReplayRow>(
      `
        SELECT *
        FROM flowmind_semantic_replay_result
        WHERE semantic_intent_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `,
      args.semanticIntentId,
    )

    return latest ?? null
  }

  private async persistCanonicalReplayResult<T>(args: {
    semanticIntentId: string
    mutationLineageHash: string
    replayFingerprint?: string
    canonicalResult: CanonicalReplayResult<T>
  }) {
    const payloadSnapshot = stableStringify(args.canonicalResult.payload)
    const requestedAt = new Date().toISOString()

    const persist = async () => this.options.db.run(
      `
        INSERT INTO flowmind_semantic_replay_result (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args.replayFingerprint ?? null,
      args.semanticIntentId,
      args.mutationLineageHash,
      buildReplayResultShapeHash({
        payload: args.canonicalResult.payload,
        semanticIntentId: args.semanticIntentId,
        replayFingerprint: args.replayFingerprint,
      }),
      payloadSnapshot,
      args.canonicalResult.semanticIntegrity,
      args.canonicalResult.replayResultState,
      args.canonicalResult.lineageHash,
      new Date().toISOString(),
    )

    if (!this.options.persistenceCoordination) {
      await persist()
      return
    }

    await this.options.persistenceCoordination.executeCoordinatedOperation({
      context: {
        operationId: `semantic-replay:${args.semanticIntentId}:${args.canonicalResult.replayResultState}:${requestedAt}`,
        persistenceDomain: 'replay',
        mutationLineageHash: args.mutationLineageHash,
        replayFingerprint: args.replayFingerprint,
        continuityEpoch: undefined,
        executionPriority: args.canonicalResult.replayResultState === 'invalid' ? 'critical' : 'high',
        executionClass: 'replay',
        replayRelevant: true,
        continuityRelevant: true,
        recoveryRelevant: false,
        actorId: 'semantic-replay-hydration-service',
        requestedAt,
      },
      work: persist,
    })
  }
}

export function createSemanticReplayHydrationService(options: SemanticReplayHydrationServiceOptions) {
  return new SemanticReplayHydrationService(options)
}