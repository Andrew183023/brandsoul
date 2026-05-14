import { createHash } from 'node:crypto'

import type {
  AdaptiveWeightRecord,
  AdaptiveWeightSnapshotRuntime,
} from './adaptiveWeightSnapshotRuntime.js'
import type { EconomicMemoryRepository } from '../../persistence/economic/economicMemoryRepository.js'
import { getInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { buildSemanticFingerprint, getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'
import type { OpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import type { OpportunityLead } from '../../market-signals/opportunities/contracts/OpportunityLead.js'
import type { EntityActionSuggestion } from '../../market-signals/opportunities/contracts/EntityActionSuggestion.js'
import type { AdaptiveEquilibriumEvidenceRepository } from '../persistence/adaptiveEquilibriumEvidenceRepository.js'
import { buildLearningCheckpointId, type LearningCheckpointRepository } from '../persistence/learningCheckpointRepository.js'
import {
  AdaptiveEquilibriumEvidenceEvent,
  AdaptiveHeatmapSnapshot,
  AppendAdaptiveEquilibriumEvidenceInput,
} from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { appendAdaptiveEvidenceWithSovereignAuthority } from '../persistence/sovereignAdaptiveAppend.js'
import {
  assessReplayIdentityFreeze,
  getFrozenReplayIdentityFields,
} from '../governance/replayIdentityGovernancePolicy.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'
import type { GovernanceEvidenceTimelineService } from '../governance/governanceEvidenceTimelineService.js'
import { enforceAdaptiveInfluenceProductionPolicy } from '../../config/adaptiveInfluencePolicy.js'

type AdaptiveInfluenceGateRuntimeDependencies = {
  adaptiveWeightSnapshotRuntime: AdaptiveWeightSnapshotRuntime
  economicMemoryRepository: EconomicMemoryRepository
  adaptiveEquilibriumEvidenceRepository: AdaptiveEquilibriumEvidenceRepository
  learningCheckpointRepository?: LearningCheckpointRepository
  governanceEvidenceTimelineService?: GovernanceEvidenceTimelineService
  opportunitySnapshotStore: OpportunitySnapshotStore
  refreshIntervalMs?: number
  config?: Partial<AdaptiveInfluenceGateConfig>
}

export type AdaptiveInfluenceMode = 'off' | 'shadow_compare' | 'live_rank_only'
export type AdaptiveInfluenceScope = 'signal' | 'category' | 'entity'
export type AdaptiveInfluenceBlockedReason =
  | 'mode_off'
  | 'runtime_disabled'
  | 'kill_switch_enabled'
  | 'below_rollout_threshold'
  | 'no_applicable_weights'
  | 'below_minimum_sample'
  | 'eligible_shadow_projection'
  | 'eligible_live_projection_forbidden'
  | 'projection_allowed_but_non_mutating'

export type AdaptiveInfluenceGateConfig = {
  enabled: boolean
  mode: AdaptiveInfluenceMode
  boundedMin: number
  boundedMax: number
  rolloutPercentage: number
  minimumSampleRequirement: number
  allowedScopes: AdaptiveInfluenceScope[]
  killSwitchEnabled: boolean
}

export type AdaptiveInfluenceWeightEvidence = {
  scope: AdaptiveInfluenceScope
  memoryId: string
  weightId: string
  weight: number
  sampleCount: number
  confidenceLevel: 'low' | 'medium' | 'high'
  decayFactor: number
}

export type AdaptiveInfluencePayload = {
  opportunityId: string
  marketSignalId: string
  keyword: string
  category: string
  entityId: string | null
  baseScore: number
  baseRank: number
  adaptiveMultiplier: number
  finalProjectedScore: number
  projectedRank: number
  rankDelta: number
  influenceApplied: boolean
  rolloutEligible: boolean
  blockedReason: AdaptiveInfluenceBlockedReason
  rolloutBucket: number
  sampleThresholdSatisfied: boolean
  projectionMode: AdaptiveInfluenceMode
  weightSources: {
    signal: string | null
    category: string | null
    entity: string | null
  }
  memoryIds: {
    signal: string | null
    category: string | null
    entity: string | null
  }
  evidence: {
    signal: AdaptiveInfluenceWeightEvidence | null
    category: AdaptiveInfluenceWeightEvidence | null
    entity: AdaptiveInfluenceWeightEvidence | null
  }
  evidenceScopes: AdaptiveInfluenceScope[]
  sampleCounts: {
    signal: number | null
    category: number | null
    entity: number | null
  }
  replayFingerprint: string
}

export type AdaptiveInfluenceGateSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  config: AdaptiveInfluenceGateConfig
  influences: AdaptiveInfluencePayload[]
  metadata: {
    candidateCount: number
    influenceAppliedCount: number
    rolloutEligibleCount: number
    blockedCount: number
    divergenceCount: number
    rankShiftCount: number
    topRankChanged: boolean
    averageRankDelta: number
    maxAbsRankDelta: number
    averageAdaptiveMultiplier: number
    boundedMin: number
    boundedMax: number
    rolloutPercentage: number
    minimumSampleRequirement: number
    allowedScopes: AdaptiveInfluenceScope[]
    economicMemoryRecordCount: number
    audit: {
      rankDrift: {
        averageAbsRankDelta: number
        maxAbsRankDelta: number
        divergenceRatio: number
      }
      categoryDominance: {
        topProjectedCategory: string | null
        topProjectedCategoryShare: number
        top3CategoryConcentration: number
      }
      entityDominance: {
        topProjectedEntityId: string | null
        topProjectedEntityShare: number
        top3EntityConcentration: number
      }
      repeatedTopRankPersistence: {
        topOpportunityId: string | null
        consecutiveRefreshes: number
      }
      oscillation: {
        oscillationFrequency: number
        oscillatingOpportunityCount: number
        comparableOpportunityCount: number
      }
      multiplierSaturation: {
        saturationRatio: number
        minBoundHitRatio: number
        maxBoundHitRatio: number
      }
      suppression: {
        suppressedProjectionRatio: number
        suppressedCount: number
        candidateCount: number
      }
      lowSampleInstability: {
        lowSampleInstabilityRatio: number
        lowSampleCount: number
        unstableLowSampleCount: number
      }
      lowConfidenceAmplification: {
        lowConfidenceProjectionRatio: number
        amplifiedLowConfidenceCount: number
        lowConfidenceProjectionCount: number
      }
      replayConsistency: {
        equivalentFingerprintRatio: number
        equivalentFingerprintCount: number
        comparableFingerprintCount: number
      }
      projectionVolatility: {
        averageProjectedRankChange: number
        maxProjectedRankChange: number
      }
      driftDetection: {
        thresholds: AdaptiveDriftDetectionThresholds
        warningSummary: {
          activeCount: number
          warningCount: number
          criticalCount: number
        }
        warnings: AdaptiveDriftWarningEvent[]
      }
      reinforcementLoopDetection: AdaptiveReinforcementLoopDetection
      historicalReplaySimulation: AdaptiveHistoricalReplaySimulation
      longDurationValidation: AdaptiveLongDurationValidation
      stabilityScore: number
    }
    refreshIntervalMs: number
    lastRefreshDurationMs: number | null
    lastError: string | null
  }
}

export type AdaptiveInfluenceGateRuntimeStatus = {
  runtimeName: string
  started: boolean
  ready: boolean
  warming: boolean
  error: boolean
  advisoryOnly: true
  mutatesLiveRanking: false
  mutatesGovernance: false
  mutatesExecution: false
  lastRunAt: string | null
  lastError: string | null
  refreshIntervalMs: number
  config: AdaptiveInfluenceGateConfig
  candidateCount: number
  influenceAppliedCount: number
  rolloutEligibleCount: number
  blockedCount: number
  divergenceCount: number
  rankShiftCount: number
  topRankChanged: boolean
}

export type AdaptiveDriftWarningCode =
  | 'runaway_multipliers'
  | 'category_over_concentration'
  | 'entity_reinforcement_loop'
  | 'projection_instability'
  | 'replay_divergence'
  | 'ranking_volatility'
  | 'repetitive_rank_flipping'
  | 'low_confidence_amplification'

export type AdaptiveDriftWarningSeverity = 'info' | 'warning' | 'critical'
export type AdaptiveDriftWarningStatus = 'clear' | 'active'

export type AdaptiveDriftWarningEvent = {
  id: string
  code: AdaptiveDriftWarningCode
  severity: AdaptiveDriftWarningSeverity
  status: AdaptiveDriftWarningStatus
  message: string
  observedValue: number
  warningThreshold: number
  criticalThreshold: number
  context: Record<string, unknown>
}

export type AdaptiveReinforcementLoopWarningCode =
  | 'repeated_entity_dominance'
  | 'repeated_category_dominance'
  | 'self_reinforcing_top_rank_persistence'
  | 'multiplier_compounding_behavior'
  | 'adaptive_saturation_loop'
  | 'projection_lock_in'
  | 'low_diversity_ranking_cycle'

export type AdaptiveReinforcementLoopWarningSeverity = 'info' | 'warning' | 'critical'
export type AdaptiveReinforcementLoopWarningStatus = 'clear' | 'active'

export type AdaptiveReinforcementLoopWarningEvent = {
  id: string
  code: AdaptiveReinforcementLoopWarningCode
  severity: AdaptiveReinforcementLoopWarningSeverity
  status: AdaptiveReinforcementLoopWarningStatus
  message: string
  observedValue: number
  warningThreshold: number
  criticalThreshold: number
  context: Record<string, unknown>
}

export type AdaptiveReinforcementLoopDetection = {
  thresholds: AdaptiveReinforcementLoopDetectionThresholds
  warningSummary: {
    activeCount: number
    warningCount: number
    criticalCount: number
  }
  loopMetrics: {
    repeatedEntityDominance: number
    repeatedCategoryDominance: number
    selfReinforcingTopRankPersistence: number
    multiplierCompoundingBehavior: number
    adaptiveSaturationLoop: number
    projectionLockIn: number
    lowDiversityRankingCycle: number
  }
  persistence: {
    entityDominanceConsecutive: number
    categoryDominanceConsecutive: number
    topRankConsecutive: number
    saturationConsecutive: number
  }
  replaySafeDiagnostics: {
    currentTopReplayFingerprint: string | null
    previousTopReplayFingerprint: string | null
    topReplayFingerprintStable: boolean
    comparableFingerprintCount: number
    equivalentFingerprintCount: number
    equivalentFingerprintRatio: number
    comparableMultiplierCount: number
  }
  warnings: AdaptiveReinforcementLoopWarningEvent[]
}

export type AdaptiveLongDurationTrendDirection = 'improving' | 'degrading' | 'stable'

export type AdaptiveLongDurationTrendMetric = {
  current: number
  shortWindowAverage: number
  mediumWindowAverage: number
  longWindowAverage: number
  shortDelta: number
  longDelta: number
  direction: AdaptiveLongDurationTrendDirection
}

export type AdaptiveLongDurationHistoryPoint = {
  generatedAt: string
  driftActiveWarnings: number
  driftCriticalWarnings: number
  driftWarningRatio: number
  divergenceRatio: number
  rankingConvergenceRatio: number
  replayEquivalentRatio: number
  categoryTopShare: number
  entityTopShare: number
  oscillationFrequency: number
  saturationRatio: number
  lowConfidenceAmplificationRatio: number
  suppressionRatio: number
  stabilityScore: number
  topProjectedCategory: string | null
  topProjectedEntityId: string | null
}

export type AdaptiveLongDurationValidation = {
  architecture: {
    observationOnly: true
    automaticCorrection: false
    adaptiveMutation: false
    autoDisable: false
    rollingWindows: {
      short: number
      medium: number
      long: number
    }
    historyRetentionLimit: number
  }
  snapshotHistory: {
    retainedSnapshots: number
    oldestGeneratedAt: string | null
    latestGeneratedAt: string | null
    history: AdaptiveLongDurationHistoryPoint[]
  }
  trendAggregation: {
    driftPersistence: AdaptiveLongDurationTrendMetric
    rankingConvergence: AdaptiveLongDurationTrendMetric
    replayConsistency: AdaptiveLongDurationTrendMetric
    categoryDominanceEvolution: AdaptiveLongDurationTrendMetric
    entityReinforcementLoops: AdaptiveLongDurationTrendMetric
    oscillationPersistence: AdaptiveLongDurationTrendMetric
    multiplierSaturationTrends: AdaptiveLongDurationTrendMetric
    lowConfidenceAmplificationTrends: AdaptiveLongDurationTrendMetric
    suppressionRatios: AdaptiveLongDurationTrendMetric
    stabilityScoreEvolution: AdaptiveLongDurationTrendMetric
  }
  historicalDivergenceSummary: {
    totalSnapshots: number
    snapshotsWithDivergence: number
    divergencePresenceRatio: number
    averageDivergenceRatio: number
    peakDivergenceRatio: number
  }
  replayConsistencyHistory: {
    equivalentRatioTrend: AdaptiveLongDurationTrendMetric
    averageEquivalentRatio: number
    minimumEquivalentRatio: number
  }
  persistenceCounters: {
    driftWarningConsecutive: number
    driftCriticalConsecutive: number
    saturationWarningConsecutive: number
    saturationCriticalConsecutive: number
  }
}

export type AdaptiveHistoricalReplayTimelinePoint = {
  generatedAt: string
  historicalRankingReplay: number
  adaptiveProjectionReplay: number
  divergenceRatio: number
  driftWarningRatio: number
  replayConsistencyRatio: number
  saturationRatio: number
  oscillationFrequency: number
  reinforcementLoopIntensity: number
  projectionStabilityScore: number
}

export type AdaptiveHistoricalReplaySimulation = {
  engine: {
    simulationOnly: true
    mutatesAdaptivePersistence: false
    mutatesGovernance: false
    mutatesExecution: false
    replayTimelineRetentionLimit: number
  }
  replayTimeline: {
    totalReplayedSnapshots: number
    startedAt: string | null
    endedAt: string | null
    points: AdaptiveHistoricalReplayTimelinePoint[]
  }
  historicalDriftAnalysis: {
    driftAccumulationScore: number
    peakDriftWarningRatio: number
    activeDriftSnapshots: number
  }
  projectionStabilityAnalysis: {
    averageStabilityScore: number
    minimumStabilityScore: number
    stabilityDegradation: number
  }
  replayDegradationMetrics: {
    averageReplayConsistency: number
    minimumReplayConsistency: number
    replayConsistencyDegradation: number
    degradedReplaySnapshots: number
  }
  divergenceEvolution: {
    averageDivergenceRatio: number
    peakDivergenceRatio: number
    divergenceTrend: AdaptiveLongDurationTrendMetric
  }
  saturationEvolution: {
    averageSaturationRatio: number
    peakSaturationRatio: number
    saturationTrend: AdaptiveLongDurationTrendMetric
  }
  oscillationPersistence: {
    averageOscillationFrequency: number
    peakOscillationFrequency: number
    oscillationTrend: AdaptiveLongDurationTrendMetric
  }
  reinforcementLoops: {
    averageLoopIntensity: number
    peakLoopIntensity: number
    lowDiversityCycleRatio: number
    loopTrend: AdaptiveLongDurationTrendMetric
  }
  stressSimulation: {
    engine: {
      simulationOnly: true
      noMutation: true
      autoCorrection: false
      governanceInfluence: false
      stressHistorySize: number
      syntheticGapInjectionInterval: number
    }
    replayInstabilityThresholds: {
      replayConsistencyWarning: number
      replayConsistencyCritical: number
      collapseWarning: number
      collapseCritical: number
      oscillationAmplificationWarning: number
      oscillationAmplificationCritical: number
      saturationPersistenceWarning: number
      saturationPersistenceCritical: number
      reinforcementEscalationWarning: number
      reinforcementEscalationCritical: number
    }
    degradationMetrics: {
      stressReplayConsistencyAverage: number
      stressReplayConsistencyMinimum: number
      fingerprintDivergenceRatio: number
      snapshotGapRatio: number
      oscillationAmplificationRatio: number
      saturationPersistenceRatio: number
      rankingInstabilityAccumulation: number
      reinforcementLoopEscalationRatio: number
    }
    replayCollapseDetection: {
      collapseScore: number
      collapseStatus: 'stable' | 'warning' | 'critical'
      collapseDetected: boolean
      collapseSignals: string[]
    }
    replayRiskDiagnostics: {
      riskScore: number
      riskClassification: 'safe' | 'caution' | 'unsafe'
      dominantRiskSignals: string[]
    }
  }
  rootCauseAnalysis: {
    rootCauseGraph: {
      nodes: Array<{
        id: string
        label: string
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      }>
      edges: Array<{
        from: string
        to: string
        weight: number
      }>
    }
    instabilityContributionModel: Array<{
      factor: string
      contribution: number
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      evidenceMetric: number
    }>
    dominantInstabilityFactors: string[]
    replayCollapseContributors: Array<{
      factor: string
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      contribution: number
    }>
    saturationContributors: Array<{
      factor: string
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      contribution: number
    }>
    reinforcementEscalationContributors: Array<{
      factor: string
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      contribution: number
    }>
    stabilityBlockers: string[]
    governanceRiskSummary: {
      overallSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      rolloutRecommendation: 'do_not_rollout'
      explanation: string
    }
  }
  decayHysteresisResearch: {
    decaySimulationModel: {
      simulationOnly: true
      gradualDecayRate: number
      delayedReinforcementResponseSteps: number
      saturationCoolingFactor: number
    }
    hysteresisSimulationModel: {
      simulationOnly: true
      hysteresisWindow: number
      entryThreshold: number
      exitThreshold: number
      delayedResponseSteps: number
    }
    replayImpactAnalysis: {
      baselineReplayConsistency: number
      projectedReplayConsistencyWithDecay: number
      replayConsistencyDelta: number
    }
    saturationImpactAnalysis: {
      baselineSaturationPersistence: number
      projectedSaturationPersistenceWithCooling: number
      saturationDelta: number
    }
    oscillationImpactAnalysis: {
      baselineOscillationAmplification: number
      projectedOscillationWithHysteresis: number
      oscillationDelta: number
    }
    equilibriumAnalysis: {
      baselineEquilibriumScore: number
      projectedEquilibriumScore: number
      equilibriumDelta: number
      rankStabilizationEffect: number
    }
    governanceRiskAssessment: {
      residualRiskScore: number
      confidencePenalty: number
      notes: string[]
      classification: 'SAFE' | 'CAUTION' | 'UNSAFE'
    }
    rolloutRecommendation: {
      classification: 'SAFE' | 'CAUTION' | 'UNSAFE'
      recommendation: 'do_not_rollout'
      rationale: string
    }
  }
  equilibriumLongitudinalStudy: {
    longitudinalModel: {
      simulationOnly: true
      noMutation: true
      noRollout: true
      noAdaptiveCorrection: true
      boundedAdaptiveBehavior: true
      observationWindows: {
        short: number
        medium: number
        long: number
      }
      trackedDimensions: string[]
      studyOverTime: {
        replayConsistencyEquilibrium: number
        reinforcementEscalationPersistence: number
        saturationEquilibrium: number
        oscillationDamping: number
        projectionStabilityConvergence: number
        rankingDiversityPreservation: number
        entropyEvolution: number
        projectionLockInPersistence: number
        lowConfidenceAmplificationPersistence: number
        replayDegradationPersistence: number
      }
    }
    stabilityConvergenceMetrics: {
      projectionStabilityConvergence: number
      replayConsistencyEquilibrium: number
      oscillationDamping: number
      equilibriumConfidence: number
    }
    saturationEquilibriumMetrics: {
      saturationEquilibriumScore: number
      saturationPersistence: number
      saturationDrift: number
    }
    reinforcementPersistenceMetrics: {
      reinforcementEscalationPersistence: number
      projectionLockInPersistence: number
      lowConfidenceAmplificationPersistence: number
    }
    entropyEvolutionAnalysis: {
      baselineEntropy: number
      currentEntropy: number
      entropyDelta: number
      entropyTrend: AdaptiveLongDurationTrendDirection
    }
    rankingDiversityAnalysis: {
      baselineDiversity: number
      currentDiversity: number
      diversityPreservationRatio: number
      diversityLossRisk: 'low' | 'medium' | 'high'
    }
    replayEquilibriumAnalysis: {
      replayDegradationPersistence: number
      replayConsistencyEquilibrium: number
      equilibriumBreachCount: number
    }
    governanceRecommendation: {
      classification: 'SAFE' | 'CAUTION' | 'UNSAFE'
      recommendation: 'do_not_rollout'
      sustainedEquilibriumEvidence: boolean
      rationale: string
    }
  }
}

type AdaptiveInfluenceAuditMetrics = AdaptiveInfluenceGateSnapshot['metadata']['audit']
type AdaptiveInfluenceAuditCoreMetrics = Omit<
AdaptiveInfluenceAuditMetrics,
'reinforcementLoopDetection' | 'historicalReplaySimulation' | 'longDurationValidation'
>

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const DEFAULT_BOUNDED_MIN = 0.75
const DEFAULT_BOUNDED_MAX = 1.35
const DEFAULT_MINIMUM_SAMPLE_REQUIREMENT = 3
const DEFAULT_ALLOWED_SCOPES: AdaptiveInfluenceScope[] = ['signal', 'category', 'entity']
const ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME = 'adaptive-influence-gate-runtime'
const ADAPTIVE_DRIFT_DETECTION_THRESHOLDS = {
  runawayMultipliers: { warning: 0.4, critical: 0.6 },
  categoryOverConcentration: { warning: 0.8, critical: 0.95 },
  entityReinforcementLoop: { warning: 0.65, critical: 0.85 },
  projectionInstability: { warning: 0.3, critical: 0.5 },
  replayDivergence: { warning: 0.05, critical: 0.2 },
  rankingVolatility: { warning: 0.5, critical: 0.8 },
  repetitiveRankFlipping: { warning: 0.4, critical: 0.7 },
  lowConfidenceAmplification: { warning: 0.35, critical: 0.6 },
} as const
const ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS = {
  repeatedEntityDominance: { warning: 0.55, critical: 0.75 },
  repeatedCategoryDominance: { warning: 0.6, critical: 0.8 },
  selfReinforcingTopRankPersistence: { warning: 0.5, critical: 0.75 },
  multiplierCompoundingBehavior: { warning: 0.4, critical: 0.65 },
  adaptiveSaturationLoop: { warning: 0.45, critical: 0.7 },
  projectionLockIn: { warning: 0.6, critical: 0.8 },
  lowDiversityRankingCycle: { warning: 0.55, critical: 0.8 },
} as const
const ADAPTIVE_LONG_DURATION_WINDOWS = {
  short: 5,
  medium: 15,
  long: 30,
} as const
const ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT = 120
const ADAPTIVE_REPLAY_STRESS_SIMULATION = {
  stressHistorySize: 90,
  syntheticGapInjectionInterval: 12,
  thresholds: {
    replayConsistencyWarning: 0.92,
    replayConsistencyCritical: 0.8,
    collapseWarning: 0.45,
    collapseCritical: 0.65,
    oscillationAmplificationWarning: 0.25,
    oscillationAmplificationCritical: 0.45,
    saturationPersistenceWarning: 0.3,
    saturationPersistenceCritical: 0.5,
    reinforcementEscalationWarning: 0.35,
    reinforcementEscalationCritical: 0.55,
  },
} as const
const ADAPTIVE_DECAY_HYSTERESIS_RESEARCH = {
  gradualDecayRate: 0.015,
  delayedReinforcementResponseSteps: 3,
  saturationCoolingFactor: 0.65,
  hysteresisWindow: 0.08,
  entryThreshold: 0.62,
  exitThreshold: 0.54,
  confidencePenalty: 0.2,
} as const
let adaptiveReplayIdentityPolicyDisclosureLogged = false
const ADAPTIVE_CONTINUITY_LINEAGE_KEY = 'adaptive-influence-longitudinal-continuity-v1'
const ADAPTIVE_CONTINUITY_CHECKPOINT_VERSION = 1
const ADAPTIVE_CONTINUITY_GAP_WARNING_MS = 6 * 60 * 60 * 1000

type AdaptiveLongitudinalContinuityCheckpointPayload = {
  version: 1
  checkpointedAt: string
  continuityWindows: {
    short: number
    medium: number
    long: number
    historyRetentionLimit: number
  }
  longDurationHistory: AdaptiveLongDurationHistoryPoint[]
  longitudinalTrendState: AdaptiveLongDurationValidation['trendAggregation']
  replayContinuityContext: {
    previousTopOpportunityId: string | null
    previousTopStreak: number
    previousGovernanceEvidenceId: string | null
    governanceTimelineEventSequence: number
    lastEquilibriumReplayFingerprint: string | null
  }
  continuityCheckpoints: {
    lastSnapshotGeneratedAt: string | null
    lastEvidenceGeneratedAt: string | null
    lastEvidenceId: string | null
  }
  continuityLineageMetadata: {
    lineageKey: string
    lineageVersion: number
    checkpointCount: number
    parentContinuityFingerprint: string | null
    restoreGapDetected: boolean
  }
}

type AdaptiveDriftDetectionThresholds = typeof ADAPTIVE_DRIFT_DETECTION_THRESHOLDS
type AdaptiveReinforcementLoopDetectionThresholds = typeof ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS

function buildBaselineTrendMetric(): AdaptiveLongDurationTrendMetric {
  return {
    current: 0,
    shortWindowAverage: 0,
    mediumWindowAverage: 0,
    longWindowAverage: 0,
    shortDelta: 0,
    longDelta: 0,
    direction: 'stable',
  }
}

function buildInitialLongDurationValidation(): AdaptiveLongDurationValidation {
  return {
    architecture: {
      observationOnly: true,
      automaticCorrection: false,
      adaptiveMutation: false,
      autoDisable: false,
      rollingWindows: ADAPTIVE_LONG_DURATION_WINDOWS,
      historyRetentionLimit: ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT,
    },
    snapshotHistory: {
      retainedSnapshots: 0,
      oldestGeneratedAt: null,
      latestGeneratedAt: null,
      history: [],
    },
    trendAggregation: {
      driftPersistence: buildBaselineTrendMetric(),
      rankingConvergence: buildBaselineTrendMetric(),
      replayConsistency: buildBaselineTrendMetric(),
      categoryDominanceEvolution: buildBaselineTrendMetric(),
      entityReinforcementLoops: buildBaselineTrendMetric(),
      oscillationPersistence: buildBaselineTrendMetric(),
      multiplierSaturationTrends: buildBaselineTrendMetric(),
      lowConfidenceAmplificationTrends: buildBaselineTrendMetric(),
      suppressionRatios: buildBaselineTrendMetric(),
      stabilityScoreEvolution: buildBaselineTrendMetric(),
    },
    historicalDivergenceSummary: {
      totalSnapshots: 0,
      snapshotsWithDivergence: 0,
      divergencePresenceRatio: 0,
      averageDivergenceRatio: 0,
      peakDivergenceRatio: 0,
    },
    replayConsistencyHistory: {
      equivalentRatioTrend: buildBaselineTrendMetric(),
      averageEquivalentRatio: 0,
      minimumEquivalentRatio: 0,
    },
    persistenceCounters: {
      driftWarningConsecutive: 0,
      driftCriticalConsecutive: 0,
      saturationWarningConsecutive: 0,
      saturationCriticalConsecutive: 0,
    },
  }
}

function buildInitialHistoricalReplaySimulation(): AdaptiveHistoricalReplaySimulation {
  return {
    engine: {
      simulationOnly: true,
      mutatesAdaptivePersistence: false,
      mutatesGovernance: false,
      mutatesExecution: false,
      replayTimelineRetentionLimit: ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT,
    },
    replayTimeline: {
      totalReplayedSnapshots: 0,
      startedAt: null,
      endedAt: null,
      points: [],
    },
    historicalDriftAnalysis: {
      driftAccumulationScore: 0,
      peakDriftWarningRatio: 0,
      activeDriftSnapshots: 0,
    },
    projectionStabilityAnalysis: {
      averageStabilityScore: 0,
      minimumStabilityScore: 0,
      stabilityDegradation: 0,
    },
    replayDegradationMetrics: {
      averageReplayConsistency: 0,
      minimumReplayConsistency: 0,
      replayConsistencyDegradation: 0,
      degradedReplaySnapshots: 0,
    },
    divergenceEvolution: {
      averageDivergenceRatio: 0,
      peakDivergenceRatio: 0,
      divergenceTrend: buildBaselineTrendMetric(),
    },
    saturationEvolution: {
      averageSaturationRatio: 0,
      peakSaturationRatio: 0,
      saturationTrend: buildBaselineTrendMetric(),
    },
    oscillationPersistence: {
      averageOscillationFrequency: 0,
      peakOscillationFrequency: 0,
      oscillationTrend: buildBaselineTrendMetric(),
    },
    reinforcementLoops: {
      averageLoopIntensity: 0,
      peakLoopIntensity: 0,
      lowDiversityCycleRatio: 0,
      loopTrend: buildBaselineTrendMetric(),
    },
    stressSimulation: {
      engine: {
        simulationOnly: true,
        noMutation: true,
        autoCorrection: false,
        governanceInfluence: false,
        stressHistorySize: ADAPTIVE_REPLAY_STRESS_SIMULATION.stressHistorySize,
        syntheticGapInjectionInterval: ADAPTIVE_REPLAY_STRESS_SIMULATION.syntheticGapInjectionInterval,
      },
      replayInstabilityThresholds: ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds,
      degradationMetrics: {
        stressReplayConsistencyAverage: 0,
        stressReplayConsistencyMinimum: 0,
        fingerprintDivergenceRatio: 0,
        snapshotGapRatio: 0,
        oscillationAmplificationRatio: 0,
        saturationPersistenceRatio: 0,
        rankingInstabilityAccumulation: 0,
        reinforcementLoopEscalationRatio: 0,
      },
      replayCollapseDetection: {
        collapseScore: 0,
        collapseStatus: 'stable',
        collapseDetected: false,
        collapseSignals: [],
      },
      replayRiskDiagnostics: {
        riskScore: 0,
        riskClassification: 'safe',
        dominantRiskSignals: [],
      },
    },
    rootCauseAnalysis: {
      rootCauseGraph: {
        nodes: [],
        edges: [],
      },
      instabilityContributionModel: [],
      dominantInstabilityFactors: [],
      replayCollapseContributors: [],
      saturationContributors: [],
      reinforcementEscalationContributors: [],
      stabilityBlockers: [],
      governanceRiskSummary: {
        overallSeverity: 'LOW',
        rolloutRecommendation: 'do_not_rollout',
        explanation: 'Insufficient instability evidence collected.',
      },
    },
    decayHysteresisResearch: {
      decaySimulationModel: {
        simulationOnly: true,
        gradualDecayRate: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.gradualDecayRate,
        delayedReinforcementResponseSteps: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.delayedReinforcementResponseSteps,
        saturationCoolingFactor: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.saturationCoolingFactor,
      },
      hysteresisSimulationModel: {
        simulationOnly: true,
        hysteresisWindow: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.hysteresisWindow,
        entryThreshold: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.entryThreshold,
        exitThreshold: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.exitThreshold,
        delayedResponseSteps: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.delayedReinforcementResponseSteps,
      },
      replayImpactAnalysis: {
        baselineReplayConsistency: 0,
        projectedReplayConsistencyWithDecay: 0,
        replayConsistencyDelta: 0,
      },
      saturationImpactAnalysis: {
        baselineSaturationPersistence: 0,
        projectedSaturationPersistenceWithCooling: 0,
        saturationDelta: 0,
      },
      oscillationImpactAnalysis: {
        baselineOscillationAmplification: 0,
        projectedOscillationWithHysteresis: 0,
        oscillationDelta: 0,
      },
      equilibriumAnalysis: {
        baselineEquilibriumScore: 0,
        projectedEquilibriumScore: 0,
        equilibriumDelta: 0,
        rankStabilizationEffect: 0,
      },
      governanceRiskAssessment: {
        residualRiskScore: 0,
        confidencePenalty: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.confidencePenalty,
        notes: [],
        classification: 'UNSAFE',
      },
      rolloutRecommendation: {
        classification: 'UNSAFE',
        recommendation: 'do_not_rollout',
        rationale: 'Research-only baseline with no stability evidence.',
      },
    },
    equilibriumLongitudinalStudy: {
      longitudinalModel: {
        simulationOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveCorrection: true,
        boundedAdaptiveBehavior: true,
        observationWindows: ADAPTIVE_LONG_DURATION_WINDOWS,
        trackedDimensions: [
          'replay_consistency_equilibrium',
          'reinforcement_escalation_persistence',
          'saturation_equilibrium',
          'oscillation_damping',
          'projection_stability_convergence',
          'ranking_diversity_preservation',
          'entropy_evolution',
          'projection_lock_in_persistence',
          'low_confidence_amplification_persistence',
          'replay_degradation_persistence',
        ],
        studyOverTime: {
          replayConsistencyEquilibrium: 0,
          reinforcementEscalationPersistence: 0,
          saturationEquilibrium: 0,
          oscillationDamping: 0,
          projectionStabilityConvergence: 0,
          rankingDiversityPreservation: 0,
          entropyEvolution: 0,
          projectionLockInPersistence: 0,
          lowConfidenceAmplificationPersistence: 0,
          replayDegradationPersistence: 0,
        },
      },
      stabilityConvergenceMetrics: {
        projectionStabilityConvergence: 0,
        replayConsistencyEquilibrium: 0,
        oscillationDamping: 0,
        equilibriumConfidence: 0,
      },
      saturationEquilibriumMetrics: {
        saturationEquilibriumScore: 0,
        saturationPersistence: 0,
        saturationDrift: 0,
      },
      reinforcementPersistenceMetrics: {
        reinforcementEscalationPersistence: 0,
        projectionLockInPersistence: 0,
        lowConfidenceAmplificationPersistence: 0,
      },
      entropyEvolutionAnalysis: {
        baselineEntropy: 0,
        currentEntropy: 0,
        entropyDelta: 0,
        entropyTrend: 'stable',
      },
      rankingDiversityAnalysis: {
        baselineDiversity: 0,
        currentDiversity: 0,
        diversityPreservationRatio: 0,
        diversityLossRisk: 'high',
      },
      replayEquilibriumAnalysis: {
        replayDegradationPersistence: 0,
        replayConsistencyEquilibrium: 0,
        equilibriumBreachCount: 0,
      },
      governanceRecommendation: {
        classification: 'UNSAFE',
        recommendation: 'do_not_rollout',
        sustainedEquilibriumEvidence: false,
        rationale: 'Research-only baseline with no sustained equilibrium evidence.',
      },
    },
  }
}

function buildInitialAuditMetrics(): AdaptiveInfluenceAuditMetrics {
  return {
    rankDrift: {
      averageAbsRankDelta: 0,
      maxAbsRankDelta: 0,
      divergenceRatio: 0,
    },
    categoryDominance: {
      topProjectedCategory: null,
      topProjectedCategoryShare: 0,
      top3CategoryConcentration: 0,
    },
    entityDominance: {
      topProjectedEntityId: null,
      topProjectedEntityShare: 0,
      top3EntityConcentration: 0,
    },
    repeatedTopRankPersistence: {
      topOpportunityId: null,
      consecutiveRefreshes: 0,
    },
    oscillation: {
      oscillationFrequency: 0,
      oscillatingOpportunityCount: 0,
      comparableOpportunityCount: 0,
    },
    multiplierSaturation: {
      saturationRatio: 0,
      minBoundHitRatio: 0,
      maxBoundHitRatio: 0,
    },
    suppression: {
      suppressedProjectionRatio: 0,
      suppressedCount: 0,
      candidateCount: 0,
    },
    lowSampleInstability: {
      lowSampleInstabilityRatio: 0,
      lowSampleCount: 0,
      unstableLowSampleCount: 0,
    },
    lowConfidenceAmplification: {
      lowConfidenceProjectionRatio: 0,
      amplifiedLowConfidenceCount: 0,
      lowConfidenceProjectionCount: 0,
    },
    replayConsistency: {
      equivalentFingerprintRatio: 1,
      equivalentFingerprintCount: 0,
      comparableFingerprintCount: 0,
    },
    projectionVolatility: {
      averageProjectedRankChange: 0,
      maxProjectedRankChange: 0,
    },
    driftDetection: {
      thresholds: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS,
      warningSummary: {
        activeCount: 0,
        warningCount: 0,
        criticalCount: 0,
      },
      warnings: [],
    },
    reinforcementLoopDetection: {
      thresholds: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS,
      warningSummary: {
        activeCount: 0,
        warningCount: 0,
        criticalCount: 0,
      },
      loopMetrics: {
        repeatedEntityDominance: 0,
        repeatedCategoryDominance: 0,
        selfReinforcingTopRankPersistence: 0,
        multiplierCompoundingBehavior: 0,
        adaptiveSaturationLoop: 0,
        projectionLockIn: 0,
        lowDiversityRankingCycle: 0,
      },
      persistence: {
        entityDominanceConsecutive: 0,
        categoryDominanceConsecutive: 0,
        topRankConsecutive: 0,
        saturationConsecutive: 0,
      },
      replaySafeDiagnostics: {
        currentTopReplayFingerprint: null,
        previousTopReplayFingerprint: null,
        topReplayFingerprintStable: false,
        comparableFingerprintCount: 0,
        equivalentFingerprintCount: 0,
        equivalentFingerprintRatio: 1,
        comparableMultiplierCount: 0,
      },
      warnings: [],
    },
    historicalReplaySimulation: buildInitialHistoricalReplaySimulation(),
    longDurationValidation: buildInitialLongDurationValidation(),
    stabilityScore: 1,
  }
}

function buildDriftEventId(args: {
  code: AdaptiveDriftWarningCode
  status: AdaptiveDriftWarningStatus
  severity: AdaptiveDriftWarningSeverity
  observedValue: number
}) {
  const fingerprint = createHash('sha256')
    .update([args.code, args.status, args.severity, roundMetric(args.observedValue).toString()].join(':'))
    .digest('hex')

  return `adaptive-drift:${fingerprint.slice(0, 24)}`
}

function classifyDriftSeverity(observedValue: number, warningThreshold: number, criticalThreshold: number) {
  if (observedValue >= criticalThreshold) {
    return { status: 'active' as const, severity: 'critical' as const }
  }

  if (observedValue >= warningThreshold) {
    return { status: 'active' as const, severity: 'warning' as const }
  }

  return { status: 'clear' as const, severity: 'info' as const }
}

function createDriftWarningEvent(args: {
  code: AdaptiveDriftWarningCode
  observedValue: number
  warningThreshold: number
  criticalThreshold: number
  message: string
  context: Record<string, unknown>
}): AdaptiveDriftWarningEvent {
  const classification = classifyDriftSeverity(args.observedValue, args.warningThreshold, args.criticalThreshold)
  return {
    id: buildDriftEventId({
      code: args.code,
      status: classification.status,
      severity: classification.severity,
      observedValue: args.observedValue,
    }),
    code: args.code,
    severity: classification.severity,
    status: classification.status,
    message: args.message,
    observedValue: roundMetric(args.observedValue),
    warningThreshold: args.warningThreshold,
    criticalThreshold: args.criticalThreshold,
    context: args.context,
  }
}

function buildDriftDetectionWarnings(args: {
  categoryDominance: AdaptiveInfluenceGateSnapshot['metadata']['audit']['categoryDominance']
  entityDominance: AdaptiveInfluenceGateSnapshot['metadata']['audit']['entityDominance']
  repeatedTopRankPersistence: AdaptiveInfluenceGateSnapshot['metadata']['audit']['repeatedTopRankPersistence']
  oscillation: AdaptiveInfluenceGateSnapshot['metadata']['audit']['oscillation']
  multiplierSaturation: AdaptiveInfluenceGateSnapshot['metadata']['audit']['multiplierSaturation']
  lowConfidenceAmplification: AdaptiveInfluenceGateSnapshot['metadata']['audit']['lowConfidenceAmplification']
  replayConsistency: AdaptiveInfluenceGateSnapshot['metadata']['audit']['replayConsistency']
  projectionVolatility: AdaptiveInfluenceGateSnapshot['metadata']['audit']['projectionVolatility']
  stabilityScore: number
}) {
  const instabilityScore = roundMetric(1 - args.stabilityScore)
  const replayDivergence = roundMetric(1 - args.replayConsistency.equivalentFingerprintRatio)
  const rankingVolatility = Math.max(
    roundMetric(args.projectionVolatility.averageProjectedRankChange / 2),
    roundMetric(args.projectionVolatility.maxProjectedRankChange / 3),
  )
  const entityLoopObservedValue = args.repeatedTopRankPersistence.consecutiveRefreshes >= 2
    ? args.entityDominance.topProjectedEntityShare
    : 0

  const warnings = [
    createDriftWarningEvent({
      code: 'runaway_multipliers',
      observedValue: args.multiplierSaturation.saturationRatio,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.runawayMultipliers.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.runawayMultipliers.critical,
      message: 'Adaptive multiplier saturation indicates potential runaway weighting behavior.',
      context: {
        minBoundHitRatio: args.multiplierSaturation.minBoundHitRatio,
        maxBoundHitRatio: args.multiplierSaturation.maxBoundHitRatio,
      },
    }),
    createDriftWarningEvent({
      code: 'category_over_concentration',
      observedValue: args.categoryDominance.top3CategoryConcentration,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.categoryOverConcentration.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.categoryOverConcentration.critical,
      message: 'Projected ranking is over-concentrated in a narrow category set.',
      context: {
        topProjectedCategory: args.categoryDominance.topProjectedCategory,
        topProjectedCategoryShare: args.categoryDominance.topProjectedCategoryShare,
      },
    }),
    createDriftWarningEvent({
      code: 'entity_reinforcement_loop',
      observedValue: entityLoopObservedValue,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.entityReinforcementLoop.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.entityReinforcementLoop.critical,
      message: 'Entity concentration is reinforcing the same top-ranked loop across refreshes.',
      context: {
        topProjectedEntityId: args.entityDominance.topProjectedEntityId,
        topPersistence: args.repeatedTopRankPersistence.consecutiveRefreshes,
      },
    }),
    createDriftWarningEvent({
      code: 'projection_instability',
      observedValue: instabilityScore,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.projectionInstability.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.projectionInstability.critical,
      message: 'Projection stability score indicates unstable adaptive behavior.',
      context: {
        stabilityScore: args.stabilityScore,
      },
    }),
    createDriftWarningEvent({
      code: 'replay_divergence',
      observedValue: replayDivergence,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.replayDivergence.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.replayDivergence.critical,
      message: 'Replay fingerprint divergence detected across comparable opportunities.',
      context: {
        comparableFingerprintCount: args.replayConsistency.comparableFingerprintCount,
        equivalentFingerprintCount: args.replayConsistency.equivalentFingerprintCount,
      },
    }),
    createDriftWarningEvent({
      code: 'ranking_volatility',
      observedValue: rankingVolatility,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.rankingVolatility.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.rankingVolatility.critical,
      message: 'Projected ranking is showing elevated volatility between refreshes.',
      context: {
        averageProjectedRankChange: args.projectionVolatility.averageProjectedRankChange,
        maxProjectedRankChange: args.projectionVolatility.maxProjectedRankChange,
      },
    }),
    createDriftWarningEvent({
      code: 'repetitive_rank_flipping',
      observedValue: args.oscillation.oscillationFrequency,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.repetitiveRankFlipping.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.repetitiveRankFlipping.critical,
      message: 'Opportunities are repeatedly flipping projected ranks.',
      context: {
        oscillatingOpportunityCount: args.oscillation.oscillatingOpportunityCount,
        comparableOpportunityCount: args.oscillation.comparableOpportunityCount,
      },
    }),
    createDriftWarningEvent({
      code: 'low_confidence_amplification',
      observedValue: args.lowConfidenceAmplification.lowConfidenceProjectionRatio,
      warningThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.lowConfidenceAmplification.warning,
      criticalThreshold: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.lowConfidenceAmplification.critical,
      message: 'Low-confidence signals are being amplified in projected outcomes.',
      context: {
        amplifiedLowConfidenceCount: args.lowConfidenceAmplification.amplifiedLowConfidenceCount,
        lowConfidenceProjectionCount: args.lowConfidenceAmplification.lowConfidenceProjectionCount,
      },
    }),
  ]

  const activeWarnings = warnings.filter((warning) => warning.status === 'active')
  const warningCount = activeWarnings.filter((warning) => warning.severity === 'warning').length
  const criticalCount = activeWarnings.filter((warning) => warning.severity === 'critical').length

  return {
    thresholds: ADAPTIVE_DRIFT_DETECTION_THRESHOLDS,
    warningSummary: {
      activeCount: activeWarnings.length,
      warningCount,
      criticalCount,
    },
    warnings,
  }
}

function buildReinforcementLoopEventId(args: {
  code: AdaptiveReinforcementLoopWarningCode
  status: AdaptiveReinforcementLoopWarningStatus
  severity: AdaptiveReinforcementLoopWarningSeverity
  observedValue: number
}) {
  const fingerprint = createHash('sha256')
    .update([args.code, args.status, args.severity, roundMetric(args.observedValue).toString()].join(':'))
    .digest('hex')

  return `adaptive-loop:${fingerprint.slice(0, 24)}`
}

function createReinforcementLoopWarningEvent(args: {
  code: AdaptiveReinforcementLoopWarningCode
  observedValue: number
  warningThreshold: number
  criticalThreshold: number
  message: string
  context: Record<string, unknown>
}): AdaptiveReinforcementLoopWarningEvent {
  const classification = classifyDriftSeverity(args.observedValue, args.warningThreshold, args.criticalThreshold)
  return {
    id: buildReinforcementLoopEventId({
      code: args.code,
      status: classification.status,
      severity: classification.severity,
      observedValue: args.observedValue,
    }),
    code: args.code,
    severity: classification.severity,
    status: classification.status,
    message: args.message,
    observedValue: roundMetric(args.observedValue),
    warningThreshold: args.warningThreshold,
    criticalThreshold: args.criticalThreshold,
    context: args.context,
  }
}

function countDominanceStreak(args: {
  history: AdaptiveLongDurationHistoryPoint[]
  currentValue: string | null
  selector: (point: AdaptiveLongDurationHistoryPoint) => string | null
}) {
  if (!args.currentValue) {
    return 0
  }

  let streak = 1
  for (let index = args.history.length - 1; index >= 0; index -= 1) {
    const point = args.history[index]
    if (!point || args.selector(point) !== args.currentValue) {
      break
    }
    streak += 1
  }

  return streak
}

function buildReinforcementLoopDetection(args: {
  history: AdaptiveLongDurationHistoryPoint[]
  metrics: AdaptiveInfluenceAuditCoreMetrics
  influences: AdaptiveInfluencePayload[]
  previousInfluences: AdaptiveInfluencePayload[]
}): AdaptiveReinforcementLoopDetection {
  const windowSize = ADAPTIVE_LONG_DURATION_WINDOWS.short
  const projectedRanking = [...args.influences].sort((left, right) => left.projectedRank - right.projectedRank)
  const previousProjectedRanking = [...args.previousInfluences].sort((left, right) => left.projectedRank - right.projectedRank)
  const currentTop = projectedRanking[0] ?? null
  const previousTop = previousProjectedRanking[0] ?? null
  const previousByOpportunityId = new Map(args.previousInfluences.map((item) => [item.opportunityId, item] as const))
  const comparable = args.influences.filter((item) => previousByOpportunityId.has(item.opportunityId))

  const entityDominanceConsecutive = countDominanceStreak({
    history: args.history,
    currentValue: args.metrics.entityDominance.topProjectedEntityId,
    selector: (point) => point.topProjectedEntityId,
  })
  const categoryDominanceConsecutive = countDominanceStreak({
    history: args.history,
    currentValue: args.metrics.categoryDominance.topProjectedCategory,
    selector: (point) => point.topProjectedCategory,
  })
  const topRankConsecutive = args.metrics.repeatedTopRankPersistence.consecutiveRefreshes

  const previousSaturationConsecutive = countConsecutiveFromEnd({
    history: args.history,
    predicate: (point) => point.saturationRatio >= ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.adaptiveSaturationLoop.warning,
  })
  const saturationConsecutive = args.metrics.multiplierSaturation.saturationRatio >= ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.adaptiveSaturationLoop.warning
    ? previousSaturationConsecutive + 1
    : 0

  const comparableMultiplierCount = comparable.length
  const multiplierCompoundingCount = comparable.filter((item) => {
    const previous = previousByOpportunityId.get(item.opportunityId)
    if (!previous) {
      return false
    }

    return item.adaptiveMultiplier > 1
      && previous.adaptiveMultiplier > 1
      && item.adaptiveMultiplier > previous.adaptiveMultiplier
  }).length
  const multiplierCompoundingBehavior = comparableMultiplierCount > 0
    ? roundMetric(multiplierCompoundingCount / comparableMultiplierCount)
    : 0

  const repeatedEntityDominance = roundMetric(clamp(
    ((entityDominanceConsecutive / windowSize) * 0.6)
      + (args.metrics.entityDominance.topProjectedEntityShare * 0.4),
    0,
    1,
  ))
  const repeatedCategoryDominance = roundMetric(clamp(
    ((categoryDominanceConsecutive / windowSize) * 0.6)
      + (args.metrics.categoryDominance.topProjectedCategoryShare * 0.4),
    0,
    1,
  ))
  const selfReinforcingTopRankPersistence = roundMetric(clamp(
    ((topRankConsecutive / windowSize) * 0.7)
      + (args.metrics.entityDominance.topProjectedEntityShare * 0.3),
    0,
    1,
  ))
  const adaptiveSaturationLoop = roundMetric(clamp(
    (args.metrics.multiplierSaturation.saturationRatio * 0.5)
      + (Math.min(1, saturationConsecutive / windowSize) * 0.5),
    0,
    1,
  ))

  const rankingConvergenceRatio = roundMetric(1 - args.metrics.rankDrift.divergenceRatio)
  const projectionLockIn = roundMetric(clamp(
    ((topRankConsecutive / windowSize) * 0.5)
      + (args.metrics.replayConsistency.equivalentFingerprintRatio * 0.3)
      + (rankingConvergenceRatio * 0.2),
    0,
    1,
  ))
  const lowDiversityRankingCycle = roundMetric(clamp(
    (Math.max(
      args.metrics.categoryDominance.top3CategoryConcentration,
      args.metrics.entityDominance.top3EntityConcentration,
    ) * 0.7)
      + (args.metrics.oscillation.oscillationFrequency * 0.3),
    0,
    1,
  ))

  const loopMetrics = {
    repeatedEntityDominance,
    repeatedCategoryDominance,
    selfReinforcingTopRankPersistence,
    multiplierCompoundingBehavior,
    adaptiveSaturationLoop,
    projectionLockIn,
    lowDiversityRankingCycle,
  }

  const warnings = [
    createReinforcementLoopWarningEvent({
      code: 'repeated_entity_dominance',
      observedValue: loopMetrics.repeatedEntityDominance,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.repeatedEntityDominance.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.repeatedEntityDominance.critical,
      message: 'Projected rankings are repeatedly dominated by the same entity.',
      context: {
        topProjectedEntityId: args.metrics.entityDominance.topProjectedEntityId,
        entityDominanceConsecutive,
      },
    }),
    createReinforcementLoopWarningEvent({
      code: 'repeated_category_dominance',
      observedValue: loopMetrics.repeatedCategoryDominance,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.repeatedCategoryDominance.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.repeatedCategoryDominance.critical,
      message: 'Projected rankings are repeatedly dominated by the same category.',
      context: {
        topProjectedCategory: args.metrics.categoryDominance.topProjectedCategory,
        categoryDominanceConsecutive,
      },
    }),
    createReinforcementLoopWarningEvent({
      code: 'self_reinforcing_top_rank_persistence',
      observedValue: loopMetrics.selfReinforcingTopRankPersistence,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.selfReinforcingTopRankPersistence.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.selfReinforcingTopRankPersistence.critical,
      message: 'Top-rank persistence is self-reinforcing across refresh cycles.',
      context: {
        topOpportunityId: args.metrics.repeatedTopRankPersistence.topOpportunityId,
        topRankConsecutive,
      },
    }),
    createReinforcementLoopWarningEvent({
      code: 'multiplier_compounding_behavior',
      observedValue: loopMetrics.multiplierCompoundingBehavior,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.multiplierCompoundingBehavior.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.multiplierCompoundingBehavior.critical,
      message: 'Adaptive multipliers are compounding over repeated cycles.',
      context: {
        multiplierCompoundingCount,
        comparableMultiplierCount,
      },
    }),
    createReinforcementLoopWarningEvent({
      code: 'adaptive_saturation_loop',
      observedValue: loopMetrics.adaptiveSaturationLoop,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.adaptiveSaturationLoop.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.adaptiveSaturationLoop.critical,
      message: 'Adaptive saturation is persisting as a loop pattern.',
      context: {
        saturationRatio: args.metrics.multiplierSaturation.saturationRatio,
        saturationConsecutive,
      },
    }),
    createReinforcementLoopWarningEvent({
      code: 'projection_lock_in',
      observedValue: loopMetrics.projectionLockIn,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.projectionLockIn.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.projectionLockIn.critical,
      message: 'Projected ordering is exhibiting lock-in behavior.',
      context: {
        topRankConsecutive,
        rankingConvergenceRatio,
      },
    }),
    createReinforcementLoopWarningEvent({
      code: 'low_diversity_ranking_cycle',
      observedValue: loopMetrics.lowDiversityRankingCycle,
      warningThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.lowDiversityRankingCycle.warning,
      criticalThreshold: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.lowDiversityRankingCycle.critical,
      message: 'Projected ranking cycles show low diversity concentration.',
      context: {
        top3CategoryConcentration: args.metrics.categoryDominance.top3CategoryConcentration,
        top3EntityConcentration: args.metrics.entityDominance.top3EntityConcentration,
        oscillationFrequency: args.metrics.oscillation.oscillationFrequency,
      },
    }),
  ]

  const activeWarnings = warnings.filter((warning) => warning.status === 'active')
  const warningCount = activeWarnings.filter((warning) => warning.severity === 'warning').length
  const criticalCount = activeWarnings.filter((warning) => warning.severity === 'critical').length

  return {
    thresholds: ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS,
    warningSummary: {
      activeCount: activeWarnings.length,
      warningCount,
      criticalCount,
    },
    loopMetrics,
    persistence: {
      entityDominanceConsecutive,
      categoryDominanceConsecutive,
      topRankConsecutive,
      saturationConsecutive,
    },
    replaySafeDiagnostics: {
      currentTopReplayFingerprint: currentTop?.replayFingerprint ?? null,
      previousTopReplayFingerprint: previousTop?.replayFingerprint ?? null,
      topReplayFingerprintStable: currentTop?.replayFingerprint === previousTop?.replayFingerprint,
      comparableFingerprintCount: args.metrics.replayConsistency.comparableFingerprintCount,
      equivalentFingerprintCount: args.metrics.replayConsistency.equivalentFingerprintCount,
      equivalentFingerprintRatio: args.metrics.replayConsistency.equivalentFingerprintRatio,
      comparableMultiplierCount,
    },
    warnings,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function averageMetric(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function binaryEntropy(value: number) {
  const bounded = clamp(value, 0, 1)
  if (bounded <= 0 || bounded >= 1) {
    return 0
  }

  const entropy = -((bounded * Math.log2(bounded)) + ((1 - bounded) * Math.log2(1 - bounded)))
  return roundMetric(clamp(entropy, 0, 1))
}

function resolveTrendDirection(args: {
  shortDelta: number
  longDelta: number
  higherIsBetter: boolean
}): AdaptiveLongDurationTrendDirection {
  const epsilon = 0.01
  if (Math.abs(args.shortDelta) < epsilon && Math.abs(args.longDelta) < epsilon) {
    return 'stable'
  }

  const improved = args.higherIsBetter
    ? args.shortDelta > epsilon || args.longDelta > epsilon
    : args.shortDelta < -epsilon || args.longDelta < -epsilon

  return improved ? 'improving' : 'degrading'
}

function buildTrendMetric(args: {
  history: AdaptiveLongDurationHistoryPoint[]
  selector: (point: AdaptiveLongDurationHistoryPoint) => number
  higherIsBetter?: boolean
}): AdaptiveLongDurationTrendMetric {
  const values = args.history.map((point) => args.selector(point))
  if (values.length === 0) {
    return buildBaselineTrendMetric()
  }

  const current = values[values.length - 1] ?? 0
  const shortValues = values.slice(-ADAPTIVE_LONG_DURATION_WINDOWS.short)
  const mediumValues = values.slice(-ADAPTIVE_LONG_DURATION_WINDOWS.medium)
  const longValues = values.slice(-ADAPTIVE_LONG_DURATION_WINDOWS.long)
  const shortWindowAverage = averageMetric(shortValues)
  const mediumWindowAverage = averageMetric(mediumValues)
  const longWindowAverage = averageMetric(longValues)
  const shortDelta = roundMetric(current - shortWindowAverage)
  const longDelta = roundMetric(current - longWindowAverage)
  const direction = resolveTrendDirection({
    shortDelta,
    longDelta,
    higherIsBetter: args.higherIsBetter === true,
  })

  return {
    current: roundMetric(current),
    shortWindowAverage,
    mediumWindowAverage,
    longWindowAverage,
    shortDelta,
    longDelta,
    direction,
  }
}

function countConsecutiveFromEnd(args: {
  history: AdaptiveLongDurationHistoryPoint[]
  predicate: (point: AdaptiveLongDurationHistoryPoint) => boolean
}) {
  let count = 0
  for (let index = args.history.length - 1; index >= 0; index -= 1) {
    const point = args.history[index]
    if (!point || !args.predicate(point)) {
      break
    }
    count += 1
  }

  return count
}

function buildLongDurationHistoryPoint(args: {
  generatedAt: string
  metrics: AdaptiveInfluenceAuditCoreMetrics
}): AdaptiveLongDurationHistoryPoint {
  const candidateCount = Math.max(args.metrics.suppression.candidateCount, 1)
  return {
    generatedAt: args.generatedAt,
    driftActiveWarnings: args.metrics.driftDetection.warningSummary.activeCount,
    driftCriticalWarnings: args.metrics.driftDetection.warningSummary.criticalCount,
    driftWarningRatio: roundMetric(args.metrics.driftDetection.warningSummary.activeCount / candidateCount),
    divergenceRatio: args.metrics.rankDrift.divergenceRatio,
    rankingConvergenceRatio: roundMetric(1 - args.metrics.rankDrift.divergenceRatio),
    replayEquivalentRatio: args.metrics.replayConsistency.equivalentFingerprintRatio,
    categoryTopShare: args.metrics.categoryDominance.topProjectedCategoryShare,
    entityTopShare: args.metrics.entityDominance.topProjectedEntityShare,
    oscillationFrequency: args.metrics.oscillation.oscillationFrequency,
    saturationRatio: args.metrics.multiplierSaturation.saturationRatio,
    lowConfidenceAmplificationRatio: args.metrics.lowConfidenceAmplification.lowConfidenceProjectionRatio,
    suppressionRatio: args.metrics.suppression.suppressedProjectionRatio,
    stabilityScore: args.metrics.stabilityScore,
    topProjectedCategory: args.metrics.categoryDominance.topProjectedCategory,
    topProjectedEntityId: args.metrics.entityDominance.topProjectedEntityId,
  }
}

function buildLongDurationValidation(args: {
  history: AdaptiveLongDurationHistoryPoint[]
}): AdaptiveLongDurationValidation {
  const { history } = args
  const divergenceValues = history.map((point) => point.divergenceRatio)
  const replayValues = history.map((point) => point.replayEquivalentRatio)
  const snapshotsWithDivergence = divergenceValues.filter((value) => value > 0).length

  return {
    architecture: {
      observationOnly: true,
      automaticCorrection: false,
      adaptiveMutation: false,
      autoDisable: false,
      rollingWindows: ADAPTIVE_LONG_DURATION_WINDOWS,
      historyRetentionLimit: ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT,
    },
    snapshotHistory: {
      retainedSnapshots: history.length,
      oldestGeneratedAt: history[0]?.generatedAt ?? null,
      latestGeneratedAt: history[history.length - 1]?.generatedAt ?? null,
      history,
    },
    trendAggregation: {
      driftPersistence: buildTrendMetric({ history, selector: (point) => point.driftWarningRatio }),
      rankingConvergence: buildTrendMetric({ history, selector: (point) => point.rankingConvergenceRatio, higherIsBetter: true }),
      replayConsistency: buildTrendMetric({ history, selector: (point) => point.replayEquivalentRatio, higherIsBetter: true }),
      categoryDominanceEvolution: buildTrendMetric({ history, selector: (point) => point.categoryTopShare }),
      entityReinforcementLoops: buildTrendMetric({ history, selector: (point) => point.entityTopShare }),
      oscillationPersistence: buildTrendMetric({ history, selector: (point) => point.oscillationFrequency }),
      multiplierSaturationTrends: buildTrendMetric({ history, selector: (point) => point.saturationRatio }),
      lowConfidenceAmplificationTrends: buildTrendMetric({ history, selector: (point) => point.lowConfidenceAmplificationRatio }),
      suppressionRatios: buildTrendMetric({ history, selector: (point) => point.suppressionRatio }),
      stabilityScoreEvolution: buildTrendMetric({ history, selector: (point) => point.stabilityScore, higherIsBetter: true }),
    },
    historicalDivergenceSummary: {
      totalSnapshots: history.length,
      snapshotsWithDivergence,
      divergencePresenceRatio: history.length > 0 ? roundMetric(snapshotsWithDivergence / history.length) : 0,
      averageDivergenceRatio: averageMetric(divergenceValues),
      peakDivergenceRatio: divergenceValues.length > 0 ? roundMetric(Math.max(...divergenceValues)) : 0,
    },
    replayConsistencyHistory: {
      equivalentRatioTrend: buildTrendMetric({ history, selector: (point) => point.replayEquivalentRatio, higherIsBetter: true }),
      averageEquivalentRatio: averageMetric(replayValues),
      minimumEquivalentRatio: replayValues.length > 0 ? roundMetric(Math.min(...replayValues)) : 0,
    },
    persistenceCounters: {
      driftWarningConsecutive: countConsecutiveFromEnd({
        history,
        predicate: (point) => point.driftWarningRatio >= ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.projectionInstability.warning,
      }),
      driftCriticalConsecutive: countConsecutiveFromEnd({
        history,
        predicate: (point) => point.driftWarningRatio >= ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.projectionInstability.critical,
      }),
      saturationWarningConsecutive: countConsecutiveFromEnd({
        history,
        predicate: (point) => point.saturationRatio >= ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.runawayMultipliers.warning,
      }),
      saturationCriticalConsecutive: countConsecutiveFromEnd({
        history,
        predicate: (point) => point.saturationRatio >= ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.runawayMultipliers.critical,
      }),
    },
  }
}

function buildHistoricalReplaySimulation(args: {
  history: AdaptiveLongDurationHistoryPoint[]
}): AdaptiveHistoricalReplaySimulation {
  const classifyInstabilitySeverity = (value: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' => {
    if (value >= 0.75) {
      return 'CRITICAL'
    }
    if (value >= 0.55) {
      return 'HIGH'
    }
    if (value >= 0.3) {
      return 'MEDIUM'
    }
    return 'LOW'
  }

  const replayTimelinePoints = args.history.map((point) => {
    const historicalRankingReplay = roundMetric(1 - point.divergenceRatio)
    const adaptiveProjectionReplay = roundMetric((point.replayEquivalentRatio + point.stabilityScore) / 2)
    const reinforcementLoopIntensity = roundMetric(Math.max(point.entityTopShare, point.categoryTopShare))
    const projectionStabilityScore = roundMetric(clamp(
      (point.stabilityScore * 0.7) + ((1 - point.oscillationFrequency) * 0.3),
      0,
      1,
    ))

    return {
      generatedAt: point.generatedAt,
      historicalRankingReplay,
      adaptiveProjectionReplay,
      divergenceRatio: point.divergenceRatio,
      driftWarningRatio: point.driftWarningRatio,
      replayConsistencyRatio: point.replayEquivalentRatio,
      saturationRatio: point.saturationRatio,
      oscillationFrequency: point.oscillationFrequency,
      reinforcementLoopIntensity,
      projectionStabilityScore,
    } satisfies AdaptiveHistoricalReplayTimelinePoint
  })

  const divergenceValues = replayTimelinePoints.map((point) => point.divergenceRatio)
  const driftValues = replayTimelinePoints.map((point) => point.driftWarningRatio)
  const replayValues = replayTimelinePoints.map((point) => point.replayConsistencyRatio)
  const saturationValues = replayTimelinePoints.map((point) => point.saturationRatio)
  const oscillationValues = replayTimelinePoints.map((point) => point.oscillationFrequency)
  const stabilityValues = replayTimelinePoints.map((point) => point.projectionStabilityScore)
  const loopValues = replayTimelinePoints.map((point) => point.reinforcementLoopIntensity)

  const stressWindowSize = ADAPTIVE_REPLAY_STRESS_SIMULATION.stressHistorySize
  const stressTimeline = Array.from({ length: stressWindowSize }, (_, index) => {
    const basePoint = replayTimelinePoints[replayTimelinePoints.length > 0
      ? index % replayTimelinePoints.length
      : 0]

    if (!basePoint) {
      return {
        gapInjected: false,
        replayConsistencyRatio: 1,
        divergenceRatio: 0,
        oscillationFrequency: 0,
        saturationRatio: 0,
        reinforcementLoopIntensity: 0,
      }
    }

    const cycle = Math.floor(index / Math.max(1, replayTimelinePoints.length))
    const degradation = clamp(cycle * 0.03, 0, 0.3)
    const gapInjected = ADAPTIVE_REPLAY_STRESS_SIMULATION.syntheticGapInjectionInterval > 0
      && index > 0
      && index % ADAPTIVE_REPLAY_STRESS_SIMULATION.syntheticGapInjectionInterval === 0

    return {
      gapInjected,
      replayConsistencyRatio: roundMetric(clamp(basePoint.replayConsistencyRatio - degradation - (gapInjected ? 0.08 : 0), 0, 1)),
      divergenceRatio: roundMetric(clamp(basePoint.divergenceRatio + degradation + (gapInjected ? 0.07 : 0), 0, 1)),
      oscillationFrequency: roundMetric(clamp(basePoint.oscillationFrequency + degradation + (gapInjected ? 0.05 : 0), 0, 1)),
      saturationRatio: roundMetric(clamp(basePoint.saturationRatio + (degradation * 0.7) + (gapInjected ? 0.04 : 0), 0, 1)),
      reinforcementLoopIntensity: roundMetric(clamp(basePoint.reinforcementLoopIntensity + (degradation * 0.8), 0, 1)),
    }
  })

  const stressReplayConsistencyValues = stressTimeline.map((point) => point.replayConsistencyRatio)
  const stressDivergenceValues = stressTimeline.map((point) => point.divergenceRatio)
  const stressOscillationValues = stressTimeline.map((point) => point.oscillationFrequency)
  const stressSaturationValues = stressTimeline.map((point) => point.saturationRatio)
  const stressLoopValues = stressTimeline.map((point) => point.reinforcementLoopIntensity)
  const lowConfidenceValues = args.history.map((point) => point.lowConfidenceAmplificationRatio)
  const categoryDominanceValues = args.history.map((point) => point.categoryTopShare)
  const entityDominanceValues = args.history.map((point) => point.entityTopShare)

  const gapInjectedCount = stressTimeline.filter((point) => point.gapInjected).length
  const snapshotGapRatio = stressTimeline.length > 0 ? roundMetric(gapInjectedCount / stressTimeline.length) : 0
  const stressReplayConsistencyAverage = averageMetric(stressReplayConsistencyValues)
  const stressReplayConsistencyMinimum = stressReplayConsistencyValues.length > 0
    ? roundMetric(Math.min(...stressReplayConsistencyValues))
    : 0
  const fingerprintDivergenceRatio = averageMetric(stressDivergenceValues)
  const oscillationAmplificationRatio = averageMetric(stressOscillationValues)
  const saturationPersistenceRatio = averageMetric(stressSaturationValues)
  const rankingInstabilityAccumulation = roundMetric(clamp(
    stressDivergenceValues.reduce((sum, value) => sum + value, 0) / Math.max(1, stressDivergenceValues.length),
    0,
    1,
  ))
  const reinforcementLoopEscalationRatio = averageMetric(stressLoopValues)

  const collapseScore = roundMetric(clamp(
    ((1 - stressReplayConsistencyAverage) * 0.35)
      + (fingerprintDivergenceRatio * 0.2)
      + (oscillationAmplificationRatio * 0.15)
      + (saturationPersistenceRatio * 0.15)
      + (rankingInstabilityAccumulation * 0.1)
      + (reinforcementLoopEscalationRatio * 0.05),
    0,
    1,
  ))

  const collapseSignals: string[] = []
  if (stressReplayConsistencyAverage <= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.replayConsistencyWarning) {
    collapseSignals.push('degraded_replay_consistency')
  }
  if (snapshotGapRatio > 0) {
    collapseSignals.push('snapshot_gaps')
  }
  if (fingerprintDivergenceRatio >= 0.2) {
    collapseSignals.push('fingerprint_divergence')
  }
  if (oscillationAmplificationRatio >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.oscillationAmplificationWarning) {
    collapseSignals.push('oscillation_amplification')
  }
  if (saturationPersistenceRatio >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.saturationPersistenceWarning) {
    collapseSignals.push('saturation_persistence')
  }
  if (reinforcementLoopEscalationRatio >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.reinforcementEscalationWarning) {
    collapseSignals.push('reinforcement_escalation')
  }

  const collapseStatus = collapseScore >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.collapseCritical
    ? 'critical'
    : (collapseScore >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.collapseWarning ? 'warning' : 'stable')

  const collapseDetected = collapseStatus !== 'stable'
  const riskScore = roundMetric(clamp((collapseScore * 0.7) + ((collapseSignals.length / 6) * 0.3), 0, 1))
  const riskClassification = riskScore >= 0.7
    ? 'unsafe'
    : (riskScore >= 0.4 ? 'caution' : 'safe')

  const contributionEntries = [
    {
      factor: 'replay_degradation_causes',
      contribution: roundMetric(1 - stressReplayConsistencyAverage),
      evidenceMetric: stressReplayConsistencyAverage,
    },
    {
      factor: 'saturation_persistence_causes',
      contribution: saturationPersistenceRatio,
      evidenceMetric: saturationPersistenceRatio,
    },
    {
      factor: 'reinforcement_escalation_causes',
      contribution: reinforcementLoopEscalationRatio,
      evidenceMetric: reinforcementLoopEscalationRatio,
    },
    {
      factor: 'oscillation_amplification_causes',
      contribution: oscillationAmplificationRatio,
      evidenceMetric: oscillationAmplificationRatio,
    },
    {
      factor: 'ranking_instability_accumulation',
      contribution: rankingInstabilityAccumulation,
      evidenceMetric: rankingInstabilityAccumulation,
    },
    {
      factor: 'low_confidence_amplification',
      contribution: averageMetric(lowConfidenceValues),
      evidenceMetric: averageMetric(lowConfidenceValues),
    },
    {
      factor: 'projection_lock_in',
      contribution: roundMetric(Math.max(reinforcementLoopEscalationRatio, averageMetric(loopValues))),
      evidenceMetric: averageMetric(loopValues),
    },
    {
      factor: 'category_dominance_persistence',
      contribution: averageMetric(categoryDominanceValues),
      evidenceMetric: averageMetric(categoryDominanceValues),
    },
    {
      factor: 'entity_dominance_persistence',
      contribution: averageMetric(entityDominanceValues),
      evidenceMetric: averageMetric(entityDominanceValues),
    },
    {
      factor: 'replay_collapse_contributors',
      contribution: collapseScore,
      evidenceMetric: collapseScore,
    },
  ].map((entry) => ({
    ...entry,
    severity: classifyInstabilitySeverity(entry.contribution),
  }))

  const dominantInstabilityFactors = [...contributionEntries]
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 4)
    .map((entry) => entry.factor)

  const replayCollapseContributors = contributionEntries
    .filter((entry) => (
      entry.factor === 'replay_degradation_causes'
      || entry.factor === 'replay_collapse_contributors'
      || entry.factor === 'oscillation_amplification_causes'
      || entry.factor === 'ranking_instability_accumulation'
    ))
    .map((entry) => ({
      factor: entry.factor,
      severity: entry.severity,
      contribution: entry.contribution,
    }))

  const saturationContributors = contributionEntries
    .filter((entry) => (
      entry.factor === 'saturation_persistence_causes'
      || entry.factor === 'low_confidence_amplification'
      || entry.factor === 'ranking_instability_accumulation'
    ))
    .map((entry) => ({
      factor: entry.factor,
      severity: entry.severity,
      contribution: entry.contribution,
    }))

  const reinforcementEscalationContributors = contributionEntries
    .filter((entry) => (
      entry.factor === 'reinforcement_escalation_causes'
      || entry.factor === 'projection_lock_in'
      || entry.factor === 'entity_dominance_persistence'
      || entry.factor === 'category_dominance_persistence'
    ))
    .map((entry) => ({
      factor: entry.factor,
      severity: entry.severity,
      contribution: entry.contribution,
    }))

  const overallContributionScore = roundMetric(clamp(
    contributionEntries.reduce((sum, entry) => sum + entry.contribution, 0) / Math.max(1, contributionEntries.length),
    0,
    1,
  ))
  const overallSeverity = classifyInstabilitySeverity(Math.max(overallContributionScore, riskScore, collapseScore))
  const stabilityBlockers = [
    collapseDetected ? 'replay_collapse_risk' : null,
    stressReplayConsistencyAverage < ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.replayConsistencyWarning
      ? 'replay_consistency_degradation' : null,
    oscillationAmplificationRatio >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.oscillationAmplificationWarning
      ? 'oscillation_amplification' : null,
    reinforcementLoopEscalationRatio >= ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds.reinforcementEscalationWarning
      ? 'reinforcement_escalation' : null,
    averageMetric(lowConfidenceValues) >= ADAPTIVE_DRIFT_DETECTION_THRESHOLDS.lowConfidenceAmplification.warning
      ? 'low_confidence_amplification' : null,
    averageMetric(categoryDominanceValues) >= ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.repeatedCategoryDominance.warning
      ? 'category_dominance_persistence' : null,
    averageMetric(entityDominanceValues) >= ADAPTIVE_REINFORCEMENT_LOOP_THRESHOLDS.repeatedEntityDominance.warning
      ? 'entity_dominance_persistence' : null,
  ].filter((value): value is string => value !== null)

  const rootCauseGraph = {
    nodes: [
      { id: 'replay_degradation', label: 'Replay Degradation', severity: classifyInstabilitySeverity(1 - stressReplayConsistencyAverage) },
      { id: 'saturation_persistence', label: 'Saturation Persistence', severity: classifyInstabilitySeverity(saturationPersistenceRatio) },
      { id: 'reinforcement_escalation', label: 'Reinforcement Escalation', severity: classifyInstabilitySeverity(reinforcementLoopEscalationRatio) },
      { id: 'oscillation_amplification', label: 'Oscillation Amplification', severity: classifyInstabilitySeverity(oscillationAmplificationRatio) },
      { id: 'ranking_instability', label: 'Ranking Instability', severity: classifyInstabilitySeverity(rankingInstabilityAccumulation) },
      { id: 'replay_collapse', label: 'Replay Collapse Risk', severity: classifyInstabilitySeverity(collapseScore) },
      { id: 'unsafe_rollout', label: 'UNSAFE Live Rollout Classification', severity: overallSeverity },
    ],
    edges: [
      { from: 'replay_degradation', to: 'replay_collapse', weight: 0.35 },
      { from: 'oscillation_amplification', to: 'replay_collapse', weight: 0.15 },
      { from: 'ranking_instability', to: 'replay_collapse', weight: 0.2 },
      { from: 'saturation_persistence', to: 'reinforcement_escalation', weight: 0.3 },
      { from: 'reinforcement_escalation', to: 'replay_collapse', weight: 0.25 },
      { from: 'replay_collapse', to: 'unsafe_rollout', weight: 0.5 },
      { from: 'reinforcement_escalation', to: 'unsafe_rollout', weight: 0.3 },
      { from: 'ranking_instability', to: 'unsafe_rollout', weight: 0.2 },
    ],
  }

  const baselineReplayConsistency = stressReplayConsistencyAverage
  const baselineSaturationPersistence = saturationPersistenceRatio
  const baselineOscillationAmplification = oscillationAmplificationRatio
  const baselineEquilibriumScore = roundMetric(clamp(1 - rankingInstabilityAccumulation, 0, 1))

  const projectedReplayConsistencyWithDecay = roundMetric(clamp(
    baselineReplayConsistency
      + (ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.gradualDecayRate * 0.6)
      + (ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.saturationCoolingFactor * 0.03)
      - (Math.max(0, baselineOscillationAmplification - ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.hysteresisWindow) * 0.2),
    0,
    1,
  ))
  const replayConsistencyDelta = roundMetric(projectedReplayConsistencyWithDecay - baselineReplayConsistency)

  const projectedSaturationPersistenceWithCooling = roundMetric(clamp(
    baselineSaturationPersistence * (1 - (ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.saturationCoolingFactor * 0.35)),
    0,
    1,
  ))
  const saturationDelta = roundMetric(projectedSaturationPersistenceWithCooling - baselineSaturationPersistence)

  const hysteresisOscillationPenalty = ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.hysteresisWindow < 0.1 ? 0.02 : -0.01
  const projectedOscillationWithHysteresis = roundMetric(clamp(
    baselineOscillationAmplification + hysteresisOscillationPenalty - (ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.gradualDecayRate * 0.2),
    0,
    1,
  ))
  const oscillationDelta = roundMetric(projectedOscillationWithHysteresis - baselineOscillationAmplification)

  const projectedEquilibriumScore = roundMetric(clamp(
    baselineEquilibriumScore
      + (Math.max(0, replayConsistencyDelta) * 0.6)
      + (Math.max(0, -saturationDelta) * 0.25)
      - (Math.max(0, oscillationDelta) * 0.5),
    0,
    1,
  ))
  const equilibriumDelta = roundMetric(projectedEquilibriumScore - baselineEquilibriumScore)
  const rankStabilizationEffect = roundMetric(clamp(
    (Math.max(0, equilibriumDelta) * 0.8) + Math.max(0, -oscillationDelta) * 0.2,
    0,
    1,
  ))

  const residualRiskScore = roundMetric(clamp(
    (riskScore * 0.55)
      + (collapseScore * 0.25)
      + (Math.max(0, oscillationDelta) * 0.1)
      + (ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.confidencePenalty * 0.1),
    0,
    1,
  ))
  const governanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE' = residualRiskScore >= 0.7
    ? 'UNSAFE'
    : (residualRiskScore >= 0.4 ? 'CAUTION' : 'SAFE')
  const governanceNotes = [
    replayConsistencyDelta > 0 ? 'Decay simulation suggests marginal replay consistency improvement.' : 'Replay consistency does not improve under simulated decay.',
    saturationDelta < 0 ? 'Saturation cooling reduces persistence in simulation.' : 'Saturation persistence remains elevated under cooling simulation.',
    oscillationDelta <= 0 ? 'Hysteresis appears to contain oscillation amplification in simulation.' : 'Hysteresis window may amplify oscillation under current parameters.',
    'Results are simulation-only and cannot justify rollout without longitudinal staging validation.',
  ]

  const averageCategoryDominance = averageMetric(categoryDominanceValues)
  const averageEntityDominance = averageMetric(entityDominanceValues)
  const rankingDiversityPreservation = roundMetric(clamp(1 - Math.max(averageCategoryDominance, averageEntityDominance), 0, 1))
  const baselineDiversity = roundMetric(clamp(1 - Math.max(categoryDominanceValues[0] ?? 0, entityDominanceValues[0] ?? 0), 0, 1))
  const currentDiversity = roundMetric(clamp(1 - Math.max(
    categoryDominanceValues[categoryDominanceValues.length - 1] ?? 0,
    entityDominanceValues[entityDominanceValues.length - 1] ?? 0,
  ), 0, 1))

  const replayConsistencyEquilibrium = averageMetric(replayValues)
  const reinforcementEscalationPersistence = averageMetric(loopValues)
  const saturationPersistence = averageMetric(saturationValues)
  const saturationEquilibriumScore = roundMetric(clamp(1 - saturationPersistence, 0, 1))
  const oscillationDamping = roundMetric(clamp(1 - averageMetric(oscillationValues), 0, 1))
  const replayDegradationPersistence = replayValues.length > 0
    ? roundMetric(replayValues.filter((value) => value < 1).length / replayValues.length)
    : 0
  const firstStability = stabilityValues[0] ?? 0
  const lastStability = stabilityValues[stabilityValues.length - 1] ?? 0

  const projectionStabilityConvergence = roundMetric(clamp(
    (averageMetric(stabilityValues) * 0.75)
      + (Math.max(0, lastStability - firstStability) * 0.25),
    0,
    1,
  ))

  const lockInPairs = args.history.length <= 1
    ? 0
    : args.history.slice(1).filter((point, index) => (
      point.topProjectedCategory === args.history[index]?.topProjectedCategory
      && point.topProjectedEntityId === args.history[index]?.topProjectedEntityId
    )).length
  const projectionLockInPersistence = args.history.length <= 1
    ? 0
    : roundMetric(lockInPairs / Math.max(1, args.history.length - 1))
  const lowConfidenceAmplificationPersistence = averageMetric(lowConfidenceValues)

  const baselineEntropy = binaryEntropy(Math.max(categoryDominanceValues[0] ?? 0, entityDominanceValues[0] ?? 0))
  const currentEntropy = binaryEntropy(Math.max(
    categoryDominanceValues[categoryDominanceValues.length - 1] ?? 0,
    entityDominanceValues[entityDominanceValues.length - 1] ?? 0,
  ))
  const entropyDelta = roundMetric(currentEntropy - baselineEntropy)
  const entropyTrend: AdaptiveLongDurationTrendDirection = entropyDelta > 0
    ? 'improving'
    : (entropyDelta < 0 ? 'degrading' : 'stable')

  const saturationDrift = roundMetric(
    (saturationValues[saturationValues.length - 1] ?? 0) - (saturationValues[0] ?? 0),
  )
  const equilibriumBreachCount = replayValues.filter((value) => value < 0.95).length
  const equilibriumConfidence = roundMetric(clamp(
    (replayConsistencyEquilibrium * 0.35)
      + (projectionStabilityConvergence * 0.25)
      + (oscillationDamping * 0.15)
      + (rankingDiversityPreservation * 0.1)
      + ((1 - replayDegradationPersistence) * 0.15),
    0,
    1,
  ))

  const longitudinalRiskScore = roundMetric(clamp(
    ((1 - replayConsistencyEquilibrium) * 0.22)
      + (reinforcementEscalationPersistence * 0.18)
      + (saturationPersistence * 0.12)
      + ((1 - oscillationDamping) * 0.1)
      + ((1 - projectionStabilityConvergence) * 0.12)
      + ((1 - rankingDiversityPreservation) * 0.08)
      + (replayDegradationPersistence * 0.08)
      + (lowConfidenceAmplificationPersistence * 0.1),
    0,
    1,
  ))

  const sustainedEquilibriumEvidence = (
    args.history.length >= ADAPTIVE_LONG_DURATION_WINDOWS.long
    && replayConsistencyEquilibrium >= 0.97
    && reinforcementEscalationPersistence <= 0.3
    && saturationPersistence <= 0.2
    && oscillationDamping >= 0.75
    && projectionStabilityConvergence >= 0.75
    && rankingDiversityPreservation >= 0.35
    && lowConfidenceAmplificationPersistence <= 0.25
    && replayDegradationPersistence <= 0.1
  )

  const equilibriumGovernanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE' = longitudinalRiskScore >= 0.66
    ? 'UNSAFE'
    : (longitudinalRiskScore >= 0.38 ? 'CAUTION' : 'SAFE')
  const diversityLossRisk: 'low' | 'medium' | 'high' = rankingDiversityPreservation < 0.2
    ? 'high'
    : (rankingDiversityPreservation < 0.45 ? 'medium' : 'low')

  const firstReplay = replayValues[0] ?? 0
  const lastReplay = replayValues[replayValues.length - 1] ?? 0

  return {
    engine: {
      simulationOnly: true,
      mutatesAdaptivePersistence: false,
      mutatesGovernance: false,
      mutatesExecution: false,
      replayTimelineRetentionLimit: ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT,
    },
    replayTimeline: {
      totalReplayedSnapshots: replayTimelinePoints.length,
      startedAt: replayTimelinePoints[0]?.generatedAt ?? null,
      endedAt: replayTimelinePoints[replayTimelinePoints.length - 1]?.generatedAt ?? null,
      points: replayTimelinePoints,
    },
    historicalDriftAnalysis: {
      driftAccumulationScore: averageMetric(driftValues),
      peakDriftWarningRatio: driftValues.length > 0 ? roundMetric(Math.max(...driftValues)) : 0,
      activeDriftSnapshots: driftValues.filter((value) => value > 0).length,
    },
    projectionStabilityAnalysis: {
      averageStabilityScore: averageMetric(stabilityValues),
      minimumStabilityScore: stabilityValues.length > 0 ? roundMetric(Math.min(...stabilityValues)) : 0,
      stabilityDegradation: roundMetric(clamp(firstStability - lastStability, -1, 1)),
    },
    replayDegradationMetrics: {
      averageReplayConsistency: averageMetric(replayValues),
      minimumReplayConsistency: replayValues.length > 0 ? roundMetric(Math.min(...replayValues)) : 0,
      replayConsistencyDegradation: roundMetric(clamp(firstReplay - lastReplay, -1, 1)),
      degradedReplaySnapshots: replayValues.filter((value) => value < 1).length,
    },
    divergenceEvolution: {
      averageDivergenceRatio: averageMetric(divergenceValues),
      peakDivergenceRatio: divergenceValues.length > 0 ? roundMetric(Math.max(...divergenceValues)) : 0,
      divergenceTrend: buildTrendMetric({
        history: args.history,
        selector: (point) => point.divergenceRatio,
      }),
    },
    saturationEvolution: {
      averageSaturationRatio: averageMetric(saturationValues),
      peakSaturationRatio: saturationValues.length > 0 ? roundMetric(Math.max(...saturationValues)) : 0,
      saturationTrend: buildTrendMetric({
        history: args.history,
        selector: (point) => point.saturationRatio,
      }),
    },
    oscillationPersistence: {
      averageOscillationFrequency: averageMetric(oscillationValues),
      peakOscillationFrequency: oscillationValues.length > 0 ? roundMetric(Math.max(...oscillationValues)) : 0,
      oscillationTrend: buildTrendMetric({
        history: args.history,
        selector: (point) => point.oscillationFrequency,
      }),
    },
    reinforcementLoops: {
      averageLoopIntensity: averageMetric(loopValues),
      peakLoopIntensity: loopValues.length > 0 ? roundMetric(Math.max(...loopValues)) : 0,
      lowDiversityCycleRatio: replayTimelinePoints.length > 0
        ? roundMetric(replayTimelinePoints.filter((point) => point.reinforcementLoopIntensity >= 0.7).length / replayTimelinePoints.length)
        : 0,
      loopTrend: buildTrendMetric({
        history: args.history,
        selector: (point) => Math.max(point.entityTopShare, point.categoryTopShare),
      }),
    },
    stressSimulation: {
      engine: {
        simulationOnly: true,
        noMutation: true,
        autoCorrection: false,
        governanceInfluence: false,
        stressHistorySize: stressWindowSize,
        syntheticGapInjectionInterval: ADAPTIVE_REPLAY_STRESS_SIMULATION.syntheticGapInjectionInterval,
      },
      replayInstabilityThresholds: ADAPTIVE_REPLAY_STRESS_SIMULATION.thresholds,
      degradationMetrics: {
        stressReplayConsistencyAverage,
        stressReplayConsistencyMinimum,
        fingerprintDivergenceRatio,
        snapshotGapRatio,
        oscillationAmplificationRatio,
        saturationPersistenceRatio,
        rankingInstabilityAccumulation,
        reinforcementLoopEscalationRatio,
      },
      replayCollapseDetection: {
        collapseScore,
        collapseStatus,
        collapseDetected,
        collapseSignals,
      },
      replayRiskDiagnostics: {
        riskScore,
        riskClassification,
        dominantRiskSignals: collapseSignals,
      },
    },
    rootCauseAnalysis: {
      rootCauseGraph,
      instabilityContributionModel: contributionEntries.map((entry) => ({
        factor: entry.factor,
        contribution: entry.contribution,
        severity: entry.severity,
        evidenceMetric: entry.evidenceMetric,
      })),
      dominantInstabilityFactors,
      replayCollapseContributors,
      saturationContributors,
      reinforcementEscalationContributors,
      stabilityBlockers,
      governanceRiskSummary: {
        overallSeverity,
        rolloutRecommendation: 'do_not_rollout',
        explanation: 'Instability causes remain active across replay degradation, collapse risk, reinforcement escalation, and ranking instability accumulation; rollout is blocked pending deeper causal control evidence.',
      },
    },
    decayHysteresisResearch: {
      decaySimulationModel: {
        simulationOnly: true,
        gradualDecayRate: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.gradualDecayRate,
        delayedReinforcementResponseSteps: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.delayedReinforcementResponseSteps,
        saturationCoolingFactor: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.saturationCoolingFactor,
      },
      hysteresisSimulationModel: {
        simulationOnly: true,
        hysteresisWindow: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.hysteresisWindow,
        entryThreshold: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.entryThreshold,
        exitThreshold: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.exitThreshold,
        delayedResponseSteps: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.delayedReinforcementResponseSteps,
      },
      replayImpactAnalysis: {
        baselineReplayConsistency,
        projectedReplayConsistencyWithDecay,
        replayConsistencyDelta,
      },
      saturationImpactAnalysis: {
        baselineSaturationPersistence,
        projectedSaturationPersistenceWithCooling,
        saturationDelta,
      },
      oscillationImpactAnalysis: {
        baselineOscillationAmplification,
        projectedOscillationWithHysteresis,
        oscillationDelta,
      },
      equilibriumAnalysis: {
        baselineEquilibriumScore,
        projectedEquilibriumScore,
        equilibriumDelta,
        rankStabilizationEffect,
      },
      governanceRiskAssessment: {
        residualRiskScore,
        confidencePenalty: ADAPTIVE_DECAY_HYSTERESIS_RESEARCH.confidencePenalty,
        notes: governanceNotes,
        classification: governanceClassification,
      },
      rolloutRecommendation: {
        classification: governanceClassification,
        recommendation: 'do_not_rollout',
        rationale: 'Simulation-only decay/hysteresis research does not provide longitudinal stability evidence required for rollout authorization.',
      },
    },
    equilibriumLongitudinalStudy: {
      longitudinalModel: {
        simulationOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveCorrection: true,
        boundedAdaptiveBehavior: true,
        observationWindows: ADAPTIVE_LONG_DURATION_WINDOWS,
        trackedDimensions: [
          'replay_consistency_equilibrium',
          'reinforcement_escalation_persistence',
          'saturation_equilibrium',
          'oscillation_damping',
          'projection_stability_convergence',
          'ranking_diversity_preservation',
          'entropy_evolution',
          'projection_lock_in_persistence',
          'low_confidence_amplification_persistence',
          'replay_degradation_persistence',
        ],
        studyOverTime: {
          replayConsistencyEquilibrium,
          reinforcementEscalationPersistence,
          saturationEquilibrium: saturationEquilibriumScore,
          oscillationDamping,
          projectionStabilityConvergence,
          rankingDiversityPreservation,
          entropyEvolution: currentEntropy,
          projectionLockInPersistence,
          lowConfidenceAmplificationPersistence,
          replayDegradationPersistence,
        },
      },
      stabilityConvergenceMetrics: {
        projectionStabilityConvergence,
        replayConsistencyEquilibrium,
        oscillationDamping,
        equilibriumConfidence,
      },
      saturationEquilibriumMetrics: {
        saturationEquilibriumScore,
        saturationPersistence,
        saturationDrift,
      },
      reinforcementPersistenceMetrics: {
        reinforcementEscalationPersistence,
        projectionLockInPersistence,
        lowConfidenceAmplificationPersistence,
      },
      entropyEvolutionAnalysis: {
        baselineEntropy,
        currentEntropy,
        entropyDelta,
        entropyTrend,
      },
      rankingDiversityAnalysis: {
        baselineDiversity,
        currentDiversity,
        diversityPreservationRatio: rankingDiversityPreservation,
        diversityLossRisk,
      },
      replayEquilibriumAnalysis: {
        replayDegradationPersistence,
        replayConsistencyEquilibrium,
        equilibriumBreachCount,
      },
      governanceRecommendation: {
        classification: equilibriumGovernanceClassification,
        recommendation: 'do_not_rollout',
        sustainedEquilibriumEvidence,
        rationale: sustainedEquilibriumEvidence
          ? 'Equilibrium signals are positive but live rollout remains blocked until sustained evidence is re-validated in controlled longitudinal observation windows.'
          : 'Do not recommend rollout: sustained equilibrium evidence is not yet established across replay, reinforcement, saturation, oscillation, diversity, and entropy dimensions.',
      },
    },
  }
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clampRolloutPercentage(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.trunc(value)))
}

function clampMinimumSampleRequirement(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MINIMUM_SAMPLE_REQUIREMENT
  }

  return Math.max(1, Math.trunc(value))
}

function normalizeAllowedScopes(value: AdaptiveInfluenceScope[] | undefined) {
  if (!Array.isArray(value) || value.length === 0) {
    return [...DEFAULT_ALLOWED_SCOPES]
  }

  const normalized = Array.from(
    new Set(
      value.filter((scope): scope is AdaptiveInfluenceScope => (
        scope === 'signal' || scope === 'category' || scope === 'entity'
      )),
    ),
  )

  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_SCOPES]
}

function normalizeConfig(config: Partial<AdaptiveInfluenceGateConfig> | undefined): AdaptiveInfluenceGateConfig {
  const boundedMin = typeof config?.boundedMin === 'number' && Number.isFinite(config.boundedMin)
    ? config.boundedMin
    : DEFAULT_BOUNDED_MIN
  const boundedMax = typeof config?.boundedMax === 'number' && Number.isFinite(config.boundedMax)
    ? config.boundedMax
    : DEFAULT_BOUNDED_MAX
  const normalizedMin = Math.min(boundedMin, boundedMax)
  const normalizedMax = Math.max(boundedMin, boundedMax)

  return {
    enabled: config?.enabled === true,
    mode: config?.mode ?? 'off',
    boundedMin: roundMetric(clamp(normalizedMin, 0.5, 1.5)),
    boundedMax: roundMetric(clamp(normalizedMax, 0.5, 1.5)),
    rolloutPercentage: clampRolloutPercentage(config?.rolloutPercentage),
    minimumSampleRequirement: clampMinimumSampleRequirement(config?.minimumSampleRequirement),
    allowedScopes: normalizeAllowedScopes(config?.allowedScopes),
    killSwitchEnabled: config?.killSwitchEnabled === true,
  }
}

function buildInitialSnapshot(refreshIntervalMs: number, config: AdaptiveInfluenceGateConfig): AdaptiveInfluenceGateSnapshot {
  return {
    status: 'warming',
    generatedAt: new Date().toISOString(),
    config,
    influences: [],
    metadata: {
      candidateCount: 0,
      influenceAppliedCount: 0,
      rolloutEligibleCount: 0,
      blockedCount: 0,
      divergenceCount: 0,
      rankShiftCount: 0,
      topRankChanged: false,
      averageRankDelta: 0,
      maxAbsRankDelta: 0,
      averageAdaptiveMultiplier: 0,
      boundedMin: config.boundedMin,
      boundedMax: config.boundedMax,
      rolloutPercentage: config.rolloutPercentage,
      minimumSampleRequirement: config.minimumSampleRequirement,
      allowedScopes: [...config.allowedScopes],
      economicMemoryRecordCount: 0,
      audit: buildInitialAuditMetrics(),
      refreshIntervalMs,
      lastRefreshDurationMs: null,
      lastError: null,
    },
  }
}

function computeConcentration(values: Array<string | null>, topN: number) {
  if (values.length === 0 || topN <= 0) {
    return 0
  }

  const selected = values.slice(0, topN)
  const counts = new Map<string, number>()
  for (const value of selected) {
    const key = value ?? '__null__'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const maxCount = Math.max(...counts.values())
  return roundMetric(maxCount / selected.length)
}

function computeShare(values: Array<string | null>, target: string | null) {
  if (values.length === 0) {
    return 0
  }

  const targetKey = target ?? '__null__'
  const matching = values.filter((value) => (value ?? '__null__') === targetKey).length
  return roundMetric(matching / values.length)
}

function buildDivergenceAuditMetrics(args: {
  influences: AdaptiveInfluencePayload[]
  previousInfluences: AdaptiveInfluencePayload[]
  boundedMin: number
  boundedMax: number
  previousTopOpportunityId: string | null
  previousTopStreak: number
}) {
  const influencesByProjectedRank = [...args.influences].sort((left, right) => left.projectedRank - right.projectedRank)
  const candidateCount = args.influences.length
  const epsilon = 1e-9
  const previousByOpportunityId = new Map(args.previousInfluences.map((item) => [item.opportunityId, item] as const))
  const comparable = args.influences.filter((item) => previousByOpportunityId.has(item.opportunityId))

  const divergenceRatio = candidateCount > 0
    ? roundMetric(args.influences.filter((item) => item.baseRank !== item.projectedRank).length / candidateCount)
    : 0

  const categoryKeys = influencesByProjectedRank.map((item) => normalizeIdPart(item.category))
  const topProjectedCategory = influencesByProjectedRank[0]?.category ?? null
  const topProjectedCategoryShare = computeShare(
    categoryKeys,
    topProjectedCategory ? normalizeIdPart(topProjectedCategory) : null,
  )
  const top3CategoryConcentration = computeConcentration(categoryKeys, Math.min(3, categoryKeys.length))

  const entityKeys = influencesByProjectedRank.map((item) => item.entityId ? normalizeIdPart(item.entityId) : null)
  const topProjectedEntityId = influencesByProjectedRank[0]?.entityId ?? null
  const topProjectedEntityShare = computeShare(
    entityKeys,
    topProjectedEntityId ? normalizeIdPart(topProjectedEntityId) : null,
  )
  const top3EntityConcentration = computeConcentration(entityKeys, Math.min(3, entityKeys.length))

  const topOpportunityId = influencesByProjectedRank[0]?.opportunityId ?? null
  const consecutiveRefreshes = topOpportunityId && topOpportunityId === args.previousTopOpportunityId
    ? args.previousTopStreak + 1
    : (topOpportunityId ? 1 : 0)

  const oscillatingOpportunityCount = comparable
    .filter((item) => Math.abs(item.projectedRank - (previousByOpportunityId.get(item.opportunityId)?.projectedRank ?? item.projectedRank)) > 0)
    .length
  const comparableOpportunityCount = comparable.length
  const oscillationFrequency = comparableOpportunityCount > 0
    ? roundMetric(oscillatingOpportunityCount / comparableOpportunityCount)
    : 0

  const minBoundHitCount = args.influences.filter((item) => item.adaptiveMultiplier <= args.boundedMin + epsilon).length
  const maxBoundHitCount = args.influences.filter((item) => item.adaptiveMultiplier >= args.boundedMax - epsilon).length
  const saturationRatio = candidateCount > 0
    ? roundMetric((minBoundHitCount + maxBoundHitCount) / candidateCount)
    : 0
  const minBoundHitRatio = candidateCount > 0 ? roundMetric(minBoundHitCount / candidateCount) : 0
  const maxBoundHitRatio = candidateCount > 0 ? roundMetric(maxBoundHitCount / candidateCount) : 0

  const suppressedCount = args.influences.filter((item) => !item.influenceApplied).length
  const suppressedProjectionRatio = candidateCount > 0 ? roundMetric(suppressedCount / candidateCount) : 0

  const lowSampleInfluences = args.influences.filter((item) => !item.sampleThresholdSatisfied)
  const unstableLowSampleCount = lowSampleInfluences.filter((item) => Math.abs(item.rankDelta) > 0).length
  const lowSampleInstabilityRatio = lowSampleInfluences.length > 0
    ? roundMetric(unstableLowSampleCount / lowSampleInfluences.length)
    : 0

  const lowConfidenceProjections = args.influences.filter((item) => (
    item.evidence.signal?.confidenceLevel === 'low'
    || item.evidence.category?.confidenceLevel === 'low'
    || item.evidence.entity?.confidenceLevel === 'low'
  ))
  const amplifiedLowConfidenceCount = lowConfidenceProjections.filter((item) => (
    item.adaptiveMultiplier > 1
    || Math.abs(item.rankDelta) > 0
  )).length
  const lowConfidenceProjectionRatio = lowConfidenceProjections.length > 0
    ? roundMetric(amplifiedLowConfidenceCount / lowConfidenceProjections.length)
    : 0

  const equivalentFingerprintCount = comparable
    .filter((item) => item.replayFingerprint === previousByOpportunityId.get(item.opportunityId)?.replayFingerprint)
    .length
  const equivalentFingerprintRatio = comparableOpportunityCount > 0
    ? roundMetric(equivalentFingerprintCount / comparableOpportunityCount)
    : 1

  const projectedRankChanges = comparable.map((item) => Math.abs(item.projectedRank - (previousByOpportunityId.get(item.opportunityId)?.projectedRank ?? item.projectedRank)))
  const averageProjectedRankChange = projectedRankChanges.length > 0
    ? roundMetric(projectedRankChanges.reduce((sum, value) => sum + value, 0) / projectedRankChanges.length)
    : 0
  const maxProjectedRankChange = projectedRankChanges.length > 0 ? Math.max(...projectedRankChanges) : 0

  const averageAbsRankDelta = candidateCount > 0
    ? roundMetric(args.influences.reduce((sum, item) => sum + Math.abs(item.rankDelta), 0) / candidateCount)
    : 0
  const maxAbsRankDelta = candidateCount > 0
    ? Math.max(...args.influences.map((item) => Math.abs(item.rankDelta)))
    : 0

  const penalty = (
    (Math.min(1, averageAbsRankDelta / 3) * 0.2)
    + (oscillationFrequency * 0.15)
    + (saturationRatio * 0.1)
    + (suppressedProjectionRatio * 0.1)
    + (lowSampleInstabilityRatio * 0.1)
    + (lowConfidenceProjectionRatio * 0.05)
    + (Math.min(1, averageProjectedRankChange / 3) * 0.15)
    + ((1 - equivalentFingerprintRatio) * 0.2)
  )
  const stabilityScore = roundMetric(clamp(1 - penalty, 0, 1), 4)
  const driftDetection = buildDriftDetectionWarnings({
    categoryDominance: {
      topProjectedCategory,
      topProjectedCategoryShare,
      top3CategoryConcentration,
    },
    entityDominance: {
      topProjectedEntityId,
      topProjectedEntityShare,
      top3EntityConcentration,
    },
    repeatedTopRankPersistence: {
      topOpportunityId,
      consecutiveRefreshes,
    },
    oscillation: {
      oscillationFrequency,
      oscillatingOpportunityCount,
      comparableOpportunityCount,
    },
    multiplierSaturation: {
      saturationRatio,
      minBoundHitRatio,
      maxBoundHitRatio,
    },
    lowConfidenceAmplification: {
      lowConfidenceProjectionRatio,
      amplifiedLowConfidenceCount,
      lowConfidenceProjectionCount: lowConfidenceProjections.length,
    },
    replayConsistency: {
      equivalentFingerprintRatio,
      equivalentFingerprintCount,
      comparableFingerprintCount: comparableOpportunityCount,
    },
    projectionVolatility: {
      averageProjectedRankChange,
      maxProjectedRankChange,
    },
    stabilityScore,
  })

  return {
    metrics: {
      rankDrift: {
        averageAbsRankDelta,
        maxAbsRankDelta,
        divergenceRatio,
      },
      categoryDominance: {
        topProjectedCategory,
        topProjectedCategoryShare,
        top3CategoryConcentration,
      },
      entityDominance: {
        topProjectedEntityId,
        topProjectedEntityShare,
        top3EntityConcentration,
      },
      repeatedTopRankPersistence: {
        topOpportunityId,
        consecutiveRefreshes,
      },
      oscillation: {
        oscillationFrequency,
        oscillatingOpportunityCount,
        comparableOpportunityCount,
      },
      multiplierSaturation: {
        saturationRatio,
        minBoundHitRatio,
        maxBoundHitRatio,
      },
      suppression: {
        suppressedProjectionRatio,
        suppressedCount,
        candidateCount,
      },
      lowSampleInstability: {
        lowSampleInstabilityRatio,
        lowSampleCount: lowSampleInfluences.length,
        unstableLowSampleCount,
      },
      lowConfidenceAmplification: {
        lowConfidenceProjectionRatio,
        amplifiedLowConfidenceCount,
        lowConfidenceProjectionCount: lowConfidenceProjections.length,
      },
      replayConsistency: {
        equivalentFingerprintRatio,
        equivalentFingerprintCount,
        comparableFingerprintCount: comparableOpportunityCount,
      },
      projectionVolatility: {
        averageProjectedRankChange,
        maxProjectedRankChange,
      },
      driftDetection,
      stabilityScore,
    } satisfies AdaptiveInfluenceAuditCoreMetrics,
    topOpportunityId,
    topStreak: consecutiveRefreshes,
  }
}

function extractKeywordFromReasoning(reasoning: string) {
  const keywordMatch = reasoning.match(/signal "([^"]+)"/i)
  return keywordMatch?.[1]?.trim().toLowerCase() ?? null
}

function sortSuggestionsDeterministically(suggestions: EntityActionSuggestion[]) {
  return [...suggestions].sort((left, right) => {
    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence
    }

    const byEntity = left.entityId.localeCompare(right.entityId)
    if (byEntity !== 0) {
      return byEntity
    }

    const byAction = left.suggestedAction.localeCompare(right.suggestedAction)
    if (byAction !== 0) {
      return byAction
    }

    return left.reasoning.localeCompare(right.reasoning)
  })
}

