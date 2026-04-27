export type ServiceHealth = {
  ready: boolean
}

export function getServiceHealth(): ServiceHealth {
  return {
    ready: true,
  }
}

export { AssetStorageService, createAssetStorageService, getAssetStorageConfig } from './assetStorageService.js'
export { DiscoveryEngine, createDiscoveryEngine } from './discoveryEngine.js'
export { ObservabilityService, createObservabilityService } from './observabilityService.js'
export { PublicCacheService, createPublicCacheService } from './publicCacheService.js'
export { BillingService, createBillingService } from './billingService.js'
export { createFlowMindService } from './flowMindService.js'
export type { FlowMindPort, FlowMindServiceMode, FlowMindServiceResult, FlowMindServiceSummary } from './flowMindPort.js'
export { GrowthEngine } from '../domain/growth/GrowthEngine.js'
export { MonetizationService, createMonetizationService } from './monetizationService.js'
export { GlobalFeedEngine, createGlobalFeedEngine } from './globalFeedEngine.js'
export { createJobsContext } from '../jobs/index.js'
export { RelationshipEngine, createRelationshipEngine } from './relationshipEngine.js'
export {
  SocialSignalEngine,
  aggregateSignals,
  computeEngagementScore,
  computeEntityScore,
  createSocialSignalEngine,
  normalizeSocialSignalType,
} from './socialSignalEngine.js'
