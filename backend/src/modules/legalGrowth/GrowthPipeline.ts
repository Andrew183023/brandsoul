import type { ObservabilityService } from '../../services/observabilityService.js'
import { createCapacityEngine } from './capacity/CapacityEngine.js'
import { createCoverageEngine } from './coverage/CoverageEngine.js'
import { createDemandEngine } from './demand/DemandEngine.js'
import { createLandingIntelligenceEngine } from './landing/LandingIntelligenceEngine.js'
import { createExpansionOpportunityEngine } from './opportunities/ExpansionOpportunityEngine.js'
import { createRecommendationEngine } from './recommendations/RecommendationEngine.js'
import { createGrowthScoreEngine } from './scoring/GrowthScoreEngine.js'
import { createTerritoryEngine } from './territory/TerritoryEngine.js'
import type { GrowthContext } from './GrowthContext.js'
import { createGrowthMetrics } from './GrowthMetrics.js'
import type { GrowthSnapshot } from './GrowthSnapshot.js'

function normalizeGeneratedAt(now: GrowthContext['now']) {
  return typeof now === 'string' ? now : now.toISOString()
}

export class GrowthPipeline {
  private readonly capacityEngine
  private readonly metrics
  private readonly coverageEngine
  private readonly demandEngine
  private readonly growthScoreEngine
  private readonly landingIntelligenceEngine
  private readonly opportunityEngine
  private readonly recommendationEngine
  private readonly territoryEngine

  constructor(observability?: ObservabilityService) {
    this.capacityEngine = createCapacityEngine(observability)
    this.metrics = createGrowthMetrics(observability)
    this.coverageEngine = createCoverageEngine(observability)
    this.demandEngine = createDemandEngine(observability)
    this.growthScoreEngine = createGrowthScoreEngine(observability)
    this.landingIntelligenceEngine = createLandingIntelligenceEngine(observability)
    this.opportunityEngine = createExpansionOpportunityEngine(observability)
    this.recommendationEngine = createRecommendationEngine(observability)
    this.territoryEngine = createTerritoryEngine(observability)
  }

  build(context: GrowthContext): GrowthSnapshot {
    const startedAt = Date.now()

    try {
      const demandResult = context.cases?.length
        ? this.demandEngine.build(context)
        : {
            projection: {
              items: [],
            },
            evidence: [],
          }
      const territoryResult = demandResult.projection.items.length > 0
        ? this.territoryEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            demand: demandResult.projection,
            professionals: context.professionals,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }
      const coverageResult = demandResult.projection.items.length > 0
        ? this.coverageEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            demand: demandResult.projection,
            territories: territoryResult.projections,
            professionals: context.professionals,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }
      const capacityResult = (context.cases?.length ?? 0) > 0 || (context.professionals?.length ?? 0) > 0
        ? this.capacityEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            cases: context.cases,
            professionals: context.professionals,
            demand: demandResult.projection,
            coverage: coverageResult.projections,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }
      const scoreResult = demandResult.projection.items.length > 0
        ? this.growthScoreEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            demand: demandResult.projection,
            territories: territoryResult.projections,
            coverage: coverageResult.projections,
            capacity: capacityResult.projections,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }
      const recommendationResult = scoreResult.projections.length > 0
        ? this.recommendationEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            scores: scoreResult.projections,
            demand: demandResult.projection,
            territories: territoryResult.projections,
            coverage: coverageResult.projections,
            capacity: capacityResult.projections,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }
      const opportunityResult = recommendationResult.projections.length > 0
        ? this.opportunityEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            scores: scoreResult.projections,
            recommendations: recommendationResult.projections,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }
      const landingResult = scoreResult.projections.length > 0
        ? this.landingIntelligenceEngine.build({
            officeId: context.officeId,
            tenantId: context.tenantId,
            period: context.period,
            opportunities: opportunityResult.projections,
            scores: scoreResult.projections,
            recommendations: recommendationResult.projections,
            entityProfile: context.entityProfile,
          })
        : {
            projections: [],
            evidence: [],
          }

      const snapshot: GrowthSnapshot = {
        officeId: context.officeId,
        tenantId: context.tenantId,
        period: context.period,
        generatedAt: normalizeGeneratedAt(context.now),
        demand: demandResult.projection,
        territories: territoryResult.projections,
        coverage: coverageResult.projections,
        capacity: capacityResult.projections,
        scores: scoreResult.projections,
        recommendations: recommendationResult.projections,
        opportunities: opportunityResult.projections,
        landingCandidates: landingResult.projections,
        metadata: {
          deterministic: true,
          foundationVersion: 'g7.0',
          evidence: [
            ...demandResult.evidence,
            ...territoryResult.evidence,
            ...coverageResult.evidence,
            ...capacityResult.evidence,
            ...scoreResult.evidence,
            ...recommendationResult.evidence,
            ...opportunityResult.evidence,
            ...landingResult.evidence,
          ],
        },
      }

      this.metrics.recordSnapshotBuildTiming({
        tenantId: context.tenantId,
        officeId: context.officeId,
        durationMs: Date.now() - startedAt,
      })

      return snapshot
    } catch (error) {
      this.metrics.recordSnapshotBuildTiming({
        tenantId: context.tenantId,
        officeId: context.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createGrowthPipeline(observability?: ObservabilityService) {
  return new GrowthPipeline(observability)
}