function selectEntityIdForOpportunity(opportunity: OpportunityLead, suggestions: EntityActionSuggestion[]) {
  const targetKeyword = normalizeIdPart(opportunity.keyword)
  const sortedSuggestions = sortSuggestionsDeterministically(suggestions)

  const match = sortedSuggestions.find((suggestion) => {
    const reasoningKeyword = extractKeywordFromReasoning(suggestion.reasoning)
    return reasoningKeyword !== null && normalizeIdPart(reasoningKeyword) === targetKeyword
  })

  return match?.entityId ?? null
}

function selectBestWeight(weights: AdaptiveWeightRecord[], predicate: (weight: AdaptiveWeightRecord) => boolean) {
  const candidates = weights.filter(predicate)

  if (candidates.length === 0) {
    return null
  }

  return [...candidates].sort((left, right) => {
    if (left.weight !== right.weight) {
      return right.weight - left.weight
    }

    if (left.sampleCount !== right.sampleCount) {
      return right.sampleCount - left.sampleCount
    }

    return left.weightId.localeCompare(right.weightId)
  })[0] ?? null
}

function toEvidence(weight: AdaptiveWeightRecord | null): AdaptiveInfluenceWeightEvidence | null {
  if (!weight) {
    return null
  }

  return {
    scope: weight.scope,
    memoryId: weight.memoryId,
    weightId: weight.weightId,
    weight: roundMetric(weight.weight),
    sampleCount: weight.sampleCount,
    confidenceLevel: weight.confidenceLevel,
    decayFactor: roundMetric(weight.decayFactor),
  }
}

