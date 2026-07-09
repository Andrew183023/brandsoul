import type { BackendDatabase } from '../../db/index.js'
import {
  buildExecutiveMemoryObservationFingerprint,
  buildExecutiveMemoryObservationId,
} from './ExecutiveMemoryTemporalIdentity.js'

export interface ExecutiveMemoryObservationRecord {
  id: string
  tenantId: number
  officeId: string
  projectionVersion: number
  captureCycleId: string
  contentFingerprint: string
  observationFingerprint: string
  capturedAt: string
  sourceFingerprint: string
  stateSnapshotId: string
  createdAt: string
}

export interface SaveExecutiveMemoryObservationInput {
  tenantId: number
  officeId: string
  projectionVersion: number
  captureCycleId: string
  contentFingerprint: string
  capturedAt: string
  sourceFingerprint: string
  stateSnapshotId: string
}

export interface SaveExecutiveMemoryObservationResult {
  created: boolean
  record: ExecutiveMemoryObservationRecord
}

export interface ExecutiveMemoryObservationLookupInput {
  tenantId: number
  officeId: string
}

export interface ExecutiveMemoryObservationListInput
extends ExecutiveMemoryObservationLookupInput {
  limit?: number
}

export interface ExecutiveMemoryObservationStateListInput
extends ExecutiveMemoryObservationListInput {
  contentFingerprint: string
}

export interface ExecutiveMemoryObservationCaptureCycleListInput
extends ExecutiveMemoryObservationListInput {
  captureCycleId: string
}

type ExecutiveMemoryObservationRow = {
  id: string
  tenant_id: number
  office_id: string
  projection_version: number
  capture_cycle_id: string
  content_fingerprint: string
  observation_fingerprint: string
  captured_at: string | Date
  source_fingerprint: string
  state_snapshot_id: string
  created_at: string | Date
}

type ExecutiveMemorySnapshotValidationRow = {
  id: string
  tenant_id: number
  office_id: string
  projection_version: number
  content_fingerprint: string
}

const DEFAULT_LIST_LIMIT = 20
const MIN_LIST_LIMIT = 1
const MAX_LIST_LIMIT = 100

function assertTenantId(tenantId: number) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Executive memory observation repository requires tenantId.')
  }
}

