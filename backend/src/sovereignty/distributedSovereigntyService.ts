import { createHash, randomUUID } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ObservabilityService } from '../services/observabilityService.js'

export type SovereignNodeClass =
  | 'primary'
  | 'secondary'
  | 'observer'
  | 'replay'
  | 'recovery'

export type SovereignNodeIdentity = {
  nodeId: string
  nodeClass: SovereignNodeClass
  institutionalPlaneId: string
  lineagePlaneId: string
  replayPlaneId: string
  authorityPlaneId: string
  persistencePlaneId: string
  nodeEpoch: string
  startupAttestationHash: string
  registeredAt: string
}

export type DistributedLineageRecord = {
  lineageId: string
  originatingNodeId: string
  continuityEpoch: string
  replayFingerprint?: string
  mutationLineageHash?: string
  semanticLineageHash?: string
  attestationLineageHash?: string
  distributedSequence: number
  distributedClockHash: string
  createdAt: string
}

export type SovereignQuorumHealth =
  | 'healthy'
  | 'degraded'
  | 'split_brain_risk'
  | 'unsafe'

export type SovereignQuorumContinuityState =
  | 'verified'
  | 'partial'
  | 'unsafe'

export type SovereignConsensusMode =
  | 'single_writer'
  | 'advisory'
  | 'shadow'
  | 'disabled'

export type SovereignQuorumState = {
  quorumId: string
  participatingNodes: string[]
  activeNodes: string[]
  quorumHealth: SovereignQuorumHealth
  quorumContinuityState: SovereignQuorumContinuityState
  consensusMode: SovereignConsensusMode
  createdAt: string
}

export type DistributedAttestationPlane =
  | 'replay'
  | 'continuity'
  | 'recovery'
  | 'governance'
  | 'semantic'

export type DistributedAttestation = {
  attestationId: string
  nodeId: string
  attestationPlane: DistributedAttestationPlane
  lineageHash: string
  continuityEpoch: string
  distributedClockHash: string
  attestedAt: string
}

export type ReplayFederationState = {
  federationState: 'uninitialized' | 'export_ready' | 'import_ready' | 'synchronized' | 'divergent'
  exportCount: number
  importCount: number
  continuityVerified: boolean
  lastExportedAt: string | null
  lastImportedAt: string | null
  synchronizedReplayPlanes: string[]
  replayPlaneSynchronizationMetadata: {
    lastEventType: 'export' | 'import' | null
    latestContinuityEpoch: string | null
    latestReplayFingerprint: string | null
    lineageIntegrityHash: string | null
  }
}

export type DistributedContinuityRiskState = {
  riskLevel: 'none' | 'caution' | 'high'
  lineageForkDetected: boolean
  distributedReplayDivergenceDetected: boolean
  quorumDisagreementDetected: boolean
  continuityEpochMismatchDetected: boolean
  duplicateAuthorityPlaneDetected: boolean
  distributedAttestationConflictDetected: boolean
  warnings: string[]
  detectedAt: string
}

export type DistributedRecoveryMetadataState = {
  recoveryFoundationState: 'metadata_only' | 'coordinating' | 'observed'
  totalRecoveryEpochs: number
  activeRecoveryNodes: string[]
  latestRecoveryEpoch: string | null
  latestRecoveryState: string | null
  replayRestorationMarkers: string[]
}

export type DistributedContinuityState = {
  continuityFederationState: 'verified' | 'partial' | 'unsafe'
  activeContinuityEpochs: string[]
  attestedEpochs: string[]
  lineageMonotonic: boolean
  attestationLineagePreserved: boolean
  duplicateAuthorityPlaneDetected: boolean
}

export type DistributedSovereigntyStatus = {
  distributedSovereigntyState: {
    distributedFoundation: true
    consensusImplemented: false
    failoverImplemented: false
    splitBrainResolutionImplemented: false
    consensusMode: SovereignConsensusMode
    nodeCount: number
    lastDistributedSequence: number
  }
  nodeRegistryState: {
    totalNodes: number
    nodes: SovereignNodeIdentity[]
  }
  quorumState: SovereignQuorumState
  distributedContinuityState: DistributedContinuityState
  replayFederationState: ReplayFederationState
  splitBrainRiskState: DistributedContinuityRiskState
  distributedRecoveryState: DistributedRecoveryMetadataState
  distributedLineageIntegrity: 'verified' | 'non_monotonic' | 'fork_detected'
}

type ReplayFederationEventType = 'export' | 'import'

type DistributedReplayFederationEvent = {
  federationEventId: string
  nodeId: string
  sourceNodeId: string | null
  eventType: ReplayFederationEventType
  continuityEpoch: string
  replayFingerprint: string | null
  lineageIds: string[]
  planeSyncMetadata: Record<string, unknown>
  continuityVerified: boolean
  distributedClockHash: string
  createdAt: string
}

type DistributedRecoveryEpochRecord = {
  recoveryEpochId: string
  nodeId: string
  recoveryEpoch: string
  continuityEpoch: string
  recoveryState: string
  federatedCoordinationState: 'metadata_only' | 'coordinating' | 'observed'
  replayRestorationMarker: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

type DistributedSovereigntyServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  now?: () => string
  consensusMode?: SovereignConsensusMode
  defaultNodeIdentity?: Partial<Omit<SovereignNodeIdentity, 'startupAttestationHash' | 'registeredAt'>>
}

type RegisterNodeInput = Partial<Omit<SovereignNodeIdentity, 'startupAttestationHash'>> & {
  registeredAt?: string
}

type AppendDistributedLineageInput = {
  lineageId?: string
  originatingNodeId: string
  continuityEpoch: string
  replayFingerprint?: string
  mutationLineageHash?: string
  semanticLineageHash?: string
  attestationLineageHash?: string
  createdAt?: string
}