function buildReplayFingerprint(args: {
  opportunityId: string
  marketSignalId: string
  entityId: string | null
  baseScore: number
  baseRank: number
  adaptiveMultiplier: number
  finalProjectedScore: number
  projectedRank: number
  rankDelta: number
  blockedReason: AdaptiveInfluenceBlockedReason
  rolloutBucket: number
  sampleThresholdSatisfied: boolean
  projectionMode: AdaptiveInfluenceMode
  weightSources: AdaptiveInfluencePayload['weightSources']
  memoryIds: AdaptiveInfluencePayload['memoryIds']
  config: AdaptiveInfluenceGateConfig
  evidence: AdaptiveInfluencePayload['evidence']
}) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeIdPart(args.opportunityId),
      normalizeIdPart(args.marketSignalId),
      normalizeIdPart(args.entityId ?? '*'),
      roundMetric(args.baseScore).toString(),
      args.baseRank.toString(),
      roundMetric(args.adaptiveMultiplier).toString(),
      roundMetric(args.finalProjectedScore).toString(),
      args.projectedRank.toString(),
      args.rankDelta.toString(),
      args.blockedReason,
      args.rolloutBucket.toString(),
      args.sampleThresholdSatisfied ? '1' : '0',
      args.projectionMode,
      args.weightSources.signal ?? 'none',
      args.weightSources.category ?? 'none',
      args.weightSources.entity ?? 'none',
      args.memoryIds.signal ?? 'none',
      args.memoryIds.category ?? 'none',
      args.memoryIds.entity ?? 'none',
      args.config.enabled ? '1' : '0',
      args.config.mode,
      args.config.killSwitchEnabled ? '1' : '0',
      args.config.rolloutPercentage.toString(),
      args.config.minimumSampleRequirement.toString(),
      [...args.config.allowedScopes].sort().join(','),
      args.evidence.signal?.weightId ?? 'none',
      args.evidence.category?.weightId ?? 'none',
      args.evidence.entity?.weightId ?? 'none',
    ].join(':'))
    .digest('hex')

  return `adaptive-influence:${fingerprint.slice(0, 24)}`
}

