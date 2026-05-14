export type AdaptiveEvidenceCompatibilityClassification =
  | 'FULLY_COMPATIBLE'
  | 'PARTIALLY_COMPATIBLE'
  | 'INCOMPATIBLE'

export type AdaptiveEvidenceSemanticVersionMetadata = {
  contractFamily: 'adaptive_equilibrium_evidence'
  contractSchemaVersion: number
  scoringSemanticsVersion: string
  entropySemanticsVersion: string
  replaySemanticsVersion: string
  equilibriumSemanticsVersion: string
  heatmapSemanticsVersion: string
  reducerWeightingSemanticsVersion: string
}

export type AdaptiveEvidenceReducerSemanticMetadata = {
  reducerSetVersion: string
  driftStabilitySemantics: string
  equilibriumConvergenceSemantics: string
  heatmapConcentrationReducerVersion: string
  replayDivergenceReducerVersion: string
  weightedStabilityScoreReducerVersion: string
}

export type AdaptiveEvidenceGenerationMetadata = {
  generatedBy: string
  runtimeSemanticsVersion: string
  analysisMode: 'observability_only'
  replayInterpretationMode: 'version_aware'
  governanceSurface: 'compatibility_guarded'
  sovereignAppendAudit?: {
    authoritySource: string
    viaExecutor: boolean
    traceEnforced: true
  }
}

export type AdaptiveEvidenceCompatibilityAssessment = {
  classification: AdaptiveEvidenceCompatibilityClassification
  reasonCodes: string[]
  warnings: string[]
  longitudinalComparisonSafe: boolean
  replayInterpretationSafe: boolean
  governanceInterpretationSafe: boolean
  requiresVersionAwareInterpretation: boolean
}

export type AdaptiveEvidenceCompatibilitySummary = {
  currentEvidenceContractVersion: string
  highestRiskClassification: AdaptiveEvidenceCompatibilityClassification
  longitudinalComparisonSafe: boolean
  replayInterpretationSafe: boolean
  governanceInterpretationSafe: boolean
  requiresVersionAwareInterpretation: boolean
  warnings: string[]
  versions: Array<{
    evidenceContractVersion: string
    count: number
    classification: AdaptiveEvidenceCompatibilityClassification
  }>
}

export const LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION = 'legacy-unversioned'
export const CURRENT_ADAPTIVE_EVIDENCE_CONTRACT_VERSION = 'adaptive-equilibrium-evidence/1.0.0'

export const CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA: AdaptiveEvidenceSemanticVersionMetadata = {
  contractFamily: 'adaptive_equilibrium_evidence',
  contractSchemaVersion: 1,
  scoringSemanticsVersion: '1.0.0',
  entropySemanticsVersion: '1.0.0',
  replaySemanticsVersion: '1.0.0',
  equilibriumSemanticsVersion: '1.0.0',
  heatmapSemanticsVersion: '1.0.0',
  reducerWeightingSemanticsVersion: '1.0.0',
}

export const CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA: AdaptiveEvidenceReducerSemanticMetadata = {
  reducerSetVersion: '1.0.0',
  driftStabilitySemantics: 'inverse_drift_pressure_v1',
  equilibriumConvergenceSemantics: 'projection_stability_convergence_v1',
  heatmapConcentrationReducerVersion: 'weighted_concentration_v1',
  replayDivergenceReducerVersion: 'replay_divergence_intensity_v1',
  weightedStabilityScoreReducerVersion: 'weighted_longitudinal_stability_v1',
}

export const CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA: AdaptiveEvidenceGenerationMetadata = {
  generatedBy: 'adaptiveInfluenceGateRuntime',
  runtimeSemanticsVersion: '1.0.0',
  analysisMode: 'observability_only',
  replayInterpretationMode: 'version_aware',
  governanceSurface: 'compatibility_guarded',
}

