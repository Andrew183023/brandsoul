export type EconomicMemoryRebuildResultStatus = 'completed' | 'failed'

export type EconomicMemoryRebuildResult = {
  rebuildId: string
  dryRun: boolean
  startedAt: string
  completedAt: string
  processedLedgerEvents: number
  rebuiltMemoryRecords: number
  skippedEvents: number
  warnings: string[]
  status: EconomicMemoryRebuildResultStatus
}
