import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'

export type EpistemicConfidenceClassification =
  | 'HIGH_CONFIDENCE'
  | 'MEDIUM_CONFIDENCE'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_EVIDENCE'

export type EpistemicConfidenceMetricKey =
  | 'evidenceDensity'
  | 'replayCoverage'
  | 'longitudinalContinuity'
  | 'entropyBaselineStability'
  | 'observationalCompleteness'
  | 'samplingConfidence'
  | 'temporalGapPressure'
  | 'projectionConfidence'
  | 'replayConfidence'
  | 'governanceInterpretationConfidence'

export type EpistemicConfidenceWarningCode =
  | 'low_evidence_density'
  | 'replay_coverage_degradation'
  | 'longitudinal_continuity_gap'
  | 'entropy_baseline_instability'
  | 'observational_completeness_low'
  | 'sampling_confidence_low'
  | 'temporal_gap_pressure_high'
  | 'projection_confidence_low'
  | 'replay_confidence_low'
  | 'governance_interpretation_confidence_low'

export type EpistemicConfidenceWarning = {
  code: EpistemicConfidenceWarningCode
  severity: 'info' | 'warning' | 'critical'
  metric: EpistemicConfidenceMetricKey
  message: string
}

export type EpistemicGovernanceConfidenceSummary = {
  classification: EpistemicConfidenceClassification
  score: number
  governanceInterpretationConfidence: number
  observationalCompleteness: number
  samplingConfidence: number
  warnings: EpistemicConfidenceWarning[]
}

export type EpistemicReplayConfidenceSummary = {
  classification: EpistemicConfidenceClassification
  score: number
  replayCoverage: number
  replayConfidence: number
  temporalGapPressure: number
  warnings: EpistemicConfidenceWarning[]
}

export type EpistemicConfidenceMetadata = {
  sampleCount: number
  timeSpanHours: number
  weightedConfidenceScore: number
  classification: EpistemicConfidenceClassification
  metrics: Record<EpistemicConfidenceMetricKey, number>
  warnings: EpistemicConfidenceWarning[]
  governanceSummary: EpistemicGovernanceConfidenceSummary
  replaySummary: EpistemicReplayConfidenceSummary
}

const HOURS_MS = 60 * 60 * 1000
const MIN_REQUIRED_SAMPLES = 3

function roundMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number(value.toFixed(6))
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, roundMetric(value)))
}

function sortChronological(events: AdaptiveEquilibriumEvidenceEvent[]) {
  return [...events].sort((left, right) => {
    const byTime = left.generatedAt.localeCompare(right.generatedAt)
    if (byTime !== 0) {
      return byTime
    }

    return left.evidenceId.localeCompare(right.evidenceId)
  })
}

