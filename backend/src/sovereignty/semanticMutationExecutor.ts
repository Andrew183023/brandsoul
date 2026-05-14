import { createHash, randomUUID } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ObservabilityService } from '../services/observabilityService.js'
import type { SovereignMutationAttestation, SovereignMutationContext } from './institutionalSovereignMutationGate.js'
import { getInstitutionalSovereignMutationGate } from './institutionalSovereignMutationGate.js'
import { buildSemanticMutationAuthorityGraph } from './semanticMutationAuthorityGraph.js'
import type { SemanticMutationEffect } from './semanticMutationEffect.js'
import type { SemanticMutationIntent } from './semanticMutationIntent.js'
import type { SovereignPersistenceCoordinationService } from './sovereignPersistenceCoordinationService.js'
import {
  createSemanticReplayHydrationService,
  verifyCanonicalReplayShape,
  type CanonicalReplayShapeVerification,
  type ReplayShapeContract,
  type SemanticReplayHydrationService,
} from './semanticReplayHydrationService.js'

type ExecuteSemanticMutationArgs<TPersisted, TResult = TPersisted> = {
  authoritySource: string
  intent: SemanticMutationIntent
  validateIntent?: (intent: SemanticMutationIntent) => Promise<void> | void
  captureBeforeState?: () => Promise<unknown> | unknown
  executePersistence: () => Promise<TPersisted>
  captureAfterState?: (persisted: TPersisted) => Promise<unknown> | unknown
  deriveEffect: (args: {
    intent: SemanticMutationIntent
    persisted: TPersisted
    beforeState: unknown
    afterState: unknown
    sovereignAttestation: SovereignMutationAttestation
  }) => Promise<SemanticMutationEffect> | SemanticMutationEffect
  verifyEffect?: (args: {
    intent: SemanticMutationIntent
    effect: SemanticMutationEffect
    persisted: TPersisted
    beforeState: unknown
    afterState: unknown
  }) => Promise<boolean> | boolean
  mapResult?: (args: {
    persisted: TPersisted
    effect: SemanticMutationEffect
    sovereignAttestation: SovereignMutationAttestation
  }) => TResult
  canonicalReplayShape?: ReplayShapeContract
  canonicalShapeVerifier?: (payload: unknown) => CanonicalReplayShapeVerification<TResult>
  replayHydrateResult?: (payload: unknown) => Promise<TResult | null> | TResult | null
  replayReconstructResult?: (context: {
    intent: SemanticMutationIntent
    effect: SemanticMutationEffect | null
    replayFingerprint?: string
    lineageHash: string
    mutationLineageHash: string
  }) => Promise<TResult | null> | TResult | null
  replayFallbackResult?: (context: {
    intent: SemanticMutationIntent
    replayFingerprint?: string
    lineageHash: string
    mutationLineageHash: string
  }) => TResult
}

type SemanticMutationExecutorOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  persistenceCoordination?: SovereignPersistenceCoordinationService
}

export type ExecutedSemanticMutation<TResult> = {
  result: TResult
  intent: SemanticMutationIntent
  effect: SemanticMutationEffect
  sovereignAttestation: SovereignMutationAttestation
}

let installedExecutor: SemanticMutationExecutor | null = null

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

