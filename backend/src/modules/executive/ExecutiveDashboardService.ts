import { performance } from 'node:perf_hooks'

import type { ObservabilityService } from '../../services/observabilityService.js'
import { createDecisionCenterEngine, type DecisionCenterEngine } from './DecisionCenterEngine.js'
import { mapExecutiveDashboard } from './ExecutiveDashboardMapper.js'
import { createExecutiveFeedEngine, type ExecutiveFeedEngine } from './ExecutiveFeedEngine.js'
import { createExecutiveMetrics } from './ExecutiveMetrics.js'
import { createExecutiveTimelineEngine, type ExecutiveTimelineEngine } from './ExecutiveTimelineEngine.js'
import { createMorningBriefEngine, type MorningBriefEngine } from './MorningBriefEngine.js'
import { createOfficeHealthEngine, type OfficeHealthEngine } from './OfficeHealthEngine.js'
import type {
  ExecutiveDashboard,
  ExecutiveDashboardBuildInput,
} from './ExecutiveDashboardTypes.js'

export interface ExecutiveDashboardServiceDependencies {
  officeHealthEngine?: Pick<OfficeHealthEngine, 'build'>
  decisionCenterEngine?: Pick<DecisionCenterEngine, 'build'>
  morningBriefEngine?: Pick<MorningBriefEngine, 'build'>
  executiveFeedEngine?: Pick<ExecutiveFeedEngine, 'build'>
  executiveTimelineEngine?: Pick<ExecutiveTimelineEngine, 'build'>
  observability?: ObservabilityService
}

export class ExecutiveDashboardService {
  private readonly officeHealthEngine
  private readonly decisionCenterEngine
  private readonly morningBriefEngine
  private readonly executiveFeedEngine
  private readonly executiveTimelineEngine
  private readonly metrics

  constructor(dependencies: ExecutiveDashboardServiceDependencies = {}) {
    this.officeHealthEngine = dependencies.officeHealthEngine ?? createOfficeHealthEngine()
    this.decisionCenterEngine = dependencies.decisionCenterEngine ?? createDecisionCenterEngine()
    this.morningBriefEngine = dependencies.morningBriefEngine ?? createMorningBriefEngine()
    this.executiveFeedEngine = dependencies.executiveFeedEngine ?? createExecutiveFeedEngine()
    this.executiveTimelineEngine = dependencies.executiveTimelineEngine ?? createExecutiveTimelineEngine()
    this.metrics = createExecutiveMetrics(dependencies.observability)
  }

  build(input: ExecutiveDashboardBuildInput): ExecutiveDashboard {
    let stage: 'office_health' | 'decision_center' | 'executive_feed' | 'executive_timeline' | null = null
    let stageStartedAt = 0

    try {
      stage = 'office_health'
      stageStartedAt = performance.now()
      const officeHealth = this.officeHealthEngine.build({
        growth: input.growth,
        operational: input.operational,
      })
      this.metrics.recordOfficeHealthBuildTiming({
        durationMs: performance.now() - stageStartedAt,
        status: 'success',
      })

      stage = 'decision_center'
      stageStartedAt = performance.now()
      const decisionCenter = this.decisionCenterEngine.build({
        growth: input.growth,
        operational: input.operational,
        officeHealth,
      })
      this.metrics.recordDecisionCenterBuildTiming({
        durationMs: performance.now() - stageStartedAt,
        status: 'success',
      })

      const morningBrief = this.morningBriefEngine.build({
        growth: input.growth,
        operational: input.operational,
        officeHealth,
        decisionCenter,
        generatedAt: input.generatedAt,
      })

      stage = 'executive_feed'
      stageStartedAt = performance.now()
      const executiveFeed = this.executiveFeedEngine.build({
        growth: input.growth,
        operational: input.operational,
        officeHealth,
        decisionCenter,
        generatedAt: input.generatedAt,
      })
      this.metrics.recordExecutiveFeedBuildTiming({
        durationMs: performance.now() - stageStartedAt,
        status: 'success',
      })
      this.metrics.recordExecutiveFeedGenerated({
        count: executiveFeed.totalPublished,
        status: 'success',
      })

      stage = 'executive_timeline'
      const executiveTimeline = this.executiveTimelineEngine.build({
        growth: input.growth,
        operational: input.operational,
        officeHealth,
        decisionCenter,
        generatedAt: input.generatedAt,
      })

      return mapExecutiveDashboard({
        ...input,
        morningBrief,
        officeHealth,
        decisionCenter,
        executiveFeed,
        executiveTimeline,
      })
    } catch (error) {
      const durationMs = stageStartedAt === 0 ? 0 : performance.now() - stageStartedAt
      if (stage === 'office_health') {
        this.metrics.recordOfficeHealthBuildTiming({ durationMs, status: 'error' })
      }
      if (stage === 'decision_center') {
        this.metrics.recordDecisionCenterBuildTiming({ durationMs, status: 'error' })
      }
      if (stage === 'executive_feed') {
        this.metrics.recordExecutiveFeedBuildTiming({ durationMs, status: 'error' })
      }

      throw error
    }
  }
}

export function createExecutiveDashboardService(
  dependencies: ExecutiveDashboardServiceDependencies = {},
) {
  return new ExecutiveDashboardService(dependencies)
}
