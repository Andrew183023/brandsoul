import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

import { registerApi } from './api/index.js'
import { createAuthService } from './auth/authService.js'
import { createAuthSovereignMutationService } from './auth/authSovereignMutationService.js'
import { getAuthConfig } from './auth/authConfig.js'
import { createAuthObservabilityService } from './auth/authObservabilityService.js'
import { createJwksService } from './auth/jwksService.js'
import { createBackendNativeAuthStoreRepository } from './auth/repositories/backendNativeAuthStoreRepository.js'
import { createDualAuthStoreAdapter } from './auth/repositories/dualAuthStoreAdapter.js'
import { createLegacyAuthStoreRepository } from './auth/repositories/legacyAuthStoreRepository.js'
import { createRefreshSessionRepository } from './auth/repositories/refreshSessionRepository.js'
import { createSigningKeyRepository } from './auth/repositories/signingKeyRepository.js'
import { createSigningKeyService } from './auth/signingKeyService.js'
import { createTokenService } from './auth/tokenService.js'
import { registerObservabilityHooks } from './api/middleware/observability.js'
import {
  assertRenderDeploySafety,
  getAdaptiveInfluenceEnvConfig,
  getCorsOrigins,
  getHighRiskGovernanceMode,
  getLegalCaseDispatchTimeoutSeconds,
  getLegalMarketplaceEntityId,
  getLongitudinalObservationMode,
  getRenderDeployMode,
  getReplayIdentityOverrideApprover,
  getReplayIdentityOverrideReason,
  getReplayIdentityOverrideUntil,
  getReplayIdentityFreezeOverrideEnabled,
  getReplayIdentityObservationConfigLockHash,
  getRuntimeDeploymentEnvironment,
  isIsolatedTestRuntimeMode,
  validateRuntimeConfig,
} from './config/env.js'
import { createDatabaseConnection, getDatabaseConfig, initializeDatabase } from './db/index.js'
import { createJobsContext } from './jobs/index.js'
import {
  createEntityCognitiveMemoryRepository,
  createEntityEventLogRepository,
  createEntityExportRepository,
  createEntityRelationshipRepository,
  createEntityRepository,
  createFlowMindDecisionJournalRepository,
  createFlowMindExecutionLedgerRepository,
  createGlobalFeedRepository,
  createGrowthRepository,
  createMonetizationRepository,
  createOrchestratorSnapshotRepository,
  createPortfolioLeadRepository,
  createPortfolioLeadRevenueEventRepository,
  createPortfolioLeadSignalRepository,
  createPortfolioProposalRepository,
  createPortfolioProposalOutcomeRepository,
  createRelationalTraceRepository,
  createSocialSignalRepository,
} from './repositories/index.js'
import { createGlobalFeedEngine } from './services/globalFeedEngine.js'
import { createDiscoveryEngine } from './services/discoveryEngine.js'
import { createRelationshipEngine } from './services/relationshipEngine.js'
import { createSocialSignalEngine } from './services/socialSignalEngine.js'
import { createAssetStorageService, getAssetStorageConfig } from './services/assetStorageService.js'
import { createBillingService } from './services/billingService.js'
import { loadBrandSoulShadowAdapterResult } from './services/brandSoulShadowAdapter.js'
import { createFlowMindService } from './services/flowMindService.js'
import { createPersistentEntityCognitiveMemoryStore } from './flowmind/index.js'
import { GrowthEngine } from './domain/growth/GrowthEngine.js'
import { createMonetizationService } from './services/monetizationService.js'
import {
  createInstitutionalContinuityGovernanceService,
  isInstitutionalContinuityBlockedError,
} from './services/institutionalContinuityGovernanceService.js'
import { createObservabilityService } from './services/observabilityService.js'
import { createRuntimeContinuityAttestationService } from './services/runtimeContinuityAttestationService.js'
import {
  createInstitutionalRecoveryGovernanceService,
  installInstitutionalRecoveryGovernanceService,
} from './services/institutionalRecoveryGovernanceService.js'
import { createPublicCacheService } from './services/publicCacheService.js'
import { createRuntimeGovernanceService, type RuntimeSubsystemCriticality } from './services/runtimeGovernanceService.js'
import { startRuntimeWithGovernance } from './services/runtimeStartupPolicy.js'
import { seedProfessionals } from './dev/seedProfessionals.js'
import { createMultiEntityRegistry } from './orchestrator/multiEntityRegistry.js'
import { createFlowMindApprovalQueue } from './orchestrator/approvalQueue.js'
import { createFlowMindCommandTransactionService } from './orchestrator/flowMindCommandTransactionService.js'
import { createEconomicSnapshotStore } from './orchestrator/economicSnapshotStore.js'
import { createPortfolioOperationsService } from './orchestrator/portfolioOperationsService.js'
import { createPortfolioProposalLifecycleService } from './orchestrator/portfolioProposalLifecycleService.js'
import { createSovereignMutationCommandService } from './orchestrator/sovereignMutationCommandService.js'
import { isRuntimeGovernanceBlockedError } from './orchestrator/sovereignMutationCommandService.js'
import { createSearchApiGoogleTrendsProvider } from './market-signals/providers/searchApiGoogleTrendsProvider.js'
import { createOpportunityRuntime } from './market-signals/opportunities/runtime/opportunityRuntime.js'
import { createOpportunitySnapshotStore } from './market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import { createOpportunityGovernanceRuntime } from './market-signals/opportunities/governance/runtime/opportunityGovernanceRuntime.js'
import { createOpportunityGovernanceSnapshotStore } from './market-signals/opportunities/governance/runtime/opportunityGovernanceSnapshotStore.js'
import { createMarketSignalRuntime } from './market-signals/runtime/marketSignalRuntime.js'
import { createMarketSignalSnapshotStore } from './market-signals/runtime/marketSignalSnapshotStore.js'
import { createSovereignExecutionRuntime } from './execution/runtime/sovereignExecutionRuntime.js'
import { createSovereignExecutionSnapshotStore } from './execution/runtime/sovereignExecutionSnapshotStore.js'
import { createRevenueAttributionRuntime } from './execution/revenue/runtime/revenueAttributionRuntime.js'
import { createRevenueAttributionSnapshotStore } from './execution/revenue/runtime/revenueAttributionSnapshotStore.js'
import { createExecutionRepository } from './persistence/executions/executionRepository.js'
import { createEconomicMemoryRepository } from './persistence/economic/economicMemoryRepository.js'
import { createOpportunityRepository } from './persistence/opportunities/opportunityRepository.js'
import { createProposalRepository } from './persistence/opportunities/proposalRepository.js'
import { createRevenueAttributionRepository } from './persistence/revenue/revenueAttributionRepository.js'
import { createLearningLedgerRepository } from './learning/persistence/learningLedgerRepository.js'
import { createLearningCheckpointRepository } from './learning/persistence/learningCheckpointRepository.js'
import { createNegativeOutcomeRepository } from './learning/persistence/negativeOutcomeRepository.js'
import { createNegativeAttributionRepository } from './learning/persistence/negativeAttributionRepository.js'
import { createAdaptiveEquilibriumEvidenceRepository } from './learning/persistence/adaptiveEquilibriumEvidenceRepository.js'
import { createGovernanceEvidenceTimelineRepository } from './learning/persistence/governanceEvidenceTimelineRepository.js'
import { createNegativeAttributionRuntime } from './learning/negative-attribution/runtime/negativeAttributionRuntime.js'
import { createNegativeAttributionSnapshotStore } from './learning/negative-attribution/runtime/negativeAttributionSnapshotStore.js'
import { createEconomicFeedbackRuntime } from './learning/runtime/economicFeedbackRuntime.js'
import { createTerminalFailureDetectionRuntime } from './learning/runtime/terminalFailureDetectionRuntime.js'
import type { AdaptiveWeightSnapshotRuntime } from './learning/runtime/adaptiveWeightSnapshotRuntime.js'
import { createAdaptiveWeightSnapshotRuntime } from './learning/runtime/adaptiveWeightSnapshotRuntime.js'
import { createAdaptiveInfluenceGateRuntime } from './learning/runtime/adaptiveInfluenceGateRuntime.js'
import { createEconomicMemoryRebuildService } from './learning/rebuild/economicMemoryRebuildService.js'
import { createShadowProposalConfidenceRuntime } from './learning/shadow/shadowProposalConfidenceRuntime.js'
import { createAdaptiveTimelineDashboardService } from './learning/observability/adaptiveTimelineDashboardService.js'
import { createAdaptiveHeatmapService } from './learning/observability/adaptiveHeatmapService.js'
import { createLongitudinalStabilityScoreService } from './learning/observability/longitudinalStabilityScoreService.js'
import { createReplayConsistencyGraphService } from './learning/observability/replayConsistencyGraphService.js'
import { createGovernanceEvidenceTimelineService } from './learning/governance/governanceEvidenceTimelineService.js'
import { validateReplayIdentityOperationalFreeze } from './learning/governance/replayIdentityOperationalFreeze.js'
import { setSovereignMutationBoundaryEnforcement } from './sovereignty/authorityBoundary.js'
import {
  createInstitutionalSovereignMutationGate,
  getInstitutionalSovereignMutationGate,
  installInstitutionalSovereignMutationGate,
  InstitutionalSovereignMutationBlockedError,
} from './sovereignty/institutionalSovereignMutationGate.js'
import {
  createSemanticMutationExecutor,
  installSemanticMutationExecutor,
} from './sovereignty/semanticMutationExecutor.js'
import {
  createSovereignPersistenceCoordinationService,
  installSovereignPersistenceCoordinationService,
} from './sovereignty/sovereignPersistenceCoordinationService.js'
import {
  createDistributedSovereigntyService,
  installDistributedSovereigntyService,
} from './sovereignty/distributedSovereigntyService.js'

