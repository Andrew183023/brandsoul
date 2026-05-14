import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import type { JobWorker } from '../jobs/index.js'
import { createAdaptiveHeatmapService } from '../learning/observability/adaptiveHeatmapService.js'
import { createAdaptiveTimelineDashboardService } from '../learning/observability/adaptiveTimelineDashboardService.js'
import { createLongitudinalStabilityScoreService } from '../learning/observability/longitudinalStabilityScoreService.js'
import { createReplayConsistencyGraphService } from '../learning/observability/replayConsistencyGraphService.js'
import type { MultiEntityRegistry } from '../orchestrator/multiEntityRegistry.js'
import type { FlowMindApprovalQueue } from '../orchestrator/approvalQueue.js'
import type { FlowMindCommandTransactionService } from '../orchestrator/flowMindCommandTransactionService.js'
import { createEntityEventLogRepository, type EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import type { ObservabilityService } from '../services/observabilityService.js'
import { buildServer } from '../server.js'
import { getInstitutionalSovereignMutationGate } from '../sovereignty/institutionalSovereignMutationGate.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    multiEntityRegistry: MultiEntityRegistry
    flowMindApprovalQueue: FlowMindApprovalQueue
    eventLogRepository: EntityEventLogRepository
    entityRepository: {
      createEntity(input: {
        id: string
        ownerId?: string
        ownerUserId?: number
        ownerTenantId?: number
        entityProfile: unknown
        createdAt?: string
        updatedAt?: string
      }): Promise<unknown>
      getEntityById(id: string): Promise<{ id: string, entityProfile: { metadata: { updatedAt?: string, createdAt?: string } } } | null>
    }
    entityCognitiveMemoryStore: {
      get(entityId: string): Promise<{ episodicMemory: { entries: Array<{ id: string }> } } | null>
    }
    flowMindExecutionLedgerRepository: {
      getByCommandId(commandId: string): Promise<{ status: string, errorCode?: string, errorMessage?: string } | null>
    }
    runtimeGovernance: {
      registerStartupFailure(args: {
        subsystem: string
        criticality: 'critical' | 'degraded-allowed' | 'optional'
        message: string
      }): { action: 'fail-startup' | 'enter-degraded-mode' | 'continue-optional' }
      registerStartupSuccess(subsystem: string): void
      getStatus(): {
        runtimeMode: 'normal' | 'degraded'
        degradedReason?: string
        blockedCapabilities: string[]
        hardReadinessFailure?: {
          subsystem: string
          criticality: 'critical' | 'degraded-allowed' | 'optional'
          message: string
          observedAt: string
        }
        subsystemMatrix: Array<{
          subsystem: string
          criticality: 'critical' | 'degraded-allowed' | 'optional'
          started: boolean
          healthy: boolean
          lastFailure?: {
            message: string
            observedAt: string
          }
        }>
        lastUpdatedAt: string
      }
    }
    institutionalContinuityGovernance: {
      registerPersistenceTruthfulnessFailure(args: {
        reason: string
        entityId?: string
        now?: string
      }): Promise<void>
      getStatus(): {
        continuityMode: string
        persistenceTruthfulness: string
        recoveryRequired: boolean
        degradedMemoryFallbackActive: boolean
        unsafeShutdownDetected: boolean
        replayContinuityState: string
        restartIntegrityState: string
        shutdownIntegrityState: string
        blockedCapabilities: string[]
      }
    }
    flowMindCommandTransactionService: FlowMindCommandTransactionService
    observability: ObservabilityService
    flowMindService?: {
      evaluateOrchestratorCommand(input: unknown): Promise<unknown>
    }
    sovereignMutationCommandService: {
      submitCommand(input: unknown): Promise<unknown>
    }
    jobWorker: JobWorker
    terminalFailureDetectionRuntime: {
      getStatus(): {
        started: boolean
        refreshIntervalMs?: number
        ready: boolean
        warming: boolean
        error: boolean
        lastRunAt: string | null
        lastError: string | null
      }
    }
    negativeOutcomeRepository: {
      appendNegativeOutcome(input: {
        outcomeType: 'proposal_rejected' | 'failed_execution' | 'opportunity_expired' | 'abandoned_execution' | 'no_response_timeout' | 'terminal_no_conversion'
        entityId: string
        marketSignalId: string
        opportunityId: string
        proposalId: string
        executionId: string
        category: string
        signalKeyword: string
        detectedAt: string
        reason: string
        metadata?: Record<string, unknown>
      }): Promise<{ outcomeId: string }>
    }
    negativeAttributionRuntime: {
      refresh(): Promise<unknown>
      getStatus(): {
        started: boolean
        refreshIntervalMs?: number
        ready: boolean
        warming: boolean
        error: boolean
        lastRunAt: string | null
        lastAttributedOutcomeId: string | null
        attributionCount: number
        lastError: string | null
      }
    }
    economicFeedbackRuntime: {
      refresh(): Promise<void>
      getStatus(): {
        runtimeName: string
        started: boolean
        refreshIntervalMs: number
        lastProcessedNegativeOutcomeWatermark: {
          attributionId: string
          attributedAt: string
        } | null
        lastDurableNegativeOutcomeWatermark: {
          attributionId: string
          attributedAt: string
        } | null
        negativeReplayLag: number
        negativeProcessedCount: number
        lastRefreshCompletedAt: string | null
        lastError: string | null
      }
    }
    adaptiveInfluenceGateRuntime: {
      getStatus(): {
        runtimeName: string
        started: boolean
        ready: boolean
        warming: boolean
        error: boolean
        advisoryOnly: true
        mutatesLiveRanking: false
        mutatesGovernance: false
        mutatesExecution: false
        lastRunAt: string | null
        lastError: string | null
        config: {
          enabled: boolean
          mode: 'off' | 'shadow_compare' | 'live_rank_only'
          rolloutPercentage: number
          killSwitchEnabled: boolean
        }
      }
      getSnapshot(): {
        config: {
          mode: 'off' | 'shadow_compare' | 'live_rank_only'
        }
        metadata: {
          influenceAppliedCount: number
        }
      }
    }
    replayIdentityOperationalFreezeStatus: {
      freezeStatus: 'frozen' | 'drift_detected' | 'override_active'
      currentManifestHash: string
      expectedManifestHash: string
      identityFields: string[]
      operationalCouplingFields: string[]
      prohibitedFields: string[]
      driftDetected: boolean
      driftWarnings: Array<{ code: string, message: string, fields?: string[] }>
      observationModeLocked: boolean
    }
    adaptiveEquilibriumEvidenceRepository: {
      appendEvidence(input: {
        replayConsistencyEquilibrium: number
        reinforcementEscalationPersistence: number
        saturationEquilibrium: number
        oscillationDamping: number
        projectionStabilityConvergence: number
        rankingDiversityPreservation: number
        entropyEvolution: number
        projectionLockInPersistence: number
        lowConfidenceAmplificationPersistence: number
        replayDegradationPersistence: number
      governanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE'
      recommendation: 'do_not_rollout'
      sustainedEquilibriumEvidence: boolean
      replayFingerprint: string
      generatedAt: string
      heatmapSnapshot?: Record<string, unknown> | null
      }): Promise<{ evidence: { evidenceId: string }, inserted: boolean }>
      listEvidencePaginated(args: { limit?: number, offset?: number }): Promise<Array<{
        evidenceId: string
        recommendation: 'do_not_rollout'
        governanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE'
      }>>
      listEvidenceChronological(args?: { limit?: number }): Promise<Array<{
        evidenceId: string
        replayConsistencyEquilibrium: number
        reinforcementEscalationPersistence: number
        saturationEquilibrium: number
        oscillationDamping: number
        projectionStabilityConvergence: number
        rankingDiversityPreservation: number
        entropyEvolution: number
        projectionLockInPersistence: number
        lowConfidenceAmplificationPersistence: number
        replayDegradationPersistence: number
        governanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE'
        recommendation: 'do_not_rollout'
        sustainedEquilibriumEvidence: boolean
        replayFingerprint: string
        generatedAt: string
        heatmapSnapshot?: Record<string, unknown> | null
      }>>
      countEvidence(): Promise<number>
    }
    adaptiveTimelineDashboardService: {
      buildDashboard(input?: { historyLimit?: number, rollingHours?: number[] }): Promise<{
        generatedAt: string
        payloadFingerprint: string
      }>
    }
    adaptiveHeatmapService: {
      buildHeatmaps(input?: { historyLimit?: number, hotspotLimit?: number }): Promise<{
        generatedAt: string
        payloadFingerprint: string
      }>
    }
    longitudinalStabilityScoreService: {
      buildStabilityScore(input?: { historyLimit?: number, rollingHours?: number[] }): Promise<{
        generatedAt: string
        payloadFingerprint: string
      }>
    }
    replayConsistencyGraphService: {
      buildReplayGraphs(input?: { historyLimit?: number, rollingHours?: number[], replayConsistencyBucketCount?: number }): Promise<{
        generatedAt: string
        payloadFingerprint: string
      }>
    }
    shadowProposalConfidenceRuntime: {
      getSnapshot(now?: Date): {
        runtime: {
          advisoryOnly: true
          mutatesLiveProposalConfidence: false
        }
      }
    }
  }
}