type PersistDistributedAttestationInput = {
  attestationId?: string
  nodeId: string
  attestationPlane: DistributedAttestationPlane
  lineageHash: string
  continuityEpoch: string
  attestedAt?: string
}

type ReplayLineageExportInput = {
  nodeId: string
  continuityEpoch: string
  replayFingerprint?: string
  createdAt?: string
  federationEventId?: string
}

type ReplayLineageImportInput = {
  nodeId: string
  sourceNodeId: string
  continuityEpoch: string
  lineageIds: string[]
  replayFingerprint?: string
  createdAt?: string
  federationEventId?: string
}

type RecordDistributedRecoveryEpochInput = {
  recoveryEpochId?: string
  nodeId: string
  recoveryEpoch: string
  continuityEpoch: string
  recoveryState: string
  federatedCoordinationState: 'metadata_only' | 'coordinating' | 'observed'
  replayRestorationMarker?: string
  metadata?: Record<string, unknown>
  createdAt?: string
}

type SovereignNodeRow = {
  node_id: string
  node_class: SovereignNodeClass
  institutional_plane_id: string
  lineage_plane_id: string
  replay_plane_id: string
  authority_plane_id: string
  persistence_plane_id: string
  node_epoch: string
  startup_attestation_hash: string
  registered_at: string
}

type DistributedLineageRow = {
  lineage_id: string
  originating_node_id: string
  continuity_epoch: string
  replay_fingerprint: string | null
  mutation_lineage_hash: string | null
  semantic_lineage_hash: string | null
  attestation_lineage_hash: string | null
  distributed_sequence: number
  distributed_clock_hash: string
  created_at: string
}

type DistributedAttestationRow = {
  attestation_id: string
  node_id: string
  attestation_plane: DistributedAttestationPlane
  lineage_hash: string
  continuity_epoch: string
  distributed_clock_hash: string
  attested_at: string
}

type ReplayFederationRow = {
  federation_event_id: string
  node_id: string
  source_node_id: string | null
  event_type: ReplayFederationEventType
  continuity_epoch: string
  replay_fingerprint: string | null
  lineage_ids_json: string
  plane_sync_metadata_json: string
  continuity_verified: number
  distributed_clock_hash: string
  created_at: string
}

type DistributedRecoveryRow = {
  recovery_epoch_id: string
  node_id: string
  recovery_epoch: string
  continuity_epoch: string
  recovery_state: string
  federated_coordination_state: 'metadata_only' | 'coordinating' | 'observed'
  replay_restoration_marker: string | null
  metadata_json: string
  created_at: string
}

