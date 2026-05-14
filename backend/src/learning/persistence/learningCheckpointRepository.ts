import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'

export type LearningCheckpointRecord = {
  checkpointId: string
  runtimeName: string
  lastProcessedAttributionId: string | null
  lastProcessedAttributedAt: string | null
  checkpointVersion?: number
  lineageKey?: string | null
  lineageMetadataJson?: string | null
  checkpointPayloadJson?: string | null
  continuityFingerprint?: string | null
  checkpointAttestationState?: string | null
  attestationLineageHash?: string | null
  replayVerificationMetadataJson?: string | null
  updatedAt: string
}

export type UpsertLearningCheckpointInput = Omit<LearningCheckpointRecord, 'checkpointId'> & {
  checkpointId?: string
}

type LearningCheckpointRow = {
  checkpoint_id: string
  runtime_name: string
  last_processed_attribution_id: string | null
  last_processed_attributed_at: string | null
  checkpoint_version: number | null
  lineage_key: string | null
  lineage_metadata_json: string | null
  checkpoint_payload_json: string | null
  continuity_fingerprint: string | null
  checkpoint_attestation_state: string | null
  attestation_lineage_hash: string | null
  replay_verification_metadata_json: string | null
  updated_at: string
}

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildLearningCheckpointId(runtimeName: string) {
  return [
    'learning-checkpoint',
    normalizeIdentifierPart(runtimeName).slice(0, 64) || 'runtime',
  ].join(':').slice(0, 128)
}

function mapRow(row?: LearningCheckpointRow): LearningCheckpointRecord | null {
  if (!row) {
    return null
  }

  return {
    checkpointId: row.checkpoint_id,
    runtimeName: row.runtime_name,
    lastProcessedAttributionId: row.last_processed_attribution_id,
    lastProcessedAttributedAt: row.last_processed_attributed_at,
    checkpointVersion: row.checkpoint_version ?? 1,
    lineageKey: row.lineage_key,
    lineageMetadataJson: row.lineage_metadata_json,
    checkpointPayloadJson: row.checkpoint_payload_json,
    continuityFingerprint: row.continuity_fingerprint,
    checkpointAttestationState: row.checkpoint_attestation_state,
    attestationLineageHash: row.attestation_lineage_hash,
    replayVerificationMetadataJson: row.replay_verification_metadata_json,
    updatedAt: row.updated_at,
  }
}

export class LearningCheckpointRepository {
  constructor(private readonly db: BackendDatabase) {}

  async upsertCheckpoint(input: UpsertLearningCheckpointInput): Promise<LearningCheckpointRecord> {
    const checkpointId = input.checkpointId ?? buildLearningCheckpointId(input.runtimeName)

    traceMutation({
      source: 'backend/src/learning/persistence/learningCheckpointRepository.ts#upsertCheckpoint',
      type: 'portfolio',
      targetId: checkpointId,
      whatChanged: 'upsert economic feedback learning checkpoint',
    })

    await this.db.run(
      `
        INSERT INTO flowmind_learning_checkpoint (
          checkpoint_id,
          runtime_name,
          last_processed_attribution_id,
          last_processed_attributed_at,
          checkpoint_version,
          lineage_key,
          lineage_metadata_json,
          checkpoint_payload_json,
          continuity_fingerprint,
          checkpoint_attestation_state,
          attestation_lineage_hash,
          replay_verification_metadata_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(checkpoint_id) DO UPDATE SET
          runtime_name = excluded.runtime_name,
          last_processed_attribution_id = excluded.last_processed_attribution_id,
          last_processed_attributed_at = excluded.last_processed_attributed_at,
          checkpoint_version = excluded.checkpoint_version,
          lineage_key = excluded.lineage_key,
          lineage_metadata_json = excluded.lineage_metadata_json,
          checkpoint_payload_json = excluded.checkpoint_payload_json,
          continuity_fingerprint = excluded.continuity_fingerprint,
          checkpoint_attestation_state = excluded.checkpoint_attestation_state,
          attestation_lineage_hash = excluded.attestation_lineage_hash,
          replay_verification_metadata_json = excluded.replay_verification_metadata_json,
          updated_at = excluded.updated_at
      `,
      checkpointId,
      input.runtimeName,
      input.lastProcessedAttributionId,
      input.lastProcessedAttributedAt,
      input.checkpointVersion ?? 1,
      input.lineageKey ?? null,
      input.lineageMetadataJson ?? null,
      input.checkpointPayloadJson ?? null,
      input.continuityFingerprint ?? null,
      input.checkpointAttestationState ?? null,
      input.attestationLineageHash ?? null,
      input.replayVerificationMetadataJson ?? null,
      input.updatedAt,
    )

    const record = await this.getCheckpointByRuntimeName(input.runtimeName)
    if (!record) {
      throw new Error(`Failed to upsert learning checkpoint for runtime ${input.runtimeName}.`)
    }

    return record
  }

  async getCheckpointByRuntimeName(runtimeName: string): Promise<LearningCheckpointRecord | null> {
    const row = await this.db.get<LearningCheckpointRow>(
      `
        SELECT *
        FROM flowmind_learning_checkpoint
        WHERE runtime_name = ?
        LIMIT 1
      `,
      runtimeName,
    )

    return mapRow(row)
  }
}

export function createLearningCheckpointRepository(db: BackendDatabase) {
  return new LearningCheckpointRepository(db)
}
