export type RepositoryHealth = {
  ready: boolean
}

export function getRepositoryHealth(): RepositoryHealth {
  return {
    ready: true,
  }
}

export { EntityRepository, createEntityRepository } from './entityRepository.js'
export { EntityCognitiveMemoryRepository, createEntityCognitiveMemoryRepository } from './entityCognitiveMemoryRepository.js'
export { EntityEventLogRepository, createEntityEventLogRepository } from './entityEventLogRepository.js'
export { EntityExportRepository, createEntityExportRepository } from './entityExportRepository.js'
export { EntityRelationshipRepository, createEntityRelationshipRepository } from './entityRelationshipRepository.js'
export { FlowMindDecisionJournalRepository, createFlowMindDecisionJournalRepository } from './flowMindDecisionJournalRepository.js'
export { FlowMindExecutionLedgerRepository, createFlowMindExecutionLedgerRepository } from './flowMindExecutionLedgerRepository.js'
export { GlobalFeedRepository, createGlobalFeedRepository } from './globalFeedRepository.js'
export { GrowthRepository, createGrowthRepository } from './growthRepository.js'
export { MonetizationRepository, createMonetizationRepository } from './monetizationRepository.js'
export { OrchestratorSnapshotRepository, createOrchestratorSnapshotRepository } from './orchestratorSnapshotRepository.js'
export { PortfolioLeadRepository, createPortfolioLeadRepository } from './portfolioLeadRepository.js'
export { PortfolioLeadIntakeRepository, createPortfolioLeadIntakeRepository } from './portfolioLeadIntakeRepository.js'
export { PortfolioLeadRevenueEventRepository, createPortfolioLeadRevenueEventRepository } from './portfolioLeadRevenueEventRepository.js'
export { PortfolioLeadSignalRepository, createPortfolioLeadSignalRepository } from './portfolioLeadSignalRepository.js'
export { PortfolioProposalRepository, createPortfolioProposalRepository } from './portfolioProposalRepository.js'
export { PortfolioProposalOutcomeRepository, createPortfolioProposalOutcomeRepository } from './portfolioProposalOutcomeRepository.js'
export { RelationalTraceRepository, createRelationalTraceRepository } from './relationalTraceRepository.js'
export { SocialSignalRepository, createSocialSignalRepository } from './socialSignalRepository.js'
export { RefreshSessionRepository, createRefreshSessionRepository } from '../auth/repositories/refreshSessionRepository.js'
export { SigningKeyRepository, createSigningKeyRepository } from '../auth/repositories/signingKeyRepository.js'
export { AccessAuditRepository, createAccessAuditRepository } from '../auth/repositories/accessAuditRepository.js'