function buildAdaptiveEquilibriumReplayFingerprint(influences: AdaptiveInfluencePayload[]) {
  const digest = createHash('sha256')
    .update(
      [...influences]
        .sort((left, right) => left.opportunityId.localeCompare(right.opportunityId))
        .map((influence) => [
          influence.opportunityId,
          influence.marketSignalId,
          influence.baseRank,
          influence.projectedRank,
          influence.adaptiveMultiplier,
          influence.finalProjectedScore,
          influence.replayFingerprint,
        ].join(':'))
        .join('|'),
    )
    .digest('hex')

  return `adaptive-equilibrium:${digest.slice(0, 24)}`
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)

    return `{${entries.join(',')}}`
  }

  return 'null'
}

function buildContinuityCheckpointFingerprint(payload: AdaptiveLongitudinalContinuityCheckpointPayload) {
  const digest = createHash('sha256')
    .update(stableSerialize(payload))
    .digest('hex')

  return `adaptive-continuity:${digest.slice(0, 24)}`
}

function parseContinuityCheckpointPayload(raw: string | null | undefined): AdaptiveLongitudinalContinuityCheckpointPayload | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AdaptiveLongitudinalContinuityCheckpointPayload> | null
    if (!parsed || parsed.version !== ADAPTIVE_CONTINUITY_CHECKPOINT_VERSION) {
      return null
    }

    if (!Array.isArray(parsed.longDurationHistory)) {
      return null
    }

    if (!parsed.replayContinuityContext || !parsed.continuityCheckpoints || !parsed.continuityLineageMetadata) {
      return null
    }

    return parsed as AdaptiveLongitudinalContinuityCheckpointPayload
  } catch {
    return null
  }
}

