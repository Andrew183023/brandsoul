import type { MarketSignal } from '../contracts/MarketSignal.js'
import type { MarketSignalSnapshot } from '../contracts/MarketSignalSnapshot.js'
import type { SearchApiGoogleTrendsProvider } from '../providers/searchApiGoogleTrendsProvider.js'
import { MarketSignalSnapshotStore } from './marketSignalSnapshotStore.js'

type MarketSignalRuntimeDependencies = {
  provider: SearchApiGoogleTrendsProvider
  store: MarketSignalSnapshotStore
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function selectTopOpportunity(signals: MarketSignal[]) {
  return [...signals].sort((left, right) => right.economicRelevance - left.economicRelevance)[0]
}

function sortSignalsByEconomicRelevance(signals: MarketSignal[]) {
  return [...signals].sort((left, right) => right.economicRelevance - left.economicRelevance)
}

function filterAndRankSignals(signals: MarketSignal[]) {
  const keptSignals = signals.filter((signal) => !signal.isNoise)

  console.info('[market-signals] signals.received', {
    count: signals.length,
  })
  console.info('[market-signals] signals.filtered', {
    count: signals.length - keptSignals.length,
  })
  console.info('[market-signals] signals.kept', {
    count: keptSignals.length,
  })

  return sortSignalsByEconomicRelevance(keptSignals)
}

function buildSnapshot(signals: MarketSignal[], generatedAt: string): MarketSignalSnapshot {
  const rankedSignals = filterAndRankSignals(signals)

  return {
    status: 'ready',
    generatedAt,
    signals: rankedSignals,
    topOpportunity: selectTopOpportunity(rankedSignals),
  }
}

export class MarketSignalRuntime {
  private readonly refreshIntervalMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<MarketSignalSnapshot> | null = null

  constructor(private readonly dependencies: MarketSignalRuntimeDependencies) {
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
        console.warn('[market-signals] scheduled snapshot refresh failed', {
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

  async refresh(): Promise<MarketSignalSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      console.info('[market-signals] snapshot refresh start')
      this.dependencies.store.setRefreshing(true)

      try {
        const signals = await this.dependencies.provider.getTrendingNow()
        const generatedAt = new Date().toISOString()
        const snapshot = buildSnapshot(signals, generatedAt)
        const refreshCompletedAt = Date.now()

        this.dependencies.store.setSnapshot(snapshot, {
          refreshStartedAt,
          refreshCompletedAt,
          lastError: null,
        })

        console.info('[market-signals] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          signalCount: signals.length,
          topOpportunity: snapshot.topOpportunity?.keyword ?? null,
        })

        return snapshot
      } catch (error) {
        const refreshCompletedAt = Date.now()
        const message = error instanceof Error ? error.message : 'Failed to refresh market signal snapshot.'

        this.dependencies.store.setLastError(message)
        console.warn('[market-signals] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          outcome: 'error',
          message,
        })

        throw error
      } finally {
        this.dependencies.store.setRefreshing(false)
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createMarketSignalRuntime(dependencies: MarketSignalRuntimeDependencies) {
  return new MarketSignalRuntime(dependencies)
}