export async function buildServer() {
  assertRenderDeploySafety()
  validateRuntimeConfig()
  const allowedCorsOrigins = new Set(getCorsOrigins())
  const isolatedRuntimeMode = isIsolatedTestRuntimeMode()
  const disableExternalProviders = (process.env.FLOWMIND_DISABLE_EXTERNAL_PROVIDERS ?? '').toLowerCase() === 'true'
  const renderDeployMode = getRenderDeployMode()

  const app = Fastify({
    logger: true,
  })

  app.log.info({
    event: 'ci.runtime.initialized',
    isolatedRuntimeMode,
    disableExternalProviders,
    renderDeployMode,
  }, 'CI runtime initialized')

  app.setErrorHandler((error, request, reply) => {
    if (isInstitutionalContinuityBlockedError(error)) {
      return reply.status(503).send({
        status: 'failed',
        error: {
          code: error.code,
          message: error.message,
        },
        continuityMode: error.continuityMode,
        persistenceTruthfulness: error.persistenceTruthfulness,
        recoveryRequired: error.recoveryRequired,
        degradedMemoryFallbackActive: error.degradedMemoryFallbackActive,
        unsafeShutdownDetected: error.unsafeShutdownDetected,
        replayContinuityState: error.replayContinuityState,
        restartIntegrityState: error.restartIntegrityState,
        blockedCapabilities: error.blockedCapabilities,
        continuityDecision: error.continuityDecision,
      })
    }

    if (isRuntimeGovernanceBlockedError(error)) {
      return reply.status(503).send({
        status: 'failed',
        error: {
          code: error.code,
          message: error.message,
        },
        runtimeMode: error.runtimeMode,
        degradedReason: error.degradedReason,
        blockedCapabilities: error.blockedCapabilities,
        governanceDecision: error.governanceDecision,
      })
    }

    if (error instanceof InstitutionalSovereignMutationBlockedError) {
      return reply.status(error.statusCode).send({
        status: 'failed',
        error: {
          code: error.code,
          message: error.message,
        },
        attestation: error.attestation,
        blockedCapabilities: error.blockedCapabilities,
      })
    }

    request.log.error(error)
    return reply.send(error)
  })

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin

    if (origin && allowedCorsOrigins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin)
      reply.header('Vary', 'Origin')
      reply.header('Access-Control-Allow-Credentials', 'true')
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-tenant-id, x-case-claim-token')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    }

    if (request.method === 'OPTIONS') {
      return reply.status(204).send()
    }
  })

  const db = getDatabaseConfig()
  const connection = await createDatabaseConnection(db)
  await initializeDatabase(connection)
  const observability = createObservabilityService()
  if (isolatedRuntimeMode) {
    observability.incrementMetric('hermetic_test_runtime_total', 1, { mode: 'isolated' })
    observability.incrementMetric('isolated_runtime_boot_total', 1, { mode: 'isolated' })
    app.log.info({
      event: 'hermetic.runtime.mode.active',
      runtimeMode: 'isolated',
    }, 'Isolated runtime mode active')
  }

  if (disableExternalProviders) {
    app.log.info({
      event: 'hermetic.external-providers.disabled',
      reason: 'FLOWMIND_DISABLE_EXTERNAL_PROVIDERS=true',
    }, 'External providers disabled')
  }
  const sovereignPersistenceCoordination = createSovereignPersistenceCoordinationService({
    db: connection,
    observability,
    logger: app.log,
  })
  installSovereignPersistenceCoordinationService(sovereignPersistenceCoordination)
  const runtimeGovernance = createRuntimeGovernanceService({ observability })
  const institutionalContinuityGovernance = createInstitutionalContinuityGovernanceService({
    db: connection,
    observability,
    logger: app.log,
  })
  await institutionalContinuityGovernance.initialize()
  const runtimeContinuityAttestationService = createRuntimeContinuityAttestationService({
    db: connection,
    observability,
    logger: app.log,
  })
  const institutionalRecoveryGovernance = createInstitutionalRecoveryGovernanceService({
    db: connection,
    observability,
    logger: app.log,
    continuityGovernance: institutionalContinuityGovernance,
    runtimeContinuityAttestationService,
  })
  installInstitutionalRecoveryGovernanceService(institutionalRecoveryGovernance)
  const institutionalSovereignMutationGate = createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    logger: app.log,
    persistenceCoordination: sovereignPersistenceCoordination,
    runtimeGovernance,
    continuityGovernance: institutionalContinuityGovernance,
    runtimeContinuityAttestationService,
    recoveryGovernance: institutionalRecoveryGovernance,
  })
  installInstitutionalSovereignMutationGate(institutionalSovereignMutationGate)
  installSemanticMutationExecutor(createSemanticMutationExecutor({
    db: connection,
    observability,
    logger: app.log,
    persistenceCoordination: sovereignPersistenceCoordination,
  }))
  const distributedSovereigntyService = createDistributedSovereigntyService({
    db: connection,
    observability,
    logger: app.log,
    consensusMode: 'single_writer',
    defaultNodeIdentity: {
      nodeClass: (process.env.DISTRIBUTED_SOVEREIGN_NODE_CLASS as 'primary' | 'secondary' | 'observer' | 'replay' | 'recovery' | undefined) ?? 'primary',
      nodeId: process.env.DISTRIBUTED_SOVEREIGN_NODE_ID,
      institutionalPlaneId: process.env.DISTRIBUTED_INSTITUTIONAL_PLANE_ID ?? 'institutional-plane:singleton',
      lineagePlaneId: process.env.DISTRIBUTED_LINEAGE_PLANE_ID ?? 'lineage-plane:singleton',
      replayPlaneId: process.env.DISTRIBUTED_REPLAY_PLANE_ID ?? 'replay-plane:singleton',
      authorityPlaneId: process.env.DISTRIBUTED_AUTHORITY_PLANE_ID ?? 'authority-plane:single-writer',
      persistencePlaneId: process.env.DISTRIBUTED_PERSISTENCE_PLANE_ID ?? 'persistence-plane:single-writer',
      nodeEpoch: process.env.DISTRIBUTED_NODE_EPOCH,
    },
  })
  installDistributedSovereigntyService(distributedSovereigntyService)
  setSovereignMutationBoundaryEnforcement(true)
  const publicCacheService = createPublicCacheService()
  const assetStorageService = createAssetStorageService(getAssetStorageConfig(process.cwd()))
  const entityRepository = createEntityRepository(connection)
  const eventLogRepository = createEntityEventLogRepository(connection)
  const entityExportRepository = createEntityExportRepository(connection)
  const entityRelationshipRepository = createEntityRelationshipRepository(connection)
  const globalFeedRepository = createGlobalFeedRepository(connection)
  const growthRepository = createGrowthRepository(connection)
  const monetizationRepository = createMonetizationRepository(connection)
  const socialSignalRepository = createSocialSignalRepository(connection)
  const orchestratorSnapshotRepository = createOrchestratorSnapshotRepository(connection)
  const portfolioLeadRepository = createPortfolioLeadRepository(connection)
  const portfolioLeadRevenueEventRepository = createPortfolioLeadRevenueEventRepository(connection)
  const portfolioLeadSignalRepository = createPortfolioLeadSignalRepository(connection)
  const portfolioProposalRepository = createPortfolioProposalRepository(connection)
  const portfolioProposalOutcomeRepository = createPortfolioProposalOutcomeRepository(connection)
  const relationalTraceRepository = createRelationalTraceRepository(connection)
  const entityCognitiveMemoryRepository = createEntityCognitiveMemoryRepository(connection)
  const flowMindDecisionJournalRepository = createFlowMindDecisionJournalRepository(connection)
  const flowMindExecutionLedgerRepository = createFlowMindExecutionLedgerRepository(connection)
  const opportunityRepository = createOpportunityRepository(connection)
  const opportunityProposalRepository = createProposalRepository(connection)
  const executionRepository = createExecutionRepository(connection)
  const revenueAttributionRepository = createRevenueAttributionRepository(connection)
  const economicMemoryRepository = createEconomicMemoryRepository(connection)
  const learningLedgerRepository = createLearningLedgerRepository(connection)
  const learningCheckpointRepository = createLearningCheckpointRepository(connection)
  const negativeOutcomeRepository = createNegativeOutcomeRepository(connection)
  const negativeAttributionRepository = createNegativeAttributionRepository(connection)
  const adaptiveEquilibriumEvidenceRepository = createAdaptiveEquilibriumEvidenceRepository(connection)
  const governanceEvidenceTimelineRepository = createGovernanceEvidenceTimelineRepository(connection)
  const multiEntityRegistry = createMultiEntityRegistry(connection)
  const flowMindApprovalQueue = createFlowMindApprovalQueue(connection)
  const authConfig = getAuthConfig()
  const legacyAuthStoreRepository = createLegacyAuthStoreRepository(authConfig.legacyAuthDbPath)
  const backendNativeAuthStoreRepository = createBackendNativeAuthStoreRepository(connection)
  const refreshSessionRepository = createRefreshSessionRepository(connection)
  const signingKeyRepository = createSigningKeyRepository(connection)
  const authObservabilityService = createAuthObservabilityService(
    observability,
    refreshSessionRepository,
    signingKeyRepository,
    app.log,
  )
  const signingKeyService = createSigningKeyService(signingKeyRepository, authConfig)
  await signingKeyService.syncConfiguredKey()
  const tokenService = createTokenService(authConfig, signingKeyService)
  const authIdentityStoreRepository = createDualAuthStoreAdapter(
    legacyAuthStoreRepository,
    backendNativeAuthStoreRepository,
    {
      mode: authConfig.authStoreMode,
      logger: app.log,
      observability,
    },
  )
  const authSovereignMutationService = createAuthSovereignMutationService({
    db: connection,
    observability,
    logger: app.log,
  })
  const authService = createAuthService(
    connection,
    authConfig,
    authIdentityStoreRepository,
    signingKeyService,
    tokenService,
    observability,
    authSovereignMutationService,
  )
  const jwksService = createJwksService(signingKeyService, tokenService)
  const globalFeedEngine = createGlobalFeedEngine(globalFeedRepository)
  const socialSignalEngine = createSocialSignalEngine(socialSignalRepository, globalFeedEngine)
  const relationshipEngine = createRelationshipEngine({
    createRelationship: (input) => entityRelationshipRepository.createRelationship(input),
    getRelationship: (input) => entityRelationshipRepository.getRelationship(input),
    updateRelationship: async (input) => {
      const record = await entityRelationshipRepository.updateRelationship(input)
      if (record) {
        return record
      }

      return entityRelationshipRepository.createRelationship(input)
    },
    getConnections: (entityId) => entityRelationshipRepository.getConnections(entityId),
  })
  const billingService = createBillingService(monetizationRepository)
  const monetizationService = createMonetizationService(monetizationRepository)
  const brandSoulShadowAdapter = await loadBrandSoulShadowAdapterResult()
  const entityCognitiveMemoryStore = createPersistentEntityCognitiveMemoryStore({
    repository: entityCognitiveMemoryRepository,
    continuityGovernance: institutionalContinuityGovernance,
  })
  const flowMindService = createFlowMindService({
    mode: 'shadow',
    adapter: brandSoulShadowAdapter.adapter,
    adapterLoadStatus: brandSoulShadowAdapter.status,
    adapterLoadReason: brandSoulShadowAdapter.reason,
    memoryStore: entityCognitiveMemoryStore,
  })
  const growthEngine = new GrowthEngine(
    growthRepository,
    entityRepository,
    entityExportRepository,
    socialSignalRepository,
  )
  const discoveryEngine = createDiscoveryEngine({
    entityRepository,
    eventLogRepository,
    entityExportRepository,
    entityRelationshipRepository,
    globalFeedRepository,
    socialSignalRepository,
    growthEngine,
  })
  const { jobQueue, jobProducer, jobWorker } = createJobsContext({
    db: connection,
    assetStorageService,
    entityExportRepository,
    socialSignalEngine,
    globalFeedEngine,
    monetizationService,
    discoveryEngine,
    growthEngine,
    orchestratorSnapshotRepository,
    observability,
    logger: app.log,
  })

  if (!isolatedRuntimeMode) {
    await jobWorker.start()
  }

  const portfolioOperationsService = createPortfolioOperationsService({
    registry: multiEntityRegistry,
    entityRepository,
    leadRepository: portfolioLeadRepository,
    revenueEventRepository: portfolioLeadRevenueEventRepository,
    leadSignalRepository: portfolioLeadSignalRepository,
    proposalRepository: portfolioProposalRepository,
  })
  const economicSnapshotStore = createEconomicSnapshotStore({
    portfolioOperationsService,
    multiEntityRegistry,
    observability,
    logger: app.log,
  })
  const marketSignalSnapshotStore = createMarketSignalSnapshotStore()
  const marketSignalsProvider = disableExternalProviders
    ? {
      async getTrendingNow() {
        return []
      },
    }
    : createSearchApiGoogleTrendsProvider()
  const marketSignalRuntime = createMarketSignalRuntime({
    provider: marketSignalsProvider,
    store: marketSignalSnapshotStore,
  })
  const opportunitySnapshotStore = createOpportunitySnapshotStore()
  const opportunityRuntime = createOpportunityRuntime({
    marketSignalSnapshotStore,
    opportunitySnapshotStore,
    opportunityRepository,
    listAvailableEntities: async () => {
      const registryEntries = await multiEntityRegistry.listEntities()
      return registryEntries.map((entry) => ({
        entityId: entry.entityId,
        entityName: entry.entityId,
        market: entry.market,
        category: entry.entityType,
      }))
    },
  })
  const opportunityGovernanceSnapshotStore = createOpportunityGovernanceSnapshotStore()
  const opportunityGovernanceRuntime = createOpportunityGovernanceRuntime({
    connection,
    opportunitySnapshotStore,
    opportunityGovernanceSnapshotStore,
    proposalRepository: opportunityProposalRepository,
  })
  const sovereignExecutionSnapshotStore = createSovereignExecutionSnapshotStore()
  const sovereignExecutionRuntime = createSovereignExecutionRuntime({
    opportunityGovernanceSnapshotStore,
    sovereignExecutionSnapshotStore,
    executionRepository,
  })
  const revenueAttributionSnapshotStore = createRevenueAttributionSnapshotStore()
  const revenueAttributionRuntime = createRevenueAttributionRuntime({
    opportunitySnapshotStore,
    opportunityGovernanceSnapshotStore,
    sovereignExecutionSnapshotStore,
    revenueEventRepository: portfolioLeadRevenueEventRepository,
    revenueAttributionRepository,
    revenueAttributionSnapshotStore,
  })
  const economicFeedbackRuntime = createEconomicFeedbackRuntime({
    revenueAttributionSnapshotStore,
    opportunitySnapshotStore,
    sovereignExecutionSnapshotStore,
    negativeOutcomeRepository,
    learningLedgerRepository,
    economicMemoryRepository,
    learningCheckpointRepository,
  })
  const terminalFailureDetectionRuntime = createTerminalFailureDetectionRuntime({
    opportunitySnapshotStore,
    opportunityGovernanceSnapshotStore,
    sovereignExecutionSnapshotStore,
    negativeOutcomeRepository,
  })
  const negativeAttributionSnapshotStore = createNegativeAttributionSnapshotStore()
  const negativeAttributionRuntime = createNegativeAttributionRuntime({
    negativeOutcomeRepository,
    negativeAttributionRepository,
    negativeAttributionSnapshotStore,
  })
  const adaptiveWeightSnapshotRuntime = createAdaptiveWeightSnapshotRuntime({
    economicMemoryRepository,
  })
  const governanceEvidenceTimelineService = createGovernanceEvidenceTimelineService({
    repository: governanceEvidenceTimelineRepository,
    listEvidenceChronological: (args) => adaptiveEquilibriumEvidenceRepository.listEvidenceChronological(args),
  })
  const adaptiveInfluenceEnvConfig = getAdaptiveInfluenceEnvConfig()
  const runtimeEnvironment = getRuntimeDeploymentEnvironment()
  const replayIdentityOperationalFreezeStatus = validateReplayIdentityOperationalFreeze({
    adaptiveInfluenceConfig: adaptiveInfluenceEnvConfig,
    observationMode: getLongitudinalObservationMode(),
    allowOverride: getReplayIdentityFreezeOverrideEnabled(),
    runtimeEnvironment,
    highRiskGovernanceMode: getHighRiskGovernanceMode(),
    overrideUntil: getReplayIdentityOverrideUntil(),
    overrideReason: getReplayIdentityOverrideReason(),
    overrideApprover: getReplayIdentityOverrideApprover(),
    expectedObservationConfigHash: getReplayIdentityObservationConfigLockHash(),
  })
  if (!isolatedRuntimeMode && replayIdentityOperationalFreezeStatus.freezeStatus === 'override_active' && replayIdentityOperationalFreezeStatus.overrideActivation) {
    const override = replayIdentityOperationalFreezeStatus.overrideActivation
    const triggerFactors = [
      `environment:${override.environment}`,
      `approver:${override.approver}`,
      `until:${override.until}`,
      `reason:${override.reason}`,
      ...replayIdentityOperationalFreezeStatus.driftWarnings.map((warning) => `warning:${warning.code}`),
    ]

    await getInstitutionalSovereignMutationGate().evaluateAndExecute({
      authoritySource: 'backend/src/server.ts#buildServer.replayIdentityOverrideAudit',
      context: {
        mutationType: 'governance.override.audit',
        mutationScope: 'governance',
        requestedCapability: 'governance.replay.generate',
        runtimeMode: runtimeGovernance.getStatus().runtimeMode,
        continuityMode: institutionalContinuityGovernance.getStatus().continuityMode,
        replayVerificationState: runtimeContinuityAttestationService.getStatus().replayVerificationState,
        attestationIntegrity: runtimeContinuityAttestationService.getStatus().attestationIntegrity,
        recoveryRequired: institutionalContinuityGovernance.getStatus().recoveryRequired,
        actor: 'governance',
        traceId: `replay-identity-override:${override.until}`,
      },
      work: () => governanceEvidenceTimelineRepository.appendEvent({
      eventType: 'override_activation',
      timestamp: override.activatedAt,
      classification: 'CAUTION',
      recommendation: 'do_not_rollout',
      severity: override.warningOnly ? 'HIGH' : 'CRITICAL',
      triggerFactors,
      replayFingerprint: replayIdentityOperationalFreezeStatus.currentManifestHash,
      longitudinalWindow: 'long',
      sourceEvidenceId: `replay-identity-override:${override.until}`,
      }),
    })

    app.log.warn({
      event: 'adaptive-governance.replay-identity-freeze.override',
      environment: override.environment,
      until: override.until,
      approver: override.approver,
      reason: override.reason,
      warningOnly: override.warningOnly,
      currentManifestHash: replayIdentityOperationalFreezeStatus.currentManifestHash,
      expectedManifestHash: replayIdentityOperationalFreezeStatus.expectedManifestHash,
    }, 'Replay identity override active')
  }
  app.log.info({
    event: 'adaptive-governance.replay-identity-freeze.status',
    freezeStatus: replayIdentityOperationalFreezeStatus.freezeStatus,
    driftDetected: replayIdentityOperationalFreezeStatus.driftDetected,
    observationModeLocked: replayIdentityOperationalFreezeStatus.observationModeLocked,
    currentManifestHash: replayIdentityOperationalFreezeStatus.currentManifestHash,
    expectedManifestHash: replayIdentityOperationalFreezeStatus.expectedManifestHash,
  }, 'Replay identity operational freeze status')
  const runtimeAttestationValidation = await runtimeContinuityAttestationService.validateRecovery({
    shutdownIntegrityState: institutionalContinuityGovernance.getStatus().shutdownIntegrityState,
  })
  const restartContinuityValidation = await institutionalContinuityGovernance.validateStartup({
    replayIdentityOperationalFreezeStatus,
    learningCheckpointRepository,
    runtimeContinuityAttestationValidationResult: runtimeAttestationValidation,
  })
  const recoveryStatus = await institutionalRecoveryGovernance.initializeRecovery({
    replayIdentityOperationalFreezeStatus,
    shutdownIntegrityState: institutionalContinuityGovernance.getStatus().shutdownIntegrityState,
    startupValidation: restartContinuityValidation,
    runtimeAttestationValidation: runtimeAttestationValidation,
  })
  if (restartContinuityValidation.failStartup || !recoveryStatus.institutionalUnlockAllowed) {
    const failure = new Error(restartContinuityValidation.reasons.join('; ') || 'Institutional continuity validation failed.')
    ;(failure as Error & { code?: string }).code = 'INSTITUTIONAL_CONTINUITY_STARTUP_BLOCKED'
    throw failure
  }
  if (!isolatedRuntimeMode) {
    await institutionalContinuityGovernance.markRuntimeStarted()
    const distributedNode = await distributedSovereigntyService.registerNode()
    const distributedContinuityEpoch = runtimeContinuityAttestationService.buildContinuityEpoch()
    const distributedStartupLineage = await distributedSovereigntyService.appendDistributedLineage({
      originatingNodeId: distributedNode.nodeId,
      continuityEpoch: distributedContinuityEpoch,
      attestationLineageHash: distributedNode.startupAttestationHash,
      semanticLineageHash: distributedNode.startupAttestationHash,
    })
    await distributedSovereigntyService.persistDistributedAttestation({
      nodeId: distributedNode.nodeId,
      attestationPlane: 'continuity',
      lineageHash: distributedStartupLineage.distributedClockHash,
      continuityEpoch: distributedContinuityEpoch,
    })
    await distributedSovereigntyService.recordDistributedRecoveryEpoch({
      nodeId: distributedNode.nodeId,
      recoveryEpoch: `distributed-recovery:${distributedContinuityEpoch}`,
      continuityEpoch: distributedContinuityEpoch,
      recoveryState: recoveryStatus.recoveryState,
      federatedCoordinationState: 'metadata_only',
      replayRestorationMarker: runtimeContinuityAttestationService.getStatus().replayVerificationState,
      metadata: {
        institutionalUnlockAllowed: recoveryStatus.institutionalUnlockAllowed,
        replayRestorationState: recoveryStatus.replayRestorationState,
        lineageReconciliationState: recoveryStatus.lineageReconciliationState,
      },
    })
  }
  const adaptiveInfluenceGateRuntime = createAdaptiveInfluenceGateRuntime({
    adaptiveWeightSnapshotRuntime,
    economicMemoryRepository,
    adaptiveEquilibriumEvidenceRepository,
    learningCheckpointRepository,
    governanceEvidenceTimelineService,
    opportunitySnapshotStore,
    config: adaptiveInfluenceEnvConfig,
  })
  const adaptiveTimelineDashboardService = createAdaptiveTimelineDashboardService({
    listEvidenceChronological: (args) => adaptiveEquilibriumEvidenceRepository.listEvidenceChronological(args),
  })
  const adaptiveHeatmapService = createAdaptiveHeatmapService({
    listEvidenceChronological: (args) => adaptiveEquilibriumEvidenceRepository.listEvidenceChronological(args),
  })
  const longitudinalStabilityScoreService = createLongitudinalStabilityScoreService({
    listEvidenceChronological: (args) => adaptiveEquilibriumEvidenceRepository.listEvidenceChronological(args),
  })
  const replayConsistencyGraphService = createReplayConsistencyGraphService({
    listEvidenceChronological: (args) => adaptiveEquilibriumEvidenceRepository.listEvidenceChronological(args),
  })
  const shadowProposalConfidenceRuntime = createShadowProposalConfidenceRuntime({
    opportunitySnapshotStore,
    adaptiveWeightSnapshotRuntime,
  })
  const economicMemoryRebuildService = createEconomicMemoryRebuildService(connection)
  const sovereignMutationCommandService = createSovereignMutationCommandService({
    connection,
    runtimeGovernance,
    continuityGovernance: institutionalContinuityGovernance,
    flowMindService,
    economicSnapshotStore,
    relationshipEngine,
    socialSignalEngine,
    globalFeedEngine,
    monetizationService,
    growthEngine,
    jobProducer,
  })
  const portfolioProposalLifecycleService = createPortfolioProposalLifecycleService({
    proposalRepository: portfolioProposalRepository,
    outcomeRepository: portfolioProposalOutcomeRepository,
    sovereignCommandService: sovereignMutationCommandService,
  })
  const flowMindCommandTransactionService = createFlowMindCommandTransactionService({
    connection,
    flowMindService,
    ledgerRepository: flowMindExecutionLedgerRepository,
  })

  app.decorate('backendContext', {
    db,
    connection,
    entityRepository,
    eventLogRepository,
    entityExportRepository,
    entityRelationshipRepository,
    globalFeedRepository,
    growthRepository,
    monetizationRepository,
    socialSignalRepository,
    observability,
    sovereignPersistenceCoordination,
    institutionalSovereignMutationGate,
    institutionalContinuityGovernance,
    runtimeContinuityAttestationService,
    runtimeGovernance,
    institutionalRecoveryGovernance,
    distributedSovereigntyService,
    publicCacheService,
    assetStorageService,
    globalFeedEngine,
    socialSignalEngine,
    relationshipEngine,
    billingService,
    monetizationService,
    flowMindService,
    growthEngine,
    discoveryEngine,
    jobQueue,
    jobProducer,
    jobWorker,
    orchestratorSnapshotRepository,
    portfolioLeadSignalRepository,
    portfolioProposalRepository,
    portfolioProposalOutcomeRepository,
    portfolioOperationsService,
    economicSnapshotStore,
    marketSignalSnapshotStore,
    opportunitySnapshotStore,
    opportunityGovernanceSnapshotStore,
    sovereignExecutionSnapshotStore,
    revenueAttributionSnapshotStore,
    negativeOutcomeRepository,
    negativeAttributionRepository,
    negativeAttributionSnapshotStore,
    adaptiveWeightSnapshotRuntime,
    adaptiveInfluenceGateRuntime,
    adaptiveEquilibriumEvidenceRepository,
    governanceEvidenceTimelineService,
    adaptiveTimelineDashboardService,
    adaptiveHeatmapService,
    longitudinalStabilityScoreService,
    replayConsistencyGraphService,
    governanceEvidenceTimelineRepository,
    replayIdentityOperationalFreezeStatus,
    terminalFailureDetectionRuntime,
    negativeAttributionRuntime,
    shadowProposalConfidenceRuntime,
    economicFeedbackRuntime,
    economicMemoryRebuildService,
    learningLedgerRepository,
    learningCheckpointRepository,
    economicMemoryRepository,
    portfolioProposalLifecycleService,
    sovereignMutationCommandService,
    relationalTraceRepository,
    entityCognitiveMemoryStore,
    flowMindDecisionJournalRepository,
    flowMindExecutionLedgerRepository,
    multiEntityRegistry,
    flowMindApprovalQueue,
    flowMindCommandTransactionService,
    auth: {
      config: authConfig,
      authIdentityStoreRepository,
      legacyAuthStoreRepository,
      backendNativeAuthStoreRepository,
      signingKeyRepository,
      refreshSessionRepository,
      signingKeyService,
      tokenService,
      authService,
      authSovereignMutationService,
      jwksService,
      authObservabilityService,
    },
  })

  if (process.env.NODE_ENV !== 'production') {
    await seedProfessionals(app)
  }

  const marketplaceEntityId = getLegalMarketplaceEntityId()
  const marketplaceRow = await connection.get<{ owner_tenant_id: number | null }>(
    `
      SELECT owner_tenant_id
      FROM entity_profile
      WHERE id = ?
    `,
    marketplaceEntityId,
  )
  app.log.info({
    legalMarketplaceEntityId: marketplaceEntityId,
    legalMarketplaceTenantId: typeof marketplaceRow?.owner_tenant_id === 'number' ? marketplaceRow.owner_tenant_id : null,
    legalCaseDispatchTimeoutSeconds: getLegalCaseDispatchTimeoutSeconds(),
  }, 'marketplace.config')

  await registerObservabilityHooks(app)
  if (!isolatedRuntimeMode) {
    await economicSnapshotStore.start()
  }

  const startManagedRuntime = async (args: {
    subsystem: string
    criticality: RuntimeSubsystemCriticality
    start: () => Promise<unknown>
  }) => {
    await startRuntimeWithGovernance({
      ...args,
      runtimeGovernance,
      logger: app.log,
    })
  }

  const startCriticalRuntime = async (args: {
    subsystem: string
    start: () => Promise<unknown>
  }) => startManagedRuntime({
    subsystem: args.subsystem,
    criticality: 'critical',
    start: args.start,
  })

  if (!isolatedRuntimeMode) {
    await startCriticalRuntime({
      subsystem: 'market-signal-runtime',
      start: () => marketSignalRuntime.start(),
    })
    await startCriticalRuntime({
      subsystem: 'opportunity-runtime',
      start: () => opportunityRuntime.start(),
    })
    await startCriticalRuntime({
      subsystem: 'opportunity-governance-runtime',
      start: () => opportunityGovernanceRuntime.start(),
    })
    await startCriticalRuntime({
      subsystem: 'sovereign-execution-runtime',
      start: () => sovereignExecutionRuntime.start(),
    })
    await startCriticalRuntime({
      subsystem: 'revenue-attribution-runtime',
      start: () => revenueAttributionRuntime.start(),
    })
    await startManagedRuntime({
      subsystem: 'terminal-failure-detection-runtime',
      criticality: 'degraded-allowed',
      start: () => terminalFailureDetectionRuntime.start(),
    })
    await startManagedRuntime({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      start: () => negativeAttributionRuntime.start(),
    })
    await startCriticalRuntime({
      subsystem: 'economic-feedback-runtime',
      start: () => economicFeedbackRuntime.start(),
    })
    await startManagedRuntime({
      subsystem: 'adaptive-weight-snapshot-runtime',
      criticality: 'degraded-allowed',
      start: () => adaptiveWeightSnapshotRuntime.start(),
    })
    await startManagedRuntime({
      subsystem: 'adaptive-influence-gate-runtime',
      criticality: 'degraded-allowed',
      start: () => adaptiveInfluenceGateRuntime.start(),
    })
    await startManagedRuntime({
      subsystem: 'shadow-proposal-confidence-runtime',
      criticality: 'optional',
      start: () => shadowProposalConfidenceRuntime.start(),
    })
  }

  await registerApi(app)

  app.addHook('onClose', async () => {
    await institutionalContinuityGovernance.executeGovernedShutdown([
      {
        name: 'governance-event-flush',
        run: async () => undefined,
        runtimeId: 'governance-runtime-plane',
        shutdownPhase: 'runtime_flush',
      },
      {
        name: 'replay-runtime-flush',
        run: async () => {
          try {
            await shadowProposalConfidenceRuntime.stop()
          } catch (error) {
            app.log.warn({
              event: 'shadow-proposal-confidence.runtime.stop.failed',
              error: error instanceof Error ? error.message : 'unknown_error',
            }, 'Shadow proposal confidence runtime stop failed')
          }
          try {
            await adaptiveInfluenceGateRuntime.stop()
          } catch (error) {
            app.log.warn({
              event: 'adaptive-influence.runtime.stop.failed',
              error: error instanceof Error ? error.message : 'unknown_error',
            }, 'Adaptive influence gate runtime stop failed')
          }
          try {
            await adaptiveWeightSnapshotRuntime.stop()
          } catch (error) {
            app.log.warn({
              event: 'adaptive-weights.runtime.stop.failed',
              error: error instanceof Error ? error.message : 'unknown_error',
            }, 'Adaptive weight shadow runtime stop failed')
          }
          try {
            await negativeAttributionRuntime.stop()
          } catch (error) {
            app.log.warn({
              event: 'negative-attribution.runtime.stop.failed',
              error: error instanceof Error ? error.message : 'unknown_error',
            }, 'Negative attribution runtime stop failed')
          }
          try {
            await terminalFailureDetectionRuntime.stop()
          } catch (error) {
            app.log.warn({
              event: 'negative-outcomes.runtime.stop.failed',
              error: error instanceof Error ? error.message : 'unknown_error',
            }, 'Terminal failure detection runtime stop failed')
          }
          await economicFeedbackRuntime.stop()
          await revenueAttributionRuntime.stop()
          await sovereignExecutionRuntime.stop()
          await opportunityGovernanceRuntime.stop()
          await opportunityRuntime.stop()
          await marketSignalRuntime.stop()
        },
        runtimeId: 'replay-runtime-plane',
        shutdownPhase: 'replay_flush',
      },
      {
        name: 'mutation-queue-drain',
        run: async () => {
          await jobWorker.stop()
        },
        runtimeId: 'mutation-queue',
        shutdownPhase: 'queue_drain',
      },
      {
        name: 'persistence-checkpoint-flush',
        run: async () => {
          await economicSnapshotStore.stop()
        },
        runtimeId: 'checkpoint-store',
        shutdownPhase: 'checkpoint_flush',
      },
      {
        name: 'auth-storage-close',
        run: async () => {
          await legacyAuthStoreRepository.close()
        },
      },
    ], {
      runtimeContinuityAttestationService,
    })
    await connection.close()
  })

  return app
}

async function start() {
  const app = await buildServer()
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'

  try {
    await app.listen({ port, host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

const entrypointHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''

if (entrypointHref === import.meta.url) {
  void start()
}
