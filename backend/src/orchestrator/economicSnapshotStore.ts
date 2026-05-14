import type { FastifyBaseLogger } from 'fastify'

import type { ObservabilityService } from '../services/observabilityService.js'
import type { MultiEntityRegistry } from './multiEntityRegistry.js'
import type { PortfolioMetricsReadModel, PortfolioOperationsService } from './portfolioOperationsService.js'

type IncidentSummary = Awaited<ReturnType<MultiEntityRegistry['listIncidents']>>

export type EconomicSnapshotSummary = {
  entityCount: number
  revenue: number
  opportunityScore: number
  leadScore: number
  autonomyScore: number
  riskScore: number
  incidents: number
  updatedAt: string | null
}

export type EconomicSnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type EconomicSnapshotPayload = {
  metrics: PortfolioMetricsReadModel
  summary: EconomicSnapshotSummary
  incidents: IncidentSummary
  updatedAt: string
}

export type EconomicSnapshotResponse = {
  status: 'ready' | 'warming'
  metrics: PortfolioMetricsReadModel
  summary: EconomicSnapshotSummary
  incidents: IncidentSummary
  freshness: EconomicSnapshotFreshness
}

export type EconomicSnapshotStoreDependencies = {
  portfolioOperationsService: PortfolioOperationsService
  multiEntityRegistry: MultiEntityRegistry
  observability: ObservabilityService
  logger: FastifyBaseLogger
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 15_000

const EMPTY_METRICS: PortfolioMetricsReadModel = {
  portfolio: {
    entityCount: 0,
    normalizedScores: {
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
    },
  },
  entities: [],
}

const EMPTY_INCIDENTS: IncidentSummary = []

function buildEmptySummary(): EconomicSnapshotSummary {
  return {
    entityCount: 0,
    revenue: 0,
    opportunityScore: 0,
    leadScore: 0,
    autonomyScore: 0,
    riskScore: 0,
    incidents: 0,
    updatedAt: null,
  }
}

export class EconomicSnapshotStore {
  private readonly refreshIntervalMs: number
  private snapshot: EconomicSnapshotPayload | null = null
  private lastError: string | null = null
  private lastRefreshDurationMs: number | null = null
  private inFlightRefresh: Promise<EconomicSnapshotPayload> | null = null
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false

  constructor(private readonly dependencies: EconomicSnapshotStoreDependencies) {
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
      this.dependencies.logger.error(
        {
          event: 'snapshot.refresh.failed',
          snapshot: 'economic',
          error: error instanceof Error ? error.message : 'unknown_error',
        },
        'Economic snapshot warm-up failed',
      )
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        this.dependencies.logger.error(
          {
            event: 'snapshot.refresh.failed',
            snapshot: 'economic',
            error: error instanceof Error ? error.message : 'unknown_error',
          },
          'Economic snapshot refresh failed',
        )
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

  private buildSummary(metrics: PortfolioMetricsReadModel, incidents: IncidentSummary, updatedAt: string): EconomicSnapshotSummary {
    const aggregate = metrics.portfolio.normalizedScores

    return {
      entityCount: metrics.portfolio.entityCount,
      revenue: aggregate.convertedRevenue,
      opportunityScore: aggregate.opportunityScore,
      leadScore: aggregate.leadGenerationScore,
      autonomyScore: aggregate.autonomyReadiness,
      riskScore: aggregate.riskScore,
      incidents: incidents.length,
      updatedAt,
    }
  }

  async refresh(now = new Date().toISOString()): Promise<EconomicSnapshotPayload> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const startedAt = Date.now()
      try {
        const [readModel, incidents] = await Promise.all([
          this.dependencies.portfolioOperationsService.refresh(now),
          this.dependencies.multiEntityRegistry.listIncidents(),
        ])

        const updatedAt = new Date().toISOString()
        const snapshot: EconomicSnapshotPayload = {
          metrics: readModel.metrics,
          summary: this.buildSummary(readModel.metrics, incidents, updatedAt),
          incidents,
          updatedAt,
        }

        this.snapshot = snapshot
        this.lastError = null
        this.lastRefreshDurationMs = Date.now() - startedAt
        this.dependencies.observability.recordTiming('snapshot.refresh.durationMs', this.lastRefreshDurationMs, {
          snapshot: 'economic',
        })
        this.dependencies.logger.info(
          {
            event: 'snapshot.refresh.durationMs',
            snapshot: 'economic',
            durationMs: this.lastRefreshDurationMs,
            entityCount: snapshot.summary.entityCount,
            incidents: snapshot.summary.incidents,
          },
          'Economic snapshot refreshed',
        )

        return snapshot
      } catch (error) {
        this.lastRefreshDurationMs = Date.now() - startedAt
        this.lastError = error instanceof Error ? error.message : 'Failed to refresh economic snapshot.'
        this.dependencies.observability.recordTiming('snapshot.refresh.durationMs', this.lastRefreshDurationMs, {
          snapshot: 'economic',
          outcome: 'error',
        })
        throw error
      } finally {
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }

  getSnapshot(now = new Date()): EconomicSnapshotResponse {
    const startedAt = Date.now()
    const ageMs = this.snapshot ? Math.max(0, now.getTime() - Date.parse(this.snapshot.updatedAt)) : null

    const response: EconomicSnapshotResponse = this.snapshot
      ? {
        status: 'ready',
        metrics: this.snapshot.metrics,
        summary: this.snapshot.summary,
        incidents: this.snapshot.incidents,
        freshness: {
          ready: true,
          updatedAt: this.snapshot.updatedAt,
          ageMs,
          refreshIntervalMs: this.refreshIntervalMs,
          lastRefreshDurationMs: this.lastRefreshDurationMs,
          refreshing: this.inFlightRefresh !== null,
          lastError: this.lastError,
        },
      }
      : {
        status: 'warming',
        metrics: EMPTY_METRICS,
        summary: buildEmptySummary(),
        incidents: EMPTY_INCIDENTS,
        freshness: {
          ready: false,
          updatedAt: null,
          ageMs: null,
          refreshIntervalMs: this.refreshIntervalMs,
          lastRefreshDurationMs: this.lastRefreshDurationMs,
          refreshing: this.inFlightRefresh !== null,
          lastError: this.lastError,
        },
      }

    const durationMs = Date.now() - startedAt
    this.dependencies.observability.recordTiming('snapshot.read.durationMs', durationMs, {
      snapshot: 'economic',
    })
    this.dependencies.logger.info(
      {
        event: 'snapshot.read.durationMs',
        snapshot: 'economic',
        durationMs,
        ready: response.freshness.ready,
        refreshing: response.freshness.refreshing,
      },
      'Economic snapshot read',
    )

    return response
  }
}

export function createEconomicSnapshotStore(dependencies: EconomicSnapshotStoreDependencies) {
  return new EconomicSnapshotStore(dependencies)
}
