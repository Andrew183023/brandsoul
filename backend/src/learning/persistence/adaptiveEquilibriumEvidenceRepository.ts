import type { BackendDatabase } from '../../db/index.js'
import { getMutationAuthorityContext, traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  buildAdaptiveEquilibriumEvidenceId,
  type AdaptiveHeatmapSnapshot,
  type AdaptiveEquilibriumEvidenceEvent,
  type AdaptiveEquilibriumGovernanceClassification,
  type AppendAdaptiveEquilibriumEvidenceInput,
} from './AdaptiveEquilibriumEvidenceEvent.js'
import {
  buildCurrentAdaptiveEvidenceContractMetadata,
  parseAdaptiveEvidenceJsonRecord,
  resolveAdaptiveEvidenceContractVersion,
  resolveAdaptiveEvidenceGenerationMetadata,
  resolveAdaptiveEvidenceReducerSemanticMetadata,
  resolveAdaptiveEvidenceSemanticVersionMetadata,
} from './adaptiveEvidenceContract.js'

type AdaptiveEquilibriumEvidenceRow = {
  evidence_id: string
  evidence_type: 'adaptive_equilibrium_evidence'
  replay_consistency_equilibrium: number
  reinforcement_escalation_persistence: number
  saturation_equilibrium: number
  oscillation_damping: number
  projection_stability_convergence: number
  ranking_diversity_preservation: number
  entropy_evolution: number
  projection_lock_in_persistence: number
  low_confidence_amplification_persistence: number
  replay_degradation_persistence: number
  governance_classification: AdaptiveEquilibriumGovernanceClassification
  recommendation: 'do_not_rollout'
  sustained_equilibrium_evidence: number
  replay_fingerprint: string
  heatmap_snapshot_json: string
  evidence_contract_version: string | null
  semantic_version_metadata_json: string | null
  reducer_semantic_metadata_json: string | null
  evidence_generation_metadata_json: string | null
  generated_at: string
  recorded_at: string
}

export type AppendAdaptiveEquilibriumEvidenceResult = {
  evidence: AdaptiveEquilibriumEvidenceEvent
  inserted: boolean
}

function normalizeUnitMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  const bounded = Math.min(Math.max(value, 0), 1)
  return Number(bounded.toFixed(6))
}

function normalizeHeatmapSnapshot(snapshot: AdaptiveHeatmapSnapshot | null | undefined) {
  if (!snapshot) {
    return null
  }

  return JSON.parse(JSON.stringify(snapshot)) as AdaptiveHeatmapSnapshot
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidHeatmapSnapshot(value: unknown): value is AdaptiveHeatmapSnapshot {
  if (!isRecord(value)) {
    return false
  }

  return Array.isArray(value.category)
    && Array.isArray(value.entity)
    && Array.isArray(value.adaptiveScope)
    && Array.isArray(value.rankingDistribution)
    && isRecord(value.replayDivergence)
    && isRecord(value.summary)
}

function parseHeatmapSnapshot(raw: string | null | undefined) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isValidHeatmapSnapshot(parsed)) {
      return null
    }

    return normalizeHeatmapSnapshot(parsed)
  } catch {
    return null
  }
}