function parseMajor(version: string) {
  const match = /^(\d+)\./.exec(version.trim())
  return match ? Number.parseInt(match[1] ?? '0', 10) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeSovereignAppendAudit(value: unknown): AdaptiveEvidenceGenerationMetadata['sovereignAppendAudit'] {
  if (!isRecord(value)) {
    return undefined
  }

  return {
    authoritySource: normalizeString(value.authoritySource, 'unknown_authority_source'),
    viaExecutor: value.viaExecutor === true,
    traceEnforced: true,
  }
}

export function buildCurrentAdaptiveEvidenceContractMetadata() {
  return {
    evidenceContractVersion: CURRENT_ADAPTIVE_EVIDENCE_CONTRACT_VERSION,
    semanticVersionMetadata: { ...CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA },
    reducerSemanticMetadata: { ...CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA },
    evidenceGenerationMetadata: { ...CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA },
  }
}

export function resolveAdaptiveEvidenceContractVersion(raw: string | null | undefined) {
  return normalizeString(raw, LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION)
}

export function resolveAdaptiveEvidenceSemanticVersionMetadata(
  input: Partial<AdaptiveEvidenceSemanticVersionMetadata> | null | undefined,
  evidenceContractVersion?: string,
): AdaptiveEvidenceSemanticVersionMetadata {
  if (evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION) {
    return {
      ...CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA,
      contractSchemaVersion: 0,
    }
  }

  return {
    contractFamily: 'adaptive_equilibrium_evidence',
    contractSchemaVersion: normalizeNumber(
      input?.contractSchemaVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.contractSchemaVersion,
    ),
    scoringSemanticsVersion: normalizeString(
      input?.scoringSemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.scoringSemanticsVersion,
    ),
    entropySemanticsVersion: normalizeString(
      input?.entropySemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.entropySemanticsVersion,
    ),
    replaySemanticsVersion: normalizeString(
      input?.replaySemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.replaySemanticsVersion,
    ),
    equilibriumSemanticsVersion: normalizeString(
      input?.equilibriumSemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.equilibriumSemanticsVersion,
    ),
    heatmapSemanticsVersion: normalizeString(
      input?.heatmapSemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.heatmapSemanticsVersion,
    ),
    reducerWeightingSemanticsVersion: normalizeString(
      input?.reducerWeightingSemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.reducerWeightingSemanticsVersion,
    ),
  }
}

export function resolveAdaptiveEvidenceReducerSemanticMetadata(
  input: Partial<AdaptiveEvidenceReducerSemanticMetadata> | null | undefined,
  evidenceContractVersion?: string,
): AdaptiveEvidenceReducerSemanticMetadata {
  if (evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION) {
    return {
      ...CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA,
      reducerSetVersion: 'legacy-unversioned',
    }
  }

  return {
    reducerSetVersion: normalizeString(
      input?.reducerSetVersion,
      CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA.reducerSetVersion,
    ),
    driftStabilitySemantics: normalizeString(
      input?.driftStabilitySemantics,
      CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA.driftStabilitySemantics,
    ),
    equilibriumConvergenceSemantics: normalizeString(
      input?.equilibriumConvergenceSemantics,
      CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA.equilibriumConvergenceSemantics,
    ),
    heatmapConcentrationReducerVersion: normalizeString(
      input?.heatmapConcentrationReducerVersion,
      CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA.heatmapConcentrationReducerVersion,
    ),
    replayDivergenceReducerVersion: normalizeString(
      input?.replayDivergenceReducerVersion,
      CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA.replayDivergenceReducerVersion,
    ),
    weightedStabilityScoreReducerVersion: normalizeString(
      input?.weightedStabilityScoreReducerVersion,
      CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA.weightedStabilityScoreReducerVersion,
    ),
  }
}

export function resolveAdaptiveEvidenceGenerationMetadata(
  input: Partial<AdaptiveEvidenceGenerationMetadata> | null | undefined,
  evidenceContractVersion?: string,
): AdaptiveEvidenceGenerationMetadata {
  if (evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION) {
    return {
      ...CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA,
      generatedBy: 'unknown_legacy_runtime',
      runtimeSemanticsVersion: 'legacy-unversioned',
    }
  }

  return {
    generatedBy: normalizeString(input?.generatedBy, CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA.generatedBy),
    runtimeSemanticsVersion: normalizeString(
      input?.runtimeSemanticsVersion,
      CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA.runtimeSemanticsVersion,
    ),
    analysisMode: 'observability_only',
    replayInterpretationMode: 'version_aware',
    governanceSurface: 'compatibility_guarded',
    sovereignAppendAudit: normalizeSovereignAppendAudit(input?.sovereignAppendAudit),
  }
}

type ContractLike = {
  evidenceContractVersion: string
  semanticVersionMetadata: AdaptiveEvidenceSemanticVersionMetadata
  reducerSemanticMetadata: AdaptiveEvidenceReducerSemanticMetadata
  evidenceGenerationMetadata: AdaptiveEvidenceGenerationMetadata
}

export function assessAdaptiveEvidenceCompatibility(input: ContractLike): AdaptiveEvidenceCompatibilityAssessment {
  if (input.evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION) {
    return {
      classification: 'PARTIALLY_COMPATIBLE',
      reasonCodes: ['legacy_unversioned_contract'],
      warnings: [
        'Evidence predates explicit contract versioning.',
        'Longitudinal comparisons require version-aware interpretation.',
      ],
      longitudinalComparisonSafe: false,
      replayInterpretationSafe: true,
      governanceInterpretationSafe: true,
      requiresVersionAwareInterpretation: true,
    }
  }

  const reasons: string[] = []
  const currentContractMajor = parseMajor(CURRENT_ADAPTIVE_EVIDENCE_CONTRACT_VERSION.split('/')[1] ?? '')
  const recordContractMajor = parseMajor(input.evidenceContractVersion.split('/')[1] ?? '')
  if (currentContractMajor !== null && recordContractMajor !== null && currentContractMajor !== recordContractMajor) {
    reasons.push('contract_major_mismatch')
  }

  if (input.semanticVersionMetadata.contractFamily !== CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.contractFamily) {
    reasons.push('contract_family_mismatch')
  }

  if (parseMajor(input.semanticVersionMetadata.scoringSemanticsVersion) !== parseMajor(CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.scoringSemanticsVersion)) {
    reasons.push('scoring_semantics_major_mismatch')
  }
  if (parseMajor(input.semanticVersionMetadata.replaySemanticsVersion) !== parseMajor(CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.replaySemanticsVersion)) {
    reasons.push('replay_semantics_major_mismatch')
  }
  if (parseMajor(input.semanticVersionMetadata.equilibriumSemanticsVersion) !== parseMajor(CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA.equilibriumSemanticsVersion)) {
    reasons.push('equilibrium_semantics_major_mismatch')
  }

  const semanticallyEqual = JSON.stringify(input.semanticVersionMetadata) === JSON.stringify(CURRENT_ADAPTIVE_EVIDENCE_SEMANTIC_VERSION_METADATA)
    && JSON.stringify(input.reducerSemanticMetadata) === JSON.stringify(CURRENT_ADAPTIVE_EVIDENCE_REDUCER_SEMANTIC_METADATA)
    && input.evidenceGenerationMetadata.analysisMode === CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA.analysisMode
    && input.evidenceGenerationMetadata.replayInterpretationMode === CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA.replayInterpretationMode
    && input.evidenceGenerationMetadata.governanceSurface === CURRENT_ADAPTIVE_EVIDENCE_GENERATION_METADATA.governanceSurface

  if (reasons.length > 0) {
    return {
      classification: 'INCOMPATIBLE',
      reasonCodes: reasons,
      warnings: ['Evidence semantics are not directly comparable with the current contract.'],
      longitudinalComparisonSafe: false,
      replayInterpretationSafe: !reasons.includes('replay_semantics_major_mismatch'),
      governanceInterpretationSafe: false,
      requiresVersionAwareInterpretation: true,
    }
  }

  if (semanticallyEqual) {
    return {
      classification: 'FULLY_COMPATIBLE',
      reasonCodes: [],
      warnings: [],
      longitudinalComparisonSafe: true,
      replayInterpretationSafe: true,
      governanceInterpretationSafe: true,
      requiresVersionAwareInterpretation: false,
    }
  }

  return {
    classification: 'PARTIALLY_COMPATIBLE',
    reasonCodes: ['semantic_version_delta'],
    warnings: ['Evidence semantics differ from the current contract, but remain interpretable with explicit caveats.'],
    longitudinalComparisonSafe: false,
    replayInterpretationSafe: true,
    governanceInterpretationSafe: true,
    requiresVersionAwareInterpretation: true,
  }
}

export function buildAdaptiveEvidenceCompatibilitySummary(events: Array<ContractLike>): AdaptiveEvidenceCompatibilitySummary {
  const counts = new Map<string, {
    count: number
    classification: AdaptiveEvidenceCompatibilityClassification
  }>()
  let highestRiskClassification: AdaptiveEvidenceCompatibilityClassification = 'FULLY_COMPATIBLE'
  let longitudinalComparisonSafe = true
  let replayInterpretationSafe = true
  let governanceInterpretationSafe = true
  let requiresVersionAwareInterpretation = false
  const warnings = new Set<string>()

  for (const event of events) {
    const compatibility = assessAdaptiveEvidenceCompatibility(event)
    const existing = counts.get(event.evidenceContractVersion)
    counts.set(event.evidenceContractVersion, {
      count: (existing?.count ?? 0) + 1,
      classification: compatibility.classification,
    })

    if (compatibility.classification === 'INCOMPATIBLE') {
      highestRiskClassification = 'INCOMPATIBLE'
    } else if (compatibility.classification === 'PARTIALLY_COMPATIBLE' && highestRiskClassification === 'FULLY_COMPATIBLE') {
      highestRiskClassification = 'PARTIALLY_COMPATIBLE'
    }

    longitudinalComparisonSafe = longitudinalComparisonSafe && compatibility.longitudinalComparisonSafe
    replayInterpretationSafe = replayInterpretationSafe && compatibility.replayInterpretationSafe
    governanceInterpretationSafe = governanceInterpretationSafe && compatibility.governanceInterpretationSafe
    requiresVersionAwareInterpretation = requiresVersionAwareInterpretation || compatibility.requiresVersionAwareInterpretation
    for (const warning of compatibility.warnings) {
      warnings.add(warning)
    }
  }

  return {
    currentEvidenceContractVersion: CURRENT_ADAPTIVE_EVIDENCE_CONTRACT_VERSION,
    highestRiskClassification,
    longitudinalComparisonSafe,
    replayInterpretationSafe,
    governanceInterpretationSafe,
    requiresVersionAwareInterpretation,
    warnings: Array.from(warnings),
    versions: Array.from(counts.entries())
      .map(([evidenceContractVersion, value]) => ({
        evidenceContractVersion,
        count: value.count,
        classification: value.classification,
      }))
      .sort((left, right) => left.evidenceContractVersion.localeCompare(right.evidenceContractVersion)),
  }
}

export function parseAdaptiveEvidenceJsonRecord<T extends Record<string, unknown>>(raw: string | null | undefined): Partial<T> | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed as Partial<T> : null
  } catch {
    return null
  }
}
