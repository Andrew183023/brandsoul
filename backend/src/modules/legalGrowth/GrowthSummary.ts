import type { LandingIntelligenceProjection } from './landing/LandingIntelligenceTypes.js'
import type { GrowthSnapshot } from './GrowthSnapshot.js'
import type { GrowthPriority } from './GrowthTypes.js'

export type GrowthSummary = {
  totalDemand: number
  totalTerritories: number
  totalCoverageGaps: number
  overloadedProfessionals: number
  constrainedProfessionals: number
  expansionOpportunities: number
  landingCandidates: number
  eligibleLandingCandidates: number
  recommendations: number
  criticalRecommendations: number
  averageGrowthScore: number | null
  highestPriority: GrowthPriority | null
  generatedAt: string
}

function priorityRank(priority: GrowthPriority) {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
    default:
      return 1
  }
}

function isEligibleLandingCandidate(candidate: LandingIntelligenceProjection) {
  return candidate.eligible === true
}

export function buildGrowthSummary(snapshot: GrowthSnapshot): GrowthSummary {
  const totalDemand = snapshot.demand.items
    .reduce((total, item) => total + item.casesCount, 0)
  const totalCoverageGaps = snapshot.coverage
    .filter((projection) => projection.gapType !== 'none' && projection.gapType !== 'unknown')
    .length
  const overloadedProfessionals = snapshot.capacity
    .filter((projection) => projection.capacityStatus === 'overloaded')
    .length
  const constrainedProfessionals = snapshot.capacity
    .filter((projection) => projection.capacityStatus === 'constrained')
    .length
  const eligibleLandingCandidates = snapshot.landingCandidates
    .filter(isEligibleLandingCandidate)
    .length
  const criticalRecommendations = snapshot.recommendations
    .filter((recommendation) => recommendation.priority === 'critical')
    .length
  const averageGrowthScore = snapshot.scores.length > 0
    ? Math.round(
      snapshot.scores.reduce((total, score) => total + score.value, 0) / snapshot.scores.length,
    )
    : null

  const highestPriority = [
    ...snapshot.scores.map((score) => score.priority),
    ...snapshot.recommendations.map((recommendation) => recommendation.priority),
    ...snapshot.opportunities.map((opportunity) => opportunity.priority),
  ].reduce<GrowthPriority | null>((current, priority) => {
    if (!current || priorityRank(priority) > priorityRank(current)) {
      return priority
    }
    return current
  }, null)

  return {
    totalDemand,
    totalTerritories: snapshot.territories.length,
    totalCoverageGaps,
    overloadedProfessionals,
    constrainedProfessionals,
    expansionOpportunities: snapshot.opportunities.length,
    landingCandidates: snapshot.landingCandidates.length,
    eligibleLandingCandidates,
    recommendations: snapshot.recommendations.length,
    criticalRecommendations,
    averageGrowthScore,
    highestPriority,
    generatedAt: snapshot.generatedAt,
  }
}
