import type { MarketSignal } from '../contracts/MarketSignal.js'
import { calculateEconomicRelevance } from '../relevance/economicRelevance.js'
import { calculateLeadProbability } from '../relevance/leadProbability.js'
import { classifyMarketCategory } from '../relevance/marketDomainClassifier.js'

type JsonRecord = Record<string, unknown>

export type SearchApiGoogleTrendsProvider = {
  getTrendingNow(): Promise<MarketSignal[]>
}

export type SearchApiGoogleTrendsProviderOptions = {
  apiKey?: string
  fetchImpl?: typeof fetch
  endpoint?: string
  timeoutMs?: number
}

const DEFAULT_SEARCHAPI_ENDPOINT = 'https://www.searchapi.io/api/v1/search'
const DEFAULT_TIMEOUT_MS = 10_000

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.replace(/[^\d.-]/g, '')
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function extractSignalKeyword(item: JsonRecord) {
  return (
    readString(item.keyword) ??
    readString(item.query) ??
    readString(item.title) ??
    readString(item.trend) ??
    readString(item.search_term) ??
    readString(item.name)
  )
}

function extractGrowthPercentage(item: JsonRecord) {
  return (
    readNumber(item.growthPercentage) ??
    readNumber(item.growth_percentage) ??
    readNumber(item.percentGrowth) ??
    readNumber(item.percent_growth) ??
    readNumber(item.growth) ??
    0
  )
}

function extractTrafficSignal(item: JsonRecord) {
  return (
    readNumber(item.traffic) ??
    readNumber(item.search_volume) ??
    readNumber(item.searchVolume) ??
    readNumber(item.volume) ??
    0
  )
}

function computeHeuristicTrendScore(args: {
  index: number
  growthPercentage: number
  trafficSignal: number
}) {
  const rankScore = clamp(100 - args.index * 6, 18, 100)
  const growthBonus = clamp(args.growthPercentage, 0, 100) * 0.35
  const trafficBonus = clamp(args.trafficSignal / 10_000, 0, 18)

  return clamp(roundTo(rankScore + growthBonus + trafficBonus, 2), 0, 100)
}

function extractCandidateItems(payload: JsonRecord): JsonRecord[] {
  const directCandidates = [
    payload.trending_searches,
    payload.trendingSearches,
    payload.searches,
    payload.results,
    payload.items,
    payload.trends,
  ]

  for (const candidate of directCandidates) {
    const items = readArray(candidate).filter(isRecord)
    if (items.length > 0) {
      return items
    }
  }

  const nestedCandidates = [
    payload.trending_now,
    payload.trendingNow,
    payload.data,
  ]

  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate)) {
      continue
    }

    const nestedItems: JsonRecord[] = extractCandidateItems(candidate)
    if (nestedItems.length > 0) {
      return nestedItems
    }
  }

  return []
}

function normalizeMarketSignals(payload: JsonRecord, detectedAt: string): MarketSignal[] {
  return extractCandidateItems(payload)
    .map((item: JsonRecord, index: number) => {
      const keyword = extractSignalKeyword(item)
      if (!keyword) {
        return undefined
      }

      const growthPercentage = extractGrowthPercentage(item)
      const trafficSignal = extractTrafficSignal(item)
      const trendScore = computeHeuristicTrendScore({
        index,
        growthPercentage,
        trafficSignal,
      })
      const opportunityScore = roundTo(trendScore / 100, 4)
      const category = classifyMarketCategory(keyword)

      const signal: MarketSignal = {
        keyword,
        source: 'google_trends',
        category,
        trendScore,
        momentum: 'rising',
        growthPercentage,
        opportunityScore,
        economicRelevance: calculateEconomicRelevance({
          keyword,
          trendScore,
          opportunityScore,
        }),
        leadProbability: calculateLeadProbability(keyword),
        isNoise: category === 'noise',
        detectedAt,
      }

      return signal
    })
    .filter((signal: MarketSignal | undefined): signal is MarketSignal => Boolean(signal))
}

export function createSearchApiGoogleTrendsProvider(
  options: SearchApiGoogleTrendsProviderOptions = {},
): SearchApiGoogleTrendsProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint ?? DEFAULT_SEARCHAPI_ENDPOINT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async getTrendingNow() {
      const apiKey = options.apiKey?.trim() || process.env.SEARCHAPI_API_KEY?.trim() || ''
      if (!apiKey) {
        console.warn('[market-signals] SEARCHAPI_API_KEY not configured; returning empty Google Trends snapshot.')
        return []
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const detectedAt = new Date().toISOString()

      try {
        const url = new URL(endpoint)
        url.searchParams.set('engine', 'google_trends_trending_now')
        url.searchParams.set('api_key', apiKey)

        const response = await fetchImpl(url.toString(), {
          method: 'GET',
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorBody = await response.text()
          console.warn('[market-signals] SearchAPI Google Trends request failed.', {
            status: response.status,
            body: errorBody.slice(0, 500),
          })
          return []
        }

        const payload = (await response.json()) as unknown
        if (!isRecord(payload)) {
          console.warn('[market-signals] SearchAPI Google Trends returned a non-object payload.')
          return []
        }

        return normalizeMarketSignals(payload, detectedAt)
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error.name === 'AbortError'
              ? new Error(`SearchAPI Google Trends request timed out after ${timeoutMs}ms`)
              : error
            : new Error(String(error))

        console.warn('[market-signals] SearchAPI Google Trends request failed.', {
          message: normalizedError.message,
        })
        return []
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