function computeHeatmapScopeKey(influence: AdaptiveInfluencePayload) {
  if (influence.evidenceScopes.length === 0) {
    return 'unscoped' as const
  }

  if (influence.evidenceScopes.length > 1) {
    return 'multi_scope' as const
  }

  return influence.evidenceScopes[0]
}

function computeRankDominance(rank: number, totalCount: number) {
  if (totalCount <= 0) {
    return 0
  }

  return roundMetric((totalCount - rank + 1) / totalCount)
}

function buildAdaptiveHeatmapSnapshot(args: {
  influences: AdaptiveInfluencePayload[]
  metrics: AdaptiveInfluenceAuditCoreMetrics
}): AdaptiveHeatmapSnapshot {
  const ranked = [...args.influences].sort((left, right) => left.projectedRank - right.projectedRank)
  const candidateCount = ranked.length
  const projectedScoreTotal = ranked.reduce((sum, influence) => sum + influence.finalProjectedScore, 0)
  const categoryMap = new Map<string, {
    label: string
    opportunityCount: number
    projectedScoreTotal: number
    adaptiveWeightTotal: number
    rankDominanceTotal: number
  }>()
  const entityMap = new Map<string, {
    label: string
    opportunityCount: number
    projectedScoreTotal: number
    adaptiveWeightTotal: number
    rankDominanceTotal: number
  }>()
  const scopeMap = new Map<string, {
    opportunityCount: number
    projectedShareCount: number
    adaptiveWeightTotal: number
  }>()

  for (const influence of ranked) {
    const rankDominance = computeRankDominance(influence.projectedRank, candidateCount)
    const categoryKey = influence.category.trim().length > 0 ? influence.category : 'uncategorized'
    const entityKey = influence.entityId ?? 'unassigned'
    const scopeKey = computeHeatmapScopeKey(influence)

    const categoryEntry = categoryMap.get(categoryKey) ?? {
      label: categoryKey,
      opportunityCount: 0,
      projectedScoreTotal: 0,
      adaptiveWeightTotal: 0,
      rankDominanceTotal: 0,
    }
    categoryEntry.opportunityCount += 1
    categoryEntry.projectedScoreTotal += influence.finalProjectedScore
    categoryEntry.adaptiveWeightTotal += influence.adaptiveMultiplier
    categoryEntry.rankDominanceTotal += rankDominance
    categoryMap.set(categoryKey, categoryEntry)

    const entityEntry = entityMap.get(entityKey) ?? {
      label: entityKey,
      opportunityCount: 0,
      projectedScoreTotal: 0,
      adaptiveWeightTotal: 0,
      rankDominanceTotal: 0,
    }
    entityEntry.opportunityCount += 1
    entityEntry.projectedScoreTotal += influence.finalProjectedScore
    entityEntry.adaptiveWeightTotal += influence.adaptiveMultiplier
    entityEntry.rankDominanceTotal += rankDominance
    entityMap.set(entityKey, entityEntry)

    const scopeEntry = scopeMap.get(scopeKey) ?? {
      opportunityCount: 0,
      projectedShareCount: 0,
      adaptiveWeightTotal: 0,
    }
    scopeEntry.opportunityCount += 1
    scopeEntry.projectedShareCount += 1
    scopeEntry.adaptiveWeightTotal += influence.adaptiveMultiplier
    scopeMap.set(scopeKey, scopeEntry)
  }

  const toConcentrationCells = (source: typeof categoryMap) => Array.from(source.entries())
    .map(([key, entry]) => {
      const projectedShare = candidateCount > 0 ? roundMetric(entry.opportunityCount / candidateCount) : 0
      const projectedScoreShare = projectedScoreTotal > 0 ? roundMetric(entry.projectedScoreTotal / projectedScoreTotal) : 0
      const averageAdaptiveWeight = entry.opportunityCount > 0
        ? roundMetric(entry.adaptiveWeightTotal / entry.opportunityCount)
        : 0
      const averageRankDominance = entry.opportunityCount > 0
        ? roundMetric(entry.rankDominanceTotal / entry.opportunityCount)
        : 0
      const normalizedWeight = clamp((averageAdaptiveWeight - 1) / Math.max(DEFAULT_BOUNDED_MAX - 1, 0.000001), 0, 1)
      const concentrationScore = roundMetric(clamp(
        (projectedShare * 0.3)
          + (projectedScoreShare * 0.35)
          + (normalizedWeight * 0.15)
          + (averageRankDominance * 0.2),
        0,
        1,
      ))

      return {
        key,
        label: entry.label,
        opportunityCount: entry.opportunityCount,
        projectedShare,
        projectedScoreShare,
        averageAdaptiveWeight,
        averageRankDominance,
        concentrationScore,
      }
    })
    .sort((left, right) => right.concentrationScore - left.concentrationScore)

  const category = toConcentrationCells(categoryMap)
  const entity = toConcentrationCells(entityMap)
  const adaptiveScope = Array.from(scopeMap.entries())
    .map(([scope, entry]) => {
      const projectedShare = candidateCount > 0 ? roundMetric(entry.projectedShareCount / candidateCount) : 0
      const averageAdaptiveWeight = entry.opportunityCount > 0
        ? roundMetric(entry.adaptiveWeightTotal / entry.opportunityCount)
        : 0
      const normalizedWeight = clamp((averageAdaptiveWeight - 1) / Math.max(DEFAULT_BOUNDED_MAX - 1, 0.000001), 0, 1)
      const concentrationScore = roundMetric(clamp(
        (projectedShare * 0.6) + (normalizedWeight * 0.4),
        0,
        1,
      ))

      return {
        scope: scope as AdaptiveHeatmapSnapshot['adaptiveScope'][number]['scope'],
        opportunityCount: entry.opportunityCount,
        projectedShare,
        averageAdaptiveWeight,
        concentrationScore,
      }
    })
    .sort((left, right) => right.concentrationScore - left.concentrationScore)

  const rankingDistribution = ranked.map((influence) => ({
    rank: influence.projectedRank,
    opportunityId: influence.opportunityId,
    category: influence.category,
    entityId: influence.entityId,
    baseRank: influence.baseRank,
    projectedRank: influence.projectedRank,
    rankDelta: influence.rankDelta,
    adaptiveWeight: influence.adaptiveMultiplier,
    dominanceScore: roundMetric(clamp(
      (computeRankDominance(influence.projectedRank, candidateCount) * 0.6)
        + ((projectedScoreTotal > 0 ? influence.finalProjectedScore / projectedScoreTotal : 0) * 0.4),
      0,
      1,
    )),
  }))

  const replayDivergenceIntensityScore = roundMetric(clamp(
    (args.metrics.rankDrift.divergenceRatio * 0.3)
      + (Math.min(1, args.metrics.rankDrift.averageAbsRankDelta / Math.max(candidateCount, 1)) * 0.2)
      + ((1 - args.metrics.replayConsistency.equivalentFingerprintRatio) * 0.25)
      + (args.metrics.oscillation.oscillationFrequency * 0.15)
      + (args.metrics.multiplierSaturation.saturationRatio * 0.1),
    0,
    1,
  ))

  return {
    category,
    entity,
    adaptiveScope,
    rankingDistribution,
    replayDivergence: {
      divergenceRatio: args.metrics.rankDrift.divergenceRatio,
      averageAbsRankDelta: args.metrics.rankDrift.averageAbsRankDelta,
      maxAbsRankDelta: args.metrics.rankDrift.maxAbsRankDelta,
      equivalentFingerprintRatio: args.metrics.replayConsistency.equivalentFingerprintRatio,
      oscillationFrequency: args.metrics.oscillation.oscillationFrequency,
      saturationRatio: args.metrics.multiplierSaturation.saturationRatio,
      replayDivergenceIntensityScore,
    },
    summary: {
      candidateCount,
      topCategoryKey: category[0]?.key ?? null,
      topEntityKey: entity[0]?.key ?? null,
      rankingDominanceScore: rankingDistribution[0]?.dominanceScore ?? 0,
      saturationIntensityScore: args.metrics.multiplierSaturation.saturationRatio,
      reinforcementIntensityScore: roundMetric(clamp(
        (args.metrics.entityDominance.topProjectedEntityShare * 0.45)
          + (args.metrics.categoryDominance.topProjectedCategoryShare * 0.3)
          + (Math.min(1, args.metrics.repeatedTopRankPersistence.consecutiveRefreshes / 6) * 0.25),
        0,
        1,
      )),
      oscillationIntensityScore: args.metrics.oscillation.oscillationFrequency,
    },
  }
}