let installedDistributedSovereigntyService: DistributedSovereigntyService | null = null

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`
}

function hashValue(value: unknown) {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right))
}

function mapNodeRow(row: SovereignNodeRow): SovereignNodeIdentity {
  return {
    nodeId: row.node_id,
    nodeClass: row.node_class,
    institutionalPlaneId: row.institutional_plane_id,
    lineagePlaneId: row.lineage_plane_id,
    replayPlaneId: row.replay_plane_id,
    authorityPlaneId: row.authority_plane_id,
    persistencePlaneId: row.persistence_plane_id,
    nodeEpoch: row.node_epoch,
    startupAttestationHash: row.startup_attestation_hash,
    registeredAt: row.registered_at,
  }
}

function mapLineageRow(row: DistributedLineageRow): DistributedLineageRecord {
  return {
    lineageId: row.lineage_id,
    originatingNodeId: row.originating_node_id,
    continuityEpoch: row.continuity_epoch,
    replayFingerprint: row.replay_fingerprint ?? undefined,
    mutationLineageHash: row.mutation_lineage_hash ?? undefined,
    semanticLineageHash: row.semantic_lineage_hash ?? undefined,
    attestationLineageHash: row.attestation_lineage_hash ?? undefined,
    distributedSequence: row.distributed_sequence,
    distributedClockHash: row.distributed_clock_hash,
    createdAt: row.created_at,
  }
}

function mapAttestationRow(row: DistributedAttestationRow): DistributedAttestation {
  return {
    attestationId: row.attestation_id,
    nodeId: row.node_id,
    attestationPlane: row.attestation_plane,
    lineageHash: row.lineage_hash,
    continuityEpoch: row.continuity_epoch,
    distributedClockHash: row.distributed_clock_hash,
    attestedAt: row.attested_at,
  }
}

function sortLineages(records: DistributedLineageRecord[]) {
  return [...records].sort((left, right) => {
    if (left.distributedSequence !== right.distributedSequence) {
      return left.distributedSequence - right.distributedSequence
    }

    const byCreatedAt = left.createdAt.localeCompare(right.createdAt)
    if (byCreatedAt !== 0) {
      return byCreatedAt
    }

    return left.lineageId.localeCompare(right.lineageId)
  })
}

function buildDistributedClockHash(args: {
  distributedSequence: number
  continuityEpoch: string
  replayFingerprint?: string
  lineageHash?: string
  attestationPlane?: DistributedAttestationPlane
  nodeId?: string
}) {
  return hashValue({
    distributedSequence: args.distributedSequence,
    continuityEpoch: args.continuityEpoch,
    replayFingerprint: args.replayFingerprint ?? null,
    lineageHash: args.lineageHash ?? null,
    attestationPlane: args.attestationPlane ?? null,
    nodeId: args.nodeId ?? null,
  })
}

function buildLineageIntegrity(records: DistributedLineageRecord[]) {
  if (records.length === 0) {
    return 'verified' as const
  }

  const sorted = sortLineages(records)
  let expected = sorted[0]?.distributedSequence ?? 0
  for (const record of sorted) {
    if (record.distributedSequence !== expected) {
      return 'non_monotonic' as const
    }
    expected += 1
  }

  const mutationForks = new Map<string, Set<string>>()
  for (const record of records) {
    if (!record.mutationLineageHash) {
      continue
    }

    const signatures = mutationForks.get(record.mutationLineageHash) ?? new Set<string>()
    signatures.add([
      record.semanticLineageHash ?? '',
      record.attestationLineageHash ?? '',
      record.replayFingerprint ?? '',
    ].join(':'))
    mutationForks.set(record.mutationLineageHash, signatures)
  }

  for (const signatures of mutationForks.values()) {
    if (signatures.size > 1) {
      return 'fork_detected' as const
    }
  }

  return 'verified' as const
}

export class DistributedSovereigntyService {
  private readonly now: () => string

  constructor(private readonly options: DistributedSovereigntyServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  buildSovereignNodeIdentity(input: RegisterNodeInput = {}): SovereignNodeIdentity {
    const registeredAt = input.registeredAt ?? this.now()
    const defaults = this.options.defaultNodeIdentity ?? {}
    const nodeClass = input.nodeClass ?? defaults.nodeClass ?? 'primary'
    const institutionalPlaneId = input.institutionalPlaneId ?? defaults.institutionalPlaneId ?? 'institutional-plane:singleton'
    const lineagePlaneId = input.lineagePlaneId ?? defaults.lineagePlaneId ?? 'lineage-plane:singleton'
    const replayPlaneId = input.replayPlaneId ?? defaults.replayPlaneId ?? 'replay-plane:singleton'
    const authorityPlaneId = input.authorityPlaneId ?? defaults.authorityPlaneId ?? 'authority-plane:single-writer'
    const persistencePlaneId = input.persistencePlaneId ?? defaults.persistencePlaneId ?? 'persistence-plane:single-writer'
    const nodeEpoch = input.nodeEpoch ?? defaults.nodeEpoch ?? `node-epoch:${registeredAt}`
    const nodeId = input.nodeId ?? defaults.nodeId ?? `node:${hashValue({
      nodeClass,
      institutionalPlaneId,
      lineagePlaneId,
      replayPlaneId,
      authorityPlaneId,
      persistencePlaneId,
    }).slice(0, 24)}`
    const startupAttestationHash = hashValue({
      nodeId,
      nodeClass,
      institutionalPlaneId,
      lineagePlaneId,
      replayPlaneId,
      authorityPlaneId,
      persistencePlaneId,
      nodeEpoch,
      registeredAt,
    })

    return {
      nodeId,
      nodeClass,
      institutionalPlaneId,
      lineagePlaneId,
      replayPlaneId,
      authorityPlaneId,
      persistencePlaneId,
      nodeEpoch,
      startupAttestationHash,
      registeredAt,
    }
  }

  async registerNode(input: RegisterNodeInput = {}): Promise<SovereignNodeIdentity> {
    const identity = this.buildSovereignNodeIdentity(input)

    await this.options.db.run(
      `
        INSERT INTO flowmind_sovereign_node (
          node_id,
          node_class,
          institutional_plane_id,
          lineage_plane_id,
          replay_plane_id,
          authority_plane_id,
          persistence_plane_id,
          node_epoch,
          startup_attestation_hash,
          registered_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
          node_class = excluded.node_class,
          institutional_plane_id = excluded.institutional_plane_id,
          lineage_plane_id = excluded.lineage_plane_id,
          replay_plane_id = excluded.replay_plane_id,
          authority_plane_id = excluded.authority_plane_id,
          persistence_plane_id = excluded.persistence_plane_id,
          node_epoch = excluded.node_epoch,
          startup_attestation_hash = excluded.startup_attestation_hash,
          registered_at = excluded.registered_at,
          updated_at = excluded.updated_at
      `,
      identity.nodeId,
      identity.nodeClass,
      identity.institutionalPlaneId,
      identity.lineagePlaneId,
      identity.replayPlaneId,
      identity.authorityPlaneId,
      identity.persistencePlaneId,
      identity.nodeEpoch,
      identity.startupAttestationHash,
      identity.registeredAt,
      identity.registeredAt,
    )

    this.options.observability?.incrementMetric('distributed_sovereign_node_total')
    this.options.logger?.info({
      event: 'sovereign node registered',
      nodeId: identity.nodeId,
      nodeClass: identity.nodeClass,
      authorityPlaneId: identity.authorityPlaneId,
      institutionalPlaneId: identity.institutionalPlaneId,
    }, 'Sovereign node registered')

    await this.refreshQuorumState(identity.registeredAt)
    return identity
  }

  async appendDistributedLineage(input: AppendDistributedLineageInput): Promise<DistributedLineageRecord> {
    const lineageId = input.lineageId ?? randomUUID()
    const createdAt = input.createdAt ?? this.now()

    const record = await this.options.db.transaction(async (db) => {
      const maxSequenceRow = await db.get<{ max_sequence: number | null }>(
        'SELECT MAX(distributed_sequence) AS max_sequence FROM flowmind_distributed_lineage',
      )
      const distributedSequence = (maxSequenceRow?.max_sequence ?? 0) + 1
      const distributedClockHash = buildDistributedClockHash({
        distributedSequence,
        continuityEpoch: input.continuityEpoch,
        replayFingerprint: input.replayFingerprint,
        lineageHash: input.mutationLineageHash ?? input.attestationLineageHash ?? input.semanticLineageHash,
        nodeId: input.originatingNodeId,
      })

      await db.run(
        `
          INSERT INTO flowmind_distributed_lineage (
            lineage_id,
            originating_node_id,
            continuity_epoch,
            replay_fingerprint,
            mutation_lineage_hash,
            semantic_lineage_hash,
            attestation_lineage_hash,
            distributed_sequence,
            distributed_clock_hash,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        lineageId,
        input.originatingNodeId,
        input.continuityEpoch,
        input.replayFingerprint ?? null,
        input.mutationLineageHash ?? null,
        input.semanticLineageHash ?? null,
        input.attestationLineageHash ?? null,
        distributedSequence,
        distributedClockHash,
        createdAt,
      )

      return {
        lineageId,
        originatingNodeId: input.originatingNodeId,
        continuityEpoch: input.continuityEpoch,
        replayFingerprint: input.replayFingerprint,
        mutationLineageHash: input.mutationLineageHash,
        semanticLineageHash: input.semanticLineageHash,
        attestationLineageHash: input.attestationLineageHash,
        distributedSequence,
        distributedClockHash,
        createdAt,
      } satisfies DistributedLineageRecord
    })

    this.options.observability?.incrementMetric('distributed_lineage_total')
    this.options.logger?.info({
      event: 'distributed lineage appended',
      lineageId: record.lineageId,
      originatingNodeId: record.originatingNodeId,
      distributedSequence: record.distributedSequence,
      continuityEpoch: record.continuityEpoch,
    }, 'Distributed lineage appended')

    await this.refreshQuorumState(record.createdAt)
    return record
  }

  async persistDistributedAttestation(input: PersistDistributedAttestationInput): Promise<DistributedAttestation> {
    const attestationId = input.attestationId ?? randomUUID()
    const attestedAt = input.attestedAt ?? this.now()
    const latestLineage = await this.options.db.get<{ max_sequence: number | null }>(
      `
        SELECT MAX(distributed_sequence) AS max_sequence
        FROM flowmind_distributed_lineage
        WHERE continuity_epoch = ?
      `,
      input.continuityEpoch,
    )
    const distributedClockHash = buildDistributedClockHash({
      distributedSequence: (latestLineage?.max_sequence ?? 0) + 1,
      continuityEpoch: input.continuityEpoch,
      lineageHash: input.lineageHash,
      attestationPlane: input.attestationPlane,
      nodeId: input.nodeId,
    })

    await this.options.db.run(
      `
        INSERT INTO flowmind_distributed_attestation (
          attestation_id,
          node_id,
          attestation_plane,
          lineage_hash,
          continuity_epoch,
          distributed_clock_hash,
          attested_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      attestationId,
      input.nodeId,
      input.attestationPlane,
      input.lineageHash,
      input.continuityEpoch,
      distributedClockHash,
      attestedAt,
    )

    const record: DistributedAttestation = {
      attestationId,
      nodeId: input.nodeId,
      attestationPlane: input.attestationPlane,
      lineageHash: input.lineageHash,
      continuityEpoch: input.continuityEpoch,
      distributedClockHash,
      attestedAt,
    }

    this.options.observability?.incrementMetric('distributed_attestation_total')
    this.options.logger?.info({
      event: 'distributed attestation persisted',
      attestationId: record.attestationId,
      nodeId: record.nodeId,
      attestationPlane: record.attestationPlane,
      continuityEpoch: record.continuityEpoch,
    }, 'Distributed attestation persisted')

    await this.refreshQuorumState(record.attestedAt)
    return record
  }

  async exportReplayLineage(input: ReplayLineageExportInput): Promise<ReplayFederationState> {
    const createdAt = input.createdAt ?? this.now()
    const lineages = await this.listLineagesForFederation(input.continuityEpoch, input.replayFingerprint)
    const metadata = this.buildReplayPlaneSynchronizationMetadata(lineages, input.continuityEpoch, input.replayFingerprint)

    await this.persistReplayFederationEvent({
      federationEventId: input.federationEventId ?? randomUUID(),
      nodeId: input.nodeId,
      sourceNodeId: null,
      eventType: 'export',
      continuityEpoch: input.continuityEpoch,
      replayFingerprint: input.replayFingerprint ?? null,
      lineageIds: lineages.map((lineage) => lineage.lineageId),
      planeSyncMetadata: metadata,
      continuityVerified: true,
      distributedClockHash: buildDistributedClockHash({
        distributedSequence: lineages.at(-1)?.distributedSequence ?? 0,
        continuityEpoch: input.continuityEpoch,
        replayFingerprint: input.replayFingerprint,
        nodeId: input.nodeId,
      }),
      createdAt,
    })

    return this.getReplayFederationState()
  }

  async importReplayLineage(input: ReplayLineageImportInput): Promise<ReplayFederationState> {
    const createdAt = input.createdAt ?? this.now()
    const importedLineages = await this.options.db.all<DistributedLineageRow[]>(
      `
        SELECT lineage_id, originating_node_id, continuity_epoch, replay_fingerprint, mutation_lineage_hash,
               semantic_lineage_hash, attestation_lineage_hash, distributed_sequence, distributed_clock_hash, created_at
        FROM flowmind_distributed_lineage
        WHERE lineage_id IN (${input.lineageIds.map(() => '?').join(', ')})
      `,
      ...input.lineageIds,
    )
    const lineages = importedLineages.map((row) => mapLineageRow(row))
    const continuityVerified = lineages.length === input.lineageIds.length
      && lineages.every((lineage) => lineage.continuityEpoch === input.continuityEpoch)
      && lineages.every((lineage) => input.replayFingerprint ? lineage.replayFingerprint === input.replayFingerprint : true)

    const metadata = this.buildReplayPlaneSynchronizationMetadata(lineages, input.continuityEpoch, input.replayFingerprint)
    await this.persistReplayFederationEvent({
      federationEventId: input.federationEventId ?? randomUUID(),
      nodeId: input.nodeId,
      sourceNodeId: input.sourceNodeId,
      eventType: 'import',
      continuityEpoch: input.continuityEpoch,
      replayFingerprint: input.replayFingerprint ?? null,
      lineageIds: input.lineageIds,
      planeSyncMetadata: metadata,
      continuityVerified,
      distributedClockHash: buildDistributedClockHash({
        distributedSequence: lineages.at(-1)?.distributedSequence ?? 0,
        continuityEpoch: input.continuityEpoch,
        replayFingerprint: input.replayFingerprint,
        nodeId: input.nodeId,
      }),
      createdAt,
    })

    if (!continuityVerified) {
      this.options.observability?.incrementMetric('distributed_replay_divergence_total')
      this.options.logger?.warn({
        event: 'distributed replay divergence detected',
        nodeId: input.nodeId,
        sourceNodeId: input.sourceNodeId,
        continuityEpoch: input.continuityEpoch,
      }, 'Distributed replay divergence detected')
    }

    await this.refreshQuorumState(createdAt)
    return this.getReplayFederationState()
  }

  async recordDistributedRecoveryEpoch(input: RecordDistributedRecoveryEpochInput): Promise<DistributedRecoveryEpochRecord> {
    const createdAt = input.createdAt ?? this.now()
    const record: DistributedRecoveryEpochRecord = {
      recoveryEpochId: input.recoveryEpochId ?? randomUUID(),
      nodeId: input.nodeId,
      recoveryEpoch: input.recoveryEpoch,
      continuityEpoch: input.continuityEpoch,
      recoveryState: input.recoveryState,
      federatedCoordinationState: input.federatedCoordinationState,
      replayRestorationMarker: input.replayRestorationMarker ?? null,
      metadata: input.metadata ?? {},
      createdAt,
    }

    await this.options.db.run(
      `
        INSERT INTO flowmind_distributed_recovery_epoch (
          recovery_epoch_id,
          node_id,
          recovery_epoch,
          continuity_epoch,
          recovery_state,
          federated_coordination_state,
          replay_restoration_marker,
          metadata_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      record.recoveryEpochId,
      record.nodeId,
      record.recoveryEpoch,
      record.continuityEpoch,
      record.recoveryState,
      record.federatedCoordinationState,
      record.replayRestorationMarker,
      JSON.stringify(record.metadata),
      record.createdAt,
    )

    this.options.observability?.incrementMetric('distributed_recovery_epoch_total')
    this.options.logger?.info({
      event: 'distributed recovery epoch created',
      recoveryEpochId: record.recoveryEpochId,
      nodeId: record.nodeId,
      recoveryEpoch: record.recoveryEpoch,
      recoveryState: record.recoveryState,
    }, 'Distributed recovery epoch created')

    await this.refreshQuorumState(createdAt)
    return record
  }

  async getStatus(): Promise<DistributedSovereigntyStatus> {
    const nodes = await this.listNodes()
    const lineages = await this.listDistributedLineages()
    const attestations = await this.listDistributedAttestations()
    const quorumState = await this.getQuorumState()
    const replayFederationState = await this.getReplayFederationState()
    const splitBrainRiskState = await this.getDistributedContinuityRiskState()
    const distributedLineageIntegrity = buildLineageIntegrity(lineages)
    const continuityState = this.buildDistributedContinuityState({
      nodes,
      lineages,
      attestations,
      quorumState,
      splitBrainRiskState,
    })

    return {
      distributedSovereigntyState: {
        distributedFoundation: true,
        consensusImplemented: false,
        failoverImplemented: false,
        splitBrainResolutionImplemented: false,
        consensusMode: this.options.consensusMode ?? 'single_writer',
        nodeCount: nodes.length,
        lastDistributedSequence: lineages.at(-1)?.distributedSequence ?? 0,
      },
      nodeRegistryState: {
        totalNodes: nodes.length,
        nodes,
      },
      quorumState,
      distributedContinuityState: continuityState,
      replayFederationState,
      splitBrainRiskState,
      distributedRecoveryState: await this.getDistributedRecoveryState(),
      distributedLineageIntegrity,
    }
  }

  async getInvariantViolations(): Promise<string[]> {
    const status = await this.getStatus()
    const violations: string[] = []

    if (status.splitBrainRiskState.duplicateAuthorityPlaneDetected) {
      violations.push('duplicate authority plane detected')
    }
    if (status.distributedLineageIntegrity === 'non_monotonic') {
      violations.push('distributed lineage non-monotonic')
    }
    if (status.replayFederationState.federationState === 'divergent') {
      violations.push('replay federation corrupts lineage')
    }
    if (!status.quorumState.activeNodes.every((nodeId) => status.quorumState.participatingNodes.includes(nodeId))) {
      violations.push('quorum active nodes inconsistent')
    }
    if (!status.distributedContinuityState.attestationLineagePreserved) {
      violations.push('distributed attestation loses continuity lineage')
    }

    return violations
  }

  private async listNodes() {
    const rows = await this.options.db.all<SovereignNodeRow[]>(
      `
        SELECT node_id, node_class, institutional_plane_id, lineage_plane_id, replay_plane_id,
               authority_plane_id, persistence_plane_id, node_epoch, startup_attestation_hash, registered_at
        FROM flowmind_sovereign_node
        ORDER BY registered_at ASC, node_id ASC
      `,
    )

    return rows.map((row) => mapNodeRow(row))
  }

  private async listDistributedLineages() {
    const rows = await this.options.db.all<DistributedLineageRow[]>(
      `
        SELECT lineage_id, originating_node_id, continuity_epoch, replay_fingerprint, mutation_lineage_hash,
               semantic_lineage_hash, attestation_lineage_hash, distributed_sequence, distributed_clock_hash, created_at
        FROM flowmind_distributed_lineage
        ORDER BY distributed_sequence ASC, created_at ASC, lineage_id ASC
      `,
    )

    return rows.map((row) => mapLineageRow(row))
  }

  private async listDistributedAttestations() {
    const rows = await this.options.db.all<DistributedAttestationRow[]>(
      `
        SELECT attestation_id, node_id, attestation_plane, lineage_hash, continuity_epoch, distributed_clock_hash, attested_at
        FROM flowmind_distributed_attestation
        ORDER BY attested_at ASC, attestation_id ASC
      `,
    )

    return rows.map((row) => mapAttestationRow(row))
  }

  private async listLineagesForFederation(continuityEpoch: string, replayFingerprint?: string) {
    const rows = replayFingerprint
      ? await this.options.db.all<DistributedLineageRow[]>(
        `
          SELECT lineage_id, originating_node_id, continuity_epoch, replay_fingerprint, mutation_lineage_hash,
                 semantic_lineage_hash, attestation_lineage_hash, distributed_sequence, distributed_clock_hash, created_at
          FROM flowmind_distributed_lineage
          WHERE continuity_epoch = ?
            AND replay_fingerprint = ?
          ORDER BY distributed_sequence ASC, created_at ASC, lineage_id ASC
        `,
        continuityEpoch,
        replayFingerprint,
      )
      : await this.options.db.all<DistributedLineageRow[]>(
        `
          SELECT lineage_id, originating_node_id, continuity_epoch, replay_fingerprint, mutation_lineage_hash,
                 semantic_lineage_hash, attestation_lineage_hash, distributed_sequence, distributed_clock_hash, created_at
          FROM flowmind_distributed_lineage
          WHERE continuity_epoch = ?
          ORDER BY distributed_sequence ASC, created_at ASC, lineage_id ASC
        `,
        continuityEpoch,
      )

    return rows.map((row) => mapLineageRow(row))
  }

  private buildReplayPlaneSynchronizationMetadata(
    lineages: DistributedLineageRecord[],
    continuityEpoch: string,
    replayFingerprint?: string,
  ) {
    return {
      continuityEpoch,
      replayFingerprint: replayFingerprint ?? null,
      exportedLineageCount: lineages.length,
      lineageIntegrityHash: hashValue(lineages.map((lineage) => ({
        lineageId: lineage.lineageId,
        distributedSequence: lineage.distributedSequence,
        distributedClockHash: lineage.distributedClockHash,
      }))),
    }
  }

  private async persistReplayFederationEvent(event: DistributedReplayFederationEvent) {
    await this.options.db.run(
      `
        INSERT INTO flowmind_replay_federation_state (
          federation_event_id,
          node_id,
          source_node_id,
          event_type,
          continuity_epoch,
          replay_fingerprint,
          lineage_ids_json,
          plane_sync_metadata_json,
          continuity_verified,
          distributed_clock_hash,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      event.federationEventId,
      event.nodeId,
      event.sourceNodeId,
      event.eventType,
      event.continuityEpoch,
      event.replayFingerprint,
      JSON.stringify(event.lineageIds),
      JSON.stringify(event.planeSyncMetadata),
      event.continuityVerified ? 1 : 0,
      event.distributedClockHash,
      event.createdAt,
    )

    this.options.logger?.info({
      event: event.eventType === 'export' ? 'distributed replay lineage exported' : 'distributed replay lineage imported',
      nodeId: event.nodeId,
      sourceNodeId: event.sourceNodeId,
      continuityEpoch: event.continuityEpoch,
      continuityVerified: event.continuityVerified,
    }, 'Replay federation metadata persisted')

    await this.refreshQuorumState(event.createdAt)
  }

  private async getQuorumState(): Promise<SovereignQuorumState> {
    const persisted = await this.options.db.get<{
      quorum_id: string
      participating_nodes_json: string
      active_nodes_json: string
      quorum_health: SovereignQuorumHealth
      quorum_continuity_state: SovereignQuorumContinuityState
      consensus_mode: SovereignConsensusMode
      created_at: string
    }>(
      `
        SELECT quorum_id, participating_nodes_json, active_nodes_json, quorum_health,
               quorum_continuity_state, consensus_mode, created_at
        FROM flowmind_sovereign_quorum
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
    )

    if (persisted) {
      return {
        quorumId: persisted.quorum_id,
        participatingNodes: parseJsonArray(persisted.participating_nodes_json),
        activeNodes: parseJsonArray(persisted.active_nodes_json),
        quorumHealth: persisted.quorum_health,
        quorumContinuityState: persisted.quorum_continuity_state,
        consensusMode: persisted.consensus_mode,
        createdAt: persisted.created_at,
      }
    }

    return {
      quorumId: 'distributed-foundation-quorum',
      participatingNodes: [],
      activeNodes: [],
      quorumHealth: 'unsafe',
      quorumContinuityState: 'unsafe',
      consensusMode: this.options.consensusMode ?? 'single_writer',
      createdAt: this.now(),
    }
  }

  private async getReplayFederationState(): Promise<ReplayFederationState> {
    const rows = await this.options.db.all<ReplayFederationRow[]>(
      `
        SELECT federation_event_id, node_id, source_node_id, event_type, continuity_epoch, replay_fingerprint,
               lineage_ids_json, plane_sync_metadata_json, continuity_verified, distributed_clock_hash, created_at
        FROM flowmind_replay_federation_state
        ORDER BY created_at ASC, federation_event_id ASC
      `,
    )

    const exports = rows.filter((row) => row.event_type === 'export')
    const imports = rows.filter((row) => row.event_type === 'import')
    const latest = rows.at(-1)
    const continuityVerified = imports.every((row) => row.continuity_verified === 1)
    const synchronizedReplayPlanes = uniqueSorted(
      rows.flatMap((row) => {
        const metadata = parseJsonObject(row.plane_sync_metadata_json)
        return [
          typeof metadata.sourceReplayPlaneId === 'string' ? metadata.sourceReplayPlaneId : '',
          typeof metadata.targetReplayPlaneId === 'string' ? metadata.targetReplayPlaneId : '',
        ]
      }),
    )

    return {
      federationState: rows.length === 0
        ? 'uninitialized'
        : imports.length === 0
          ? 'export_ready'
          : continuityVerified
            ? 'synchronized'
            : 'divergent',
      exportCount: exports.length,
      importCount: imports.length,
      continuityVerified,
      lastExportedAt: exports.at(-1)?.created_at ?? null,
      lastImportedAt: imports.at(-1)?.created_at ?? null,
      synchronizedReplayPlanes,
      replayPlaneSynchronizationMetadata: {
        lastEventType: latest?.event_type ?? null,
        latestContinuityEpoch: latest?.continuity_epoch ?? null,
        latestReplayFingerprint: latest?.replay_fingerprint ?? null,
        lineageIntegrityHash: latest ? (parseJsonObject(latest.plane_sync_metadata_json).lineageIntegrityHash as string | null ?? null) : null,
      },
    }
  }

  private async getDistributedRecoveryState(): Promise<DistributedRecoveryMetadataState> {
    const rows = await this.options.db.all<DistributedRecoveryRow[]>(
      `
        SELECT recovery_epoch_id, node_id, recovery_epoch, continuity_epoch, recovery_state,
               federated_coordination_state, replay_restoration_marker, metadata_json, created_at
        FROM flowmind_distributed_recovery_epoch
        ORDER BY created_at ASC, recovery_epoch_id ASC
      `,
    )

    return {
      recoveryFoundationState: rows.some((row) => row.federated_coordination_state === 'coordinating')
        ? 'coordinating'
        : rows.length > 0
          ? 'metadata_only'
          : 'observed',
      totalRecoveryEpochs: rows.length,
      activeRecoveryNodes: uniqueSorted(rows.map((row) => row.node_id)),
      latestRecoveryEpoch: rows.at(-1)?.recovery_epoch ?? null,
      latestRecoveryState: rows.at(-1)?.recovery_state ?? null,
      replayRestorationMarkers: uniqueSorted(rows.map((row) => row.replay_restoration_marker ?? '')),
    }
  }

  private async getDistributedContinuityRiskState(): Promise<DistributedContinuityRiskState> {
    const nodes = await this.listNodes()
    const lineages = await this.listDistributedLineages()
    const attestations = await this.listDistributedAttestations()
    const federationRows = await this.options.db.all<ReplayFederationRow[]>(
      `
        SELECT federation_event_id, node_id, source_node_id, event_type, continuity_epoch, replay_fingerprint,
               lineage_ids_json, plane_sync_metadata_json, continuity_verified, distributed_clock_hash, created_at
        FROM flowmind_replay_federation_state
        ORDER BY created_at ASC, federation_event_id ASC
      `,
    )

    const warnings: string[] = []
    const authorityPlaneCounts = new Map<string, number>()
    for (const node of nodes) {
      authorityPlaneCounts.set(node.authorityPlaneId, (authorityPlaneCounts.get(node.authorityPlaneId) ?? 0) + 1)
    }

    const duplicateAuthorityPlaneDetected = Array.from(authorityPlaneCounts.values()).some((count) => count > 1)
    if (duplicateAuthorityPlaneDetected) {
      warnings.push('duplicate authority plane detected')
      this.options.observability?.incrementMetric('distributed_split_brain_risk_total')
      this.options.logger?.warn({ event: 'split-brain risk detected', reason: 'duplicate_authority_plane' }, 'Split-brain risk detected')
    }

    const continuityEpochMismatchDetected = uniqueSorted([
      ...lineages.map((lineage) => lineage.continuityEpoch),
      ...attestations.map((attestation) => attestation.continuityEpoch),
    ]).length > 1
    if (continuityEpochMismatchDetected) {
      warnings.push('continuity epoch mismatch detected')
    }

    const distributedReplayDivergenceDetected = federationRows.some((row) => row.continuity_verified !== 1)
    if (distributedReplayDivergenceDetected) {
      warnings.push('distributed replay divergence detected')
    }

    const mutationForks = new Map<string, Set<string>>()
    for (const lineage of lineages) {
      if (!lineage.mutationLineageHash) {
        continue
      }

      const signatures = mutationForks.get(lineage.mutationLineageHash) ?? new Set<string>()
      signatures.add(`${lineage.semanticLineageHash ?? ''}:${lineage.attestationLineageHash ?? ''}`)
      mutationForks.set(lineage.mutationLineageHash, signatures)
    }
    const lineageForkDetected = Array.from(mutationForks.values()).some((set) => set.size > 1)
    if (lineageForkDetected) {
      warnings.push('lineage fork detected')
    }

    const distributedAttestationConflictDetected = (() => {
      const seen = new Map<string, string>()
      for (const attestation of attestations) {
        const key = `${attestation.attestationPlane}:${attestation.continuityEpoch}:${attestation.lineageHash}`
        const existing = seen.get(key)
        if (existing && existing !== attestation.distributedClockHash) {
          return true
        }
        seen.set(key, attestation.distributedClockHash)
      }
      return false
    })()
    if (distributedAttestationConflictDetected) {
      warnings.push('distributed attestation conflict detected')
    }

    const quorumDisagreementDetected = uniqueSorted(nodes.map((node) => node.institutionalPlaneId)).length > 1
    if (quorumDisagreementDetected) {
      warnings.push('quorum disagreement detected')
    }

    return {
      riskLevel: duplicateAuthorityPlaneDetected || lineageForkDetected || distributedAttestationConflictDetected
        ? 'high'
        : warnings.length > 0
          ? 'caution'
          : 'none',
      lineageForkDetected,
      distributedReplayDivergenceDetected,
      quorumDisagreementDetected,
      continuityEpochMismatchDetected,
      duplicateAuthorityPlaneDetected,
      distributedAttestationConflictDetected,
      warnings,
      detectedAt: this.now(),
    }
  }

  private buildDistributedContinuityState(args: {
    nodes: SovereignNodeIdentity[]
    lineages: DistributedLineageRecord[]
    attestations: DistributedAttestation[]
    quorumState: SovereignQuorumState
    splitBrainRiskState: DistributedContinuityRiskState
  }): DistributedContinuityState {
    const distributedLineageIntegrity = buildLineageIntegrity(args.lineages)
    const lineageHashes = new Set<string>()
    for (const lineage of args.lineages) {
      if (lineage.attestationLineageHash) {
        lineageHashes.add(lineage.attestationLineageHash)
      }
      if (lineage.mutationLineageHash) {
        lineageHashes.add(lineage.mutationLineageHash)
      }
      if (lineage.semanticLineageHash) {
        lineageHashes.add(lineage.semanticLineageHash)
      }
      lineageHashes.add(lineage.distributedClockHash)
    }

    const attestationLineagePreserved = args.attestations.every((attestation) => lineageHashes.has(attestation.lineageHash))

    return {
      continuityFederationState: args.quorumState.quorumContinuityState === 'verified' && attestationLineagePreserved && distributedLineageIntegrity === 'verified'
        ? 'verified'
        : args.splitBrainRiskState.riskLevel === 'high'
          ? 'unsafe'
          : 'partial',
      activeContinuityEpochs: uniqueSorted(args.lineages.map((lineage) => lineage.continuityEpoch)),
      attestedEpochs: uniqueSorted(args.attestations.map((attestation) => attestation.continuityEpoch)),
      lineageMonotonic: distributedLineageIntegrity !== 'non_monotonic',
      attestationLineagePreserved,
      duplicateAuthorityPlaneDetected: args.splitBrainRiskState.duplicateAuthorityPlaneDetected,
    }
  }

  private async refreshQuorumState(createdAt = this.now()) {
    const nodes = await this.listNodes()
    const lineages = await this.listDistributedLineages()
    const attestations = await this.listDistributedAttestations()
    const riskState = await this.getDistributedContinuityRiskState()
    const distributedLineageIntegrity = buildLineageIntegrity(lineages)
    const participatingNodes = uniqueSorted(nodes.map((node) => node.nodeId))
    const activeNodes = uniqueSorted(nodes.map((node) => node.nodeId))
    const continuityPreserved = attestations.every((attestation) => lineages.some((lineage) =>
      lineage.continuityEpoch === attestation.continuityEpoch
      && (
        lineage.distributedClockHash === attestation.lineageHash
        || lineage.attestationLineageHash === attestation.lineageHash
        || lineage.mutationLineageHash === attestation.lineageHash
        || lineage.semanticLineageHash === attestation.lineageHash
      ),
    ))

    const quorumHealth: SovereignQuorumHealth = participatingNodes.length === 0
      ? 'unsafe'
      : riskState.duplicateAuthorityPlaneDetected
        ? 'split_brain_risk'
        : riskState.riskLevel === 'high'
          ? 'unsafe'
          : riskState.riskLevel === 'caution'
            ? 'degraded'
            : 'healthy'

    const quorumContinuityState: SovereignQuorumContinuityState = quorumHealth === 'unsafe' || quorumHealth === 'split_brain_risk'
      ? 'unsafe'
      : distributedLineageIntegrity === 'verified' && continuityPreserved
        ? 'verified'
        : 'partial'

    await this.options.db.run(
      `
        INSERT INTO flowmind_sovereign_quorum (
          quorum_id,
          participating_nodes_json,
          active_nodes_json,
          quorum_health,
          quorum_continuity_state,
          consensus_mode,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(quorum_id) DO UPDATE SET
          participating_nodes_json = excluded.participating_nodes_json,
          active_nodes_json = excluded.active_nodes_json,
          quorum_health = excluded.quorum_health,
          quorum_continuity_state = excluded.quorum_continuity_state,
          consensus_mode = excluded.consensus_mode,
          updated_at = excluded.updated_at
      `,
      'distributed-foundation-quorum',
      JSON.stringify(participatingNodes),
      JSON.stringify(activeNodes),
      quorumHealth,
      quorumContinuityState,
      this.options.consensusMode ?? 'single_writer',
      createdAt,
      createdAt,
    )

    this.options.observability?.incrementMetric('distributed_quorum_health', quorumHealth === 'healthy' ? 1 : 0)
    this.options.logger?.info({
      event: 'quorum state updated',
      quorumHealth,
      quorumContinuityState,
      participatingNodes,
      activeNodes,
      consensusMode: this.options.consensusMode ?? 'single_writer',
    }, 'Quorum state updated')
  }
}

export function createDistributedSovereigntyService(options: DistributedSovereigntyServiceOptions) {
  return new DistributedSovereigntyService(options)
}

export function installDistributedSovereigntyService(service: DistributedSovereigntyService) {
  installedDistributedSovereigntyService = service
}

export function getDistributedSovereigntyService() {
  if (!installedDistributedSovereigntyService) {
    throw new Error('Distributed sovereignty service has not been installed.')
  }

  return installedDistributedSovereigntyService
}