function mapRow(row?: AdaptiveEquilibriumEvidenceRow): AdaptiveEquilibriumEvidenceEvent | null {
  if (!row) {
    return null
  }

  return {
    evidenceContractVersion: resolveAdaptiveEvidenceContractVersion(row.evidence_contract_version),
    evidenceId: row.evidence_id,
    evidenceType: row.evidence_type,
    replayConsistencyEquilibrium: normalizeUnitMetric(Number(row.replay_consistency_equilibrium)),
    reinforcementEscalationPersistence: normalizeUnitMetric(Number(row.reinforcement_escalation_persistence)),
    saturationEquilibrium: normalizeUnitMetric(Number(row.saturation_equilibrium)),
    oscillationDamping: normalizeUnitMetric(Number(row.oscillation_damping)),
    projectionStabilityConvergence: normalizeUnitMetric(Number(row.projection_stability_convergence)),
    rankingDiversityPreservation: normalizeUnitMetric(Number(row.ranking_diversity_preservation)),
    entropyEvolution: normalizeUnitMetric(Number(row.entropy_evolution)),
    projectionLockInPersistence: normalizeUnitMetric(Number(row.projection_lock_in_persistence)),
    lowConfidenceAmplificationPersistence: normalizeUnitMetric(Number(row.low_confidence_amplification_persistence)),
    replayDegradationPersistence: normalizeUnitMetric(Number(row.replay_degradation_persistence)),
    governanceClassification: row.governance_classification,
    recommendation: row.recommendation,
    sustainedEquilibriumEvidence: Boolean(row.sustained_equilibrium_evidence),
    replayFingerprint: row.replay_fingerprint,
    generatedAt: row.generated_at,
    heatmapSnapshot: parseHeatmapSnapshot(row.heatmap_snapshot_json),
    semanticVersionMetadata: resolveAdaptiveEvidenceSemanticVersionMetadata(
      parseAdaptiveEvidenceJsonRecord(row.semantic_version_metadata_json),
      resolveAdaptiveEvidenceContractVersion(row.evidence_contract_version),
    ),
    reducerSemanticMetadata: resolveAdaptiveEvidenceReducerSemanticMetadata(
      parseAdaptiveEvidenceJsonRecord(row.reducer_semantic_metadata_json),
      resolveAdaptiveEvidenceContractVersion(row.evidence_contract_version),
    ),
    evidenceGenerationMetadata: resolveAdaptiveEvidenceGenerationMetadata(
      parseAdaptiveEvidenceJsonRecord(row.evidence_generation_metadata_json),
      resolveAdaptiveEvidenceContractVersion(row.evidence_contract_version),
    ),
  }
}

export class AdaptiveEquilibriumEvidenceRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendEvidence(input: AppendAdaptiveEquilibriumEvidenceInput): Promise<AppendAdaptiveEquilibriumEvidenceResult> {
    const currentContractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
    const evidenceId = input.evidenceId ?? buildAdaptiveEquilibriumEvidenceId(input)
    const evidenceType = input.evidenceType ?? 'adaptive_equilibrium_evidence'
    const recordedAt = new Date().toISOString()
    const evidenceContractVersion = input.evidenceContractVersion ?? currentContractMetadata.evidenceContractVersion
    const semanticVersionMetadata = resolveAdaptiveEvidenceSemanticVersionMetadata(
      input.semanticVersionMetadata,
      evidenceContractVersion,
    )
    const reducerSemanticMetadata = resolveAdaptiveEvidenceReducerSemanticMetadata(
      input.reducerSemanticMetadata,
      evidenceContractVersion,
    )
    const evidenceGenerationMetadata = resolveAdaptiveEvidenceGenerationMetadata(
      input.evidenceGenerationMetadata,
      evidenceContractVersion,
    )
    const authorityContext = getMutationAuthorityContext()
    const enrichedEvidenceGenerationMetadata = {
      ...evidenceGenerationMetadata,
      sovereignAppendAudit: {
        authoritySource: authorityContext?.source ?? 'unknown_authority_source',
        viaExecutor: authorityContext?.viaExecutor === true,
        traceEnforced: true as const,
      },
    }

    traceMutation({
      source: 'backend/src/learning/persistence/adaptiveEquilibriumEvidenceRepository.ts#appendEvidence',
      type: 'portfolio',
      targetId: evidenceId,
      whatChanged: 'append adaptive equilibrium evidence event',
    })