function hashValue(value: unknown) {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

function mapIntentDomainToMutationScope(intent: SemanticMutationIntent): SovereignMutationContext['mutationScope'] {
  switch (intent.domain) {
    case 'auth':
      return 'auth'
    case 'governance':
      return 'governance'
    case 'replay':
      return 'replay'
    case 'checkpoint':
      return 'checkpoint'
    case 'queue':
      return 'queue'
    case 'runtime':
      return 'runtime'
    case 'memory':
      return 'memory'
    case 'entity':
    case 'legal_case':
    default:
      return 'entity'
  }
}

function mapIntentToCapability(intent: SemanticMutationIntent) {
  switch (intent.domain) {
    case 'auth':
      return intent.intentType
    case 'governance':
    case 'replay':
      return 'governance.replay.generate'
    case 'checkpoint':
    case 'runtime':
      return 'adaptive.runtime.mutation'
    case 'queue':
      return 'governance.approval'
    case 'memory':
    case 'entity':
    case 'legal_case':
    default:
      return 'sovereign.mutation'
  }
}

function buildMutationLineageHash(args: {
  intent: SemanticMutationIntent
  effectType: string
  institutionalMeaning: string
  changedFields: string[]
  beforeFingerprint: string
  afterFingerprint: string
  replayFingerprint: string
}) {
  return hashValue({
    intent: {
      intentType: args.intent.intentType,
      domain: args.intent.domain,
      semanticPurpose: args.intent.semanticPurpose,
      expectedInstitutionalEffect: args.intent.expectedInstitutionalEffect,
    },
    effect: {
      effectType: args.effectType,
      institutionalMeaning: args.institutionalMeaning,
      changedFields: [...args.changedFields].sort(),
      beforeFingerprint: args.beforeFingerprint,
      afterFingerprint: args.afterFingerprint,
      replayFingerprint: args.replayFingerprint,
    },
  })
}

function defaultVerifyEffect(args: {
  intent: SemanticMutationIntent
  effect: SemanticMutationEffect
  beforeState: unknown
}) {
  if (!args.effect.institutionalMeaning.trim()) {
    return false
  }
  if (args.effect.changedFields.length === 0 && args.intent.riskLevel !== 'low') {
    return false
  }
  if (args.intent.replayRelevant && !args.effect.replayFingerprint.trim()) {
    return false
  }
  if (args.intent.continuityRelevant && !args.effect.continuityLineageHash.trim()) {
    return false
  }

  const expectedMutationLineageHash = buildMutationLineageHash({
    intent: args.intent,
    effectType: args.effect.effectType,
    institutionalMeaning: args.effect.institutionalMeaning,
    changedFields: args.effect.changedFields,
    beforeFingerprint: args.effect.beforeFingerprint ?? hashValue(args.beforeState),
    afterFingerprint: args.effect.afterFingerprint ?? '',
    replayFingerprint: args.effect.replayFingerprint,
  })

  return expectedMutationLineageHash === args.effect.mutationLineageHash
}

export class SemanticMutationExecutor {
  private readonly replayEquivalentCache = new Map<string, ExecutedSemanticMutation<unknown>>()
  private readonly replayHydrationService: SemanticReplayHydrationService

  constructor(private readonly options: SemanticMutationExecutorOptions) {
    this.replayHydrationService = createSemanticReplayHydrationService(options)
  }

  async executeSemanticMutation<TPersisted, TResult = TPersisted>(
    args: ExecuteSemanticMutationArgs<TPersisted, TResult>,
  ): Promise<ExecutedSemanticMutation<TResult>> {
    await args.validateIntent?.(args.intent)
    this.validateIntentShape(args.intent)

    const beforeState = await args.captureBeforeState?.()
    const beforeFingerprint = hashValue(beforeState ?? null)
    const replayIntentFingerprint = hashValue({
      intentType: args.intent.intentType,
      semanticPurpose: args.intent.semanticPurpose,
      beforeFingerprint,
    })
    const replayCacheKey = `${args.intent.intentId}:${beforeFingerprint}`

    const replayEquivalent = await this.options.db.get<{
      intent_id: string
      effect_id: string
      domain: string
      intent_type: string
      semantic_purpose: string
      institutional_meaning: string
      risk_level: string
      replay_relevant: number
      continuity_relevant: number
      auth_relevant: number
      before_fingerprint: string | null
      after_fingerprint: string | null
      replay_fingerprint: string
      continuity_lineage_hash: string
      mutation_lineage_hash: string
      verified: number
      created_at: string
    }>(
      `
        SELECT *
        FROM flowmind_semantic_mutation_attestation
        WHERE intent_id = ?
        LIMIT 1
      `,
      args.intent.intentId,
    )

    if (replayEquivalent && replayEquivalent.verified === 1) {
      const persistedBeforeFingerprint = replayEquivalent.before_fingerprint ?? ''
      const rawBeforeStateFingerprint = JSON.stringify(beforeState ?? null)
      const sameBeforeState = !persistedBeforeFingerprint
        || persistedBeforeFingerprint === beforeFingerprint
        || persistedBeforeFingerprint === rawBeforeStateFingerprint

      if (!sameBeforeState) {
        this.options.observability?.incrementMetric('semantic_replay_drift_total')
        this.options.logger?.warn({
          event: 'semantic-mutation.replay-mismatch',
          intentId: args.intent.intentId,
          expectedBeforeFingerprint: persistedBeforeFingerprint,
          replayBeforeFingerprint: beforeFingerprint,
        }, 'Semantic replay mismatch detected')
        throw new Error(`Semantic replay drift detected for intent ${args.intent.intentId}.`)
      }

      const cached = this.replayEquivalentCache.get(replayCacheKey)
      if (cached) {
        this.options.observability?.incrementMetric('sovereign_mutation_replay_equivalent_total')
        const hydratedFromCache = await this.replayHydrationService.restoreCanonicalReplayResult<TResult>({
          semanticIntentId: args.intent.intentId,
          mutationLineageHash: replayEquivalent.mutation_lineage_hash,
          lineageHash: replayEquivalent.continuity_lineage_hash,
          replayFingerprint: replayEquivalent.replay_fingerprint,
          replayEquivalent: true,
          payloadCandidate: cached.result,
          candidateSource: 'cache',
          contract: args.canonicalReplayShape,
          shapeVerifier: args.canonicalShapeVerifier,
          hydrate: args.replayHydrateResult,
          reconstruct: args.replayReconstructResult
            ? (context) => args.replayReconstructResult!({
              intent: args.intent,
              effect: cached.effect,
              replayFingerprint: context.replayFingerprint,
              lineageHash: context.lineageHash,
              mutationLineageHash: context.mutationLineageHash,
            })
            : undefined,
          fallbackFactory: (context) => {
            if (args.replayFallbackResult) {
              return args.replayFallbackResult({
                intent: args.intent,
                replayFingerprint: context.replayFingerprint,
                lineageHash: context.lineageHash,
                mutationLineageHash: context.mutationLineageHash,
              })
            }
            return defaultReplayFallback<TResult>(cached.result)
          },
        })

        const replayedFromCache = {
          ...(cached as ExecutedSemanticMutation<TResult>),
          result: hydratedFromCache.payload,
        }
        if (args.intent.intentType === 'adaptive.evidence.append' && hydratedFromCache.replayResultState !== 'original') {
          this.options.observability?.incrementMetric('adaptive_evidence_hydration_total')
        }
        this.replayEquivalentCache.set(replayCacheKey, replayedFromCache as ExecutedSemanticMutation<unknown>)
        return replayedFromCache
      }

      const recovered: ExecutedSemanticMutation<TResult> = {
        result: (null as unknown as TResult),
        intent: args.intent,
        effect: {
          effectId: replayEquivalent.effect_id,
          intentId: replayEquivalent.intent_id,
          effectType: replayEquivalent.intent_type,
          domain: replayEquivalent.domain as SemanticMutationEffect['domain'],
          changedFields: [],
          institutionalMeaning: replayEquivalent.institutional_meaning,
          replayFingerprint: replayEquivalent.replay_fingerprint,
          continuityLineageHash: replayEquivalent.continuity_lineage_hash,
          mutationLineageHash: replayEquivalent.mutation_lineage_hash,
          beforeFingerprint: replayEquivalent.before_fingerprint ?? undefined,
          afterFingerprint: replayEquivalent.after_fingerprint ?? undefined,
          verified: true,
        },
        sovereignAttestation: {
          mutationId: args.intent.intentId,
          mutationType: args.intent.intentType,
          mutationScope: mapIntentDomainToMutationScope(args.intent),
          governanceDecision: 'allowed',
          runtimeMode: 'normal',
          continuityMode: 'institutional_safe',
          replayVerificationState: 'verified',
          attestationIntegrity: 'verified',
          traceId: args.intent.intentId,
          lineageHash: replayEquivalent.continuity_lineage_hash,
          executed: true,
          persisted: true,
        },
      }
      const hydratedRecovered = await this.replayHydrationService.restoreCanonicalReplayResult<TResult>({
        semanticIntentId: args.intent.intentId,
        mutationLineageHash: replayEquivalent.mutation_lineage_hash,
        lineageHash: replayEquivalent.continuity_lineage_hash,
        replayFingerprint: replayEquivalent.replay_fingerprint,
        replayEquivalent: true,
        payloadCandidate: recovered.result,
        candidateSource: 'persisted',
        contract: args.canonicalReplayShape,
        shapeVerifier: args.canonicalShapeVerifier,
        hydrate: args.replayHydrateResult,
        reconstruct: args.replayReconstructResult
          ? (context) => args.replayReconstructResult!({
            intent: args.intent,
            effect: recovered.effect,
            replayFingerprint: context.replayFingerprint,
            lineageHash: context.lineageHash,
            mutationLineageHash: context.mutationLineageHash,
          })
          : undefined,
        fallbackFactory: (context) => {
          if (args.replayFallbackResult) {
            return args.replayFallbackResult({
              intent: args.intent,
              replayFingerprint: context.replayFingerprint,
              lineageHash: context.lineageHash,
              mutationLineageHash: context.mutationLineageHash,
            })
          }
          return defaultReplayFallback<TResult>(recovered.result)
        },
      })

      const replayRestored: ExecutedSemanticMutation<TResult> = {
        ...recovered,
        result: hydratedRecovered.payload,
      }
      if (args.intent.intentType === 'adaptive.evidence.append' && hydratedRecovered.replayResultState !== 'original') {
        this.options.observability?.incrementMetric('adaptive_evidence_hydration_total')
      }
      this.replayEquivalentCache.set(replayCacheKey, replayRestored as ExecutedSemanticMutation<unknown>)
      this.options.observability?.incrementMetric('sovereign_mutation_replay_equivalent_total')
      this.options.logger?.info({
        event: 'semantic-mutation.replay-equivalent',
        intentId: args.intent.intentId,
        replayIntentFingerprint,
      }, 'Replay-equivalent semantic mutation detected')
      return replayRestored
    }

    let sovereignAttestation: SovereignMutationAttestation | null = null

    const persisted = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
      authoritySource: args.authoritySource,
      mutationId: args.intent.intentId,
      semanticIntentId: args.intent.intentId,
      replayFingerprint: replayIntentFingerprint,
      effectFingerprint: beforeFingerprint,
      context: {
        mutationType: args.intent.intentType,
        mutationScope: mapIntentDomainToMutationScope(args.intent),
        requestedCapability: mapIntentToCapability(args.intent),
        runtimeMode: 'normal',
        continuityMode: 'institutional_safe',
        replayVerificationState: 'verified',
        attestationIntegrity: 'verified',
        recoveryRequired: false,
        actor: args.intent.actor,
        traceId: args.intent.intentId,
      },
      onAttested: (attestation) => {
        sovereignAttestation = attestation
      },
      work: args.executePersistence,
    })

    if (!sovereignAttestation) {
      throw new Error(`Semantic mutation ${args.intent.intentId} executed without sovereign attestation.`)
    }

    const afterState = await args.captureAfterState?.(persisted)
    const effect = await args.deriveEffect({
      intent: args.intent,
      persisted,
      beforeState,
      afterState,
      sovereignAttestation,
    })
    const normalizedEffect = this.normalizeEffect(args.intent, effect, beforeState, afterState, sovereignAttestation)
    const verified = await (args.verifyEffect ?? defaultVerifyEffect)({
      intent: args.intent,
      effect: normalizedEffect,
      persisted,
      beforeState,
      afterState,
    })

    if (!verified) {
      this.options.observability?.incrementMetric('semantic_mutation_verification_failed_total')
      throw new Error(`Semantic mutation ${args.intent.intentId} failed effect verification.`)
    }

    normalizedEffect.verified = true
    await this.persistSemanticAttestation(args.intent, normalizedEffect)
    this.options.observability?.incrementMetric('semantic_mutation_attested_total')

    const executedResult = args.mapResult
      ? args.mapResult({ persisted, effect: normalizedEffect, sovereignAttestation })
      : (persisted as unknown as TResult)

    const canonicalExecutedResult = await this.replayHydrationService.restoreCanonicalReplayResult<TResult>({
      semanticIntentId: args.intent.intentId,
      mutationLineageHash: normalizedEffect.mutationLineageHash,
      lineageHash: normalizedEffect.continuityLineageHash,
      replayFingerprint: normalizedEffect.replayFingerprint,
      replayEquivalent: false,
      payloadCandidate: executedResult,
      candidateSource: 'execution',
      contract: args.canonicalReplayShape,
      shapeVerifier: args.canonicalShapeVerifier,
      hydrate: args.replayHydrateResult,
      reconstruct: args.replayReconstructResult
        ? (context) => args.replayReconstructResult!({
          intent: args.intent,
          effect: normalizedEffect,
          replayFingerprint: context.replayFingerprint,
          lineageHash: context.lineageHash,
          mutationLineageHash: context.mutationLineageHash,
        })
        : undefined,
      fallbackFactory: (context) => {
        if (args.replayFallbackResult) {
          return args.replayFallbackResult({
            intent: args.intent,
            replayFingerprint: context.replayFingerprint,
            lineageHash: context.lineageHash,
            mutationLineageHash: context.mutationLineageHash,
          })
        }
        return defaultReplayFallback<TResult>(executedResult)
      },
    })

    const executed = {
      result: canonicalExecutedResult.payload,
      intent: args.intent,
      effect: normalizedEffect,
      sovereignAttestation,
    }
    this.replayEquivalentCache.set(replayCacheKey, executed as ExecutedSemanticMutation<unknown>)
    return executed
  }

  async getStatus() {
    const graph = await buildSemanticMutationAuthorityGraph()
    const coverageRow = await this.options.db.get<{
      total: number
      replay_relevant_total: number
      verified_total: number
    }>(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN replay_relevant = 1 THEN 1 ELSE 0 END) AS replay_relevant_total,
          SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified_total
        FROM flowmind_semantic_mutation_attestation
      `,
    )

    const total = Number(coverageRow?.total ?? 0)
    const replayRelevantCoverage = total === 0
      ? 0
      : Number(((Number(coverageRow?.replay_relevant_total ?? 0) / total) * 100).toFixed(2))
    const verifiedEffectCoverage = total === 0
      ? 0
      : Number(((Number(coverageRow?.verified_total ?? 0) / total) * 100).toFixed(2))

    return {
      semanticSovereigntyState: graph.unsafeSemanticWriters.length === 0 ? 'governed' : 'partial',
      semanticCoverage: graph.semanticCoverage,
      unsafeSemanticWriters: graph.unsafeSemanticWriters,
      repositoryPassivityViolations: graph.repositoryPassivityViolations,
      replayRelevantCoverage,
      verifiedEffectCoverage,
      semanticMutationAuthorityGraph: graph.nodes,
    }
  }

  async getReplayHydrationStatus() {
    return this.replayHydrationService.getStatus()
  }

  private validateIntentShape(intent: SemanticMutationIntent) {
    if (!intent.intentId.trim() || !intent.intentType.trim() || !intent.semanticPurpose.trim()) {
      throw new Error('SemanticMutationIntent requires non-empty intentId, intentType, and semanticPurpose.')
    }
    if (intent.expectedInstitutionalEffect.length === 0) {
      throw new Error(`SemanticMutationIntent ${intent.intentId} requires at least one expected institutional effect.`)
    }
  }

  private normalizeEffect(
    intent: SemanticMutationIntent,
    effect: SemanticMutationEffect,
    beforeState: unknown,
    afterState: unknown,
    sovereignAttestation: SovereignMutationAttestation,
  ): SemanticMutationEffect {
    const beforeFingerprint = effect.beforeFingerprint ?? hashValue(beforeState ?? null)
    const afterFingerprint = effect.afterFingerprint ?? hashValue(afterState ?? null)
    const replayFingerprint = effect.replayFingerprint || hashValue({
      intentType: intent.intentType,
      semanticPurpose: intent.semanticPurpose,
      institutionalMeaning: effect.institutionalMeaning,
      changedFields: [...effect.changedFields].sort(),
      beforeFingerprint,
      afterFingerprint,
    })
    const mutationLineageHash = effect.mutationLineageHash || buildMutationLineageHash({
      intent,
      effectType: effect.effectType,
      institutionalMeaning: effect.institutionalMeaning,
      changedFields: effect.changedFields,
      beforeFingerprint,
      afterFingerprint,
      replayFingerprint,
    })

    return {
      ...effect,
      beforeFingerprint,
      afterFingerprint,
      replayFingerprint,
      continuityLineageHash: effect.continuityLineageHash || sovereignAttestation.lineageHash,
      mutationLineageHash,
      verified: effect.verified,
    }
  }

  private async persistSemanticAttestation(intent: SemanticMutationIntent, effect: SemanticMutationEffect) {
    const requestedAt = new Date().toISOString()
    const persist = async () => this.options.db.run(
      `
        INSERT INTO flowmind_semantic_mutation_attestation (
          intent_id,
          effect_id,
          domain,
          intent_type,
          semantic_purpose,
          institutional_meaning,
          risk_level,
          replay_relevant,
          continuity_relevant,
          auth_relevant,
          before_fingerprint,
          after_fingerprint,
          replay_fingerprint,
          continuity_lineage_hash,
          mutation_lineage_hash,
          verified,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      intent.intentId,
      effect.effectId,
      intent.domain,
      intent.intentType,
      intent.semanticPurpose,
      effect.institutionalMeaning,
      intent.riskLevel,
      intent.replayRelevant ? 1 : 0,
      intent.continuityRelevant ? 1 : 0,
      intent.authRelevant ? 1 : 0,
      effect.beforeFingerprint ?? null,
      effect.afterFingerprint ?? null,
      effect.replayFingerprint,
      effect.continuityLineageHash,
      effect.mutationLineageHash,
      effect.verified ? 1 : 0,
      intent.createdAt,
    )

    if (!this.options.persistenceCoordination) {
      await persist()
      return
    }

    await this.options.persistenceCoordination.executeCoordinatedOperation({
      context: {
        operationId: `semantic-attestation:${intent.intentId}:${requestedAt}`,
        persistenceDomain: 'semantic',
        mutationLineageHash: effect.mutationLineageHash,
        replayFingerprint: effect.replayFingerprint,
        continuityEpoch: undefined,
        executionPriority: intent.riskLevel === 'high' ? 'high' : 'normal',
        executionClass: intent.domain === 'replay' ? 'replay' : (intent.domain === 'auth' ? 'auth' : 'governance'),
        replayRelevant: intent.replayRelevant,
        continuityRelevant: intent.continuityRelevant,
        recoveryRelevant: false,
        actorId: intent.actor,
        requestedAt,
      },
      work: persist,
    })
  }
}

export function createSemanticMutationExecutor(options: SemanticMutationExecutorOptions) {
  return new SemanticMutationExecutor(options)
}

export function installSemanticMutationExecutor(executor: SemanticMutationExecutor) {
  installedExecutor = executor
}

export function getSemanticMutationExecutor() {
  if (!installedExecutor) {
    throw new Error('Semantic mutation executor is not installed.')
  }

  return installedExecutor
}

export function buildSemanticFingerprint(value: unknown) {
  return hashValue(value)
}

function defaultReplayFallback<T>(candidate: unknown): T {
  if (candidate === null || candidate === undefined) {
    return {} as T
  }

  if (Array.isArray(candidate)) {
    return [] as unknown as T
  }

  const verification = verifyCanonicalReplayShape(candidate, { allowNullPayload: true })
  if (verification.canonicalShapeVerified) {
    return candidate as T
  }

  return {} as T
}
