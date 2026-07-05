export type {
  RecommendationDecision,
  RecommendationEngineInput,
} from './RecommendationTypes.js'
export type { RecommendationEngineResult, RecommendationProjection } from './RecommendationProjection.js'
export { InMemoryRecommendationRepository, createRecommendationRepository } from './RecommendationRepository.js'
export { RecommendationEngine, buildRecommendations, createRecommendationEngine } from './RecommendationEngine.js'
