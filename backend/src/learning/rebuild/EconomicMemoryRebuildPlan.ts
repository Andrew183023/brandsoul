export type EconomicMemoryRebuildScope = 'all' | 'signal' | 'category' | 'entity'

export type EconomicMemoryRebuildPlan = {
  dryRun: boolean
  scope: EconomicMemoryRebuildScope
  fromObservedAt?: string
  toObservedAt?: string
  reason: string
}
