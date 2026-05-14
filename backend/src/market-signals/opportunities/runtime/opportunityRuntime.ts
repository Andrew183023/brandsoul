import type { MarketSignalSnapshotStore } from '../../runtime/marketSignalSnapshotStore.js'
import {
  buildOpportunityAggregateRuntimeId,
} from '../../../persistence/opportunities/OpportunityAggregate.js'
import type { OpportunityRepository } from '../../../persistence/opportunities/opportunityRepository.js'
import { type MatchableEntity } from '../entityMatchEngine.js'
import { buildOpportunityEngineResult } from '../opportunityEngine.js'
import type { EntityActionSuggestion } from '../contracts/EntityActionSuggestion.js'
import type { OpportunityLead } from '../contracts/OpportunityLead.js'
import type { OpportunitySnapshot } from './opportunitySnapshotStore.js'
import { OpportunitySnapshotStore } from './opportunitySnapshotStore.js'

type OpportunityRuntimeDependencies = {
  marketSignalSnapshotStore: MarketSignalSnapshotStore
  opportunitySnapshotStore: OpportunitySnapshotStore
  opportunityRepository: OpportunityRepository
  listAvailableEntities: () => Promise<MatchableEntity[]>
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function extractKeywordFromReasoning(reasoning: string) {
  const keywordMatch = reasoning.match(/signal "([^"]+)"/i)
  return keywordMatch?.[1]?.trim().toLowerCase() ?? null
}

function findTopSuggestionForOpportunity(
  opportunity: OpportunityLead,
  suggestions: EntityActionSuggestion[],
) {
  const targetKeyword = opportunity.keyword.trim().toLowerCase()

  return suggestions
    .filter((suggestion) => extractKeywordFromReasoning(suggestion.reasoning) === targetKeyword)
    .sort((left, right) => right.confidence - left.confidence)[0] ?? null
}

async function persistOpportunities(args: {
  repository: OpportunityRepository
  opportunities: OpportunityLead[]
  suggestions: EntityActionSuggestion[]
  createdAt: string
}) {
  for (const opportunity of args.opportunities) {
    const topSuggestion = findTopSuggestionForOpportunity(opportunity, args.suggestions)
    const aggregateId = buildOpportunityAggregateRuntimeId({
      keyword: opportunity.keyword,
      entityId: topSuggestion?.entityId ?? null,
      detectedAt: opportunity.detectedAt,
      category: opportunity.category,
    })

    const persisted = await args.repository.upsertOpportunity({
      id: aggregateId,
      marketSignalId: opportunity.sourceSignalId,
      keyword: opportunity.keyword,
      category: opportunity.category,
      economicRelevance: opportunity.economicRelevance,
      leadProbability: opportunity.leadProbability,
      opportunityScore: opportunity.economicRelevance,
      detectedAt: opportunity.detectedAt,
      topEntityId: topSuggestion?.entityId ?? null,
      topEntityName: topSuggestion?.entityName ?? null,
      confidence: topSuggestion?.confidence ?? null,
      suggestedAction: topSuggestion?.suggestedAction ?? opportunity.recommendedAction ?? null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    })

    console.info('[market-opportunities] opportunity.persisted', {
      opportunityId: persisted.id,
      marketSignalId: persisted.marketSignalId,
      keyword: persisted.keyword,
      entityId: persisted.topEntityId,
      confidence: persisted.confidence,
    })
  }
}

function buildSnapshot(args: {
  generatedAt: string
  opportunities: ReturnType<typeof buildOpportunityEngineResult>['opportunityLeads']
  suggestions: ReturnType<typeof buildOpportunityEngineResult>['entityActionSuggestions']
}): OpportunitySnapshot {
  return {
    status: 'ready',
    generatedAt: args.generatedAt,
    opportunities: args.opportunities,
    suggestions: args.suggestions,
    topOpportunity: args.opportunities[0],
  }
}

export class OpportunityRuntime {
  private readonly refreshIntervalMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<OpportunitySnapshot> | null = null

  constructor(private readonly dependencies: OpportunityRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true

    try {
      await this.refresh()
    } catch (error) {
      this.started = false
      throw error
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[market-opportunities] scheduled snapshot refresh failed', {
          message: error instanceof Error ? error.message : 'unknown_error',
        })
      })
    }, this.refreshIntervalMs)
  }

  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }

    this.started = false
    this.inFlightRefresh = null
  }

  async refresh(): Promise<OpportunitySnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      console.info('[market-opportunities] snapshot refresh start')
      this.dependencies.opportunitySnapshotStore.setRefreshing(true)

      try {
        const marketSignalState = this.dependencies.marketSignalSnapshotStore.getSnapshot()
        const availableEntities = await this.dependencies.listAvailableEntities()
        const result = buildOpportunityEngineResult(marketSignalState.snapshot, availableEntities)
        const generatedAt = new Date().toISOString()
        await persistOpportunities({
          repository: this.dependencies.opportunityRepository,
          opportunities: result.opportunityLeads,
          suggestions: result.entityActionSuggestions,
          createdAt: generatedAt,
        })
        const snapshot = buildSnapshot({
          generatedAt,
          opportunities: result.opportunityLeads,
          suggestions: result.entityActionSuggestions,
        })
        const refreshCompletedAt = Date.now()

        this.dependencies.opportunitySnapshotStore.setSnapshot(snapshot, {
          refreshStartedAt,
          refreshCompletedAt,
          lastError: null,
        })

        console.info('[market-opportunities] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          opportunities: snapshot.opportunities.length,
          suggestions: snapshot.suggestions.length,
          topOpportunity: snapshot.topOpportunity?.keyword ?? null,
        })

        return snapshot
      } catch (error) {
        const refreshCompletedAt = Date.now()
        const message = error instanceof Error ? error.message : 'Failed to refresh opportunity snapshot.'

        this.dependencies.opportunitySnapshotStore.setLastError(message)
        console.warn('[market-opportunities] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          outcome: 'error',
          message,
        })

        throw error
      } finally {
        this.dependencies.opportunitySnapshotStore.setRefreshing(false)
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createOpportunityRuntime(dependencies: OpportunityRuntimeDependencies) {
  return new OpportunityRuntime(dependencies)
}