function buildAdaptiveEquilibriumEvidenceInput(args: {
  generatedAt: string
  replayFingerprint: string
  historicalReplaySimulation: AdaptiveHistoricalReplaySimulation
  influences: AdaptiveInfluencePayload[]
  metrics: AdaptiveInfluenceAuditCoreMetrics
}): AppendAdaptiveEquilibriumEvidenceInput {
  const study = args.historicalReplaySimulation.equilibriumLongitudinalStudy
  const values = study.longitudinalModel.studyOverTime
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()

  return {
    replayConsistencyEquilibrium: values.replayConsistencyEquilibrium,
    reinforcementEscalationPersistence: values.reinforcementEscalationPersistence,
    saturationEquilibrium: values.saturationEquilibrium,
    oscillationDamping: values.oscillationDamping,
    projectionStabilityConvergence: values.projectionStabilityConvergence,
    rankingDiversityPreservation: values.rankingDiversityPreservation,
    entropyEvolution: values.entropyEvolution,
    projectionLockInPersistence: values.projectionLockInPersistence,
    lowConfidenceAmplificationPersistence: values.lowConfidenceAmplificationPersistence,
    replayDegradationPersistence: values.replayDegradationPersistence,
    governanceClassification: study.governanceRecommendation.classification,
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: study.governanceRecommendation.sustainedEquilibriumEvidence,
    replayFingerprint: args.replayFingerprint,
    generatedAt: args.generatedAt,
    heatmapSnapshot: buildAdaptiveHeatmapSnapshot({
      influences: args.influences,
      metrics: args.metrics,
    }),
    evidenceContractVersion: contractMetadata.evidenceContractVersion,
    semanticVersionMetadata: contractMetadata.semanticVersionMetadata,
    reducerSemanticMetadata: contractMetadata.reducerSemanticMetadata,
    evidenceGenerationMetadata: contractMetadata.evidenceGenerationMetadata,
  }
}

