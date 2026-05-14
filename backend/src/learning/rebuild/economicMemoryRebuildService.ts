import type { BackendDatabase } from '../../db/index.js'
import {
  createLearningLedgerRepository,
  type LearningLedgerRepository,
} from '../persistence/learningLedgerRepository.js'
import {
  createEconomicMemoryRepository,
  type EconomicMemoryRepository,
} from '../../persistence/economic/economicMemoryRepository.js'
import {
  createEconomicMemoryRebuildEngine,
  type EconomicMemoryRebuildEngine,
} from './economicMemoryRebuildEngine.js'
import type { EconomicMemoryRebuildPlan } from './EconomicMemoryRebuildPlan.js'
import type { EconomicMemoryRebuildResult } from './EconomicMemoryRebuildResult.js'

type EconomicMemoryRebuildServiceDependencies = {
  learningLedgerRepository: LearningLedgerRepository
  economicMemoryRepository: EconomicMemoryRepository
  economicMemoryRebuildEngine: EconomicMemoryRebuildEngine
}

export type EconomicMemoryRebuildServiceStatus = {
  inProgress: boolean
  startedAt: string | null
  activePlan: EconomicMemoryRebuildPlan | null
  lastResult: EconomicMemoryRebuildResult | null
}

function buildFailedResult(args: {
  rebuildId: string
  plan: EconomicMemoryRebuildPlan
  startedAt: string
  warning: string
}): EconomicMemoryRebuildResult {
  return {
    rebuildId: args.rebuildId,
    dryRun: args.plan.dryRun,
    startedAt: args.startedAt,
    completedAt: new Date().toISOString(),
    processedLedgerEvents: 0,
    rebuiltMemoryRecords: 0,
    skippedEvents: 0,
    warnings: [args.warning],
    status: 'failed',
  }
}

function buildConcurrentBlockedResult(plan: EconomicMemoryRebuildPlan): EconomicMemoryRebuildResult {
  const now = new Date().toISOString()

  return {
    rebuildId: `economic-memory-rebuild:blocked:${Date.now()}`,
    dryRun: plan.dryRun,
    startedAt: now,
    completedAt: now,
    processedLedgerEvents: 0,
    rebuiltMemoryRecords: 0,
    skippedEvents: 0,
    warnings: ['A rebuild is already in progress. Concurrent rebuilds are blocked.'],
    status: 'failed',
  }
}

export class EconomicMemoryRebuildService {
  private inFlightRebuild: Promise<EconomicMemoryRebuildResult> | null = null
  private activePlan: EconomicMemoryRebuildPlan | null = null
  private activeStartedAt: string | null = null
  private lastResult: EconomicMemoryRebuildResult | null = null

  constructor(private readonly dependencies: EconomicMemoryRebuildServiceDependencies) {}

  getStatus(): EconomicMemoryRebuildServiceStatus {
    return {
      inProgress: this.inFlightRebuild !== null,
      startedAt: this.activeStartedAt,
      activePlan: this.activePlan,
      lastResult: this.lastResult,
    }
  }

  async rebuild(plan: EconomicMemoryRebuildPlan): Promise<EconomicMemoryRebuildResult> {
    if (this.inFlightRebuild) {
      const blocked = buildConcurrentBlockedResult(plan)
      console.error('[economic-memory-rebuild] failed', {
        rebuildId: blocked.rebuildId,
        reason: 'concurrent_rebuild_blocked',
      })

      return blocked
    }

    this.inFlightRebuild = (async () => {
      const startedAt = new Date().toISOString()
      this.activePlan = {
        ...plan,
      }
      this.activeStartedAt = startedAt
      console.info('[economic-memory-rebuild] started', {
        dryRun: plan.dryRun,
        scope: plan.scope,
        fromObservedAt: plan.fromObservedAt ?? null,
        toObservedAt: plan.toObservedAt ?? null,
        reason: plan.reason,
      })

      let rebuildId = `economic-memory-rebuild:pending:${Date.now()}`

      try {
        const ledgerEventsInScope = await this.dependencies.learningLedgerRepository.countLearningEventsForRebuild({
          fromObservedAt: plan.fromObservedAt,
          toObservedAt: plan.toObservedAt,
        })

        const rebuildOutput = await this.dependencies.economicMemoryRebuildEngine.rebuild(plan)
        rebuildId = rebuildOutput.result.rebuildId

        if (rebuildOutput.result.status === 'failed') {
          this.lastResult = rebuildOutput.result
          console.error('[economic-memory-rebuild] failed', {
            rebuildId,
            ledgerEventsInScope,
            warnings: rebuildOutput.result.warnings,
          })

          return rebuildOutput.result
        }

        if (plan.dryRun) {
          this.lastResult = rebuildOutput.result
          console.info('[economic-memory-rebuild] dry_run_completed', {
            rebuildId,
            processedLedgerEvents: rebuildOutput.result.processedLedgerEvents,
            rebuiltMemoryRecords: rebuildOutput.result.rebuiltMemoryRecords,
            skippedEvents: rebuildOutput.result.skippedEvents,
            ledgerEventsInScope,
          })

          return rebuildOutput.result
        }

        await this.dependencies.economicMemoryRepository.replaceEconomicMemoryRecords(rebuildOutput.rebuiltRecords)

        console.info('[economic-memory-rebuild] committed', {
          rebuildId,
          processedLedgerEvents: rebuildOutput.result.processedLedgerEvents,
          rebuiltMemoryRecords: rebuildOutput.result.rebuiltMemoryRecords,
          skippedEvents: rebuildOutput.result.skippedEvents,
          ledgerEventsInScope,
        })

        const committedResult = {
          ...rebuildOutput.result,
          completedAt: new Date().toISOString(),
        }

        this.lastResult = committedResult
        return committedResult
      } catch (error) {
        const warning = error instanceof Error ? error.message : 'Economic memory rebuild failed.'
        const failedResult = buildFailedResult({
          rebuildId,
          plan,
          startedAt,
          warning,
        })

        console.error('[economic-memory-rebuild] failed', {
          rebuildId,
          warning,
        })

        this.lastResult = failedResult
        return failedResult
      } finally {
        this.inFlightRebuild = null
        this.activePlan = null
        this.activeStartedAt = null
      }
    })()

    return this.inFlightRebuild
  }
}

export function createEconomicMemoryRebuildService(db: BackendDatabase) {
  return new EconomicMemoryRebuildService({
    learningLedgerRepository: createLearningLedgerRepository(db),
    economicMemoryRepository: createEconomicMemoryRepository(db),
    economicMemoryRebuildEngine: createEconomicMemoryRebuildEngine(db),
  })
}