    const insertResult = await this.db.run(
      `
        INSERT INTO flowmind_adaptive_equilibrium_evidence (
          evidence_id,
          evidence_type,
          replay_consistency_equilibrium,
          reinforcement_escalation_persistence,
          saturation_equilibrium,
          oscillation_damping,
          projection_stability_convergence,
          ranking_diversity_preservation,
          entropy_evolution,
          projection_lock_in_persistence,
          low_confidence_amplification_persistence,
          replay_degradation_persistence,
          governance_classification,
          recommendation,
          sustained_equilibrium_evidence,
          replay_fingerprint,
          heatmap_snapshot_json,
          evidence_contract_version,
          semantic_version_metadata_json,
          reducer_semantic_metadata_json,
          evidence_generation_metadata_json,
          generated_at,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(evidence_id) DO NOTHING
      `,
      evidenceId,
      evidenceType,
      normalizeUnitMetric(input.replayConsistencyEquilibrium),
      normalizeUnitMetric(input.reinforcementEscalationPersistence),
      normalizeUnitMetric(input.saturationEquilibrium),
      normalizeUnitMetric(input.oscillationDamping),
      normalizeUnitMetric(input.projectionStabilityConvergence),
      normalizeUnitMetric(input.rankingDiversityPreservation),
      normalizeUnitMetric(input.entropyEvolution),
      normalizeUnitMetric(input.projectionLockInPersistence),
      normalizeUnitMetric(input.lowConfidenceAmplificationPersistence),
      normalizeUnitMetric(input.replayDegradationPersistence),
      input.governanceClassification,
      'do_not_rollout',
      input.sustainedEquilibriumEvidence ? 1 : 0,
      input.replayFingerprint,
      JSON.stringify(normalizeHeatmapSnapshot(input.heatmapSnapshot) ?? {}),
      evidenceContractVersion,
      JSON.stringify(semanticVersionMetadata),
      JSON.stringify(reducerSemanticMetadata),
      JSON.stringify(enrichedEvidenceGenerationMetadata),
      input.generatedAt,
      recordedAt,
    )

    const evidence = await this.getEvidenceById(evidenceId)
    if (!evidence) {
      throw new Error(`Failed to append adaptive equilibrium evidence ${evidenceId}.`)
    }

    return {
      evidence,
      inserted: (insertResult.changes ?? 0) > 0,
    }
  }

  async getEvidenceById(evidenceId: string): Promise<AdaptiveEquilibriumEvidenceEvent | null> {
    const row = await this.db.get<AdaptiveEquilibriumEvidenceRow>(
      `
        SELECT *
        FROM flowmind_adaptive_equilibrium_evidence
        WHERE evidence_id = ?
        LIMIT 1
      `,
      evidenceId,
    )

    return mapRow(row)
  }

  async countEvidence(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM flowmind_adaptive_equilibrium_evidence
      `,
    )

    return Math.max(0, Number(row?.count ?? 0))
  }

  async listEvidencePaginated(args: {
    limit?: number
    offset?: number
  } = {}): Promise<AdaptiveEquilibriumEvidenceEvent[]> {
    const limit = Math.max(1, Math.min(500, Math.trunc(args.limit ?? 50)))
    const offset = Math.max(0, Math.trunc(args.offset ?? 0))

    const rows = await this.db.all<AdaptiveEquilibriumEvidenceRow[]>(
      `
        SELECT *
        FROM flowmind_adaptive_equilibrium_evidence
        ORDER BY generated_at DESC, evidence_id DESC
        LIMIT ?
        OFFSET ?
      `,
      limit,
      offset,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is AdaptiveEquilibriumEvidenceEvent => row !== null)
  }

  async listEvidenceChronological(args: {
    limit?: number
  } = {}): Promise<AdaptiveEquilibriumEvidenceEvent[]> {
    const limit = Math.max(1, Math.min(10_000, Math.trunc(args.limit ?? 720)))
    const rows = await this.db.all<AdaptiveEquilibriumEvidenceRow[]>(
      `
        SELECT *
        FROM flowmind_adaptive_equilibrium_evidence
        ORDER BY generated_at ASC, evidence_id ASC
        LIMIT ?
      `,
      limit,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is AdaptiveEquilibriumEvidenceEvent => row !== null)
  }
}

export function createAdaptiveEquilibriumEvidenceRepository(db: BackendDatabase) {
  return new AdaptiveEquilibriumEvidenceRepository(db)
}