function toTimestampMs(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function classifyByScore(score: number, sampleCount: number): EpistemicConfidenceClassification {
  if (sampleCount < MIN_REQUIRED_SAMPLES) {
    return 'INSUFFICIENT_EVIDENCE'
  }

  if (score >= 0.8) {
    return 'HIGH_CONFIDENCE'
  }

  if (score >= 0.6) {
    return 'MEDIUM_CONFIDENCE'
  }

  return 'LOW_CONFIDENCE'
}

function collectWarnings(metrics: Record<EpistemicConfidenceMetricKey, number>) {
  const warnings: EpistemicConfidenceWarning[] = []

  if (metrics.evidenceDensity < 0.45) {
    warnings.push({
      code: 'low_evidence_density',
      severity: 'warning',
      metric: 'evidenceDensity',
      message: 'Evidence density is low and may weaken longitudinal comparability.',
    })
  }

  if (metrics.replayCoverage < 0.7) {
    warnings.push({
      code: 'replay_coverage_degradation',
      severity: 'critical',
      metric: 'replayCoverage',
      message: 'Replay coverage degraded below safe interpretation threshold.',
    })
  }

  if (metrics.longitudinalContinuity < 0.65) {
    warnings.push({
      code: 'longitudinal_continuity_gap',
      severity: 'warning',
      metric: 'longitudinalContinuity',
      message: 'Longitudinal continuity has gaps that reduce trend confidence.',
    })
  }

  if (metrics.entropyBaselineStability < 0.6) {
    warnings.push({
      code: 'entropy_baseline_instability',
      severity: 'warning',
      metric: 'entropyBaselineStability',
      message: 'Entropy baseline instability detected across evidence history.',
    })
  }

  if (metrics.observationalCompleteness < 0.7) {
    warnings.push({
      code: 'observational_completeness_low',
      severity: 'warning',
      metric: 'observationalCompleteness',
      message: 'Observational completeness is below governance-grade confidence.',
    })
  }

  if (metrics.samplingConfidence < 0.65) {
    warnings.push({
      code: 'sampling_confidence_low',
      severity: 'warning',
      metric: 'samplingConfidence',
      message: 'Sampling confidence is low for stable interpretation.',
    })
  }

  if (metrics.temporalGapPressure > 0.4) {
    warnings.push({
      code: 'temporal_gap_pressure_high',
      severity: 'critical',
      metric: 'temporalGapPressure',
      message: 'Temporal gap pressure is high and threatens replay comparability.',
    })
  }

  if (metrics.projectionConfidence < 0.65) {
    warnings.push({
      code: 'projection_confidence_low',
      severity: 'warning',
      metric: 'projectionConfidence',
      message: 'Projection confidence is low for reliable forward interpretation.',
    })
  }

  if (metrics.replayConfidence < 0.7) {
    warnings.push({
      code: 'replay_confidence_low',
      severity: 'critical',
      metric: 'replayConfidence',
      message: 'Replay confidence is low and requires caution in replay analysis.',
    })
  }

  if (metrics.governanceInterpretationConfidence < 0.7) {
    warnings.push({
      code: 'governance_interpretation_confidence_low',
      severity: 'warning',
      metric: 'governanceInterpretationConfidence',
      message: 'Governance interpretation confidence is below recommended threshold.',
    })
  }

  return warnings
}

function buildGovernanceSummary(args: {
  metrics: Record<EpistemicConfidenceMetricKey, number>
  warnings: EpistemicConfidenceWarning[]
  sampleCount: number
}) {
  const score = clampUnit(
    (args.metrics.governanceInterpretationConfidence
      + args.metrics.observationalCompleteness
      + args.metrics.samplingConfidence
      + args.metrics.longitudinalContinuity) / 4,
  )

  return {
    classification: classifyByScore(score, args.sampleCount),
    score,
    governanceInterpretationConfidence: args.metrics.governanceInterpretationConfidence,
    observationalCompleteness: args.metrics.observationalCompleteness,
    samplingConfidence: args.metrics.samplingConfidence,
    warnings: args.warnings.filter((warning) => (
      warning.metric === 'governanceInterpretationConfidence'
      || warning.metric === 'observationalCompleteness'
      || warning.metric === 'samplingConfidence'
      || warning.metric === 'longitudinalContinuity'
    )),
  } satisfies EpistemicGovernanceConfidenceSummary
}

function buildReplaySummary(args: {
  metrics: Record<EpistemicConfidenceMetricKey, number>
  warnings: EpistemicConfidenceWarning[]
  sampleCount: number
}) {
  const score = clampUnit(
    (args.metrics.replayCoverage
      + args.metrics.replayConfidence
      + (1 - args.metrics.temporalGapPressure)
      + args.metrics.longitudinalContinuity) / 4,
  )

  return {
    classification: classifyByScore(score, args.sampleCount),
    score,
    replayCoverage: args.metrics.replayCoverage,
    replayConfidence: args.metrics.replayConfidence,
    temporalGapPressure: args.metrics.temporalGapPressure,
    warnings: args.warnings.filter((warning) => (
      warning.metric === 'replayCoverage'
      || warning.metric === 'replayConfidence'
      || warning.metric === 'temporalGapPressure'
      || warning.metric === 'longitudinalContinuity'
    )),
  } satisfies EpistemicReplayConfidenceSummary
}

export function deriveEpistemicConfidenceMetadata(events: AdaptiveEquilibriumEvidenceEvent[]): EpistemicConfidenceMetadata {
  const sorted = sortChronological(events)
  const sampleCount = sorted.length

  if (sampleCount === 0) {
    const zeroMetrics = {
      evidenceDensity: 0,
      replayCoverage: 0,
      longitudinalContinuity: 0,
      entropyBaselineStability: 0,
      observationalCompleteness: 0,
      samplingConfidence: 0,
      temporalGapPressure: 1,
      projectionConfidence: 0,
      replayConfidence: 0,
      governanceInterpretationConfidence: 0,
    } satisfies Record<EpistemicConfidenceMetricKey, number>
    const warnings = collectWarnings(zeroMetrics)

    return {
      sampleCount,
      timeSpanHours: 0,
      weightedConfidenceScore: 0,
      classification: 'INSUFFICIENT_EVIDENCE',
      metrics: zeroMetrics,
      warnings,
      governanceSummary: buildGovernanceSummary({ metrics: zeroMetrics, warnings, sampleCount }),
      replaySummary: buildReplaySummary({ metrics: zeroMetrics, warnings, sampleCount }),
    }
  }

  const timestampsMs = sorted
    .map((event) => toTimestampMs(event.generatedAt))
    .filter((value): value is number => value !== null)

  const minMs = timestampsMs[0] ?? 0
  const maxMs = timestampsMs[timestampsMs.length - 1] ?? minMs
  const timeSpanHours = roundMetric((maxMs - minMs) / HOURS_MS)
  const effectiveSpanHours = Math.max(1, timeSpanHours)

  const expectedHourlySamples = Math.max(1, Math.floor(effectiveSpanHours) + 1)
  const evidenceDensity = clampUnit(sampleCount / expectedHourlySamples)

  const replayFingerprintNonEmptyCount = sorted.filter((event) => event.replayFingerprint.trim().length > 0).length
  const replayCoverage = clampUnit(replayFingerprintNonEmptyCount / sampleCount)

  const deltasHours: number[] = []
  for (let index = 1; index < timestampsMs.length; index += 1) {
    deltasHours.push((timestampsMs[index] - timestampsMs[index - 1]) / HOURS_MS)
  }
  const avgDeltaHours = deltasHours.length > 0
    ? deltasHours.reduce((sum, value) => sum + value, 0) / deltasHours.length
    : 0
  const longitudinalContinuity = clampUnit(1 - clampUnit(avgDeltaHours / 6))

  const entropyValues = sorted.map((event) => clampUnit(event.entropyEvolution))
  const entropyMean = entropyValues.reduce((sum, value) => sum + value, 0) / sampleCount
  const entropyVariance = entropyValues
    .map((value) => (value - entropyMean) ** 2)
    .reduce((sum, value) => sum + value, 0) / sampleCount
  const entropyBaselineStability = clampUnit(1 - Math.sqrt(entropyVariance))

  const observationalCompleteness = clampUnit(sorted
    .map((event) => {
      let completeness = 0
      completeness += Number(Number.isFinite(event.replayConsistencyEquilibrium))
      completeness += Number(Number.isFinite(event.projectionStabilityConvergence))
      completeness += Number(Number.isFinite(event.entropyEvolution))
      completeness += Number(event.replayFingerprint.trim().length > 0)
      completeness += Number(event.governanceClassification.length > 0)
      return completeness / 5
    })
    .reduce((sum, value) => sum + value, 0) / sampleCount)

  const samplingConfidence = clampUnit(Math.log10(sampleCount + 1) / Math.log10(25 + 1))

  const gapPressures = deltasHours.map((delta) => clampUnit(delta / 12))
  const temporalGapPressure = clampUnit(gapPressures.length > 0
    ? gapPressures.reduce((sum, value) => sum + value, 0) / gapPressures.length
    : 0)

  const projectionConfidence = clampUnit(sorted
    .map((event) => {
      const stability = clampUnit(event.projectionStabilityConvergence)
      const lockInPenalty = clampUnit(event.projectionLockInPersistence)
      return clampUnit((stability + (1 - lockInPenalty)) / 2)
    })
    .reduce((sum, value) => sum + value, 0) / sampleCount)

  const replayConfidence = clampUnit((replayCoverage + longitudinalContinuity + (1 - temporalGapPressure)) / 3)

  const governanceInterpretationConfidence = clampUnit(
    (projectionConfidence + observationalCompleteness + entropyBaselineStability + samplingConfidence) / 4,
  )

  const metrics = {
    evidenceDensity,
    replayCoverage,
    longitudinalContinuity,
    entropyBaselineStability,
    observationalCompleteness,
    samplingConfidence,
    temporalGapPressure,
    projectionConfidence,
    replayConfidence,
    governanceInterpretationConfidence,
  } satisfies Record<EpistemicConfidenceMetricKey, number>

  const weightedConfidenceScore = clampUnit(
    (metrics.evidenceDensity * 0.1)
    + (metrics.replayCoverage * 0.12)
    + (metrics.longitudinalContinuity * 0.1)
    + (metrics.entropyBaselineStability * 0.08)
    + (metrics.observationalCompleteness * 0.1)
    + (metrics.samplingConfidence * 0.1)
    + ((1 - metrics.temporalGapPressure) * 0.1)
    + (metrics.projectionConfidence * 0.1)
    + (metrics.replayConfidence * 0.1)
    + (metrics.governanceInterpretationConfidence * 0.1),
  )

  const warnings = collectWarnings(metrics)

  return {
    sampleCount,
    timeSpanHours,
    weightedConfidenceScore,
    classification: classifyByScore(weightedConfidenceScore, sampleCount),
    metrics,
    warnings,
    governanceSummary: buildGovernanceSummary({ metrics, warnings, sampleCount }),
    replaySummary: buildReplaySummary({ metrics, warnings, sampleCount }),
  }
}