async function createAccessToken(args: {
  userId: number
  tenantId: number
  roles: string[]
  privateKeyPem: string
  kid: string
}) {
  const privateKey = await importPKCS8(args.privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(args.userId),
    tenant_id: String(args.tenantId),
    roles: args.roles,
    ver: 1,
    jti: `orchestrator-admin-${args.userId}-${args.tenantId}-${args.roles.join('-')}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer('brandsoul-auth-orchestrator-admin')
    .setAudience('brandsoul-api-orchestrator-admin')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-orchestrator-admin-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'orchestrator-admin-test-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    jwtSecret: process.env.JWT_SECRET,
    sqliteFile: process.env.SQLITE_FILE,
    assetStorageDir: process.env.ASSET_STORAGE_DIR,
    authIssuer: process.env.AUTH_ISSUER,
    authAudience: process.env.AUTH_AUDIENCE,
    authKid: process.env.AUTH_ACTIVE_KID,
    authPrivateKeyRef: process.env.AUTH_PRIVATE_KEY_REF,
    authPublicKeyPath: process.env.AUTH_PUBLIC_KEY_PATH,
  }

  process.env.JWT_SECRET = 'orchestrator-admin-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'orchestrator-admin.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-orchestrator-admin'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-orchestrator-admin'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()
  assert.doesNotThrow(() => getInstitutionalSovereignMutationGate())

  const authStore = (app.backendContext as AppWithContext['backendContext'] & {
    auth: {
      authIdentityStoreRepository: {
        createUser(input: {
          name: string
          email: string
          passwordHash: string
          isActive?: boolean
        }): Promise<{ id: number } | null>
        createTenant(input: {
          name: string
          slug: string
          businessModel: 'product' | 'service' | 'hybrid' | 'professional'
          plan?: string
          isActive?: boolean
        }): Promise<{ id: number } | null>
        createMembership(input: {
          userId: number
          tenantId: number
          role: string
          isActive?: boolean
        }): Promise<{ id: number; role: string } | null>
      }
    }
  }).auth.authIdentityStoreRepository

  const seededUser = await authStore.createUser({
    name: 'Orchestrator Admin Test User',
    email: 'orchestrator-admin-test@brandsoul.local',
    passwordHash: 'orchestrator-admin-test-password-hash',
    isActive: true,
  })
  assert.ok(seededUser)

  const seededTenant = await authStore.createTenant({
    name: 'Orchestrator Admin Test Tenant',
    slug: 'orchestrator-admin-test-tenant',
    businessModel: 'professional',
    plan: 'starter',
    isActive: true,
  })
  assert.ok(seededTenant)

  const seededMembership = await authStore.createMembership({
    userId: seededUser.id,
    tenantId: seededTenant.id,
    role: 'owner',
    isActive: true,
  })
  assert.ok(seededMembership)

  assert.equal(seededUser.id, 1)
  assert.equal(seededTenant.id, 1)

  return {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousEnv.jwtSecret === 'undefined') {
        delete process.env.JWT_SECRET
      } else {
        process.env.JWT_SECRET = previousEnv.jwtSecret
      }

      if (typeof previousEnv.sqliteFile === 'undefined') {
        delete process.env.SQLITE_FILE
      } else {
        process.env.SQLITE_FILE = previousEnv.sqliteFile
      }

      if (typeof previousEnv.assetStorageDir === 'undefined') {
        delete process.env.ASSET_STORAGE_DIR
      } else {
        process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      }

      if (typeof previousEnv.authIssuer === 'undefined') {
        delete process.env.AUTH_ISSUER
      } else {
        process.env.AUTH_ISSUER = previousEnv.authIssuer
      }

      if (typeof previousEnv.authAudience === 'undefined') {
        delete process.env.AUTH_AUDIENCE
      } else {
        process.env.AUTH_AUDIENCE = previousEnv.authAudience
      }

      if (typeof previousEnv.authKid === 'undefined') {
        delete process.env.AUTH_ACTIVE_KID
      } else {
        process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      }

      if (typeof previousEnv.authPrivateKeyRef === 'undefined') {
        delete process.env.AUTH_PRIVATE_KEY_REF
      } else {
        process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      }

      if (typeof previousEnv.authPublicKeyPath === 'undefined') {
        delete process.env.AUTH_PUBLIC_KEY_PATH
      } else {
        process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
      }
    },
  }
}

async function appendAdaptiveEvidence(
  app: AppWithContext,
  input: Parameters<AppWithContext['backendContext']['adaptiveEquilibriumEvidenceRepository']['appendEvidence']>[0],
) {
  const evidenceSeedId = `${input.replayFingerprint}:${input.generatedAt}`
  return sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#appendAdaptiveEvidence',
    mutationType: 'adaptive-evidence.seed.append',
    mutationScope: 'replay',
    requestedCapability: 'governance.replay.generate',
    actor: 'governance',
    traceId: `test-seed:adaptive-evidence:${evidenceSeedId}`,
    work: () => app.backendContext.adaptiveEquilibriumEvidenceRepository.appendEvidence(input),
  })
}

let sovereignSeedMutationSequence = 0

async function sovereignSeedMutation<T>(args: {
  authoritySource: string
  mutationType: string
  mutationScope: 'governance' | 'replay' | 'checkpoint' | 'queue' | 'auth' | 'runtime' | 'entity' | 'memory'
  requestedCapability: string
  actor: 'runtime' | 'governance' | 'admin' | 'public' | 'recovery'
  traceId: string
  work: () => Promise<T>
}) {
  const seedOrdinal = ++sovereignSeedMutationSequence
  const mutationId = `${args.traceId}:${String(seedOrdinal).padStart(4, '0')}`
  let attested = false

  const result = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
    authoritySource: args.authoritySource,
    mutationId,
    context: {
      mutationType: args.mutationType,
      mutationScope: args.mutationScope,
      requestedCapability: args.requestedCapability,
      runtimeMode: 'normal',
      continuityMode: 'institutional_safe',
      replayVerificationState: 'verified',
      attestationIntegrity: 'verified',
      recoveryRequired: false,
      actor: args.actor,
      traceId: args.traceId,
    },
    onAttested: (attestation) => {
      attested = true
      assert.equal(attestation.governanceDecision, 'allowed')
      assert.equal(attestation.executed, true)
      assert.equal(attestation.persisted, true)
      assert.equal(attestation.mutationScope, args.mutationScope)
    },
    work: args.work,
  })

  assert.equal(attested, true)
  return result
}

function cloneForAssertion<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getCustomObservabilityState(app: AppWithContext) {
  const snapshot = app.backendContext.observability.getMetricsSnapshot()
  return {
    customCounters: cloneForAssertion(snapshot.customCounters),
    customTimings: cloneForAssertion(snapshot.customTimings),
  }
}

function extractStableDashboardSection(kind: 'timeline' | 'governance' | 'replay' | 'heatmaps' | 'stability', payload: Record<string, any>) {
  switch (kind) {
    case 'timeline':
      return {
        status: payload.status,
        aggregationArchitecture: payload.aggregationArchitecture,
        compatibility: payload.compatibility,
        epistemicConfidence: payload.epistemicConfidence,
        timeline: payload.timeline,
        replaySafePayload: payload.replaySafePayload,
      }
    case 'governance':
      return {
        status: payload.status,
        compatibility: payload.compatibility,
        epistemicConfidence: payload.epistemicConfidence,
        reducers: payload.reducers,
        events: payload.events,
        pagination: payload.pagination,
        replaySafePayload: payload.replaySafePayload,
      }
    case 'replay':
      return {
        status: payload.status,
        aggregationArchitecture: payload.aggregationArchitecture,
        compatibility: payload.compatibility,
        epistemicConfidence: payload.epistemicConfidence,
        replayGraphs: payload.replayGraphs,
        replaySafePayload: payload.replaySafePayload,
      }
    case 'heatmaps':
      return {
        status: payload.status,
        aggregationArchitecture: payload.aggregationArchitecture,
        compatibility: payload.compatibility,
        concentrationScoring: payload.concentrationScoring,
        heatmaps: payload.heatmaps,
        hotspots: payload.hotspots,
        observability: payload.observability,
        replaySafePayload: payload.replaySafePayload,
      }
    case 'stability':
      return {
        status: payload.status,
        aggregationArchitecture: payload.aggregationArchitecture,
        compatibility: payload.compatibility,
        stabilityScoringArchitecture: payload.stabilityScoringArchitecture,
        currentScore: payload.currentScore,
        historicalScores: payload.historicalScores,
        rollingAverages: payload.rollingAverages,
        longitudinalEvolution: payload.longitudinalEvolution,
        replaySafePayload: payload.replaySafePayload,
      }
  }
}

function assertEpistemicConfidenceAliasEquivalence(
  left: Record<string, any>,
  right: Record<string, any>,
  options: {
    kind: 'timeline' | 'governance' | 'replay'
    expectedObservabilityWritesOnly: boolean
  },
) {
  // Keep request-time metadata (like generatedAt) out of equivalence checks.
  assert.deepEqual(left.epistemicConfidence, right.epistemicConfidence)
  assert.equal(left.replaySafePayload.payloadFingerprint, right.replaySafePayload.payloadFingerprint)
  assert.equal(left.operationalMetadata.observabilityWritesOnly, options.expectedObservabilityWritesOnly)
  assert.equal(right.operationalMetadata.observabilityWritesOnly, options.expectedObservabilityWritesOnly)
  assert.deepEqual(
    extractStableDashboardSection(options.kind, left),
    extractStableDashboardSection(options.kind, right),
  )
}

async function seedApproval(args: {
  app: AppWithContext
  approvalId: string
  entityId?: string
  actionType?: string
  status?: 'pending' | 'approved' | 'rejected' | 'expired'
  expiresAt?: string
}) {
  const now = '2026-05-03T10:30:00.000Z'
  await sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedApproval',
    mutationType: 'approval.seed',
    mutationScope: 'queue',
    requestedCapability: 'governance.approval',
    actor: 'governance',
    traceId: `test-seed:approval:${args.approvalId}`,
    work: async () => {
      await args.app.backendContext.flowMindApprovalQueue.enqueue({
        approvalId: args.approvalId,
        entityId: args.entityId ?? 'entity-rollback',
        proposalId: `${args.approvalId}-proposal`,
        actionType: args.actionType ?? 'create_entity',
        rationale: 'Review autonomous create_entity proposal.',
        payload: {
          proposal: {
            proposalId: `${args.approvalId}-proposal`,
            riskClassification: 'high',
          },
        },
        requestedAt: now,
        expiresAt: args.expiresAt,
      })

      if (args.status && args.status !== 'pending') {
        await args.app.backendContext.flowMindApprovalQueue.resolve({
          approvalId: args.approvalId,
          status: args.status,
          resolvedAt: '2026-05-03T10:35:00.000Z',
          resolvedBy: 'user:99',
        })
      }
    },
  })
}

async function seedNegativeOutcome(args: {
  app: AppWithContext
  input: Parameters<AppWithContext['backendContext']['negativeOutcomeRepository']['appendNegativeOutcome']>[0]
}) {
  const outcomeSeedId = `${args.input.proposalId}:${args.input.executionId}:${args.input.detectedAt}`

  return sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedNegativeOutcome',
    mutationType: 'negative-outcome.seed.append',
    mutationScope: 'runtime',
    requestedCapability: 'adaptive.runtime.mutation',
    actor: 'runtime',
    traceId: `test-seed:negative-outcome:${outcomeSeedId}`,
    work: () => args.app.backendContext.negativeOutcomeRepository.appendNegativeOutcome(args.input),
  })
}

async function seedRegistryData(registry: MultiEntityRegistry) {
  await sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedRegistryData:entity-rollback',
    mutationType: 'entity.seed.register',
    mutationScope: 'entity',
    requestedCapability: 'sovereign.mutation',
    actor: 'admin',
    traceId: 'test-seed:entity-register:entity-rollback',
    work: () => registry.registerEntity({
      entityId: 'entity-rollback',
      entityType: 'internal-sandbox',
      market: 'legal',
      lifecycleState: 'rollback',
      autonomyLevel: 'partial',
      riskLevel: 'high',
      memoryStatus: 'degraded',
      activeGoals: [{ type: 'create_entity', approvalRequired: true }],
      operatingConstraints: { isolation: 'strict' },
      healthScore: 0.32,
      leadGenerationScore: 0.11,
      memoryConfidence: 0.24,
      autonomyReadiness: 0.71,
      riskScore: 0.84,
      actionQueue: [{ type: 'create_entity_failed', executedAt: '2026-05-03T10:20:00.000Z' }],
      lastDecisionSnapshot: { reason: 'degraded-signal' },
      rollbackState: {
        active: true,
        reason: 'degraded-signal',
        since: '2026-05-03T10:15:00.000Z',
      },
      createdAt: '2026-05-03T10:00:00.000Z',
      updatedAt: '2026-05-03T10:20:00.000Z',
    }),
  })

  await sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedRegistryData:entity-sandbox',
    mutationType: 'entity.seed.register',
    mutationScope: 'entity',
    requestedCapability: 'sovereign.mutation',
    actor: 'admin',
    traceId: 'test-seed:entity-register:entity-sandbox',
    work: () => registry.registerEntity({
      entityId: 'entity-sandbox',
      entityType: 'internal-sandbox',
      market: 'legal',
      lifecycleState: 'sandbox',
      autonomyLevel: 'manual',
      riskLevel: 'low',
      memoryStatus: 'stable',
      activeGoals: [],
      operatingConstraints: {},
      healthScore: 0.61,
      leadGenerationScore: 0.45,
      memoryConfidence: 0.59,
      autonomyReadiness: 0.75,
      riskScore: 0.18,
      actionQueue: [{ type: 'observe', executedAt: '2026-05-03T10:21:00.000Z' }],
      lastDecisionSnapshot: { reason: 'stable' },
      rollbackState: { active: false },
      createdAt: '2026-05-03T10:01:00.000Z',
      updatedAt: '2026-05-03T10:21:00.000Z',
    }),
  })
}

async function seedOwnedOrchestratorEntity(app: AppWithContext, entityId = 'entity-command-route') {
  const entity = createTestEntity()
  entity.id = entityId
  entity.metadata.createdAt = '2026-05-03T11:00:00.000Z'
  entity.metadata.updatedAt = '2026-05-03T11:00:00.000Z'

  await sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedOwnedOrchestratorEntity:createEntity',
    mutationType: 'entity.seed.create',
    mutationScope: 'entity',
    requestedCapability: 'sovereign.mutation',
    actor: 'admin',
    traceId: `test-seed:entity-create:${entity.id}`,
    work: () => app.backendContext.entityRepository.createEntity({
      id: entity.id,
      ownerId: 'user:1:tenant:1',
      ownerUserId: 1,
      ownerTenantId: 1,
      entityProfile: entity,
      createdAt: entity.metadata.createdAt,
      updatedAt: entity.metadata.updatedAt,
    }),
  })

  await sovereignSeedMutation({
    authoritySource: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedOwnedOrchestratorEntity:registerEntity',
    mutationType: 'entity.seed.register',
    mutationScope: 'entity',
    requestedCapability: 'sovereign.mutation',
    actor: 'admin',
    traceId: `test-seed:entity-register:${entity.id}`,
    work: () => app.backendContext.multiEntityRegistry.registerEntity({
      entityId: entity.id,
      entityType: 'internal-sandbox',
      market: 'legal',
      lifecycleState: 'sandbox',
      autonomyLevel: 'partial',
      riskLevel: 'low',
      memoryStatus: 'stable',
      activeGoals: [],
      operatingConstraints: {},
      healthScore: 0.62,
      leadGenerationScore: 0.4,
      memoryConfidence: 0.58,
      autonomyReadiness: 0.69,
      riskScore: 0.21,
      actionQueue: [],
      rollbackState: { active: false },
      createdAt: entity.metadata.createdAt,
      updatedAt: entity.metadata.updatedAt,
    }),
  })

  return entity.id
}

test('approval admin endpoints reject unauthenticated access', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    for (const url of ['/admin/approvals', '/admin/approvals/approval-1', '/admin/approvals/approval-1/approve', '/admin/approvals/approval-1/reject']) {
      const response = await harness.app.inject({
        method: url.endsWith('/approve') || url.endsWith('/reject') ? 'POST' : 'GET',
        url,
      })

      assert.equal(response.statusCode, 401)
      assert.equal(response.json().error.code, 'AUTH_REQUIRED')
    }
  } finally {
    await harness.close()
  }
})

test('client account is forbidden from approval governance endpoints', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedRegistryData(harness.app.backendContext.multiEntityRegistry)
    await seedApproval({ app: harness.app, approvalId: 'approval-client-forbidden' })
    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/approvals',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 1,
          tenantId: 1,
          roles: ['client'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 401)
    assert.equal(response.json().error.code, 'invalid_token')
  } finally {
    await harness.close()
  }
})

test('admin can list approval items', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedRegistryData(harness.app.backendContext.multiEntityRegistry)
    await seedApproval({ app: harness.app, approvalId: 'approval-list-1' })
    await seedApproval({ app: harness.app, approvalId: 'approval-list-2', actionType: 'launch_campaign' })
    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/approvals',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 1,
          tenantId: 1,
          roles: ['owner'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(Array.isArray(body.approvals), true)
    assert.equal(body.approvals.length, 2)
    assert.equal(body.approvals[0].id, 'approval-list-2')
    assert.equal(body.approvals[0].riskLevel, 'high')
    assert.equal(body.approvals[0].status, 'pending')
  } finally {
    await harness.close()
  }
})

test('admin can approve approval items and write audit events', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-approve' })
    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-approve/approve',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 1,
          tenantId: 1,
          roles: ['owner'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(body.approval.id, 'approval-approve')
    assert.equal(body.approval.status, 'approved')
    assert.equal(body.approval.decidedByUserId, 1)
    const events = await harness.app.backendContext.eventLogRepository.getRecentEvents('entity-rollback', 10)
    assert.equal(events.some((event) => event.type === 'flowmind.approval.approved'), true)
  } finally {
    await harness.close()
  }
})

test('admin can reject approval items and write audit events', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-reject' })
    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-reject/reject',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 1,
          tenantId: 1,
          roles: ['owner'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().approval.status, 'rejected')
    const events = await harness.app.backendContext.eventLogRepository.getRecentEvents('entity-rollback', 10)
    assert.equal(events.some((event) => event.type === 'flowmind.approval.rejected'), true)
  } finally {
    await harness.close()
  }
})

test('double approve returns the same final state', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-idempotent' })
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const first = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-idempotent/approve',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    const second = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-idempotent/approve',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.equal(first.json().approval.status, 'approved')
    assert.equal(second.json().approval.status, 'approved')
    assert.equal(first.json().approval.decidedAt, second.json().approval.decidedAt)
  } finally {
    await harness.close()
  }
})

test('rejected approval cannot be approved later', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-rejected-later' })
    const rejectToken = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const rejected = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-rejected-later/reject',
      headers: {
        authorization: `Bearer ${rejectToken}`,
      },
    })
    const approvedLater = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-rejected-later/approve',
      headers: {
        authorization: `Bearer ${rejectToken}`,
      },
    })

    assert.equal(rejected.statusCode, 200)
    assert.equal(approvedLater.statusCode, 409)
    assert.equal(approvedLater.json().error.code, 'APPROVAL_TERMINAL_STATE_LOCKED')
    assert.equal(approvedLater.json().approval.status, 'rejected')
  } finally {
    await harness.close()
  }
})

test('admin approval command is blocked by centralized governance gate in degraded mode', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-governance-blocked' })
    harness.app.backendContext.runtimeGovernance.registerStartupFailure({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      message: 'synthetic degrade',
    })
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-governance-blocked/approve',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 503)
    const payload = response.json()
    assert.equal(payload.error.code, 'RUNTIME_GOVERNANCE_BLOCKED')
    assert.equal(payload.runtimeMode, 'degraded')
    assert.ok(Array.isArray(payload.blockedCapabilities))
    assert.equal(payload.governanceDecision.allowed, false)
  } finally {
    await harness.close()
  }
})

test('POST /orchestrator/:entityId/command executes through sovereign command and updates event, memory, and registry', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app)
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-route-1',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(body.command.commandId, 'orchestrator-command-route-1')
    assert.equal(body.event.causedByCommandId, 'orchestrator-command-route-1')

    const events = await harness.app.backendContext.eventLogRepository.getRecentEvents(entityId, 10)
    assert.equal(events.some((event) => event.causedByCommandId === 'orchestrator-command-route-1'), true)

    const memory = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    assert.notEqual(memory, null)

    const registryEntry = await harness.app.backendContext.multiEntityRegistry.getEntityById(entityId)
    assert.equal(registryEntry?.lastDecisionSnapshot?.commandId, 'orchestrator-command-route-1')
  } finally {
    await harness.close()
  }
})

test('POST /orchestrator/:entityId/command returns 503 with governance metadata when degraded mode blocks a high-risk command', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-governance-blocked')
    harness.app.backendContext.runtimeGovernance.registerStartupFailure({
      subsystem: 'adaptive-weight-snapshot-runtime',
      criticality: 'degraded-allowed',
      message: 'weights missing during startup',
    })
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-governance-blocked',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })

    assert.equal(response.statusCode, 503)
    const payload = response.json()
    assert.equal(payload.error.code, 'RUNTIME_GOVERNANCE_BLOCKED')
    assert.equal(payload.runtimeMode, 'degraded')
    assert.equal(typeof payload.degradedReason, 'string')
    assert.ok(payload.degradedReason.includes('adaptive-weight-snapshot-runtime'))
    assert.ok(Array.isArray(payload.blockedCapabilities))
    assert.ok(payload.blockedCapabilities.includes('orchestrator.command.execute'))
    assert.deepEqual(payload.governanceDecision, {
      capability: 'orchestrator.command.execute',
      allowed: false,
      reason: 'degraded-high-risk-blocked',
      riskLevel: 'high',
      evaluatedAt: payload.governanceDecision.evaluatedAt,
    })
  } finally {
    await harness.close()
  }
})

test('orchestrator command route does not call deprecated flowMindCommandTransactionService.execute directly', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-adapter')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const originalExecute = harness.app.backendContext.flowMindCommandTransactionService.execute.bind(harness.app.backendContext.flowMindCommandTransactionService)
    harness.app.backendContext.flowMindCommandTransactionService.execute = async () => {
      throw new Error('OLD_PATH_USED')
    }

    try {
      const response = await harness.app.inject({
        method: 'POST',
        url: `/orchestrator/${entityId}/command`,
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': 'orchestrator-command-route-2',
        },
        payload: {
          type: 'command',
          name: 'start_birth',
        },
      })

      assert.equal(response.statusCode, 200)
      assert.equal(response.json().status, 'ready')
    } finally {
      harness.app.backendContext.flowMindCommandTransactionService.execute = originalExecute
    }
  } finally {
    await harness.close()
  }
})

test('orchestrator command route is idempotent for the same command id', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-idempotent')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const first = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-route-idempotent',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })
    const eventCountAfterFirst = (await harness.app.backendContext.eventLogRepository.getRecentEvents(entityId, 20)).length

    const second = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-route-idempotent',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })
    const eventCountAfterSecond = (await harness.app.backendContext.eventLogRepository.getRecentEvents(entityId, 20)).length

    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.equal(first.json().idempotent ?? false, false)
    assert.equal(second.json().idempotent, true)
    assert.equal(eventCountAfterSecond, eventCountAfterFirst)
  } finally {
    await harness.close()
  }
})

test('orchestrator command route records ledger failure and does not claim success when FlowMind evaluation fails', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-failure')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    assert.ok(harness.app.backendContext.flowMindService)
    const originalEvaluate = harness.app.backendContext.flowMindService.evaluateOrchestratorCommand.bind(harness.app.backendContext.flowMindService)
    harness.app.backendContext.flowMindService.evaluateOrchestratorCommand = async () => {
      throw {
        statusCode: 500,
        code: 'FLOWMIND_INJECTED_FAILURE',
        message: 'Injected FlowMind failure.',
      }
    }

    try {
      const response = await harness.app.inject({
        method: 'POST',
        url: `/orchestrator/${entityId}/command`,
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': 'orchestrator-command-route-failure',
        },
        payload: {
          type: 'command',
          name: 'start_birth',
        },
      })

      assert.equal(response.statusCode, 500)
      assert.equal(response.json().status, 'failed')
      assert.equal(response.json().error.code, 'FLOWMIND_INJECTED_FAILURE')

      const ledger = await harness.app.backendContext.flowMindExecutionLedgerRepository.getByCommandId('orchestrator-command-route-failure')
      assert.equal(ledger?.status, 'failed')
      assert.equal(ledger?.errorCode, 'FLOWMIND_INJECTED_FAILURE')
    } finally {
      harness.app.backendContext.flowMindService.evaluateOrchestratorCommand = originalEvaluate
    }
  } finally {
    await harness.close()
  }
})

test('terminal failure runtime boots without changing live approvals and shadow runtime remains advisory-only', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const terminalStatus = harness.app.backendContext.terminalFailureDetectionRuntime.getStatus()
    assert.equal(typeof terminalStatus.started, 'boolean')
    assert.equal(terminalStatus.error, false)

    const negativeAttributionStatus = harness.app.backendContext.negativeAttributionRuntime.getStatus()
    assert.equal(typeof negativeAttributionStatus.started, 'boolean')
    assert.equal(negativeAttributionStatus.error, false)

    const adaptiveInfluenceStatus = harness.app.backendContext.adaptiveInfluenceGateRuntime.getStatus()
    assert.equal(typeof adaptiveInfluenceStatus.started, 'boolean')
    assert.equal(adaptiveInfluenceStatus.error, false)
    assert.equal(adaptiveInfluenceStatus.advisoryOnly, true)
    assert.equal(adaptiveInfluenceStatus.mutatesLiveRanking, false)
    assert.equal(adaptiveInfluenceStatus.mutatesGovernance, false)
    assert.equal(adaptiveInfluenceStatus.mutatesExecution, false)
    assert.equal(adaptiveInfluenceStatus.config.enabled, false)
    assert.equal(adaptiveInfluenceStatus.config.mode, 'off')
    assert.equal(adaptiveInfluenceStatus.config.rolloutPercentage, 0)
    assert.equal(adaptiveInfluenceStatus.config.killSwitchEnabled, false)

    const adaptiveInfluenceSnapshot = harness.app.backendContext.adaptiveInfluenceGateRuntime.getSnapshot()
    assert.equal(adaptiveInfluenceSnapshot.config.mode, 'off')
    assert.equal(adaptiveInfluenceSnapshot.metadata.influenceAppliedCount, 0)

    const shadowState = harness.app.backendContext.shadowProposalConfidenceRuntime.getSnapshot()
    assert.equal(shadowState.runtime.advisoryOnly, true)
    assert.equal(shadowState.runtime.mutatesLiveProposalConfidence, false)

    await seedApproval({
      app: harness.app,
      approvalId: 'approval-terminal-runtime-safe',
      actionType: 'create_entity',
      status: 'pending',
    })

    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const approvalsResponse = await harness.app.inject({
      method: 'GET',
      url: '/admin/approvals',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(approvalsResponse.statusCode, 200)
    const approvalsPayload = approvalsResponse.json()
    assert.equal(approvalsPayload.status, 'ready')
    assert.ok(Array.isArray(approvalsPayload.approvals))
    assert.ok(approvalsPayload.approvals.some((item: { id?: string }) => item.id === 'approval-terminal-runtime-safe'))
  } finally {
    await harness.close()
  }
})

test('replay identity freeze admin route exposes truthful operational freeze status', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/adaptive-governance/replay-identity-freeze',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json()
    const expectedStatus = harness.app.backendContext.replayIdentityOperationalFreezeStatus
    assert.equal(payload.freezeStatus, expectedStatus.freezeStatus)
    assert.equal(payload.currentManifestHash, expectedStatus.currentManifestHash)
    assert.equal(payload.expectedManifestHash, expectedStatus.expectedManifestHash)
    assert.deepEqual(payload.identityFields, expectedStatus.identityFields)
    assert.deepEqual(payload.operationalCouplingFields, expectedStatus.operationalCouplingFields)
    assert.deepEqual(payload.prohibitedFields, expectedStatus.prohibitedFields)
    assert.equal(payload.driftDetected, expectedStatus.driftDetected)
    assert.deepEqual(payload.driftWarnings, expectedStatus.driftWarnings)
    assert.equal(payload.observationModeLocked, expectedStatus.observationModeLocked)
  } finally {
    await harness.close()
  }
})

test('runtime governance status admin route returns the truthful runtime governance matrix', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    harness.app.backendContext.runtimeGovernance.registerStartupSuccess('market-signal-runtime')
    harness.app.backendContext.runtimeGovernance.registerStartupFailure({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      message: 'synthetic matrix degrade',
    })
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/runtime-governance/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json()
    const expectedStatus = harness.app.backendContext.runtimeGovernance.getStatus()
    assert.equal(payload.status, 'ready')
    assert.equal(payload.runtimeMode, expectedStatus.runtimeMode)
    assert.equal(payload.degradedReason, expectedStatus.degradedReason)
    assert.deepEqual(payload.blockedCapabilities, expectedStatus.blockedCapabilities)
    assert.deepEqual(payload.hardReadinessFailure, expectedStatus.hardReadinessFailure ?? null)
    assert.deepEqual(payload.subsystemMatrix, expectedStatus.subsystemMatrix)
    assert.equal(payload.lastUpdatedAt, expectedStatus.lastUpdatedAt)
    assert.deepEqual(payload.governanceDecision, {
      capability: 'admin.runtime-governance.status',
      allowed: true,
      reason: 'status-only',
      riskLevel: 'low',
      evaluatedAt: payload.governanceDecision.evaluatedAt,
    })
    assert.equal(
      payload.subsystemMatrix.some((entry: { subsystem: string, healthy: boolean }) => entry.subsystem === 'market-signal-runtime' && entry.healthy === true),
      true,
    )
    assert.equal(
      payload.subsystemMatrix.some((entry: { subsystem: string, healthy: boolean, lastFailure?: { message: string } }) => (
        entry.subsystem === 'negative-attribution-runtime'
        && entry.healthy === false
        && entry.lastFailure?.message === 'synthetic matrix degrade'
      )),
      true,
    )
  } finally {
    await harness.close()
  }
})

test('institutional continuity status admin route exposes continuity truthfulness state', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await harness.app.backendContext.institutionalContinuityGovernance.registerPersistenceTruthfulnessFailure({
      reason: 'synthetic continuity failure',
      entityId: 'entity-1',
      now: '2026-05-12T00:00:00.000Z',
    })

    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/institutional-continuity/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json()
    const expectedStatus = harness.app.backendContext.institutionalContinuityGovernance.getStatus()
    assert.equal(payload.status, 'ready')
    assert.equal(payload.continuityMode, expectedStatus.continuityMode)
    assert.equal(payload.persistenceTruthfulness, expectedStatus.persistenceTruthfulness)
    assert.equal(payload.recoveryRequired, expectedStatus.recoveryRequired)
    assert.equal(payload.degradedMemoryFallbackActive, expectedStatus.degradedMemoryFallbackActive)
    assert.equal(payload.unsafeShutdownDetected, expectedStatus.unsafeShutdownDetected)
    assert.equal(payload.replayContinuityState, expectedStatus.replayContinuityState)
    assert.equal(payload.restartIntegrityState, expectedStatus.restartIntegrityState)
    assert.equal(payload.shutdownIntegrityState, expectedStatus.shutdownIntegrityState)
    assert.deepEqual(payload.blockedCapabilities, expectedStatus.blockedCapabilities)
  } finally {
    await harness.close()
  }
})

test('replay and governance admin routes are blocked when institutional continuity is untrusted', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await harness.app.backendContext.institutionalContinuityGovernance.registerPersistenceTruthfulnessFailure({
      reason: 'synthetic continuity failure',
      entityId: 'entity-1',
      now: '2026-05-12T00:00:00.000Z',
    })
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const replayResponse = await harness.app.inject({
      method: 'GET',
      url: '/admin/adaptive-dashboard/replay-graphs?historyLimit=240&rollingHours=6,24,72&bucketCount=5',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    const governanceResponse = await harness.app.inject({
      method: 'GET',
      url: '/admin/adaptive-dashboard/governance-timeline?page=1&pageSize=10&historyLimit=240',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(replayResponse.statusCode, 503)
    assert.equal(replayResponse.json().error.code, 'INSTITUTIONAL_CONTINUITY_BLOCKED')
    assert.equal(governanceResponse.statusCode, 503)
    assert.equal(governanceResponse.json().error.code, 'INSTITUTIONAL_CONTINUITY_BLOCKED')
  } finally {
    await harness.close()
  }
})

test('negative learning status route exists and handles empty state', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/negative-learning/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json()
    assert.equal(payload.status, 'ready')
    assert.equal(payload.negativeOutcomeCount, 0)
    assert.equal(payload.negativeAttributionCount, 0)
    assert.equal(payload.negativeLedgerEventCount, 0)
    assert.equal(payload.negativeMemoryUpdateCount, null)
    assert.deepEqual(payload.countsByOutcomeType, {})
    assert.deepEqual(payload.countsBySeverity, {})
    assert.deepEqual(payload.countsByLineageQuality, {})
    assert.equal(payload.lastProcessedNegativeOutcomeWatermark, null)
    assert.equal(payload.lastDurableNegativeOutcomeWatermark, null)
    assert.equal(payload.feedbackRuntimeError, null)
    assert.equal(typeof payload.economicFeedbackRuntimeStatus.started, 'boolean')
    assert.equal(payload.operationalMetadata.advisoryOnly, true)
    assert.equal(typeof payload.terminalFailureRuntimeStatus.started, 'boolean')
    assert.equal(typeof payload.negativeAttributionRuntimeStatus.started, 'boolean')
  } finally {
    await harness.close()
  }
})

test('negative learning status route returns truthful counts without exposing raw metadata', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const rejectedProposal = await seedNegativeOutcome({
      app: harness.app,
      input: {
        outcomeType: 'proposal_rejected',
        entityId: 'entity-1',
        marketSignalId: 'signal-1',
        opportunityId: 'opportunity-1',
        proposalId: 'proposal-1',
        executionId: 'none',
        category: 'legal',
        signalKeyword: 'labor lawyer',
        detectedAt: '2026-05-08T10:00:00.000Z',
        reason: 'governance rejected',
        metadata: { secret: 'do-not-expose' },
      },
    })
    const expiredOpportunity = await seedNegativeOutcome({
      app: harness.app,
      input: {
        outcomeType: 'opportunity_expired',
        entityId: 'unassigned',
        marketSignalId: 'unknown-signal',
        opportunityId: 'unknown-opportunity',
        proposalId: 'none',
        executionId: 'none',
        category: 'general',
        signalKeyword: 'generic trend',
        detectedAt: '2026-05-08T10:01:00.000Z',
        reason: 'expired',
      },
    })

    await harness.app.backendContext.negativeAttributionRuntime.refresh()
    await harness.app.backendContext.economicFeedbackRuntime.refresh()

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/negative-learning/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json()
    assert.equal(payload.negativeOutcomeCount, 2)
    assert.equal(typeof payload.negativeAttributionCount, 'number')
    assert.equal(typeof payload.negativeLedgerEventCount, 'number')
    assert.equal(payload.negativeMemoryUpdateCount, null)
    assert.equal(payload.countsByOutcomeType.proposal_rejected, 1)
    assert.equal(payload.countsByOutcomeType.opportunity_expired, 1)
    assert.equal(payload.countsBySeverity.medium, 2)
    assert.equal(payload.countsByLineageQuality.complete, 1)
    assert.equal(payload.countsByLineageQuality.missing, 1)

    assert.equal(payload.negativeAttributionCount, 2)
    assert.equal(payload.negativeAttributionRuntimeStatus.lastAttributedOutcomeId, expiredOpportunity.outcomeId)

    assert.equal(payload.economicFeedbackRuntimeStatus.runtimeName, 'economic-feedback-runtime')

    if (payload.economicFeedbackRuntimeStatus.started) {
      assert.equal(payload.economicFeedbackRuntimeStatus.negativeProcessedCount, 2)
      assert.notEqual(payload.lastProcessedNegativeOutcomeWatermark, null)
      assert.notEqual(payload.lastDurableNegativeOutcomeWatermark, null)
    } else {
      assert.equal(payload.economicFeedbackRuntimeStatus.negativeProcessedCount, 0)
      assert.equal(payload.lastProcessedNegativeOutcomeWatermark, null)
      assert.equal(payload.lastDurableNegativeOutcomeWatermark, null)
    }

    assert.equal(payload.negativeReplayLag, 0)
    assert.equal(payload.feedbackRuntimeError, null)
    if (payload.economicFeedbackRuntimeStatus.started) {
      assert.ok(payload.feedbackRuntimeLastRunAt)
    } else {
      assert.equal(payload.feedbackRuntimeLastRunAt, null)
    }
    assert.ok(payload.lastRunAt)
    assert.equal(payload.lastError, null)
    assert.equal(payload.checkpoint.runtimeName, 'economic-feedback-runtime')
    assert.equal('metadata' in payload, false)
    assert.equal(JSON.stringify(payload).includes('do-not-expose'), false)
    assert.notEqual(rejectedProposal.outcomeId, null)
  } finally {
    await harness.close()
  }
})

test('negative learning status route reports runtime error state truthfully', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const originalFeedbackStatus = harness.app.backendContext.economicFeedbackRuntime.getStatus.bind(
      harness.app.backendContext.economicFeedbackRuntime,
    )
    const originalNegativeStatus = harness.app.backendContext.negativeAttributionRuntime.getStatus.bind(
      harness.app.backendContext.negativeAttributionRuntime,
    )
    harness.app.backendContext.economicFeedbackRuntime.getStatus = () => ({
      ...originalFeedbackStatus(),
      lastError: 'synthetic_feedback_runtime_error',
      lastRefreshCompletedAt: '2026-05-08T10:03:00.000Z',
    })
    harness.app.backendContext.negativeAttributionRuntime.getStatus = () => ({
      ...originalNegativeStatus(),
      ready: false,
      warming: false,
      error: true,
      lastError: 'synthetic_negative_runtime_error',
      lastRunAt: '2026-05-08T10:02:00.000Z',
      lastAttributedOutcomeId: null,
      attributionCount: 0,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/negative-learning/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json()
    assert.equal(payload.negativeAttributionRuntimeStatus.error, true)
    assert.equal(payload.lastError, 'synthetic_negative_runtime_error')
    assert.equal(payload.lastRunAt, '2026-05-08T10:02:00.000Z')
    assert.equal(payload.feedbackRuntimeError, 'synthetic_feedback_runtime_error')
    assert.equal(payload.feedbackRuntimeLastRunAt, '2026-05-08T10:03:00.000Z')
  } finally {
    await harness.close()
  }
})

test('adaptive influence observability endpoints reject unauthenticated access', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    for (const url of [
      '/admin/semantic-replay/status',
      '/admin/persistence-coordination/status',
      '/admin/adaptive-influence/status',
      '/admin/adaptive-influence/divergence',
      '/admin/adaptive-influence/projected-ranking',
      '/admin/adaptive-influence/evidence',
      '/admin/adaptive-influence/timeline',
      '/admin/adaptive-influence/heatmaps',
      '/admin/adaptive-influence/stability-score',
      '/admin/adaptive-influence/replay-graphs',
      '/admin/adaptive-influence/governance-timeline',
      '/admin/adaptive-dashboard/timeline',
      '/admin/adaptive-dashboard/governance-timeline',
      '/admin/adaptive-dashboard/replay-graphs',
      '/admin/adaptive-dashboard/heatmaps',
      '/admin/adaptive-dashboard/stability-score',
    ]) {
      const response = await harness.app.inject({
        method: 'GET',
        url,
      })

      assert.equal(response.statusCode, 401)
      assert.equal(response.json().error.code, 'AUTH_REQUIRED')
    }
  } finally {
    await harness.close()
  }
})

test('adaptive influence observability endpoints forbid client role', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['client'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    for (const url of [
      '/admin/semantic-replay/status',
      '/admin/persistence-coordination/status',
      '/admin/adaptive-influence/status',
      '/admin/adaptive-influence/divergence',
      '/admin/adaptive-influence/projected-ranking',
      '/admin/adaptive-influence/evidence',
      '/admin/adaptive-influence/timeline',
      '/admin/adaptive-influence/heatmaps',
      '/admin/adaptive-influence/stability-score',
      '/admin/adaptive-influence/replay-graphs',
      '/admin/adaptive-influence/governance-timeline',
      '/admin/adaptive-dashboard/timeline',
      '/admin/adaptive-dashboard/governance-timeline',
      '/admin/adaptive-dashboard/replay-graphs',
      '/admin/adaptive-dashboard/heatmaps',
      '/admin/adaptive-dashboard/stability-score',
    ]) {
      const response = await harness.app.inject({
        method: 'GET',
        url,
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      assert.equal(response.statusCode, 401)
      assert.equal(response.json().error.code, 'invalid_token')
    }
  } finally {
    await harness.close()
  }
})

test('adaptive influence observability endpoints expose truthful snapshot state without mutation', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const runtime = harness.app.backendContext.adaptiveInfluenceGateRuntime as unknown as {
      getStatus(): Record<string, unknown>
      getSnapshot(): Record<string, unknown>
    }
    const originalGetStatus = runtime.getStatus.bind(runtime)
    const originalGetSnapshot = runtime.getSnapshot.bind(runtime)

    runtime.getStatus = () => ({
      runtimeName: 'adaptive-influence-gate-runtime',
      started: true,
      ready: true,
      warming: false,
      error: false,
      advisoryOnly: true,
      mutatesLiveRanking: false,
      mutatesGovernance: false,
      mutatesExecution: false,
      lastRunAt: '2026-05-08T11:00:00.000Z',
      lastError: null,
      refreshIntervalMs: 60000,
      config: {
        enabled: true,
        mode: 'shadow_compare',
        rolloutPercentage: 40,
        killSwitchEnabled: false,
        boundedMin: 0.8,
        boundedMax: 1.2,
        minimumSampleRequirement: 5,
        allowedScopes: ['signal', 'entity'],
      },
      candidateCount: 2,
      influenceAppliedCount: 0,
      rolloutEligibleCount: 1,
      blockedCount: 2,
      divergenceCount: 1,
      rankShiftCount: 1,
      topRankChanged: false,
    })
    runtime.getSnapshot = () => ({
      status: 'ready',
      generatedAt: '2026-05-08T11:00:00.000Z',
      config: {
        enabled: true,
        mode: 'shadow_compare',
        rolloutPercentage: 40,
        killSwitchEnabled: false,
        boundedMin: 0.8,
        boundedMax: 1.2,
        minimumSampleRequirement: 5,
        allowedScopes: ['signal', 'entity'],
      },
      influences: [
        {
          opportunityId: 'op-1',
          marketSignalId: 'signal-1',
          entityId: 'entity-1',
          baseRank: 1,
          projectedRank: 2,
          baseScore: 84,
          finalProjectedScore: 75.6,
          adaptiveMultiplier: 0.9,
          influenceApplied: false,
          rolloutEligible: true,
          blockedReason: 'eligible_shadow_projection',
          rolloutBucket: 27,
          sampleThresholdSatisfied: true,
          projectionMode: 'shadow_compare',
          weightSources: {
            signal: 'weight-signal-1',
            category: null,
            entity: 'weight-entity-1',
          },
          memoryIds: {
            signal: 'memory-signal-1',
            category: null,
            entity: 'memory-entity-1',
          },
          evidence: {
            signal: { confidenceLevel: 'low' },
            category: null,
            entity: { confidenceLevel: 'high' },
          },
          evidenceScopes: ['signal', 'entity'],
          sampleCounts: {
            signal: 5,
            category: null,
            entity: 12,
          },
          replayFingerprint: 'adaptive-influence:aaaa1111bbbb2222cccc3333',
        },
        {
          opportunityId: 'op-2',
          marketSignalId: 'signal-2',
          entityId: null,
          baseRank: 2,
          projectedRank: 1,
          baseScore: 80,
          finalProjectedScore: 88,
          adaptiveMultiplier: 1.1,
          influenceApplied: false,
          rolloutEligible: false,
          blockedReason: 'below_rollout_threshold',
          rolloutBucket: 74,
          sampleThresholdSatisfied: true,
          projectionMode: 'shadow_compare',
          weightSources: {
            signal: 'weight-signal-2',
            category: null,
            entity: null,
          },
          memoryIds: {
            signal: 'memory-signal-2',
            category: null,
            entity: null,
          },
          evidence: {
            signal: { confidenceLevel: 'medium' },
            category: null,
            entity: null,
          },
          evidenceScopes: ['signal'],
          sampleCounts: {
            signal: 8,
            category: null,
            entity: null,
          },
          replayFingerprint: 'adaptive-influence:dddd4444eeee5555ffff6666',
        },
      ],
      metadata: {
        influenceAppliedCount: 0,
        averageRankDelta: 1,
        maxAbsRankDelta: 1,
        divergenceCount: 1,
        audit: {
          rankDrift: {
            averageAbsRankDelta: 1,
            maxAbsRankDelta: 1,
            divergenceRatio: 0.5,
          },
          categoryDominance: {
            topProjectedCategory: 'legal',
            topProjectedCategoryShare: 1,
            top3CategoryConcentration: 1,
          },
          entityDominance: {
            topProjectedEntityId: 'entity-1',
            topProjectedEntityShare: 0.5,
            top3EntityConcentration: 0.5,
          },
          repeatedTopRankPersistence: {
            topOpportunityId: 'op-1',
            consecutiveRefreshes: 3,
          },
          oscillation: {
            oscillationFrequency: 0.25,
            oscillatingOpportunityCount: 1,
            comparableOpportunityCount: 4,
          },
          multiplierSaturation: {
            saturationRatio: 0,
            minBoundHitRatio: 0,
            maxBoundHitRatio: 0,
          },
          suppression: {
            suppressedProjectionRatio: 1,
            suppressedCount: 2,
            candidateCount: 2,
          },
          lowSampleInstability: {
            lowSampleInstabilityRatio: 0,
            lowSampleCount: 0,
            unstableLowSampleCount: 0,
          },
          lowConfidenceAmplification: {
            lowConfidenceProjectionRatio: 0.5,
            amplifiedLowConfidenceCount: 1,
            lowConfidenceProjectionCount: 2,
          },
          replayConsistency: {
            equivalentFingerprintRatio: 1,
            equivalentFingerprintCount: 2,
            comparableFingerprintCount: 2,
          },
          projectionVolatility: {
            averageProjectedRankChange: 0,
            maxProjectedRankChange: 0,
          },
          driftDetection: {
            thresholds: {
              runawayMultipliers: { warning: 0.4, critical: 0.6 },
              categoryOverConcentration: { warning: 0.8, critical: 0.95 },
              entityReinforcementLoop: { warning: 0.65, critical: 0.85 },
              projectionInstability: { warning: 0.3, critical: 0.5 },
              replayDivergence: { warning: 0.05, critical: 0.2 },
              rankingVolatility: { warning: 0.5, critical: 0.8 },
              repetitiveRankFlipping: { warning: 0.4, critical: 0.7 },
              lowConfidenceAmplification: { warning: 0.35, critical: 0.6 },
            },
            warningSummary: {
              activeCount: 1,
              warningCount: 1,
              criticalCount: 0,
            },
            warnings: [
              {
                id: 'adaptive-drift:abcd1234abcd1234abcd1234',
                code: 'low_confidence_amplification',
                severity: 'warning',
                status: 'active',
                message: 'Low-confidence signals are being amplified in projected outcomes.',
                observedValue: 0.5,
                warningThreshold: 0.35,
                criticalThreshold: 0.6,
                context: {
                  amplifiedLowConfidenceCount: 1,
                  lowConfidenceProjectionCount: 2,
                },
              },
            ],
          },
          reinforcementLoopDetection: {
            thresholds: {
              repeatedEntityDominance: { warning: 0.55, critical: 0.75 },
              repeatedCategoryDominance: { warning: 0.6, critical: 0.8 },
              selfReinforcingTopRankPersistence: { warning: 0.5, critical: 0.75 },
              multiplierCompoundingBehavior: { warning: 0.4, critical: 0.65 },
              adaptiveSaturationLoop: { warning: 0.45, critical: 0.7 },
              projectionLockIn: { warning: 0.6, critical: 0.8 },
              lowDiversityRankingCycle: { warning: 0.55, critical: 0.8 },
            },
            warningSummary: {
              activeCount: 2,
              warningCount: 2,
              criticalCount: 0,
            },
            loopMetrics: {
              repeatedEntityDominance: 0.7,
              repeatedCategoryDominance: 1,
              selfReinforcingTopRankPersistence: 0.57,
              multiplierCompoundingBehavior: 0.5,
              adaptiveSaturationLoop: 0,
              projectionLockIn: 0.7,
              lowDiversityRankingCycle: 0.775,
            },
            persistence: {
              entityDominanceConsecutive: 3,
              categoryDominanceConsecutive: 3,
              topRankConsecutive: 3,
              saturationConsecutive: 0,
            },
            replaySafeDiagnostics: {
              currentTopReplayFingerprint: 'adaptive-influence:aaaa1111bbbb2222cccc3333',
              previousTopReplayFingerprint: 'adaptive-influence:aaaa1111bbbb2222cccc3333',
              topReplayFingerprintStable: true,
              comparableFingerprintCount: 2,
              equivalentFingerprintCount: 2,
              equivalentFingerprintRatio: 1,
              comparableMultiplierCount: 2,
            },
            warnings: [
              {
                id: 'adaptive-loop:111122223333444455556666',
                code: 'repeated_entity_dominance',
                severity: 'warning',
                status: 'active',
                message: 'Projected rankings are repeatedly dominated by the same entity.',
                observedValue: 0.7,
                warningThreshold: 0.55,
                criticalThreshold: 0.75,
                context: {
                  topProjectedEntityId: 'entity-1',
                  entityDominanceConsecutive: 3,
                },
              },
              {
                id: 'adaptive-loop:777788889999aaaabbbbcccc',
                code: 'projection_lock_in',
                severity: 'warning',
                status: 'active',
                message: 'Projected ordering is exhibiting lock-in behavior.',
                observedValue: 0.7,
                warningThreshold: 0.6,
                criticalThreshold: 0.8,
                context: {
                  topRankConsecutive: 3,
                  rankingConvergenceRatio: 0.5,
                },
              },
            ],
          },
          historicalReplaySimulation: {
            engine: {
              simulationOnly: true,
              mutatesAdaptivePersistence: false,
              mutatesGovernance: false,
              mutatesExecution: false,
              replayTimelineRetentionLimit: 120,
            },
            replayTimeline: {
              totalReplayedSnapshots: 3,
              startedAt: '2026-05-08T10:00:00.000Z',
              endedAt: '2026-05-08T11:00:00.000Z',
              points: [
                {
                  generatedAt: '2026-05-08T10:00:00.000Z',
                  historicalRankingReplay: 1,
                  adaptiveProjectionReplay: 0.975,
                  divergenceRatio: 0,
                  driftWarningRatio: 0,
                  replayConsistencyRatio: 1,
                  saturationRatio: 0,
                  oscillationFrequency: 0,
                  reinforcementLoopIntensity: 1,
                  projectionStabilityScore: 0.965,
                },
                {
                  generatedAt: '2026-05-08T10:30:00.000Z',
                  historicalRankingReplay: 0.5,
                  adaptiveProjectionReplay: 0.965,
                  divergenceRatio: 0.5,
                  driftWarningRatio: 0.5,
                  replayConsistencyRatio: 1,
                  saturationRatio: 0,
                  oscillationFrequency: 0.25,
                  reinforcementLoopIntensity: 1,
                  projectionStabilityScore: 0.876,
                },
                {
                  generatedAt: '2026-05-08T11:00:00.000Z',
                  historicalRankingReplay: 0.5,
                  adaptiveProjectionReplay: 0.96,
                  divergenceRatio: 0.5,
                  driftWarningRatio: 0.5,
                  replayConsistencyRatio: 1,
                  saturationRatio: 0,
                  oscillationFrequency: 0.25,
                  reinforcementLoopIntensity: 1,
                  projectionStabilityScore: 0.869,
                },
              ],
            },
            historicalDriftAnalysis: {
              driftAccumulationScore: 0.333333,
              peakDriftWarningRatio: 0.5,
              activeDriftSnapshots: 2,
            },
            projectionStabilityAnalysis: {
              averageStabilityScore: 0.903333,
              minimumStabilityScore: 0.869,
              stabilityDegradation: 0.096,
            },
            replayDegradationMetrics: {
              averageReplayConsistency: 1,
              minimumReplayConsistency: 1,
              replayConsistencyDegradation: 0,
              degradedReplaySnapshots: 0,
            },
            divergenceEvolution: {
              averageDivergenceRatio: 0.333333,
              peakDivergenceRatio: 0.5,
              divergenceTrend: {
                current: 0.5,
                shortWindowAverage: 0.333333,
                mediumWindowAverage: 0.333333,
                longWindowAverage: 0.333333,
                shortDelta: 0.166667,
                longDelta: 0.166667,
                direction: 'degrading',
              },
            },
            saturationEvolution: {
              averageSaturationRatio: 0,
              peakSaturationRatio: 0,
              saturationTrend: {
                current: 0,
                shortWindowAverage: 0,
                mediumWindowAverage: 0,
                longWindowAverage: 0,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
            },
            oscillationPersistence: {
              averageOscillationFrequency: 0.166667,
              peakOscillationFrequency: 0.25,
              oscillationTrend: {
                current: 0.25,
                shortWindowAverage: 0.166667,
                mediumWindowAverage: 0.166667,
                longWindowAverage: 0.166667,
                shortDelta: 0.083333,
                longDelta: 0.083333,
                direction: 'degrading',
              },
            },
            reinforcementLoops: {
              averageLoopIntensity: 1,
              peakLoopIntensity: 1,
              lowDiversityCycleRatio: 1,
              loopTrend: {
                current: 1,
                shortWindowAverage: 1,
                mediumWindowAverage: 1,
                longWindowAverage: 1,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
            },
            stressSimulation: {
              engine: {
                simulationOnly: true,
                noMutation: true,
                autoCorrection: false,
                governanceInfluence: false,
                stressHistorySize: 90,
                syntheticGapInjectionInterval: 12,
              },
              replayInstabilityThresholds: {
                replayConsistencyWarning: 0.92,
                replayConsistencyCritical: 0.8,
                collapseWarning: 0.45,
                collapseCritical: 0.65,
                oscillationAmplificationWarning: 0.25,
                oscillationAmplificationCritical: 0.45,
                saturationPersistenceWarning: 0.3,
                saturationPersistenceCritical: 0.5,
                reinforcementEscalationWarning: 0.35,
                reinforcementEscalationCritical: 0.55,
              },
              degradationMetrics: {
                stressReplayConsistencyAverage: 0.88,
                stressReplayConsistencyMinimum: 0.76,
                fingerprintDivergenceRatio: 0.31,
                snapshotGapRatio: 0.08,
                oscillationAmplificationRatio: 0.29,
                saturationPersistenceRatio: 0.22,
                rankingInstabilityAccumulation: 0.34,
                reinforcementLoopEscalationRatio: 0.46,
              },
              replayCollapseDetection: {
                collapseScore: 0.57,
                collapseStatus: 'warning',
                collapseDetected: true,
                collapseSignals: [
                  'degraded_replay_consistency',
                  'snapshot_gaps',
                  'fingerprint_divergence',
                ],
              },
              replayRiskDiagnostics: {
                riskScore: 0.63,
                riskClassification: 'caution',
                dominantRiskSignals: [
                  'degraded_replay_consistency',
                  'snapshot_gaps',
                  'fingerprint_divergence',
                ],
              },
            },
            rootCauseAnalysis: {
              rootCauseGraph: {
                nodes: [
                  { id: 'replay_degradation', label: 'Replay Degradation', severity: 'MEDIUM' },
                  { id: 'replay_collapse', label: 'Replay Collapse Risk', severity: 'HIGH' },
                  { id: 'unsafe_rollout', label: 'UNSAFE Live Rollout Classification', severity: 'HIGH' },
                ],
                edges: [
                  { from: 'replay_degradation', to: 'replay_collapse', weight: 0.35 },
                  { from: 'replay_collapse', to: 'unsafe_rollout', weight: 0.5 },
                ],
              },
              instabilityContributionModel: [
                {
                  factor: 'replay_degradation_causes',
                  contribution: 0.12,
                  severity: 'LOW',
                  evidenceMetric: 0.88,
                },
                {
                  factor: 'saturation_persistence_causes',
                  contribution: 0.22,
                  severity: 'LOW',
                  evidenceMetric: 0.22,
                },
                {
                  factor: 'reinforcement_escalation_causes',
                  contribution: 0.46,
                  severity: 'MEDIUM',
                  evidenceMetric: 0.46,
                },
                {
                  factor: 'oscillation_amplification_causes',
                  contribution: 0.29,
                  severity: 'LOW',
                  evidenceMetric: 0.29,
                },
                {
                  factor: 'ranking_instability_accumulation',
                  contribution: 0.34,
                  severity: 'MEDIUM',
                  evidenceMetric: 0.34,
                },
                {
                  factor: 'low_confidence_amplification',
                  contribution: 0.5,
                  severity: 'MEDIUM',
                  evidenceMetric: 0.5,
                },
                {
                  factor: 'projection_lock_in',
                  contribution: 1,
                  severity: 'CRITICAL',
                  evidenceMetric: 1,
                },
                {
                  factor: 'category_dominance_persistence',
                  contribution: 1,
                  severity: 'CRITICAL',
                  evidenceMetric: 1,
                },
                {
                  factor: 'entity_dominance_persistence',
                  contribution: 0.5,
                  severity: 'MEDIUM',
                  evidenceMetric: 0.5,
                },
                {
                  factor: 'replay_collapse_contributors',
                  contribution: 0.57,
                  severity: 'HIGH',
                  evidenceMetric: 0.57,
                },
              ],
              dominantInstabilityFactors: [
                'projection_lock_in',
                'category_dominance_persistence',
                'replay_collapse_contributors',
                'entity_dominance_persistence',
              ],
              replayCollapseContributors: [
                { factor: 'replay_degradation_causes', severity: 'LOW', contribution: 0.12 },
                { factor: 'replay_collapse_contributors', severity: 'HIGH', contribution: 0.57 },
              ],
              saturationContributors: [
                { factor: 'saturation_persistence_causes', severity: 'LOW', contribution: 0.22 },
                { factor: 'low_confidence_amplification', severity: 'MEDIUM', contribution: 0.5 },
              ],
              reinforcementEscalationContributors: [
                { factor: 'reinforcement_escalation_causes', severity: 'MEDIUM', contribution: 0.46 },
                { factor: 'projection_lock_in', severity: 'CRITICAL', contribution: 1 },
              ],
              stabilityBlockers: [
                'replay_collapse_risk',
                'oscillation_amplification',
                'reinforcement_escalation',
                'low_confidence_amplification',
                'category_dominance_persistence',
              ],
              governanceRiskSummary: {
                overallSeverity: 'HIGH',
                rolloutRecommendation: 'do_not_rollout',
                explanation: 'Instability causes remain active across replay degradation, collapse risk, reinforcement escalation, and ranking instability accumulation; rollout is blocked pending deeper causal control evidence.',
              },
            },
            decayHysteresisResearch: {
              decaySimulationModel: {
                simulationOnly: true,
                gradualDecayRate: 0.015,
                delayedReinforcementResponseSteps: 3,
                saturationCoolingFactor: 0.65,
              },
              hysteresisSimulationModel: {
                simulationOnly: true,
                hysteresisWindow: 0.08,
                entryThreshold: 0.62,
                exitThreshold: 0.54,
                delayedResponseSteps: 3,
              },
              replayImpactAnalysis: {
                baselineReplayConsistency: 0.88,
                projectedReplayConsistencyWithDecay: 0.9,
                replayConsistencyDelta: 0.02,
              },
              saturationImpactAnalysis: {
                baselineSaturationPersistence: 0.22,
                projectedSaturationPersistenceWithCooling: 0.16995,
                saturationDelta: -0.05005,
              },
              oscillationImpactAnalysis: {
                baselineOscillationAmplification: 0.29,
                projectedOscillationWithHysteresis: 0.307,
                oscillationDelta: 0.017,
              },
              equilibriumAnalysis: {
                baselineEquilibriumScore: 0.66,
                projectedEquilibriumScore: 0.652337,
                equilibriumDelta: -0.007663,
                rankStabilizationEffect: 0,
              },
              governanceRiskAssessment: {
                residualRiskScore: 0.5185,
                confidencePenalty: 0.2,
                notes: [
                  'Decay simulation suggests marginal replay consistency improvement.',
                  'Saturation cooling reduces persistence in simulation.',
                  'Hysteresis window may amplify oscillation under current parameters.',
                  'Results are simulation-only and cannot justify rollout without longitudinal staging validation.',
                ],
                classification: 'CAUTION',
              },
              rolloutRecommendation: {
                classification: 'CAUTION',
                recommendation: 'do_not_rollout',
                rationale: 'Simulation-only decay/hysteresis research does not provide longitudinal stability evidence required for rollout authorization.',
              },
            },
            equilibriumLongitudinalStudy: {
              longitudinalModel: {
                simulationOnly: true,
                noMutation: true,
                noRollout: true,
                noAdaptiveCorrection: true,
                boundedAdaptiveBehavior: true,
                observationWindows: {
                  short: 5,
                  medium: 15,
                  long: 30,
                },
                trackedDimensions: [
                  'replay_consistency_equilibrium',
                  'reinforcement_escalation_persistence',
                  'saturation_equilibrium',
                  'oscillation_damping',
                  'projection_stability_convergence',
                  'ranking_diversity_preservation',
                  'entropy_evolution',
                  'projection_lock_in_persistence',
                  'low_confidence_amplification_persistence',
                  'replay_degradation_persistence',
                ],
                studyOverTime: {
                  replayConsistencyEquilibrium: 1,
                  reinforcementEscalationPersistence: 1,
                  saturationEquilibrium: 1,
                  oscillationDamping: 0.833333,
                  projectionStabilityConvergence: 0.6775,
                  rankingDiversityPreservation: 0,
                  entropyEvolution: 0,
                  projectionLockInPersistence: 1,
                  lowConfidenceAmplificationPersistence: 0.333333,
                  replayDegradationPersistence: 0,
                },
              },
              stabilityConvergenceMetrics: {
                projectionStabilityConvergence: 0.6775,
                replayConsistencyEquilibrium: 1,
                oscillationDamping: 0.833333,
                equilibriumConfidence: 0.777041,
              },
              saturationEquilibriumMetrics: {
                saturationEquilibriumScore: 1,
                saturationPersistence: 0,
                saturationDrift: 0,
              },
              reinforcementPersistenceMetrics: {
                reinforcementEscalationPersistence: 1,
                projectionLockInPersistence: 1,
                lowConfidenceAmplificationPersistence: 0.333333,
              },
              entropyEvolutionAnalysis: {
                baselineEntropy: 0,
                currentEntropy: 0,
                entropyDelta: 0,
                entropyTrend: 'stable',
              },
              rankingDiversityAnalysis: {
                baselineDiversity: 0,
                currentDiversity: 0,
                diversityPreservationRatio: 0,
                diversityLossRisk: 'high',
              },
              replayEquilibriumAnalysis: {
                replayDegradationPersistence: 0,
                replayConsistencyEquilibrium: 1,
                equilibriumBreachCount: 0,
              },
              governanceRecommendation: {
                classification: 'CAUTION',
                recommendation: 'do_not_rollout',
                sustainedEquilibriumEvidence: false,
                rationale: 'Do not recommend rollout: sustained equilibrium evidence is not yet established across replay, reinforcement, saturation, oscillation, diversity, and entropy dimensions.',
              },
            },
          },
          longDurationValidation: {
            architecture: {
              observationOnly: true,
              automaticCorrection: false,
              adaptiveMutation: false,
              autoDisable: false,
              rollingWindows: {
                short: 5,
                medium: 15,
                long: 30,
              },
              historyRetentionLimit: 120,
            },
            snapshotHistory: {
              retainedSnapshots: 3,
              oldestGeneratedAt: '2026-05-08T10:00:00.000Z',
              latestGeneratedAt: '2026-05-08T11:00:00.000Z',
              history: [
                {
                  generatedAt: '2026-05-08T10:00:00.000Z',
                  driftActiveWarnings: 0,
                  driftCriticalWarnings: 0,
                  driftWarningRatio: 0,
                  divergenceRatio: 0,
                  rankingConvergenceRatio: 1,
                  replayEquivalentRatio: 1,
                  categoryTopShare: 1,
                  entityTopShare: 0.5,
                  oscillationFrequency: 0,
                  saturationRatio: 0,
                  lowConfidenceAmplificationRatio: 0,
                  suppressionRatio: 1,
                  stabilityScore: 0.95,
                  topProjectedCategory: 'legal',
                  topProjectedEntityId: 'entity-1',
                },
                {
                  generatedAt: '2026-05-08T10:30:00.000Z',
                  driftActiveWarnings: 1,
                  driftCriticalWarnings: 0,
                  driftWarningRatio: 0.5,
                  divergenceRatio: 0.5,
                  rankingConvergenceRatio: 0.5,
                  replayEquivalentRatio: 1,
                  categoryTopShare: 1,
                  entityTopShare: 0.5,
                  oscillationFrequency: 0.25,
                  saturationRatio: 0,
                  lowConfidenceAmplificationRatio: 0.5,
                  suppressionRatio: 1,
                  stabilityScore: 0.93,
                  topProjectedCategory: 'legal',
                  topProjectedEntityId: 'entity-1',
                },
                {
                  generatedAt: '2026-05-08T11:00:00.000Z',
                  driftActiveWarnings: 1,
                  driftCriticalWarnings: 0,
                  driftWarningRatio: 0.5,
                  divergenceRatio: 0.5,
                  rankingConvergenceRatio: 0.5,
                  replayEquivalentRatio: 1,
                  categoryTopShare: 1,
                  entityTopShare: 0.5,
                  oscillationFrequency: 0.25,
                  saturationRatio: 0,
                  lowConfidenceAmplificationRatio: 0.5,
                  suppressionRatio: 1,
                  stabilityScore: 0.92,
                  topProjectedCategory: 'legal',
                  topProjectedEntityId: 'entity-1',
                },
              ],
            },
            trendAggregation: {
              driftPersistence: {
                current: 0.5,
                shortWindowAverage: 0.333333,
                mediumWindowAverage: 0.333333,
                longWindowAverage: 0.333333,
                shortDelta: 0.166667,
                longDelta: 0.166667,
                direction: 'degrading',
              },
              rankingConvergence: {
                current: 0.5,
                shortWindowAverage: 0.666667,
                mediumWindowAverage: 0.666667,
                longWindowAverage: 0.666667,
                shortDelta: -0.166667,
                longDelta: -0.166667,
                direction: 'degrading',
              },
              replayConsistency: {
                current: 1,
                shortWindowAverage: 1,
                mediumWindowAverage: 1,
                longWindowAverage: 1,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
              categoryDominanceEvolution: {
                current: 1,
                shortWindowAverage: 1,
                mediumWindowAverage: 1,
                longWindowAverage: 1,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
              entityReinforcementLoops: {
                current: 0.5,
                shortWindowAverage: 0.5,
                mediumWindowAverage: 0.5,
                longWindowAverage: 0.5,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
              oscillationPersistence: {
                current: 0.25,
                shortWindowAverage: 0.166667,
                mediumWindowAverage: 0.166667,
                longWindowAverage: 0.166667,
                shortDelta: 0.083333,
                longDelta: 0.083333,
                direction: 'degrading',
              },
              multiplierSaturationTrends: {
                current: 0,
                shortWindowAverage: 0,
                mediumWindowAverage: 0,
                longWindowAverage: 0,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
              lowConfidenceAmplificationTrends: {
                current: 0.5,
                shortWindowAverage: 0.333333,
                mediumWindowAverage: 0.333333,
                longWindowAverage: 0.333333,
                shortDelta: 0.166667,
                longDelta: 0.166667,
                direction: 'degrading',
              },
              suppressionRatios: {
                current: 1,
                shortWindowAverage: 1,
                mediumWindowAverage: 1,
                longWindowAverage: 1,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
              stabilityScoreEvolution: {
                current: 0.92,
                shortWindowAverage: 0.933333,
                mediumWindowAverage: 0.933333,
                longWindowAverage: 0.933333,
                shortDelta: -0.013333,
                longDelta: -0.013333,
                direction: 'degrading',
              },
            },
            historicalDivergenceSummary: {
              totalSnapshots: 3,
              snapshotsWithDivergence: 2,
              divergencePresenceRatio: 0.666667,
              averageDivergenceRatio: 0.333333,
              peakDivergenceRatio: 0.5,
            },
            replayConsistencyHistory: {
              equivalentRatioTrend: {
                current: 1,
                shortWindowAverage: 1,
                mediumWindowAverage: 1,
                longWindowAverage: 1,
                shortDelta: 0,
                longDelta: 0,
                direction: 'stable',
              },
              averageEquivalentRatio: 1,
              minimumEquivalentRatio: 1,
            },
            persistenceCounters: {
              driftWarningConsecutive: 2,
              driftCriticalConsecutive: 0,
              saturationWarningConsecutive: 0,
              saturationCriticalConsecutive: 0,
            },
          },
          stabilityScore: 0.92,
        },
        lastError: null,
      },
    })

    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    await appendAdaptiveEvidence(harness.app, {
      replayConsistencyEquilibrium: 1,
      reinforcementEscalationPersistence: 1,
      saturationEquilibrium: 1,
      oscillationDamping: 0.833333,
      projectionStabilityConvergence: 0.6775,
      rankingDiversityPreservation: 0,
      entropyEvolution: 0,
      projectionLockInPersistence: 1,
      lowConfidenceAmplificationPersistence: 0.333333,
      replayDegradationPersistence: 0,
      governanceClassification: 'CAUTION',
      recommendation: 'do_not_rollout',
      sustainedEquilibriumEvidence: false,
      replayFingerprint: 'adaptive-equilibrium:fixture001',
      generatedAt: '2026-05-08T11:00:00.000Z',
      heatmapSnapshot: {
        category: [
          {
            key: 'legal',
            label: 'legal',
            opportunityCount: 2,
            projectedShare: 1,
            projectedScoreShare: 1,
            averageAdaptiveWeight: 0.95,
            averageRankDominance: 0.75,
            concentrationScore: 0.8,
          },
        ],
        entity: [
          {
            key: 'entity-1',
            label: 'entity-1',
            opportunityCount: 1,
            projectedShare: 0.5,
            projectedScoreShare: 0.55,
            averageAdaptiveWeight: 0.9,
            averageRankDominance: 1,
            concentrationScore: 0.72,
          },
        ],
        adaptiveScope: [
          {
            scope: 'signal',
            opportunityCount: 1,
            projectedShare: 0.5,
            averageAdaptiveWeight: 0.9,
            concentrationScore: 0.5,
          },
        ],
        rankingDistribution: [
          {
            rank: 1,
            opportunityId: 'opp-1',
            category: 'legal',
            entityId: 'entity-1',
            baseRank: 2,
            projectedRank: 1,
            rankDelta: 1,
            adaptiveWeight: 0.9,
            dominanceScore: 0.91,
          },
        ],
        replayDivergence: {
          divergenceRatio: 0.5,
          averageAbsRankDelta: 1,
          maxAbsRankDelta: 1,
          equivalentFingerprintRatio: 1,
          oscillationFrequency: 0.25,
          saturationRatio: 0,
          replayDivergenceIntensityScore: 0.47,
        },
        summary: {
          candidateCount: 2,
          topCategoryKey: 'legal',
          topEntityKey: 'entity-1',
          rankingDominanceScore: 0.91,
          saturationIntensityScore: 0,
          reinforcementIntensityScore: 0.69,
          oscillationIntensityScore: 0.25,
        },
      },
    })
    await appendAdaptiveEvidence(harness.app, {
      replayConsistencyEquilibrium: 1,
      reinforcementEscalationPersistence: 1,
      saturationEquilibrium: 1,
      oscillationDamping: 0.833333,
      projectionStabilityConvergence: 0.6775,
      rankingDiversityPreservation: 0,
      entropyEvolution: 0,
      projectionLockInPersistence: 1,
      lowConfidenceAmplificationPersistence: 0.333333,
      replayDegradationPersistence: 0,
      governanceClassification: 'CAUTION',
      recommendation: 'do_not_rollout',
      sustainedEquilibriumEvidence: false,
      replayFingerprint: 'adaptive-equilibrium:fixture001',
      generatedAt: '2026-05-08T11:00:00.000Z',
      heatmapSnapshot: {
        category: [
          {
            key: 'legal',
            label: 'legal',
            opportunityCount: 2,
            projectedShare: 1,
            projectedScoreShare: 1,
            averageAdaptiveWeight: 0.95,
            averageRankDominance: 0.75,
            concentrationScore: 0.8,
          },
        ],
        entity: [
          {
            key: 'entity-1',
            label: 'entity-1',
            opportunityCount: 1,
            projectedShare: 0.5,
            projectedScoreShare: 0.55,
            averageAdaptiveWeight: 0.9,
            averageRankDominance: 1,
            concentrationScore: 0.72,
          },
        ],
        adaptiveScope: [
          {
            scope: 'signal',
            opportunityCount: 1,
            projectedShare: 0.5,
            averageAdaptiveWeight: 0.9,
            concentrationScore: 0.5,
          },
        ],
        rankingDistribution: [
          {
            rank: 1,
            opportunityId: 'opp-1',
            category: 'legal',
            entityId: 'entity-1',
            baseRank: 2,
            projectedRank: 1,
            rankDelta: 1,
            adaptiveWeight: 0.9,
            dominanceScore: 0.91,
          },
        ],
        replayDivergence: {
          divergenceRatio: 0.5,
          averageAbsRankDelta: 1,
          maxAbsRankDelta: 1,
          equivalentFingerprintRatio: 1,
          oscillationFrequency: 0.25,
          saturationRatio: 0,
          replayDivergenceIntensityScore: 0.47,
        },
        summary: {
          candidateCount: 2,
          topCategoryKey: 'legal',
          topEntityKey: 'entity-1',
          rankingDominanceScore: 0.91,
          saturationIntensityScore: 0,
          reinforcementIntensityScore: 0.69,
          oscillationIntensityScore: 0.25,
        },
      },
    })

    const [
      statusResponse,
      divergenceResponse,
      projectedResponse,
      evidenceResponse,
      timelineResponse,
      heatmapResponse,
      stabilityScoreResponse,
      replayGraphsResponse,
      governanceTimelineResponse,
      dashboardTimelineResponse,
      dashboardGovernanceTimelineResponse,
      dashboardReplayGraphsResponse,
      dashboardHeatmapsResponse,
      dashboardStabilityScoreResponse,
    ] = await Promise.all([
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/status',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/divergence',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/projected-ranking',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/evidence?page=1&pageSize=10',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/timeline?historyLimit=240&rollingHours=6,24,72',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/heatmaps?historyLimit=240&hotspotLimit=10',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/stability-score?historyLimit=240&rollingHours=6,24,72',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/replay-graphs?historyLimit=240&rollingHours=6,24,72&bucketCount=5',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-influence/governance-timeline?page=1&pageSize=10&historyLimit=240',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-dashboard/timeline?historyLimit=240&rollingHours=6,24,72',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-dashboard/governance-timeline?page=1&pageSize=10&historyLimit=240',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-dashboard/replay-graphs?historyLimit=240&rollingHours=6,24,72&bucketCount=5',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-dashboard/heatmaps?historyLimit=240&hotspotLimit=10',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      harness.app.inject({
        method: 'GET',
        url: '/admin/adaptive-dashboard/stability-score?historyLimit=240&rollingHours=6,24,72',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    ])

    assert.equal(statusResponse.statusCode, 200)
    const statusPayload = statusResponse.json()
    assert.equal(statusPayload.enabled, true)
    assert.equal(statusPayload.mode, 'shadow_compare')
    assert.equal(statusPayload.rolloutPercentage, 40)
    assert.equal(statusPayload.killSwitchEnabled, false)
    assert.equal(statusPayload.boundedMin, 0.8)
    assert.equal(statusPayload.boundedMax, 1.2)
    assert.equal(statusPayload.minimumSampleRequirement, 5)
    assert.deepEqual(statusPayload.allowedScopes, ['signal', 'entity'])
    assert.equal(statusPayload.runtimeHealth.advisoryOnly, true)
    assert.equal(statusPayload.runtimeHealth.mutatesLiveRanking, false)
    assert.equal(statusPayload.lastRefreshAt, '2026-05-08T11:00:00.000Z')
    assert.equal(statusPayload.lastError, null)

    assert.equal(divergenceResponse.statusCode, 200)
    const divergencePayload = divergenceResponse.json()
    assert.equal(divergencePayload.averageRankDelta, 1)
    assert.equal(divergencePayload.largestRankDelta, 1)
    assert.equal(divergencePayload.divergenceCount, 1)
    assert.equal(divergencePayload.lowConfidenceProjectionCount, 1)
    assert.equal(divergencePayload.suppressedInfluenceCount, 2)
    assert.equal(divergencePayload.divergenceMetrics.rankDrift.averageAbsRankDelta, 1)
    assert.equal(divergencePayload.divergenceMetrics.categoryDominance.topProjectedCategory, 'legal')
    assert.equal(divergencePayload.divergenceMetrics.entityDominance.topProjectedEntityId, 'entity-1')
    assert.equal(divergencePayload.divergenceMetrics.repeatedTopRankPersistence.consecutiveRefreshes, 3)
    assert.equal(divergencePayload.divergenceMetrics.lowConfidenceAmplification.lowConfidenceProjectionRatio, 0.5)
    assert.equal(divergencePayload.divergenceMetrics.projectionVolatility.averageProjectedRankChange, 0)
    assert.equal(divergencePayload.driftDetectionArchitecture.analysisOnly, true)
    assert.equal(divergencePayload.driftDetectionArchitecture.thresholds.runawayMultipliers.warning, 0.4)
    assert.equal(divergencePayload.driftEventModel.warningSummary.activeCount, 1)
    assert.equal(divergencePayload.driftEventModel.warnings[0].code, 'low_confidence_amplification')
    assert.equal(divergencePayload.reinforcementLoopDetectionArchitecture.analysisOnly, true)
    assert.equal(divergencePayload.reinforcementLoopDetectionArchitecture.thresholds.repeatedEntityDominance.warning, 0.55)
    assert.equal(divergencePayload.reinforcementLoopWarningModel.warningSummary.activeCount, 2)
    assert.equal(divergencePayload.reinforcementLoopWarningModel.warnings[0].code, 'repeated_entity_dominance')
    assert.equal(divergencePayload.reinforcementLoopReplaySafeDiagnostics.topReplayFingerprintStable, true)
    assert.equal(divergencePayload.historicalReplayEngine.simulationOnly, true)
    assert.equal(divergencePayload.replayTimelineModel.totalReplayedSnapshots, 3)
    assert.equal(divergencePayload.replayTimelineModel.points.length, 3)
    assert.equal(divergencePayload.historicalDriftAnalysis.activeDriftSnapshots, 2)
    assert.equal(divergencePayload.projectionStabilityAnalysis.minimumStabilityScore, 0.869)
    assert.equal(divergencePayload.replayDegradationMetrics.replayConsistencyDegradation, 0)
    assert.equal(divergencePayload.replayStressSimulationEngine.simulationOnly, true)
    assert.equal(divergencePayload.replayStressSimulationEngine.noMutation, true)
    assert.equal(divergencePayload.replayInstabilityThresholds.collapseCritical, 0.65)
    assert.equal(divergencePayload.replayStressDegradationMetrics.snapshotGapRatio, 0.08)
    assert.equal(divergencePayload.replayCollapseDetection.collapseDetected, true)
    assert.equal(divergencePayload.replayCollapseDetection.collapseStatus, 'warning')
    assert.equal(divergencePayload.replayRiskDiagnostics.riskClassification, 'caution')
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.rootCauseGraph.nodes.length, 3)
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.instabilityContributionModel.length, 10)
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.dominantInstabilityFactors[0], 'projection_lock_in')
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.replayCollapseContributors.length, 2)
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.saturationContributors.length, 2)
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.reinforcementEscalationContributors.length, 2)
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.stabilityBlockers.length, 5)
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.governanceRiskSummary.overallSeverity, 'HIGH')
    assert.equal(divergencePayload.adaptiveInstabilityRootCauseAnalysis.governanceRiskSummary.rolloutRecommendation, 'do_not_rollout')
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.decaySimulationModel.simulationOnly, true)
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.hysteresisSimulationModel.hysteresisWindow, 0.08)
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.replayImpactAnalysis.replayConsistencyDelta, 0.02)
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.saturationImpactAnalysis.saturationDelta, -0.05005)
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.oscillationImpactAnalysis.oscillationDelta, 0.017)
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.governanceRiskAssessment.classification, 'CAUTION')
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.rolloutRecommendation.classification, 'CAUTION')
    assert.equal(divergencePayload.adaptiveDecayHysteresisResearch.rolloutRecommendation.recommendation, 'do_not_rollout')
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.longitudinalModel.simulationOnly, true)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.longitudinalModel.noRollout, true)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.longitudinalModel.trackedDimensions.length, 10)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.stabilityConvergenceMetrics.equilibriumConfidence, 0.777041)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.saturationEquilibriumMetrics.saturationEquilibriumScore, 1)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.reinforcementPersistenceMetrics.projectionLockInPersistence, 1)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.entropyEvolutionAnalysis.entropyTrend, 'stable')
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.rankingDiversityAnalysis.diversityLossRisk, 'high')
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.replayEquilibriumAnalysis.equilibriumBreachCount, 0)
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.governanceRecommendation.classification, 'CAUTION')
    assert.equal(divergencePayload.adaptiveEquilibriumLongitudinalStudy.governanceRecommendation.recommendation, 'do_not_rollout')
    assert.equal(divergencePayload.historicalReplayDiagnostics.divergenceEvolution.peakDivergenceRatio, 0.5)
    assert.equal(divergencePayload.historicalReplayDiagnostics.reinforcementLoops.lowDiversityCycleRatio, 1)
    assert.equal(divergencePayload.longDurationValidationArchitecture.observationOnly, true)
    assert.equal(divergencePayload.historicalTrendModel.snapshotHistory.retainedSnapshots, 3)
    assert.equal(divergencePayload.historicalTrendModel.trendAggregation.stabilityScoreEvolution.current, 0.92)
    assert.equal(divergencePayload.historicalTrendModel.historicalDivergenceSummary.snapshotsWithDivergence, 2)
    assert.equal(divergencePayload.replayTrendAggregation.averageEquivalentRatio, 1)
    assert.equal(divergencePayload.driftPersistenceMetrics.driftWarningConsecutive, 2)
    assert.equal(divergencePayload.saturationPersistenceMetrics.saturationWarningConsecutive, 0)
    assert.equal(divergencePayload.driftDiagnostics.divergenceRatio, 0.5)
    assert.equal(divergencePayload.saturationDiagnostics.saturationRatio, 0)
    assert.equal(divergencePayload.oscillationDiagnostics.oscillationFrequency, 0.25)
    assert.equal(divergencePayload.stabilityScoring.stabilityScore, 0.92)
    assert.equal(divergencePayload.replayConsistencyMetrics.equivalentFingerprintRatio, 1)

    assert.equal(projectedResponse.statusCode, 200)
    const projectedPayload = projectedResponse.json()
    assert.equal(projectedPayload.projections.length, 2)
    assert.equal(projectedPayload.projections[0].baseRank, 1)
    assert.equal(projectedPayload.projections[0].projectedRank, 2)
    assert.equal(projectedPayload.projections[0].baseScore, 84)
    assert.equal(projectedPayload.projections[0].projectedAdaptiveScore, 75.6)
    assert.equal(projectedPayload.projections[0].adaptiveMultiplier, 0.9)
    assert.equal(projectedPayload.projections[0].influenceApplied, false)
    assert.equal(projectedPayload.projections[0].rolloutEligible, true)
    assert.equal(projectedPayload.projections[0].blockedReason, 'eligible_shadow_projection')
    assert.equal(projectedPayload.projections[0].rolloutBucket, 27)
    assert.equal(projectedPayload.projections[0].sampleThresholdSatisfied, true)
    assert.equal(projectedPayload.projections[0].projectionMode, 'shadow_compare')
    assert.deepEqual(projectedPayload.projections[0].weightSources, {
      signal: 'weight-signal-1',
      category: null,
      entity: 'weight-entity-1',
    })
    assert.deepEqual(projectedPayload.projections[0].memoryIds, {
      signal: 'memory-signal-1',
      category: null,
      entity: 'memory-entity-1',
    })
    assert.deepEqual(projectedPayload.projections[0].evidenceScopes, ['signal', 'entity'])
    assert.deepEqual(projectedPayload.projections[0].sampleCounts, {
      signal: 5,
      category: null,
      entity: 12,
    })
    assert.equal(projectedPayload.projections[0].replayFingerprint, 'adaptive-influence:aaaa1111bbbb2222cccc3333')
    assert.equal(projectedPayload.projections[1].rolloutEligible, false)
    assert.equal(projectedPayload.projections[1].blockedReason, 'below_rollout_threshold')
    assert.equal(projectedPayload.projections[1].rolloutBucket, 74)
    assert.equal(projectedPayload.projections[1].sampleThresholdSatisfied, true)
    assert.equal(projectedPayload.projections[1].projectionMode, 'shadow_compare')
    assert.deepEqual(projectedPayload.projections[1].weightSources, {
      signal: 'weight-signal-2',
      category: null,
      entity: null,
    })
    assert.deepEqual(projectedPayload.projections[1].memoryIds, {
      signal: 'memory-signal-2',
      category: null,
      entity: null,
    })
    assert.equal(projectedPayload.projections[1].replayFingerprint, 'adaptive-influence:dddd4444eeee5555ffff6666')

    assert.equal(evidenceResponse.statusCode, 200)
    const evidencePayload = evidenceResponse.json()
    assert.equal(evidencePayload.status, 'ready')
    assert.equal(evidencePayload.pagination.total >= 1, true)
    assert.equal(evidencePayload.records.length >= 1, true)
    assert.equal(evidencePayload.records.every((record: { recommendation: string }) => record.recommendation === 'do_not_rollout'), true)
    assert.equal(evidencePayload.records.some((record: { governanceClassification: string }) => record.governanceClassification === 'CAUTION'), true)
    assert.equal(typeof evidencePayload.compatibility.currentEvidenceContractVersion, 'string')
    assert.equal(Array.isArray(evidencePayload.compatibility.versions), true)
    assert.equal(
      evidencePayload.records.every((record: { compatibility: { classification: string } }) => typeof record.compatibility.classification === 'string'),
      true,
    )
    assert.equal(evidencePayload.operationalMetadata.appendOnly, true)
    assert.equal(evidencePayload.operationalMetadata.replaySafe, true)
    assert.equal(evidencePayload.operationalMetadata.deterministicEvidenceId, true)

    assert.equal(timelineResponse.statusCode, 200)
    const timelinePayload = timelineResponse.json()
    assert.equal(timelinePayload.status, 'ready')
    assert.equal(timelinePayload.aggregationArchitecture.observationOnly, true)
    assert.equal(timelinePayload.aggregationArchitecture.derivedOnly, true)
    assert.equal(timelinePayload.aggregationArchitecture.noMutation, true)
    assert.equal(timelinePayload.aggregationArchitecture.noRollout, true)
    assert.equal(Array.isArray(timelinePayload.timeline.hourlyWindows), true)
    assert.equal(Array.isArray(timelinePayload.timeline.dailyWindows), true)
    assert.equal(Array.isArray(timelinePayload.timeline.rollingWindows), true)
    assert.equal(Array.isArray(timelinePayload.timeline.historicalSnapshots), true)
    assert.equal(Array.isArray(timelinePayload.timeline.longitudinalTrends), true)
    assert.equal(typeof timelinePayload.replaySafePayload.payloadFingerprint, 'string')
    assert.equal(typeof timelinePayload.compatibility.highestRiskClassification, 'string')
    assert.equal(typeof timelinePayload.epistemicConfidence.classification, 'string')
    assert.equal(typeof timelinePayload.epistemicConfidence.weightedConfidenceScore, 'number')
    assert.equal(timelinePayload.replaySafePayload.deterministic, true)
    assert.equal(timelinePayload.operationalMetadata.observabilityOnly, true)
    assert.equal(timelinePayload.operationalMetadata.noGovernanceMutation, true)

    assert.equal(heatmapResponse.statusCode, 200)
    const heatmapPayload = heatmapResponse.json()
    assert.equal(heatmapPayload.status, 'ready')
    assert.equal(heatmapPayload.aggregationArchitecture.observationOnly, true)
    assert.equal(heatmapPayload.aggregationArchitecture.longitudinalTracking, true)
    assert.equal(Array.isArray(heatmapPayload.heatmaps.category.current), true)
    assert.equal(Array.isArray(heatmapPayload.heatmaps.category.longitudinal), true)
    assert.equal(Array.isArray(heatmapPayload.heatmaps.entity.current), true)
    assert.equal(Array.isArray(heatmapPayload.heatmaps.adaptiveScope.current), true)
    assert.equal(Array.isArray(heatmapPayload.heatmaps.rankingDistribution.current), true)
    assert.equal(Array.isArray(heatmapPayload.heatmaps.replayDivergence.timeSeries), true)
    assert.equal(Array.isArray(heatmapPayload.hotspots.current), true)
    assert.equal(typeof heatmapPayload.concentrationScoring.weights.scoreShare, 'number')
    assert.equal(typeof heatmapPayload.compatibility.highestRiskClassification, 'string')
    assert.equal(heatmapPayload.replaySafePayload.deterministic, true)
    assert.equal(heatmapPayload.replaySafePayload.replaySafe, true)
    assert.equal(heatmapPayload.operationalMetadata.observabilityOnly, true)
    assert.equal(heatmapPayload.observability.heatmapSnapshotCount >= 1, true)

    assert.equal(stabilityScoreResponse.statusCode, 200)
    const stabilityPayload = stabilityScoreResponse.json()
    assert.equal(stabilityPayload.status, 'ready')
    assert.equal(stabilityPayload.aggregationArchitecture.observationOnly, true)
    assert.equal(stabilityPayload.aggregationArchitecture.weightedLongitudinalScoring, true)
    assert.equal(typeof stabilityPayload.stabilityScoringArchitecture.weightedCalculation.degradationPenaltyMultiplier, 'number')
    assert.equal(Array.isArray(stabilityPayload.historicalScores), true)
    assert.equal(Array.isArray(stabilityPayload.rollingAverages), true)
    assert.equal(typeof stabilityPayload.longitudinalEvolution.direction, 'string')
    assert.equal(typeof stabilityPayload.compatibility.highestRiskClassification, 'string')
    assert.equal(typeof stabilityPayload.replaySafePayload.payloadFingerprint, 'string')
    assert.equal(stabilityPayload.replaySafePayload.deterministic, true)
    assert.equal(stabilityPayload.replaySafePayload.replaySafe, true)
    assert.equal(stabilityPayload.operationalMetadata.observabilityOnly, true)

    assert.equal(replayGraphsResponse.statusCode, 200)
    const replayGraphsPayload = replayGraphsResponse.json()
    assert.equal(replayGraphsPayload.status, 'ready')
    assert.equal(replayGraphsPayload.aggregationArchitecture.observationOnly, true)
    assert.equal(replayGraphsPayload.aggregationArchitecture.derivedOnly, true)
    assert.equal(replayGraphsPayload.aggregationArchitecture.noMutation, true)
    assert.equal(replayGraphsPayload.aggregationArchitecture.replaySafe, true)
    assert.equal(Array.isArray(replayGraphsPayload.replayGraphs.timeSeries), true)
    assert.equal(Array.isArray(replayGraphsPayload.replayGraphs.rollingAverages), true)
    assert.equal(Array.isArray(replayGraphsPayload.replayGraphs.degradationDeltas), true)
    assert.equal(Array.isArray(replayGraphsPayload.replayGraphs.replayConsistencyBuckets), true)
    assert.equal(Array.isArray(replayGraphsPayload.replayGraphs.replayVariance), true)
    assert.equal(typeof replayGraphsPayload.replayGraphs.collapseSummary.collapseRatio, 'number')
    assert.equal(typeof replayGraphsPayload.compatibility.highestRiskClassification, 'string')
    assert.equal(typeof replayGraphsPayload.epistemicConfidence.classification, 'string')
    assert.equal(typeof replayGraphsPayload.epistemicConfidence.replaySummary.classification, 'string')
    assert.equal(typeof replayGraphsPayload.replaySafePayload.payloadFingerprint, 'string')
    assert.equal(replayGraphsPayload.replaySafePayload.deterministic, true)
    assert.equal(replayGraphsPayload.replaySafePayload.derivedOnly, true)
    assert.equal(replayGraphsPayload.replaySafePayload.replaySafe, true)
    assert.equal(replayGraphsPayload.operationalMetadata.observabilityOnly, true)
    assert.equal(replayGraphsPayload.operationalMetadata.noGovernanceMutation, true)

    assert.equal(governanceTimelineResponse.statusCode, 200)
    const governanceTimelinePayload = governanceTimelineResponse.json()
    assert.equal(governanceTimelinePayload.status, 'ready')
    assert.equal(Array.isArray(governanceTimelinePayload.events), true)
    assert.equal(typeof governanceTimelinePayload.pagination.total, 'number')
    assert.equal(typeof governanceTimelinePayload.reducers.transitions.totalTransitions, 'number')
    assert.equal(typeof governanceTimelinePayload.compatibility.highestRiskClassification, 'string')
    assert.equal(typeof governanceTimelinePayload.epistemicConfidence.classification, 'string')
    assert.equal(typeof governanceTimelinePayload.epistemicConfidence.governanceSummary.classification, 'string')
    assert.equal(typeof governanceTimelinePayload.replaySafePayload.payloadFingerprint, 'string')
    assert.equal(governanceTimelinePayload.replaySafePayload.deterministic, true)
    assert.equal(governanceTimelinePayload.replaySafePayload.appendOnly, true)
    assert.equal(governanceTimelinePayload.replaySafePayload.observabilityOnly, true)
    assert.equal(governanceTimelinePayload.operationalMetadata.appendOnly, true)
    assert.equal(governanceTimelinePayload.operationalMetadata.noGovernanceMutation, true)

    assert.equal(dashboardTimelineResponse.statusCode, 200)
    const dashboardTimelinePayload = dashboardTimelineResponse.json()
    assert.equal(dashboardTimelinePayload.status, 'ready')
    assert.equal(dashboardTimelinePayload.operationalMetadata.adminOnly, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.readOnly, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.replaySafe, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.noMutation, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.noDomainMutation, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.noAdaptiveStateMutation, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.noGovernanceMutation, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.observabilityWritesOnly, false)
    assert.equal(dashboardTimelinePayload.operationalMetadata.noRolloutActivation, true)
    assert.equal(dashboardTimelinePayload.operationalMetadata.noHiddenWrites, undefined)
    assert.equal(typeof dashboardTimelinePayload.epistemicConfidence.classification, 'string')
    assert.equal(typeof dashboardTimelinePayload.replaySafePayload.payloadFingerprint, 'string')

    assert.equal(dashboardGovernanceTimelineResponse.statusCode, 200)
    const dashboardGovernanceTimelinePayload = dashboardGovernanceTimelineResponse.json()
    assert.equal(dashboardGovernanceTimelinePayload.status, 'ready')
    assert.equal(Array.isArray(dashboardGovernanceTimelinePayload.events), true)
    assert.equal(typeof dashboardGovernanceTimelinePayload.pagination.total, 'number')
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.adminOnly, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.readOnly, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.noMutation, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.noDomainMutation, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.noAdaptiveStateMutation, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.noGovernanceMutation, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.observabilityWritesOnly, false)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.noRolloutActivation, true)
    assert.equal(dashboardGovernanceTimelinePayload.operationalMetadata.noHiddenWrites, undefined)
    assert.equal(typeof dashboardGovernanceTimelinePayload.epistemicConfidence.classification, 'string')

    assert.equal(dashboardReplayGraphsResponse.statusCode, 200)
    const dashboardReplayGraphsPayload = dashboardReplayGraphsResponse.json()
    assert.equal(dashboardReplayGraphsPayload.status, 'ready')
    assert.equal(Array.isArray(dashboardReplayGraphsPayload.replayGraphs.timeSeries), true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.adminOnly, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.readOnly, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.noMutation, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.noDomainMutation, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.noAdaptiveStateMutation, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.noGovernanceMutation, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.observabilityWritesOnly, false)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.noRolloutActivation, true)
    assert.equal(dashboardReplayGraphsPayload.operationalMetadata.noHiddenWrites, undefined)
    assert.equal(typeof dashboardReplayGraphsPayload.epistemicConfidence.classification, 'string')

    assert.equal(dashboardHeatmapsResponse.statusCode, 200)
    const dashboardHeatmapsPayload = dashboardHeatmapsResponse.json()
    assert.equal(dashboardHeatmapsPayload.status, 'ready')
    assert.equal(Array.isArray(dashboardHeatmapsPayload.heatmaps.category.current), true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.adminOnly, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.readOnly, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.noMutation, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.noDomainMutation, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.noAdaptiveStateMutation, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.noGovernanceMutation, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.observabilityWritesOnly, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.noRolloutActivation, true)
    assert.equal(dashboardHeatmapsPayload.operationalMetadata.noHiddenWrites, undefined)

    assert.equal(dashboardStabilityScoreResponse.statusCode, 200)
    const dashboardStabilityScorePayload = dashboardStabilityScoreResponse.json()
    assert.equal(dashboardStabilityScorePayload.status, 'ready')
    assert.equal(Array.isArray(dashboardStabilityScorePayload.historicalScores), true)
    assert.equal(Array.isArray(dashboardStabilityScorePayload.rollingAverages), true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.adminOnly, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.readOnly, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.noMutation, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.noDomainMutation, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.noAdaptiveStateMutation, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.noGovernanceMutation, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.observabilityWritesOnly, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.noRolloutActivation, true)
    assert.equal(dashboardStabilityScorePayload.operationalMetadata.noHiddenWrites, undefined)

    runtime.getStatus = originalGetStatus
    runtime.getSnapshot = originalGetSnapshot
  } finally {
    await harness.close()
  }
})

test('adaptive dashboard semantic audit proves deterministic replay-safe truthful and non-interfering behavior', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    await appendAdaptiveEvidence(harness.app, {
      replayConsistencyEquilibrium: 0.76,
      reinforcementEscalationPersistence: 0.41,
      saturationEquilibrium: 0.34,
      oscillationDamping: 0.64,
      projectionStabilityConvergence: 0.69,
      rankingDiversityPreservation: 0.42,
      entropyEvolution: 0.44,
      projectionLockInPersistence: 0.28,
      lowConfidenceAmplificationPersistence: 0.19,
      replayDegradationPersistence: 0.18,
      governanceClassification: 'CAUTION',
      recommendation: 'do_not_rollout',
      sustainedEquilibriumEvidence: false,
      replayFingerprint: 'adaptive-equilibrium:semantic-audit-001',
      generatedAt: '2026-05-08T09:00:00.000Z',
      heatmapSnapshot: {
        category: [
          {
            key: 'legal',
            label: 'legal',
            opportunityCount: 2,
            projectedShare: 0.7,
            projectedScoreShare: 0.68,
            averageAdaptiveWeight: 0.94,
            averageRankDominance: 0.72,
            concentrationScore: 0.64,
          },
        ],
        entity: [
          {
            key: 'entity-1',
            label: 'entity-1',
            opportunityCount: 1,
            projectedShare: 0.45,
            projectedScoreShare: 0.5,
            averageAdaptiveWeight: 0.91,
            averageRankDominance: 0.88,
            concentrationScore: 0.58,
          },
        ],
        adaptiveScope: [
          {
            scope: 'signal',
            opportunityCount: 2,
            projectedShare: 0.7,
            averageAdaptiveWeight: 0.92,
            concentrationScore: 0.61,
          },
        ],
        rankingDistribution: [
          {
            rank: 1,
            opportunityId: 'opp-1',
            category: 'legal',
            entityId: 'entity-1',
            baseRank: 2,
            projectedRank: 1,
            rankDelta: 1,
            adaptiveWeight: 0.94,
            dominanceScore: 0.86,
          },
        ],
        replayDivergence: {
          divergenceRatio: 0.3,
          averageAbsRankDelta: 0.8,
          maxAbsRankDelta: 1,
          equivalentFingerprintRatio: 0.95,
          oscillationFrequency: 0.21,
          saturationRatio: 0.18,
          replayDivergenceIntensityScore: 0.41,
        },
        summary: {
          candidateCount: 2,
          topCategoryKey: 'legal',
          topEntityKey: 'entity-1',
          rankingDominanceScore: 0.86,
          saturationIntensityScore: 0.18,
          reinforcementIntensityScore: 0.41,
          oscillationIntensityScore: 0.21,
        },
      },
    })

    await appendAdaptiveEvidence(harness.app, {
      replayConsistencyEquilibrium: 0.88,
      reinforcementEscalationPersistence: 0.24,
      saturationEquilibrium: 0.17,
      oscillationDamping: 0.79,
      projectionStabilityConvergence: 0.82,
      rankingDiversityPreservation: 0.57,
      entropyEvolution: 0.53,
      projectionLockInPersistence: 0.34,
      lowConfidenceAmplificationPersistence: 0.12,
      replayDegradationPersistence: 0.07,
      governanceClassification: 'SAFE',
      recommendation: 'do_not_rollout',
      sustainedEquilibriumEvidence: false,
      replayFingerprint: 'adaptive-equilibrium:semantic-audit-002',
      generatedAt: '2026-05-08T10:00:00.000Z',
      heatmapSnapshot: {
        category: [
          {
            key: 'legal',
            label: 'legal',
            opportunityCount: 3,
            projectedShare: 0.72,
            projectedScoreShare: 0.71,
            averageAdaptiveWeight: 0.97,
            averageRankDominance: 0.78,
            concentrationScore: 0.69,
          },
        ],
        entity: [
          {
            key: 'entity-1',
            label: 'entity-1',
            opportunityCount: 2,
            projectedShare: 0.52,
            projectedScoreShare: 0.56,
            averageAdaptiveWeight: 0.95,
            averageRankDominance: 0.9,
            concentrationScore: 0.63,
          },
        ],
        adaptiveScope: [
          {
            scope: 'signal',
            opportunityCount: 3,
            projectedShare: 0.72,
            averageAdaptiveWeight: 0.96,
            concentrationScore: 0.65,
          },
        ],
        rankingDistribution: [
          {
            rank: 1,
            opportunityId: 'opp-2',
            category: 'legal',
            entityId: 'entity-1',
            baseRank: 1,
            projectedRank: 1,
            rankDelta: 0,
            adaptiveWeight: 0.97,
            dominanceScore: 0.9,
          },
        ],
        replayDivergence: {
          divergenceRatio: 0.12,
          averageAbsRankDelta: 0.4,
          maxAbsRankDelta: 1,
          equivalentFingerprintRatio: 1,
          oscillationFrequency: 0.1,
          saturationRatio: 0.08,
          replayDivergenceIntensityScore: 0.19,
        },
        summary: {
          candidateCount: 3,
          topCategoryKey: 'legal',
          topEntityKey: 'entity-1',
          rankingDominanceScore: 0.9,
          saturationIntensityScore: 0.08,
          reinforcementIntensityScore: 0.24,
          oscillationIntensityScore: 0.1,
        },
      },
    })

    const endpointConfigs = [
      {
        kind: 'timeline' as const,
        dashboardUrl: '/admin/adaptive-dashboard/timeline?historyLimit=240&rollingHours=6,24,72',
        influenceUrl: '/admin/adaptive-influence/timeline?historyLimit=240&rollingHours=6,24,72',
        observabilityWritesOnly: false,
      },
      {
        kind: 'governance' as const,
        dashboardUrl: '/admin/adaptive-dashboard/governance-timeline?page=1&pageSize=10&historyLimit=240',
        influenceUrl: '/admin/adaptive-influence/governance-timeline?page=1&pageSize=10&historyLimit=240',
        observabilityWritesOnly: false,
      },
      {
        kind: 'replay' as const,
        dashboardUrl: '/admin/adaptive-dashboard/replay-graphs?historyLimit=240&rollingHours=6,24,72&bucketCount=5',
        influenceUrl: '/admin/adaptive-influence/replay-graphs?historyLimit=240&rollingHours=6,24,72&bucketCount=5',
        observabilityWritesOnly: false,
      },
      {
        kind: 'heatmaps' as const,
        dashboardUrl: '/admin/adaptive-dashboard/heatmaps?historyLimit=240&hotspotLimit=10',
        influenceUrl: '/admin/adaptive-influence/heatmaps?historyLimit=240&hotspotLimit=10',
        observabilityWritesOnly: true,
      },
      {
        kind: 'stability' as const,
        dashboardUrl: '/admin/adaptive-dashboard/stability-score?historyLimit=240&rollingHours=6,24,72',
        influenceUrl: '/admin/adaptive-influence/stability-score?historyLimit=240&rollingHours=6,24,72',
        observabilityWritesOnly: true,
      },
    ]

    for (const config of endpointConfigs) {
      const firstResponse = await harness.app.inject({
        method: 'GET',
        url: config.dashboardUrl,
        headers: { authorization: `Bearer ${token}` },
      })
      const secondResponse = await harness.app.inject({
        method: 'GET',
        url: config.dashboardUrl,
        headers: { authorization: `Bearer ${token}` },
      })

      assert.equal(firstResponse.statusCode, 200)
      assert.equal(secondResponse.statusCode, 200)

      const firstPayload = firstResponse.json()
      const secondPayload = secondResponse.json()
      assert.equal(firstPayload.replaySafePayload.payloadFingerprint, secondPayload.replaySafePayload.payloadFingerprint)
      assert.deepEqual(firstPayload.compatibility, secondPayload.compatibility)
      assert.deepEqual(
        extractStableDashboardSection(config.kind, firstPayload),
        extractStableDashboardSection(config.kind, secondPayload),
      )

      if (config.kind === 'timeline' || config.kind === 'governance' || config.kind === 'replay') {
        assertEpistemicConfidenceAliasEquivalence(firstPayload, secondPayload, {
          kind: config.kind,
          expectedObservabilityWritesOnly: false,
        })
      }
    }

    for (const config of endpointConfigs) {
      const influenceResponse = await harness.app.inject({
        method: 'GET',
        url: config.influenceUrl,
        headers: { authorization: `Bearer ${token}` },
      })
      const dashboardResponse = await harness.app.inject({
        method: 'GET',
        url: config.dashboardUrl,
        headers: { authorization: `Bearer ${token}` },
      })

      assert.equal(influenceResponse.statusCode, 200)
      assert.equal(dashboardResponse.statusCode, 200)

      const influencePayload = influenceResponse.json()
      const dashboardPayload = dashboardResponse.json()

      assert.deepEqual(
        extractStableDashboardSection(config.kind, influencePayload),
        extractStableDashboardSection(config.kind, dashboardPayload),
      )
      assert.deepEqual(influencePayload.compatibility, dashboardPayload.compatibility)

      // /admin/adaptive-dashboard/* exposes operationalMetadata.observabilityWritesOnly,
      // while /admin/adaptive-influence/* does not expose the dashboard operationalMetadata contract.
      // We normalize observabilityWritesOnly=false only to reuse
      // assertEpistemicConfidenceAliasEquivalence in cross-alias checks.
      // This does not imply any runtime API contract change for /admin/adaptive-influence/*,
      // and generatedAt remains excluded via extractStableDashboardSection.

      if (config.kind === 'timeline') {
        const normalizedInfluencePayload = {
          ...influencePayload,
          operationalMetadata: {
            ...influencePayload.operationalMetadata,
            observabilityWritesOnly: false,
          },
        }
        assertEpistemicConfidenceAliasEquivalence(
          normalizedInfluencePayload,
          dashboardPayload,
          {
            kind: 'timeline',
            expectedObservabilityWritesOnly: false,
          },
        )
      }

      if (config.kind === 'governance') {
        const normalizedInfluencePayload = {
          ...influencePayload,
          operationalMetadata: {
            ...influencePayload.operationalMetadata,
            observabilityWritesOnly: false,
          },
        }
        assertEpistemicConfidenceAliasEquivalence(
          normalizedInfluencePayload,
          dashboardPayload,
          {
            kind: 'governance',
            expectedObservabilityWritesOnly: false,
          },
        )
      }

      if (config.kind === 'replay') {
        const normalizedInfluencePayload = {
          ...influencePayload,
          operationalMetadata: {
            ...influencePayload.operationalMetadata,
            observabilityWritesOnly: false,
          },
        }
        assertEpistemicConfidenceAliasEquivalence(
          normalizedInfluencePayload,
          dashboardPayload,
          {
            kind: 'replay',
            expectedObservabilityWritesOnly: false,
          },
        )
      }
    }

    for (const config of endpointConfigs) {
      const before = getCustomObservabilityState(harness.app)
      const response = await harness.app.inject({
        method: 'GET',
        url: config.dashboardUrl,
        headers: { authorization: `Bearer ${token}` },
      })
      const after = getCustomObservabilityState(harness.app)
      const payload = response.json()

      assert.equal(response.statusCode, 200)
      assert.equal(payload.operationalMetadata.observabilityWritesOnly, config.observabilityWritesOnly)
      assert.equal(typeof payload.compatibility.highestRiskClassification, 'string')

      const customStateChanged = (
        JSON.stringify(before.customCounters) !== JSON.stringify(after.customCounters)
        || JSON.stringify(before.customTimings) !== JSON.stringify(after.customTimings)
      )
      if (config.observabilityWritesOnly) {
        assert.equal(customStateChanged, true)
      }

      if (config.kind === 'timeline' || config.kind === 'governance' || config.kind === 'replay') {
        assert.equal(payload.operationalMetadata.observabilityWritesOnly, false)
        assert.equal(
          after.customCounters.adaptive_dashboard_heatmap_requests_total
            ?? 0,
          before.customCounters.adaptive_dashboard_heatmap_requests_total
            ?? 0,
        )
        assert.equal(
          after.customCounters.adaptive_dashboard_stability_requests_total
            ?? 0,
          before.customCounters.adaptive_dashboard_stability_requests_total
            ?? 0,
        )
        assert.equal(
          after.customTimings.adaptive_dashboard_heatmap_build_duration_ms?.count
            ?? 0,
          before.customTimings.adaptive_dashboard_heatmap_build_duration_ms?.count
            ?? 0,
        )
        assert.equal(
          after.customTimings.adaptive_dashboard_stability_build_duration_ms?.count
            ?? 0,
          before.customTimings.adaptive_dashboard_stability_build_duration_ms?.count
            ?? 0,
        )
      }

      if (config.kind === 'heatmaps') {
        assert.equal(
          (after.customCounters.adaptive_dashboard_heatmap_requests_total ?? 0)
            > (before.customCounters.adaptive_dashboard_heatmap_requests_total ?? 0),
          true,
        )
        assert.equal(
          (after.customTimings.adaptive_dashboard_heatmap_build_duration_ms?.count ?? 0)
            > (before.customTimings.adaptive_dashboard_heatmap_build_duration_ms?.count ?? 0),
          true,
        )
      }

      if (config.kind === 'stability') {
        assert.equal(
          (after.customCounters.adaptive_dashboard_stability_requests_total ?? 0)
            > (before.customCounters.adaptive_dashboard_stability_requests_total ?? 0),
          true,
        )
        assert.equal(
          (after.customTimings.adaptive_dashboard_stability_build_duration_ms?.count ?? 0)
            > (before.customTimings.adaptive_dashboard_stability_build_duration_ms?.count ?? 0),
          true,
        )
      }
    }

    const evidenceRepository = harness.app.backendContext.adaptiveEquilibriumEvidenceRepository as any

    const timelineFromEarlierNow = await createAdaptiveTimelineDashboardService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T11:00:00.000Z',
    }).buildDashboard({ historyLimit: 240, rollingHours: [6, 24, 72] })
    const timelineFromLaterNow = await createAdaptiveTimelineDashboardService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T16:00:00.000Z',
    }).buildDashboard({ historyLimit: 240, rollingHours: [6, 24, 72] })
    assert.notEqual(timelineFromEarlierNow.generatedAt, timelineFromLaterNow.generatedAt)
    assert.equal(timelineFromEarlierNow.payloadFingerprint, timelineFromLaterNow.payloadFingerprint)

    const replayFromEarlierNow = await createReplayConsistencyGraphService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T11:00:00.000Z',
    }).buildReplayGraphs({ historyLimit: 240, rollingHours: [6, 24, 72], replayConsistencyBucketCount: 5 })
    const replayFromLaterNow = await createReplayConsistencyGraphService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T16:00:00.000Z',
    }).buildReplayGraphs({ historyLimit: 240, rollingHours: [6, 24, 72], replayConsistencyBucketCount: 5 })
    assert.notEqual(replayFromEarlierNow.generatedAt, replayFromLaterNow.generatedAt)
    assert.equal(replayFromEarlierNow.payloadFingerprint, replayFromLaterNow.payloadFingerprint)

    const heatmapFromEarlierNow = await createAdaptiveHeatmapService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T11:00:00.000Z',
    }).buildHeatmaps({ historyLimit: 240, hotspotLimit: 10 })
    const heatmapFromLaterNow = await createAdaptiveHeatmapService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T16:00:00.000Z',
    }).buildHeatmaps({ historyLimit: 240, hotspotLimit: 10 })
    assert.notEqual(heatmapFromEarlierNow.generatedAt, heatmapFromLaterNow.generatedAt)
    assert.equal(heatmapFromEarlierNow.payloadFingerprint, heatmapFromLaterNow.payloadFingerprint)

    const stabilityFromEarlierNow = await createLongitudinalStabilityScoreService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T11:00:00.000Z',
    }).buildStabilityScore({ historyLimit: 240, rollingHours: [6, 24, 72] })
    const stabilityFromLaterNow = await createLongitudinalStabilityScoreService({
      listEvidenceChronological: evidenceRepository.listEvidenceChronological.bind(evidenceRepository),
      now: () => '2026-05-08T16:00:00.000Z',
    }).buildStabilityScore({ historyLimit: 240, rollingHours: [6, 24, 72] })
    assert.notEqual(stabilityFromEarlierNow.generatedAt, stabilityFromLaterNow.generatedAt)
    assert.equal(stabilityFromEarlierNow.payloadFingerprint, stabilityFromLaterNow.payloadFingerprint)

    const stabilityRouteResponse = await harness.app.inject({
      method: 'GET',
      url: '/admin/adaptive-dashboard/stability-score?historyLimit=240&rollingHours=6,24,72',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(stabilityRouteResponse.statusCode, 200)
    const stabilityRoutePayload = stabilityRouteResponse.json()
    assert.equal(stabilityRoutePayload.compatibility.highestRiskClassification, 'FULLY_COMPATIBLE')
    assert.deepEqual(
      stabilityRoutePayload.stabilityScoringArchitecture.componentSemantics.driftStability.sourceFields,
      ['projectionLockInPersistence', 'lowConfidenceAmplificationPersistence'],
    )
    assert.deepEqual(
      stabilityRoutePayload.stabilityScoringArchitecture.componentSemantics.equilibriumConvergence.sourceFields,
      ['projectionStabilityConvergence'],
    )
    assert.equal(
      stabilityRoutePayload.currentScore.components.driftStability
        !== stabilityRoutePayload.currentScore.components.equilibriumConvergence,
      true,
    )
  } finally {
    await harness.close()
  }
})