function computeRolloutBucket(args: {
  opportunityId: string
  marketSignalId: string
  entityId: string | null
}) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeIdPart(args.opportunityId),
      normalizeIdPart(args.marketSignalId),
      normalizeIdPart(args.entityId ?? '*'),
    ].join(':'))
    .digest('hex')

  return Number.parseInt(fingerprint.slice(0, 8), 16) % 100
}

function computeAdaptiveMultiplier(args: {
  config: AdaptiveInfluenceGateConfig
  signalWeight: AdaptiveWeightRecord | null
  categoryWeight: AdaptiveWeightRecord | null
  entityWeight: AdaptiveWeightRecord | null
}) {
  const factors = [args.signalWeight?.weight, args.categoryWeight?.weight, args.entityWeight?.weight]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (factors.length === 0) {
    return 1
  }

  const average = factors.reduce((acc, value) => acc + value, 0) / factors.length
  return roundMetric(clamp(average, args.config.boundedMin, args.config.boundedMax))
}

function resolveBlockedReason(args: {
  config: AdaptiveInfluenceGateConfig
  rolloutEligible: boolean
  hasApplicableWeights: boolean
  hasSufficientSampleWeights: boolean
}): AdaptiveInfluenceBlockedReason {
  if (args.config.mode === 'off') {
    return 'mode_off'
  }

  if (!args.config.enabled) {
    return 'runtime_disabled'
  }

  if (args.config.killSwitchEnabled) {
    return 'kill_switch_enabled'
  }

  if (!args.hasApplicableWeights) {
    return 'no_applicable_weights'
  }

  if (!args.hasSufficientSampleWeights) {
    return 'below_minimum_sample'
  }

  if (!args.rolloutEligible) {
    return 'below_rollout_threshold'
  }

  if (args.config.mode === 'shadow_compare') {
    return 'eligible_shadow_projection'
  }

  if (args.config.mode === 'live_rank_only') {
    return 'eligible_live_projection_forbidden'
  }

  return 'projection_allowed_but_non_mutating'
}

function sortOpportunities(opportunities: OpportunityLead[]) {
  return [...opportunities].sort((left, right) => {
    if (left.economicRelevance !== right.economicRelevance) {
      return right.economicRelevance - left.economicRelevance
    }

    const byCategory = left.category.localeCompare(right.category)
    if (byCategory !== 0) {
      return byCategory
    }

    const byKeyword = left.keyword.localeCompare(right.keyword)
    if (byKeyword !== 0) {
      return byKeyword
    }

    return left.id.localeCompare(right.id)
  })
}

function sortInfluencesByBaseRank(influences: Array<{
  opportunityId: string
  baseScore: number
  category: string
  keyword: string
}>) {
  return [...influences].sort((left, right) => {
    if (left.baseScore !== right.baseScore) {
      return right.baseScore - left.baseScore
    }

    const byCategory = left.category.localeCompare(right.category)
    if (byCategory !== 0) {
      return byCategory
    }

    const byKeyword = left.keyword.localeCompare(right.keyword)
    if (byKeyword !== 0) {
      return byKeyword
    }

    return left.opportunityId.localeCompare(right.opportunityId)
  })
}

function sortInfluencesByProjectedRank(influences: Array<{
  opportunityId: string
  baseScore: number
  finalProjectedScore: number
  category: string
  keyword: string
}>) {
  return [...influences].sort((left, right) => {
    if (left.finalProjectedScore !== right.finalProjectedScore) {
      return right.finalProjectedScore - left.finalProjectedScore
    }

    if (left.baseScore !== right.baseScore) {
      return right.baseScore - left.baseScore
    }

    const byCategory = left.category.localeCompare(right.category)
    if (byCategory !== 0) {
      return byCategory
    }

    const byKeyword = left.keyword.localeCompare(right.keyword)
    if (byKeyword !== 0) {
      return byKeyword
    }

    return left.opportunityId.localeCompare(right.opportunityId)
  })
}

export class AdaptiveInfluenceGateRuntime {
  private readonly refreshIntervalMs: number
  private readonly config: AdaptiveInfluenceGateConfig
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<AdaptiveInfluenceGateSnapshot> | null = null
  private snapshot: AdaptiveInfluenceGateSnapshot
  private longDurationHistory: AdaptiveLongDurationHistoryPoint[] = []
  private previousTopOpportunityId: string | null = null
  private previousTopStreak = 0
  private previousGovernanceEvidenceEvent: AdaptiveEquilibriumEvidenceEvent | null = null
  private governanceTimelineEventSequence = 0
  private continuityRestoreAttempted = false
  private continuityCheckpointCount = 0
  private continuityRestoreGapDetected = false
  private lastContinuityFingerprint: string | null = null
  private lastRunAt: string | null = null
  private lastError: string | null = null

  constructor(private readonly dependencies: AdaptiveInfluenceGateRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.config = normalizeConfig(dependencies.config)
    enforceAdaptiveInfluenceProductionPolicy({
      enabled: this.config.enabled,
      mode: this.config.mode,
      source: 'runtime',
    })
    this.snapshot = buildInitialSnapshot(this.refreshIntervalMs, this.config)

    if (!adaptiveReplayIdentityPolicyDisclosureLogged) {
      const identityAssessment = assessReplayIdentityFreeze({
        surface: 'adaptive_influence',
        identityFields: getFrozenReplayIdentityFields('adaptive_influence'),
      })

      if (identityAssessment.warnings.length > 0) {
        console.warn('[adaptive-influence] replay.identity.freeze.warning', {
          surface: identityAssessment.surface,
          warningCodes: identityAssessment.warnings.map((warning) => warning.code),
          operationalCouplingDisclosure: identityAssessment.operationalCouplingDisclosure,
          invariants: identityAssessment.invariants,
        })
      }

      adaptiveReplayIdentityPolicyDisclosureLogged = true
    }
  }

  getStatus(): AdaptiveInfluenceGateRuntimeStatus {
    return {
      runtimeName: ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME,
      started: this.started,
      ready: this.snapshot.status === 'ready',
      warming: this.snapshot.status !== 'ready',
      error: this.lastError !== null,
      advisoryOnly: true,
      mutatesLiveRanking: false,
      mutatesGovernance: false,
      mutatesExecution: false,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      refreshIntervalMs: this.refreshIntervalMs,
      config: this.snapshot.config,
      candidateCount: this.snapshot.metadata.candidateCount,
      influenceAppliedCount: this.snapshot.metadata.influenceAppliedCount,
      rolloutEligibleCount: this.snapshot.metadata.rolloutEligibleCount,
      blockedCount: this.snapshot.metadata.blockedCount,
      divergenceCount: this.snapshot.metadata.divergenceCount,
      rankShiftCount: this.snapshot.metadata.rankShiftCount,
      topRankChanged: this.snapshot.metadata.topRankChanged,
    }
  }

