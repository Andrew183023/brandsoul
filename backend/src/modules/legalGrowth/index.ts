export type {
  GrowthCapacityProjection,
  GrowthCapacityStatus,
  GrowthCityKey,
  GrowthConfidence,
  GrowthCoverageGapType,
  GrowthCoverageProjection,
  GrowthCoverageStatus,
  GrowthDemandProjection,
  GrowthMetricTrend,
  GrowthOpportunity,
  GrowthOpportunityType,
  GrowthOriginKey,
  GrowthPeriod,
  GrowthPeriodGranularity,
  GrowthPriority,
  GrowthRecommendation,
  GrowthRecommendationType,
  GrowthScoreCard,
  GrowthScoreProjection,
  GrowthScoreValue,
  GrowthSpecialtyKey,
  GrowthTerritoryProjection,
} from './GrowthTypes.js'
export type { GrowthEvidence, GrowthEvidenceType } from './GrowthEvidence.js'
export type { GrowthSnapshot } from './GrowthSnapshot.js'
export type { GrowthSummary } from './GrowthSummary.js'
export type { GrowthContext, GrowthProfessionalContext } from './GrowthContext.js'
export type {
  LandingIntelligenceEngineInput,
  LandingIntelligenceProjection,
} from './landing/LandingIntelligenceTypes.js'
export type {
  DemandAggregateBucket,
  DemandAggregateKey,
  DemandCaseOrigin,
} from './demand/DemandTypes.js'
export type {
  DemandEngineResult,
  DemandProjection,
  DemandProjectionItem,
} from './demand/DemandProjection.js'

export {
  CAPACITY_PROJECTION_MS,
  COVERAGE_PROJECTION_MS,
  DEMAND_PROJECTION_MS,
  GROWTH_DASHBOARD_TOTAL_MS,
  GROWTH_DASHBOARD_REQUESTS_TOTAL,
  GROWTH_SCORE_BUILD_MS,
  GROWTH_SNAPSHOT_BUILD_MS,
  GROWTH_SUMMARY_BUILD_MS,
  LANDING_INTELLIGENCE_BUILD_MS,
  OPPORTUNITIES_GENERATED_TOTAL,
  RECOMMENDATION_BUILD_MS,
  TERRITORY_PROJECTION_MS,
  GrowthMetrics,
  createGrowthMetrics,
} from './GrowthMetrics.js'
export { buildGrowthSummary } from './GrowthSummary.js'
export { InMemoryGrowthRepository, createGrowthRepository } from './GrowthRepository.js'
export { GrowthPipeline, createGrowthPipeline } from './GrowthPipeline.js'
export { InMemoryDemandRepository, createDemandRepository } from './demand/DemandRepository.js'
export { DemandEngine, buildDemandProjection, createDemandEngine } from './demand/DemandEngine.js'
export type {
  ExpansionOpportunityDecision,
  ExpansionOpportunityEngineInput,
} from './opportunities/ExpansionOpportunityTypes.js'
export type {
  ExpansionOpportunityEngineResult,
  ExpansionOpportunityProjection,
} from './opportunities/ExpansionOpportunityProjection.js'
export {
  InMemoryLandingIntelligenceRepository,
  createLandingIntelligenceRepository,
} from './landing/LandingIntelligenceRepository.js'
export {
  LandingIntelligenceEngine,
  buildLandingIntelligence,
  createLandingIntelligenceEngine,
} from './landing/LandingIntelligenceEngine.js'
export type {
  LandingIntelligenceEngineResult,
} from './landing/LandingIntelligenceProjection.js'
export {
  InMemoryExpansionOpportunityRepository,
  createExpansionOpportunityRepository,
} from './opportunities/ExpansionOpportunityRepository.js'
export {
  ExpansionOpportunityEngine,
  buildExpansionOpportunities,
  createExpansionOpportunityEngine,
} from './opportunities/ExpansionOpportunityEngine.js'
export type {
  RecommendationDecision,
  RecommendationEngineInput,
} from './recommendations/RecommendationTypes.js'
export type {
  RecommendationEngineResult,
  RecommendationProjection,
} from './recommendations/RecommendationProjection.js'
export { InMemoryRecommendationRepository, createRecommendationRepository } from './recommendations/RecommendationRepository.js'
export { RecommendationEngine, buildRecommendations, createRecommendationEngine } from './recommendations/RecommendationEngine.js'
export type {
  GrowthScoreComponentSet,
  GrowthScoreEngineInput,
  GrowthScorePriority,
} from './scoring/GrowthScoreTypes.js'
export type {
  GrowthScoreEngineResult,
  GrowthScoreProjection as ScoringProjection,
} from './scoring/GrowthScoreProjection.js'
export { InMemoryGrowthScoreRepository, createGrowthScoreRepository } from './scoring/GrowthScoreRepository.js'
export { GrowthScoreEngine, buildGrowthScoreProjections, createGrowthScoreEngine } from './scoring/GrowthScoreEngine.js'
export type {
  CoverageCompatibility,
  CoverageEngineInput,
  CoverageEvaluation,
  CoverageGapType,
} from './coverage/CoverageTypes.js'
export type { CoverageEngineResult, CoverageProjection } from './coverage/CoverageProjection.js'
export { InMemoryCoverageRepository, createCoverageRepository } from './coverage/CoverageRepository.js'
export { CoverageEngine, buildCoverageProjections, createCoverageEngine } from './coverage/CoverageEngine.js'
export type {
  CapacityCaseCounters,
  CapacityEngineInput,
  CapacityRecommendation,
} from './capacity/CapacityTypes.js'
export type { CapacityEngineResult, CapacityProjection } from './capacity/CapacityProjection.js'
export { InMemoryCapacityRepository, createCapacityRepository } from './capacity/CapacityRepository.js'
export { CapacityEngine, buildCapacityProjections, createCapacityEngine } from './capacity/CapacityEngine.js'
export type {
  TerritoryCoverageCompatibility,
  TerritoryRecommendation,
} from './territory/TerritoryTypes.js'
export type {
  TerritoryEngineResult,
  TerritoryProjection,
} from './territory/TerritoryProjection.js'
export { InMemoryTerritoryRepository, createTerritoryRepository } from './territory/TerritoryRepository.js'
export { TerritoryEngine, buildTerritoryProjections, createTerritoryEngine } from './territory/TerritoryEngine.js'
export {
  GrowthIntelligenceService,
  createGrowthIntelligenceService,
} from './growthIntelligenceService.js'
export type { GrowthIntelligenceResponse } from './growthIntelligenceService.js'
