import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

import { registerApi } from './api/index.js'
import { createAuthService } from './auth/authService.js'
import { getAuthConfig } from './auth/authConfig.js'
import { createAuthObservabilityService } from './auth/authObservabilityService.js'
import { createJwksService } from './auth/jwksService.js'
import { createLegacyAuthStoreRepository } from './auth/repositories/legacyAuthStoreRepository.js'
import { createRefreshSessionRepository } from './auth/repositories/refreshSessionRepository.js'
import { createSigningKeyRepository } from './auth/repositories/signingKeyRepository.js'
import { createSigningKeyService } from './auth/signingKeyService.js'
import { createTokenService } from './auth/tokenService.js'
import { registerObservabilityHooks } from './api/middleware/observability.js'
import { getCorsOrigins, getLegalCaseDispatchTimeoutSeconds, getLegalMarketplaceEntityId, validateRuntimeConfig } from './config/env.js'
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
import { createObservabilityService } from './services/observabilityService.js'
import { createPublicCacheService } from './services/publicCacheService.js'
import { seedProfessionals } from './dev/seedProfessionals.js'
import { createMultiEntityRegistry } from './orchestrator/multiEntityRegistry.js'
import { createFlowMindApprovalQueue } from './orchestrator/approvalQueue.js'
import { createFlowMindCommandTransactionService } from './orchestrator/flowMindCommandTransactionService.js'
import { createPortfolioOperationsService } from './orchestrator/portfolioOperationsService.js'
import { createPortfolioProposalLifecycleService } from './orchestrator/portfolioProposalLifecycleService.js'
import { createSovereignMutationCommandService } from './orchestrator/sovereignMutationCommandService.js'

export async function buildServer() {
  validateRuntimeConfig()
  const allowedCorsOrigins = new Set(getCorsOrigins())

  const app = Fastify({
    logger: true,
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
  const multiEntityRegistry = createMultiEntityRegistry(connection)
  const flowMindApprovalQueue = createFlowMindApprovalQueue(connection)
  const authConfig = getAuthConfig()
  const legacyAuthStoreRepository = createLegacyAuthStoreRepository(authConfig.legacyAuthDbPath)
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
  const authService = createAuthService(
    connection,
    authConfig,
    legacyAuthStoreRepository,
    signingKeyService,
    tokenService,
    observability,
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

  await jobWorker.start()

  const portfolioOperationsService = createPortfolioOperationsService({
    registry: multiEntityRegistry,
    entityRepository,
    leadRepository: portfolioLeadRepository,
    revenueEventRepository: portfolioLeadRevenueEventRepository,
    leadSignalRepository: portfolioLeadSignalRepository,
    proposalRepository: portfolioProposalRepository,
  })
  const sovereignMutationCommandService = createSovereignMutationCommandService({
    connection,
    flowMindService,
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
      legacyAuthStoreRepository,
      signingKeyRepository,
      refreshSessionRepository,
      signingKeyService,
      tokenService,
      authService,
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

  await registerApi(app)

  app.addHook('onClose', async () => {
    await jobWorker.stop()
    await legacyAuthStoreRepository.close()
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
