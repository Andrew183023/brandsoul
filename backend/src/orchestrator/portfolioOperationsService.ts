import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { MultiEntityRiskLevel, MultiEntityRegistry, MultiEntityRegistryRecord } from './multiEntityRegistry.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import type { PortfolioLeadRecord, PortfolioLeadRepository } from '../repositories/portfolioLeadRepository.js'
import type { PortfolioLeadRevenueEventRecord, PortfolioLeadRevenueEventRepository } from '../repositories/portfolioLeadRevenueEventRepository.js'
import type { PortfolioLeadSignalRecord, PortfolioLeadSignalUrgency, PortfolioLeadSignalRepository } from '../repositories/portfolioLeadSignalRepository.js'
import type { PortfolioProposalRecord, PortfolioProposalRepository } from '../repositories/portfolioProposalRepository.js'

export type LeadSignal = {
  entityId: string
  market: string
  source: string
  intent: string
  urgency: PortfolioLeadSignalUrgency
  estimatedValue: number
  confidence: number
  recommendedAction: string
}

export type PortfolioEntityMetrics = {
  entityId: string
  market: string
  entityHealthScore: number
  leadGenerationScore: number
  conversionScore: number
  leadConversionRate: number
  convertedRevenue: number
  revenuePotential: number
  cacEstimate: number
  ltvEstimate: number
  roiEstimate: number
  riskScore: number
  autonomyReadiness: number
  budgetUtilization: number
  opportunityScore: number
}

export type PortfolioMetricsReadModel = {
  portfolio: {
    entityCount: number
    normalizedScores: Omit<PortfolioEntityMetrics, 'entityId' | 'market'>
  }
  entities: PortfolioEntityMetrics[]
}

export type PortfolioLeadFunnel = {
  rawSignals: number
  qualifiedSignals: number
  routedLeads: number
  qualifiedLeads: number
  contactedLeads: number
  convertedLeads: number
  lostLeads: number
  budgetProposals: number
  highUrgencySignals: number
  conversionRate: number
  revenueFromConvertedLeads: number
  lostReasonsDistribution: Array<{
    reason: string
    count: number
  }>
  routedLeadsByEntity: Array<{
    entityId: string
    leadCount: number
  }>
}

export type PortfolioReadModelSnapshot = {
  metrics: PortfolioMetricsReadModel
  leadSignals: Array<PortfolioLeadSignalRecord>
  leadFunnel: PortfolioLeadFunnel
  proposals: Array<PortfolioProposalRecord>
}