  getSnapshot() {
    return this.snapshot
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true
    console.info('[adaptive-influence] runtime.start', {
      mode: this.config.mode,
      enabled: this.config.enabled,
      killSwitchEnabled: this.config.killSwitchEnabled,
      rolloutPercentage: this.config.rolloutPercentage,
    })
    if (process.env.NODE_ENV === 'staging' && this.config.enabled && this.config.mode === 'shadow_compare') {
      console.info('[adaptive-influence] staging.shadow_compare.activated', {
        advisoryOnly: true,
        mutatesLiveRanking: false,
        mutatesGovernance: false,
        mutatesExecution: false,
        rolloutPercentage: this.config.rolloutPercentage,
        minimumSampleRequirement: this.config.minimumSampleRequirement,
        allowedScopes: this.config.allowedScopes,
      })
    }

    try {
      await this.refresh()
    } catch (error) {
      console.warn('[adaptive-influence] snapshot.error', {
        message: error instanceof Error ? error.message : 'unknown_error',
        phase: 'startup',
      })
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[adaptive-influence] snapshot.error', {
          message: error instanceof Error ? error.message : 'unknown_error',
          phase: 'scheduled',
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
    console.info('[adaptive-influence] runtime.stop')
  }

  private async restoreLongitudinalContinuityCheckpoint() {
    if (this.continuityRestoreAttempted) {
      return
    }

    this.continuityRestoreAttempted = true
    const checkpointRepository = this.dependencies.learningCheckpointRepository
    if (!checkpointRepository) {
      return
    }

    const checkpoint = await checkpointRepository.getCheckpointByRuntimeName(ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME)
    if (!checkpoint) {
      return
    }

    const payload = parseContinuityCheckpointPayload(checkpoint.checkpointPayloadJson)
    if (!payload) {
      console.warn('[adaptive-influence] continuity.restore.invalid_payload', {
        runtimeName: ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME,
      })
      this.continuityRestoreGapDetected = true
      return
    }

    if (payload.continuityLineageMetadata.lineageKey !== ADAPTIVE_CONTINUITY_LINEAGE_KEY) {
      console.warn('[adaptive-influence] continuity.restore.lineage_mismatch', {
        expectedLineageKey: ADAPTIVE_CONTINUITY_LINEAGE_KEY,
        actualLineageKey: payload.continuityLineageMetadata.lineageKey,
      })
      this.continuityRestoreGapDetected = true
      return
    }

    const expectedFingerprint = buildContinuityCheckpointFingerprint(payload)
    if (checkpoint.continuityFingerprint && checkpoint.continuityFingerprint !== expectedFingerprint) {
      console.warn('[adaptive-influence] continuity.restore.integrity_mismatch', {
        expectedFingerprint,
        persistedFingerprint: checkpoint.continuityFingerprint,
      })
      this.continuityRestoreGapDetected = true
      return
    }

    this.longDurationHistory = payload.longDurationHistory
      .filter((point) => typeof point.generatedAt === 'string')
      .slice(-ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT)
    this.previousTopOpportunityId = payload.replayContinuityContext.previousTopOpportunityId ?? null
    this.previousTopStreak = Math.max(0, Math.trunc(payload.replayContinuityContext.previousTopStreak))
    this.governanceTimelineEventSequence = Math.max(0, Math.trunc(payload.replayContinuityContext.governanceTimelineEventSequence))
    this.continuityCheckpointCount = Math.max(0, Math.trunc(payload.continuityLineageMetadata.checkpointCount))
    this.lastContinuityFingerprint = checkpoint.continuityFingerprint ?? expectedFingerprint

    const previousGovernanceEvidenceId = payload.replayContinuityContext.previousGovernanceEvidenceId
    if (previousGovernanceEvidenceId) {
      const previousEvidence = await this.dependencies.adaptiveEquilibriumEvidenceRepository
        .getEvidenceById(previousGovernanceEvidenceId)
      if (previousEvidence) {
        this.previousGovernanceEvidenceEvent = previousEvidence
      } else {
        this.continuityRestoreGapDetected = true
        console.warn('[adaptive-influence] continuity.restore.evidence_gap', {
          previousGovernanceEvidenceId,
        })
      }
    }

    const lastSnapshotGeneratedAt = payload.continuityCheckpoints.lastSnapshotGeneratedAt
    if (lastSnapshotGeneratedAt) {
      const gapMs = Date.now() - Date.parse(lastSnapshotGeneratedAt)
      if (Number.isFinite(gapMs) && gapMs > ADAPTIVE_CONTINUITY_GAP_WARNING_MS) {
        this.continuityRestoreGapDetected = true
        console.warn('[adaptive-influence] continuity.restore.temporal_gap', {
          gapMs,
          thresholdMs: ADAPTIVE_CONTINUITY_GAP_WARNING_MS,
          lastSnapshotGeneratedAt,
        })
      }
    }

    console.info('[adaptive-influence] continuity.restore', {
      restoredHistoryPoints: this.longDurationHistory.length,
      previousTopOpportunityId: this.previousTopOpportunityId,
      previousTopStreak: this.previousTopStreak,
      governanceTimelineEventSequence: this.governanceTimelineEventSequence,
      continuityCheckpointCount: this.continuityCheckpointCount,
      continuityGapDetected: this.continuityRestoreGapDetected,
    })
  }

  private async persistLongitudinalContinuityCheckpoint(args: {
    generatedAt: string
    longDurationValidation: AdaptiveLongDurationValidation
    equilibriumReplayFingerprint: string
    evidenceEvent: AdaptiveEquilibriumEvidenceEvent
  }) {
    const checkpointRepository = this.dependencies.learningCheckpointRepository
    if (!checkpointRepository) {
      return
    }

    const lineageMetadata: AdaptiveLongitudinalContinuityCheckpointPayload['continuityLineageMetadata'] = {
      lineageKey: ADAPTIVE_CONTINUITY_LINEAGE_KEY,
      lineageVersion: ADAPTIVE_CONTINUITY_CHECKPOINT_VERSION,
      checkpointCount: this.continuityCheckpointCount + 1,
      parentContinuityFingerprint: this.lastContinuityFingerprint,
      restoreGapDetected: this.continuityRestoreGapDetected,
    }

    const payload: AdaptiveLongitudinalContinuityCheckpointPayload = {
      version: ADAPTIVE_CONTINUITY_CHECKPOINT_VERSION,
      checkpointedAt: args.generatedAt,
      continuityWindows: {
        short: ADAPTIVE_LONG_DURATION_WINDOWS.short,
        medium: ADAPTIVE_LONG_DURATION_WINDOWS.medium,
        long: ADAPTIVE_LONG_DURATION_WINDOWS.long,
        historyRetentionLimit: ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT,
      },
      longDurationHistory: this.longDurationHistory,
      longitudinalTrendState: args.longDurationValidation.trendAggregation,
      replayContinuityContext: {
        previousTopOpportunityId: this.previousTopOpportunityId,
        previousTopStreak: this.previousTopStreak,
        previousGovernanceEvidenceId: this.previousGovernanceEvidenceEvent?.evidenceId ?? null,
        governanceTimelineEventSequence: this.governanceTimelineEventSequence,
        lastEquilibriumReplayFingerprint: args.equilibriumReplayFingerprint,
      },
      continuityCheckpoints: {
        lastSnapshotGeneratedAt: args.generatedAt,
        lastEvidenceGeneratedAt: args.evidenceEvent.generatedAt,
        lastEvidenceId: args.evidenceEvent.evidenceId,
      },
      continuityLineageMetadata: lineageMetadata,
    }

    const continuityFingerprint = buildContinuityCheckpointFingerprint(payload)

    const checkpointWrite = async () => checkpointRepository.upsertCheckpoint({
      checkpointId: buildLearningCheckpointId(ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME),
      runtimeName: ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME,
      lastProcessedAttributionId: args.evidenceEvent.evidenceId,
      lastProcessedAttributedAt: args.evidenceEvent.generatedAt,
      checkpointVersion: ADAPTIVE_CONTINUITY_CHECKPOINT_VERSION,
      lineageKey: ADAPTIVE_CONTINUITY_LINEAGE_KEY,
      lineageMetadataJson: JSON.stringify(lineageMetadata),
      checkpointPayloadJson: JSON.stringify(payload),
      continuityFingerprint,
      updatedAt: args.generatedAt,
    })

    try {
      await getSemanticMutationExecutor().executeSemanticMutation({
        authoritySource: ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME,
        intent: {
          intentId: `checkpoint:${ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME}:${args.evidenceEvent.evidenceId}`,
          intentType: 'runtime.checkpoint.update',
          domain: 'checkpoint',
          actor: 'runtime',
          targetRef: {
            runtimeId: ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME,
            checkpointId: buildLearningCheckpointId(ADAPTIVE_INFLUENCE_GATE_RUNTIME_NAME),
          },
          semanticPurpose: 'persist adaptive influence continuity checkpoint semantics',
          expectedInstitutionalEffect: ['runtime_checkpoint_advanced', 'continuity_lineage_extended'],
          riskLevel: 'high',
          replayRelevant: true,
          continuityRelevant: true,
          authRelevant: false,
          createdAt: args.generatedAt,
        },
        captureBeforeState: () => ({
          previousTopOpportunityId: this.previousTopOpportunityId,
          previousEvidenceId: this.previousGovernanceEvidenceEvent?.evidenceId ?? null,
        }),
        executePersistence: checkpointWrite,
        captureAfterState: () => ({
          continuityFingerprint,
          evidenceId: args.evidenceEvent.evidenceId,
          generatedAt: args.generatedAt,
        }),
        deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
          effectId: `${intent.intentId}:effect`,
          intentId: intent.intentId,
          effectType: 'runtime.checkpoint.updated',
          domain: intent.domain,
          beforeFingerprint: buildSemanticFingerprint(beforeState),
          afterFingerprint: buildSemanticFingerprint(afterState),
          changedFields: ['learningCheckpoint', 'continuityFingerprint'],
          institutionalMeaning: 'adaptive influence continuity state was durably advanced with replay lineage',
          replayFingerprint: buildSemanticFingerprint(afterState),
          continuityLineageHash: sovereignAttestation.lineageHash,
          mutationLineageHash: '',
          verified: false,
        }),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('Semantic mutation executor is not installed')) {
        throw error
      }

      await checkpointWrite()
    }

    this.lastContinuityFingerprint = continuityFingerprint
    this.continuityCheckpointCount += 1
    this.continuityRestoreGapDetected = false
  }

  async refresh(): Promise<AdaptiveInfluenceGateSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const startedAt = Date.now()
      console.info('[adaptive-influence] snapshot.refresh', { phase: 'start' })

      try {
        await this.restoreLongitudinalContinuityCheckpoint()

        const adaptiveState = this.dependencies.adaptiveWeightSnapshotRuntime.getSnapshot()
        const [signalMemory, categoryMemory, entityMemory] = await Promise.all([
          this.dependencies.economicMemoryRepository.listEconomicMemoryByScope('signal'),
          this.dependencies.economicMemoryRepository.listEconomicMemoryByScope('category'),
          this.dependencies.economicMemoryRepository.listEconomicMemoryByScope('entity'),
        ])
        const opportunityState = this.dependencies.opportunitySnapshotStore.getSnapshot()
        const opportunities = sortOpportunities(opportunityState.snapshot.opportunities)
        const suggestions = opportunityState.snapshot.suggestions
        const generatedAt = new Date().toISOString()

        const provisionalInfluences = opportunities.map((opportunity) => {
          const keywordKey = normalizeIdPart(opportunity.keyword)
          const categoryKey = normalizeIdPart(opportunity.category)
          const entityId = selectEntityIdForOpportunity(opportunity, suggestions)
          const entityKey = normalizeIdPart(entityId ?? '')
          const signalWeight = this.config.allowedScopes.includes('signal')
            ? selectBestWeight(
              adaptiveState.snapshot.signalWeights,
              (weight) => normalizeIdPart(weight.signalKeyword) === keywordKey,
            )
            : null
          const categoryWeight = this.config.allowedScopes.includes('category')
            ? selectBestWeight(
              adaptiveState.snapshot.categoryWeights,
              (weight) => normalizeIdPart(weight.category) === categoryKey,
            )
            : null
          const entityWeight = this.config.allowedScopes.includes('entity') && entityId
            ? selectBestWeight(
              adaptiveState.snapshot.entityWeights,
              (weight) => normalizeIdPart(weight.entityId ?? '') === entityKey,
            )
            : null

          const evidence = {
            signal: toEvidence(signalWeight),
            category: toEvidence(categoryWeight),
            entity: toEvidence(entityWeight),
          }
          const evidenceScopes = ([
            evidence.signal ? 'signal' : null,
            evidence.category ? 'category' : null,
            evidence.entity ? 'entity' : null,
          ].filter((scope): scope is AdaptiveInfluenceScope => scope !== null))
          const hasApplicableWeights = evidence.signal !== null || evidence.category !== null || evidence.entity !== null
          const selectedWeights = [signalWeight, categoryWeight, entityWeight]
            .filter((weight): weight is AdaptiveWeightRecord => weight !== null)
          const hasSufficientSampleWeights = selectedWeights.some((weight) => weight.sampleCount >= this.config.minimumSampleRequirement)
          const projectionSignalWeight = signalWeight && signalWeight.sampleCount >= this.config.minimumSampleRequirement
            ? signalWeight
            : null
          const projectionCategoryWeight = categoryWeight && categoryWeight.sampleCount >= this.config.minimumSampleRequirement
            ? categoryWeight
            : null
          const projectionEntityWeight = entityWeight && entityWeight.sampleCount >= this.config.minimumSampleRequirement
            ? entityWeight
            : null
          const rolloutBucket = computeRolloutBucket({
            opportunityId: opportunity.id,
            marketSignalId: opportunity.sourceSignalId,
            entityId,
          })
          const rolloutEligible = this.config.enabled
            && this.config.mode !== 'off'
            && !this.config.killSwitchEnabled
            && this.config.rolloutPercentage > 0
            && rolloutBucket < this.config.rolloutPercentage
          const blockedReason = resolveBlockedReason({
            config: this.config,
            rolloutEligible,
            hasApplicableWeights,
            hasSufficientSampleWeights,
          })
          const adaptiveMultiplier = computeAdaptiveMultiplier({
            config: this.config,
            signalWeight: projectionSignalWeight,
            categoryWeight: projectionCategoryWeight,
            entityWeight: projectionEntityWeight,
          })
          const baseScore = opportunity.economicRelevance
          const finalProjectedScore = roundMetric(baseScore * adaptiveMultiplier)

          return {
            opportunityId: opportunity.id,
            marketSignalId: opportunity.sourceSignalId,
            keyword: opportunity.keyword,
            category: opportunity.category,
            entityId,
            baseScore,
            adaptiveMultiplier,
            finalProjectedScore,
            influenceApplied: false,
            rolloutEligible,
            blockedReason,
            rolloutBucket,
            sampleThresholdSatisfied: hasSufficientSampleWeights,
            projectionMode: this.config.mode,
            weightSources: {
              signal: signalWeight?.weightId ?? null,
              category: categoryWeight?.weightId ?? null,
              entity: entityWeight?.weightId ?? null,
            },
            memoryIds: {
              signal: signalWeight?.memoryId ?? null,
              category: categoryWeight?.memoryId ?? null,
              entity: entityWeight?.memoryId ?? null,
            },
            evidence,
            evidenceScopes,
            sampleCounts: {
              signal: evidence.signal?.sampleCount ?? null,
              category: evidence.category?.sampleCount ?? null,
              entity: evidence.entity?.sampleCount ?? null,
            },
          }
        })

        const baseRankMap = new Map(
          sortInfluencesByBaseRank(provisionalInfluences).map((influence, index) => [influence.opportunityId, index + 1] as const),
        )
        const projectedRankMap = new Map(
          sortInfluencesByProjectedRank(provisionalInfluences).map((influence, index) => [influence.opportunityId, index + 1] as const),
        )
        const influences = provisionalInfluences.map((influence) => {
          const baseRank = baseRankMap.get(influence.opportunityId) ?? 0
          const projectedRank = projectedRankMap.get(influence.opportunityId) ?? 0
          const rankDelta = baseRank - projectedRank

          return {
            ...influence,
            baseRank,
            projectedRank,
            rankDelta,
            replayFingerprint: buildReplayFingerprint({
              opportunityId: influence.opportunityId,
              marketSignalId: influence.marketSignalId,
              entityId: influence.entityId,
              baseScore: influence.baseScore,
              baseRank,
              adaptiveMultiplier: influence.adaptiveMultiplier,
              finalProjectedScore: influence.finalProjectedScore,
              projectedRank,
              rankDelta,
              blockedReason: influence.blockedReason,
              rolloutBucket: influence.rolloutBucket,
              sampleThresholdSatisfied: influence.sampleThresholdSatisfied,
              projectionMode: influence.projectionMode,
              weightSources: influence.weightSources,
              memoryIds: influence.memoryIds,
              config: this.config,
              evidence: influence.evidence,
            }),
          } satisfies AdaptiveInfluencePayload
        }).sort((left, right) => left.baseRank - right.baseRank)

        const divergenceCount = influences.filter((item) => item.baseRank !== item.projectedRank).length
        const rankShiftCount = influences.filter((item) => item.rankDelta !== 0).length
        const topRankChanged = influences.some((item) => item.baseRank === 1 && item.projectedRank !== 1)
        const averageAdaptiveMultiplier = influences.length > 0
          ? roundMetric(influences.reduce((sum, item) => sum + item.adaptiveMultiplier, 0) / influences.length)
          : 0
        const divergenceAudit = buildDivergenceAuditMetrics({
          influences,
          previousInfluences: this.snapshot.influences,
          boundedMin: this.config.boundedMin,
          boundedMax: this.config.boundedMax,
          previousTopOpportunityId: this.previousTopOpportunityId,
          previousTopStreak: this.previousTopStreak,
        })
        const reinforcementLoopDetection = buildReinforcementLoopDetection({
          history: this.longDurationHistory,
          metrics: divergenceAudit.metrics,
          influences,
          previousInfluences: this.snapshot.influences,
        })
        const historyPoint = buildLongDurationHistoryPoint({
          generatedAt,
          metrics: divergenceAudit.metrics,
        })
        this.longDurationHistory = [...this.longDurationHistory, historyPoint]
          .slice(-ADAPTIVE_LONG_DURATION_HISTORY_RETENTION_LIMIT)
        const historicalReplaySimulation = buildHistoricalReplaySimulation({
          history: this.longDurationHistory,
        })
        const equilibriumEvidenceReplayFingerprint = buildAdaptiveEquilibriumReplayFingerprint(influences)
        const equilibriumEvidenceInput = buildAdaptiveEquilibriumEvidenceInput({
          generatedAt,
          replayFingerprint: equilibriumEvidenceReplayFingerprint,
          historicalReplaySimulation,
          influences,
          metrics: divergenceAudit.metrics,
        })
        const evidenceAppendResult = await appendAdaptiveEvidenceWithSovereignAuthority({
          repository: this.dependencies.adaptiveEquilibriumEvidenceRepository,
          input: equilibriumEvidenceInput,
          authority: {
            source: 'backend/src/learning/runtime/adaptiveInfluenceGateRuntime.ts#refresh',
          },
        })
        if (this.dependencies.governanceEvidenceTimelineService) {
          const governanceAppendResult = await this.dependencies.governanceEvidenceTimelineService.appendDerivedEvents({
            current: evidenceAppendResult.evidence,
            previous: this.previousGovernanceEvidenceEvent,
            eventSequence: this.governanceTimelineEventSequence,
            context: {
              replayCollapseDetected: historicalReplaySimulation.stressSimulation.replayCollapseDetection.collapseDetected,
              replayCollapseSignals: historicalReplaySimulation.stressSimulation.replayCollapseDetection.collapseSignals,
              instabilityRiskClassification: historicalReplaySimulation.stressSimulation.replayRiskDiagnostics.riskClassification,
              saturationRatio: historicalReplaySimulation.saturationEvolution.averageSaturationRatio,
              reinforcementLoopIntensity: historicalReplaySimulation.reinforcementLoops.averageLoopIntensity,
              equilibriumScore: historicalReplaySimulation.equilibriumLongitudinalStudy.stabilityConvergenceMetrics.equilibriumConfidence,
            },
          })

          this.governanceTimelineEventSequence += 1
          console.info('[adaptive-influence] governance.timeline', {
            sourceEvidenceId: evidenceAppendResult.evidence.evidenceId,
            derivedEventCount: governanceAppendResult.derivedCount,
            insertedEventCount: governanceAppendResult.insertedCount,
          })
        }
        this.previousGovernanceEvidenceEvent = evidenceAppendResult.evidence
        const longDurationValidation = buildLongDurationValidation({
          history: this.longDurationHistory,
        })
        const averageRankDelta = divergenceAudit.metrics.rankDrift.averageAbsRankDelta
        const maxAbsRankDelta = divergenceAudit.metrics.rankDrift.maxAbsRankDelta

        const refreshDurationMs = Date.now() - startedAt
        this.snapshot = {
          status: opportunityState.freshness.ready && adaptiveState.freshness.ready ? 'ready' : 'warming',
          generatedAt,
          config: this.config,
          influences,
          metadata: {
            candidateCount: influences.length,
            influenceAppliedCount: influences.filter((item) => item.influenceApplied).length,
            rolloutEligibleCount: influences.filter((item) => item.rolloutEligible).length,
            blockedCount: influences.filter((item) => !item.influenceApplied).length,
            divergenceCount,
            rankShiftCount,
            topRankChanged,
            averageRankDelta,
            maxAbsRankDelta,
            averageAdaptiveMultiplier,
            boundedMin: this.config.boundedMin,
            boundedMax: this.config.boundedMax,
            rolloutPercentage: this.config.rolloutPercentage,
            minimumSampleRequirement: this.config.minimumSampleRequirement,
            allowedScopes: [...this.config.allowedScopes],
            economicMemoryRecordCount: signalMemory.length + categoryMemory.length + entityMemory.length,
            audit: {
              ...divergenceAudit.metrics,
              reinforcementLoopDetection,
              historicalReplaySimulation,
              longDurationValidation,
            },
            refreshIntervalMs: this.refreshIntervalMs,
            lastRefreshDurationMs: refreshDurationMs,
            lastError: null,
          },
        }
        this.previousTopOpportunityId = divergenceAudit.topOpportunityId
        this.previousTopStreak = divergenceAudit.topStreak
        this.lastRunAt = generatedAt
        this.lastError = null

        await this.persistLongitudinalContinuityCheckpoint({
          generatedAt,
          longDurationValidation,
          equilibriumReplayFingerprint: equilibriumEvidenceReplayFingerprint,
          evidenceEvent: evidenceAppendResult.evidence,
        })

        console.info('[adaptive-influence] snapshot.refresh', {
          phase: 'done',
          durationMs: refreshDurationMs,
          candidateCount: influences.length,
          rolloutEligibleCount: this.snapshot.metadata.rolloutEligibleCount,
          influenceAppliedCount: this.snapshot.metadata.influenceAppliedCount,
          divergenceCount: this.snapshot.metadata.divergenceCount,
          rankShiftCount: this.snapshot.metadata.rankShiftCount,
          stabilityScore: this.snapshot.metadata.audit.stabilityScore,
          replayEquivalentRatio: this.snapshot.metadata.audit.replayConsistency.equivalentFingerprintRatio,
          driftActiveWarnings: this.snapshot.metadata.audit.driftDetection.warningSummary.activeCount,
          driftCriticalWarnings: this.snapshot.metadata.audit.driftDetection.warningSummary.criticalCount,
          equilibriumEvidenceId: evidenceAppendResult.evidence.evidenceId,
          equilibriumEvidenceInserted: evidenceAppendResult.inserted,
          mode: this.config.mode,
        })

        return this.snapshot
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'unknown_error'
        console.warn('[adaptive-influence] snapshot.error', {
          message: this.lastError,
          phase: 'refresh',
        })
        throw error
      } finally {
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createAdaptiveInfluenceGateRuntime(dependencies: AdaptiveInfluenceGateRuntimeDependencies) {
  return new AdaptiveInfluenceGateRuntime(dependencies)
}
