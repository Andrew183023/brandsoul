import type { MarketSignal } from './MarketSignal.js'

export type MarketSignalSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  signals: MarketSignal[]
  topOpportunity?: MarketSignal
}