function assertProjectionVersion(projectionVersion: number) {
  if (!Number.isInteger(projectionVersion) || projectionVersion <= 0) {
    throw new Error('Executive memory observation repository requires projectionVersion.')
  }
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory observation repository requires ${label}.`)
  }
}

function normalizeListLimit(limit?: number) {
  if (!Number.isInteger(limit) || typeof limit === 'undefined') {
    return DEFAULT_LIST_LIMIT
  }

  if (limit < MIN_LIST_LIMIT || limit > MAX_LIST_LIMIT) {
    return DEFAULT_LIST_LIMIT
  }

  return limit
}

function normalizeTimestamp(value: string | Date, label: string) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  throw new Error(`Executive memory observation repository returned invalid ${label}.`)
}

function mapObservationRow(
  row?: ExecutiveMemoryObservationRow,
): ExecutiveMemoryObservationRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    officeId: row.office_id,
    projectionVersion: row.projection_version,
    captureCycleId: row.capture_cycle_id,
    contentFingerprint: row.content_fingerprint,
    observationFingerprint: row.observation_fingerprint,
    capturedAt: normalizeTimestamp(row.captured_at, 'capturedAt'),
    sourceFingerprint: row.source_fingerprint,
    stateSnapshotId: row.state_snapshot_id,
    createdAt: normalizeTimestamp(row.created_at, 'createdAt'),
  }
}

function validateLookupInput(input: ExecutiveMemoryObservationLookupInput) {
  assertTenantId(input.tenantId)
  assertNonEmptyString(input.officeId, 'officeId')
}

function validateListByStateInput(input: ExecutiveMemoryObservationStateListInput) {
  validateLookupInput(input)
  assertNonEmptyString(input.contentFingerprint, 'contentFingerprint')
}

function validateListByCaptureCycleInput(
  input: ExecutiveMemoryObservationCaptureCycleListInput,
) {
  validateLookupInput(input)
  assertNonEmptyString(input.captureCycleId, 'captureCycleId')
}

function validateSaveInput(input: SaveExecutiveMemoryObservationInput) {
  assertTenantId(input.tenantId)
  assertProjectionVersion(input.projectionVersion)
  assertNonEmptyString(input.officeId, 'officeId')
  assertNonEmptyString(input.captureCycleId, 'captureCycleId')
  assertNonEmptyString(input.contentFingerprint, 'contentFingerprint')
  assertNonEmptyString(input.capturedAt, 'capturedAt')
  assertNonEmptyString(input.sourceFingerprint, 'sourceFingerprint')
  assertNonEmptyString(input.stateSnapshotId, 'stateSnapshotId')
}

export class ExecutiveMemoryObservationRepository {
  constructor(private readonly db: BackendDatabase) {}

  private async findStateSnapshot(args: {
    tenantId: number
    officeId: string
    stateSnapshotId: string
  }) {
    validateLookupInput(args)
    assertNonEmptyString(args.stateSnapshotId, 'stateSnapshotId')

    return this.db.get<ExecutiveMemorySnapshotValidationRow>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          content_fingerprint
        FROM executive_memory_snapshots
        WHERE id = ?
          AND tenant_id = ?
          AND office_id = ?
        LIMIT 1
      `,
      args.stateSnapshotId,
      args.tenantId,
      args.officeId,
    )
  }

  private async validateStateReference(input: SaveExecutiveMemoryObservationInput) {
    const stateSnapshot = await this.findStateSnapshot({
      tenantId: input.tenantId,
      officeId: input.officeId,
      stateSnapshotId: input.stateSnapshotId,
    })

    if (!stateSnapshot) {
      throw new Error('Executive memory observation repository requires a matching persisted state snapshot.')
    }

    if (stateSnapshot.projection_version !== input.projectionVersion) {
      throw new Error('Executive memory observation repository requires projectionVersion to match the referenced state snapshot.')
    }

    if (stateSnapshot.content_fingerprint !== input.contentFingerprint) {
      throw new Error('Executive memory observation repository requires contentFingerprint to match the referenced state snapshot.')
    }
  }

  async getObservationByFingerprint(args: {
    tenantId: number
    officeId: string
    observationFingerprint: string
  }): Promise<ExecutiveMemoryObservationRecord | null> {
    validateLookupInput(args)
    assertNonEmptyString(args.observationFingerprint, 'observationFingerprint')

    const row = await this.db.get<ExecutiveMemoryObservationRow>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          capture_cycle_id,
          content_fingerprint,
          observation_fingerprint,
          captured_at,
          source_fingerprint,
          state_snapshot_id,
          created_at
        FROM executive_memory_observations
        WHERE tenant_id = ?
          AND office_id = ?
          AND observation_fingerprint = ?
        LIMIT 1
      `,
      args.tenantId,
      args.officeId,
      args.observationFingerprint,
    )

    return mapObservationRow(row)
  }

  async saveObservation(
    input: SaveExecutiveMemoryObservationInput,
  ): Promise<SaveExecutiveMemoryObservationResult> {
    validateSaveInput(input)
    await this.validateStateReference(input)

    const observationFingerprint = buildExecutiveMemoryObservationFingerprint({
      projectionVersion: input.projectionVersion,
      tenantId: input.tenantId,
      officeId: input.officeId,
      captureCycleId: input.captureCycleId,
      contentFingerprint: input.contentFingerprint,
    })
    const observationId = buildExecutiveMemoryObservationId({
      projectionVersion: input.projectionVersion,
      tenantId: input.tenantId,
      officeId: input.officeId,
      captureCycleId: input.captureCycleId,
      contentFingerprint: input.contentFingerprint,
    })

    const result = await this.db.run(
      `
        INSERT INTO executive_memory_observations (
          id,
          tenant_id,
          office_id,
          projection_version,
          capture_cycle_id,
          content_fingerprint,
          observation_fingerprint,
          captured_at,
          source_fingerprint,
          state_snapshot_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, office_id, observation_fingerprint) DO NOTHING
      `,
      observationId,
      input.tenantId,
      input.officeId,
      input.projectionVersion,
      input.captureCycleId,
      input.contentFingerprint,
      observationFingerprint,
      input.capturedAt,
      input.sourceFingerprint,
      input.stateSnapshotId,
    )

    const record = await this.getObservationByFingerprint({
      tenantId: input.tenantId,
      officeId: input.officeId,
      observationFingerprint,
    })

    if (!record) {
      throw new Error('Executive memory observation repository failed to load persisted observation.')
    }

    return {
      created: (result.changes ?? 0) > 0,
      record,
    }
  }

  async getLatestObservation(
    input: ExecutiveMemoryObservationLookupInput,
  ): Promise<ExecutiveMemoryObservationRecord | null> {
    validateLookupInput(input)

    const row = await this.db.get<ExecutiveMemoryObservationRow>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          capture_cycle_id,
          content_fingerprint,
          observation_fingerprint,
          captured_at,
          source_fingerprint,
          state_snapshot_id,
          created_at
        FROM executive_memory_observations
        WHERE tenant_id = ?
          AND office_id = ?
        ORDER BY captured_at DESC, created_at DESC, id ASC
        LIMIT 1
      `,
      input.tenantId,
      input.officeId,
    )

    return mapObservationRow(row)
  }

  async listObservations(
    input: ExecutiveMemoryObservationListInput,
  ): Promise<ExecutiveMemoryObservationRecord[]> {
    validateLookupInput(input)
    const limit = normalizeListLimit(input.limit)

    const rows = await this.db.all<ExecutiveMemoryObservationRow[]>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          capture_cycle_id,
          content_fingerprint,
          observation_fingerprint,
          captured_at,
          source_fingerprint,
          state_snapshot_id,
          created_at
        FROM executive_memory_observations
        WHERE tenant_id = ?
          AND office_id = ?
        ORDER BY captured_at DESC, created_at DESC, id ASC
        LIMIT ?
      `,
      input.tenantId,
      input.officeId,
      limit,
    )

    return rows.map((row) => mapObservationRow(row)).filter((row): row is ExecutiveMemoryObservationRecord => row !== null)
  }

  async listObservationsByState(
    input: ExecutiveMemoryObservationStateListInput,
  ): Promise<ExecutiveMemoryObservationRecord[]> {
    validateListByStateInput(input)
    const limit = normalizeListLimit(input.limit)

    const rows = await this.db.all<ExecutiveMemoryObservationRow[]>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          capture_cycle_id,
          content_fingerprint,
          observation_fingerprint,
          captured_at,
          source_fingerprint,
          state_snapshot_id,
          created_at
        FROM executive_memory_observations
        WHERE tenant_id = ?
          AND office_id = ?
          AND content_fingerprint = ?
        ORDER BY captured_at DESC, created_at DESC, id ASC
        LIMIT ?
      `,
      input.tenantId,
      input.officeId,
      input.contentFingerprint,
      limit,
    )

    return rows.map((row) => mapObservationRow(row)).filter((row): row is ExecutiveMemoryObservationRecord => row !== null)
  }

  async listObservationsByCaptureCycle(
    input: ExecutiveMemoryObservationCaptureCycleListInput,
  ): Promise<ExecutiveMemoryObservationRecord[]> {
    validateListByCaptureCycleInput(input)
    const limit = normalizeListLimit(input.limit)

    const rows = await this.db.all<ExecutiveMemoryObservationRow[]>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          capture_cycle_id,
          content_fingerprint,
          observation_fingerprint,
          captured_at,
          source_fingerprint,
          state_snapshot_id,
          created_at
        FROM executive_memory_observations
        WHERE tenant_id = ?
          AND office_id = ?
          AND capture_cycle_id = ?
        ORDER BY captured_at DESC, created_at DESC, id ASC
        LIMIT ?
      `,
      input.tenantId,
      input.officeId,
      input.captureCycleId,
      limit,
    )

    return rows.map((row) => mapObservationRow(row)).filter((row): row is ExecutiveMemoryObservationRecord => row !== null)
  }
}

export function createExecutiveMemoryObservationRepository(db: BackendDatabase) {
  return new ExecutiveMemoryObservationRepository(db)
}