export type PortfolioOperationsDependencies = {
  registry: MultiEntityRegistry
  entityRepository: EntityRepository
  leadRepository: PortfolioLeadRepository
  revenueEventRepository: PortfolioLeadRevenueEventRepository
  leadSignalRepository: PortfolioLeadSignalRepository
  proposalRepository: PortfolioProposalRepository
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

export class PortfolioOperationsService {
  constructor(private readonly dependencies: PortfolioOperationsDependencies) {}

  private deriveLeadSignals(args: {
    entityProfile: EntityProfile
    registryEntry: MultiEntityRegistryRecord
    recentEventTypes: string[]
    recentSocialSignalTypes: string[]
    now: string
  }): LeadSignal[] {
    const signals: LeadSignal[] = []
    const exportFormats = Array.isArray(args.entityProfile.export?.formatsEnabled)
      ? args.entityProfile.export.formatsEnabled
      : []

    if (args.recentSocialSignalTypes.some((type) => type === 'interacted' || type === 'shared')) {
      signals.push({
        entityId: args.registryEntry.entityId,
        market: args.registryEntry.market,
        source: 'inbound_message',
        intent: 'commercial_follow_up',
        urgency: 'medium',
        estimatedValue: clamp(0.45 + args.registryEntry.leadGenerationScore * 0.35),
        confidence: clamp(0.54 + args.registryEntry.healthScore * 0.24),
        recommendedAction: 'qualify_lead',
      })
    }

    if (args.registryEntry.market === 'legal' && !args.registryEntry.rollbackState.active) {
      signals.push({
        entityId: args.registryEntry.entityId,
        market: args.registryEntry.market,
        source: 'marketplace_demand',
        intent: 'legal_intake_demand',
        urgency: args.registryEntry.riskLevel === 'high' ? 'high' : 'medium',
        estimatedValue: clamp(0.58 + args.registryEntry.autonomyReadiness * 0.18),
        confidence: clamp(0.56 + args.registryEntry.leadGenerationScore * 0.22),
        recommendedAction: 'route_lead',
      })
    }

    if (args.registryEntry.healthScore >= 0.55 && args.registryEntry.leadGenerationScore <= 0.42) {
      signals.push({
        entityId: args.registryEntry.entityId,
        market: args.registryEntry.market,
        source: 'performance_gap',
        intent: 'lead_gap',
        urgency: 'medium',
        estimatedValue: clamp(0.35 + args.registryEntry.healthScore * 0.25),
        confidence: clamp(0.6 + (1 - args.registryEntry.leadGenerationScore) * 0.2),
        recommendedAction: 'create_offer',
      })
    }

    if (exportFormats.length === 0 && args.registryEntry.healthScore >= 0.48) {
      signals.push({
        entityId: args.registryEntry.entityId,
        market: args.registryEntry.market,
        source: 'content_opportunity',
        intent: 'content_gap',
        urgency: 'low',
        estimatedValue: clamp(0.24 + args.registryEntry.healthScore * 0.18),
        confidence: clamp(0.46 + args.registryEntry.memoryConfidence * 0.18),
        recommendedAction: 'qualify_lead',
      })
    }

    if (args.recentEventTypes.some((type) => type.includes('interaction') || type.includes('share'))) {
      signals.push({
        entityId: args.registryEntry.entityId,
        market: args.registryEntry.market,
        source: 'public_chat',
        intent: 'active_interest',
        urgency: 'medium',
        estimatedValue: clamp(0.3 + args.registryEntry.leadGenerationScore * 0.22),
        confidence: clamp(0.5 + args.registryEntry.memoryConfidence * 0.16),
        recommendedAction: args.registryEntry.market === 'legal' ? 'trigger_marketplace_case' : 'route_lead',
      })
    }

    return signals
  }

  private deriveEntityMetrics(args: {
    registryEntry: MultiEntityRegistryRecord
    leadSignals: LeadSignal[]
    entityLeads: PortfolioLeadRecord[]
    revenueEvents: PortfolioLeadRevenueEventRecord[]
  }): PortfolioEntityMetrics {
    const signalConfidence = args.leadSignals.length > 0
      ? args.leadSignals.reduce((sum, signal) => sum + signal.confidence, 0) / args.leadSignals.length
      : 0
    const signalValue = args.leadSignals.length > 0
      ? args.leadSignals.reduce((sum, signal) => sum + signal.estimatedValue, 0) / args.leadSignals.length
      : 0
    const leadCount = args.entityLeads.length
    const convertedLeadCount = args.entityLeads.filter((lead) => lead.status === 'converted').length
    const leadConversionRate = leadCount === 0 ? 0 : convertedLeadCount / leadCount
    const convertedLeadIds = new Set(args.entityLeads.filter((lead) => lead.status === 'converted').map((lead) => lead.leadId))
    const convertedRevenue = args.revenueEvents.reduce((sum, event) => sum + (convertedLeadIds.has(event.leadId) ? event.amount : 0), 0)
    const revenueSignal = clamp(convertedRevenue / 5000)
    const learnedOpportunityScore = typeof args.registryEntry.lastDecisionSnapshot?.leadOutcomeLearning === 'object'
      && args.registryEntry.lastDecisionSnapshot?.leadOutcomeLearning !== null
      && typeof (args.registryEntry.lastDecisionSnapshot.leadOutcomeLearning as Record<string, unknown>).opportunityScore === 'number'
      ? clamp((args.registryEntry.lastDecisionSnapshot.leadOutcomeLearning as Record<string, number>).opportunityScore)
      : null
    const conversionScore = clamp(
      (args.registryEntry.memoryConfidence * 0.3)
      + (signalConfidence * 0.25)
      + ((1 - args.registryEntry.riskScore) * 0.2)
      + (leadConversionRate * 0.25),
    )
    const revenuePotential = clamp((args.registryEntry.leadGenerationScore * 0.28) + (signalValue * 0.26) + (conversionScore * 0.22) + (revenueSignal * 0.24))
    const cacEstimate = clamp(1 - ((args.registryEntry.leadGenerationScore * 0.55) + (conversionScore * 0.45)))
    const ltvEstimate = clamp((revenuePotential * 0.58) + (args.registryEntry.healthScore * 0.26) + (args.registryEntry.autonomyReadiness * 0.16))
    const roiEstimate = clamp((ltvEstimate * 0.7) + ((1 - cacEstimate) * 0.3))
    const budgetUtilization = clamp(
      args.registryEntry.actionQueue.filter((entry) => String(entry.type ?? '').includes('budget')).length * 0.25,
    )
    const opportunityScore = clamp(
      (revenuePotential * 0.24)
      + (args.registryEntry.leadGenerationScore * 0.16)
      + (conversionScore * 0.14)
      + (roiEstimate * 0.12)
      + (args.registryEntry.autonomyReadiness * 0.1)
      + ((1 - args.registryEntry.riskScore) * 0.1)
      + (leadConversionRate * 0.08)
      + (revenueSignal * 0.06)
      + ((learnedOpportunityScore ?? 0.5) * 0.1),
    )

    return {
      entityId: args.registryEntry.entityId,
      market: args.registryEntry.market,
      entityHealthScore: roundMetric(args.registryEntry.healthScore),
      leadGenerationScore: roundMetric(args.registryEntry.leadGenerationScore),
      conversionScore: roundMetric(conversionScore),
      leadConversionRate: roundMetric(leadConversionRate),
      convertedRevenue: roundMetric(convertedRevenue),
      revenuePotential: roundMetric(revenuePotential),
      cacEstimate: roundMetric(cacEstimate),
      ltvEstimate: roundMetric(ltvEstimate),
      roiEstimate: roundMetric(roiEstimate),
      riskScore: roundMetric(args.registryEntry.riskScore),
      autonomyReadiness: roundMetric(args.registryEntry.autonomyReadiness),
      budgetUtilization: roundMetric(budgetUtilization),
      opportunityScore: roundMetric(opportunityScore),
    }
  }

  async refresh(_now = new Date().toISOString()): Promise<PortfolioReadModelSnapshot> {
    const registryEntries = await this.dependencies.registry.listEntities()
    const persistedLeads = await this.dependencies.leadRepository.list(500)
    const revenueEvents = await this.dependencies.revenueEventRepository.list(500)
    const persistedSignals = await this.dependencies.leadSignalRepository.list(500)
    const persistedProposals = await this.dependencies.proposalRepository.list(500)
    const entitySignalsByEntityId = persistedSignals.reduce<Record<string, PortfolioLeadSignalRecord[]>>((accumulator, signal) => {
      if (!accumulator[signal.entityId]) {
        accumulator[signal.entityId] = []
      }
      accumulator[signal.entityId].push(signal)
      return accumulator
    }, {})
    const entityLeadsByEntityId = persistedLeads.reduce<Record<string, PortfolioLeadRecord[]>>((accumulator, lead) => {
      if (!accumulator[lead.entityId]) {
        accumulator[lead.entityId] = []
      }
      accumulator[lead.entityId].push(lead)
      return accumulator
    }, {})
    const entityRevenueEventsByEntityId = revenueEvents.reduce<Record<string, PortfolioLeadRevenueEventRecord[]>>((accumulator, event) => {
      if (!accumulator[event.entityId]) {
        accumulator[event.entityId] = []
      }
      accumulator[event.entityId].push(event)
      return accumulator
    }, {})

    const metrics = (await Promise.all(registryEntries.map(async (registryEntry) => {
      const entityRecord = await this.dependencies.entityRepository.getEntityById<EntityProfile>(registryEntry.entityId)
      if (!entityRecord) {
        return null
      }

      return this.deriveEntityMetrics({
        registryEntry,
        leadSignals: entitySignalsByEntityId[registryEntry.entityId] ?? [],
        entityLeads: entityLeadsByEntityId[registryEntry.entityId] ?? [],
        revenueEvents: entityRevenueEventsByEntityId[registryEntry.entityId] ?? [],
      })
    }))).filter((entityMetrics): entityMetrics is PortfolioEntityMetrics => entityMetrics !== null)

    const entityCount = metrics.length
    const aggregate = entityCount === 0
      ? {
        entityHealthScore: 0,
        leadGenerationScore: 0,
        conversionScore: 0,
        leadConversionRate: 0,
        convertedRevenue: 0,
        revenuePotential: 0,
        cacEstimate: 0,
        ltvEstimate: 0,
        roiEstimate: 0,
        riskScore: 0,
        autonomyReadiness: 0,
        budgetUtilization: 0,
        opportunityScore: 0,
      }
      : {
        entityHealthScore: roundMetric(metrics.reduce((sum, item) => sum + item.entityHealthScore, 0) / entityCount),
        leadGenerationScore: roundMetric(metrics.reduce((sum, item) => sum + item.leadGenerationScore, 0) / entityCount),
        conversionScore: roundMetric(metrics.reduce((sum, item) => sum + item.conversionScore, 0) / entityCount),
        leadConversionRate: roundMetric(metrics.reduce((sum, item) => sum + item.leadConversionRate, 0) / entityCount),
        convertedRevenue: roundMetric(metrics.reduce((sum, item) => sum + item.convertedRevenue, 0)),
        revenuePotential: roundMetric(metrics.reduce((sum, item) => sum + item.revenuePotential, 0) / entityCount),
        cacEstimate: roundMetric(metrics.reduce((sum, item) => sum + item.cacEstimate, 0) / entityCount),
        ltvEstimate: roundMetric(metrics.reduce((sum, item) => sum + item.ltvEstimate, 0) / entityCount),
        roiEstimate: roundMetric(metrics.reduce((sum, item) => sum + item.roiEstimate, 0) / entityCount),
        riskScore: roundMetric(metrics.reduce((sum, item) => sum + item.riskScore, 0) / entityCount),
        autonomyReadiness: roundMetric(metrics.reduce((sum, item) => sum + item.autonomyReadiness, 0) / entityCount),
        budgetUtilization: roundMetric(metrics.reduce((sum, item) => sum + item.budgetUtilization, 0) / entityCount),
        opportunityScore: roundMetric(metrics.reduce((sum, item) => sum + item.opportunityScore, 0) / entityCount),
      }

    return {
      metrics: {
        portfolio: {
          entityCount,
          normalizedScores: aggregate,
        },
        entities: metrics.sort((left, right) => right.opportunityScore - left.opportunityScore),
      },
      leadSignals: persistedSignals.sort((left, right) => right.detectedAt.localeCompare(left.detectedAt)),
      leadFunnel: {
        rawSignals: persistedSignals.length,
        qualifiedSignals: persistedSignals.filter((signal) => signal.confidence >= 0.6).length,
        routedLeads: persistedLeads.length,
        qualifiedLeads: persistedLeads.filter((lead) => lead.status === 'qualified').length,
        contactedLeads: persistedLeads.filter((lead) => lead.status === 'contacted').length,
        convertedLeads: persistedLeads.filter((lead) => lead.status === 'converted').length,
        lostLeads: persistedLeads.filter((lead) => lead.status === 'lost').length,
        budgetProposals: persistedProposals.filter((proposal) => proposal.proposalType === 'propose_budget_allocation').length,
        highUrgencySignals: persistedSignals.filter((signal) => signal.urgency === 'high' || signal.urgency === 'critical').length,
        conversionRate: persistedLeads.length === 0
          ? 0
          : roundMetric(persistedLeads.filter((lead) => lead.status === 'converted').length / persistedLeads.length),
        revenueFromConvertedLeads: roundMetric(
          revenueEvents.reduce((sum, event) => {
            const lead = persistedLeads.find((candidate) => candidate.leadId === event.leadId)
            return sum + (lead?.status === 'converted' ? event.amount : 0)
          }, 0),
        ),
        lostReasonsDistribution: Object.entries(
          persistedLeads.reduce<Record<string, number>>((counts, lead) => {
            if (lead.status === 'lost' && typeof lead.lostReason === 'string' && lead.lostReason.trim().length > 0) {
              const key = lead.lostReason.trim()
              counts[key] = (counts[key] ?? 0) + 1
            }
            return counts
          }, {}),
        )
          .map(([reason, count]) => ({ reason, count }))
          .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
        routedLeadsByEntity: Object.entries(
          persistedLeads.reduce<Record<string, number>>((counts, lead) => {
            counts[lead.entityId] = (counts[lead.entityId] ?? 0) + 1
            return counts
          }, {}),
        )
          .map(([entityId, leadCount]) => ({ entityId, leadCount }))
          .sort((left, right) => right.leadCount - left.leadCount || left.entityId.localeCompare(right.entityId)),
      },
      proposals: persistedProposals.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    }
  }

  async getReadModel(now = new Date().toISOString()) {
    return this.refresh(now)
  }
}

export function createPortfolioOperationsService(dependencies: PortfolioOperationsDependencies) {
  return new PortfolioOperationsService(dependencies)
}
