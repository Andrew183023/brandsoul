import type { BackendDatabase } from '../../db/index.js'
import type {
  ExecutiveMemoryDecisionCenterProjection,
  ExecutiveMemoryOfficeHealthProjection,
  ExecutiveMemoryProjection,
  ExecutiveMemoryTimelineProjection,
} from './ExecutiveMemoryProjectionTypes.js'

export interface ExecutiveMemorySnapshotRecord {
  id: string
  tenantId: number
  officeId: string
  projectionVersion: number
  capturedAt: string
  sourceGrowthGeneratedAt: string
  sourceOperationalGeneratedAt: string
  contentFingerprint: string
  sourceFingerprint: string
  officeHealth: ExecutiveMemoryOfficeHealthProjection
  decisionCenter: ExecutiveMemoryDecisionCenterProjection
  executiveTimeline: ExecutiveMemoryTimelineProjection
  createdAt: string
}

export interface SaveExecutiveMemorySnapshotResult {
  record: ExecutiveMemorySnapshotRecord
  created: boolean
}

export interface ExecutiveMemorySnapshotLookupInput {
  tenantId: number
  officeId: string
}

export interface ExecutiveMemorySnapshotListInput extends ExecutiveMemorySnapshotLookupInput {
  limit?: number
}

type ExecutiveMemorySnapshotRow = {
  id: string
  tenant_id: number
  office_id: string
  projection_version: number
  captured_at: string | Date
  source_growth_generated_at: string | Date
  source_operational_generated_at: string | Date
  content_fingerprint: string
  source_fingerprint: string
  office_health_json: unknown
  decision_center_json: unknown
  executive_timeline_json: unknown
  created_at: string | Date
}

const DEFAULT_LIST_LIMIT = 20
const MIN_LIST_LIMIT = 1
const MAX_LIST_LIMIT = 100

function assertTenantId(tenantId: number) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Executive memory repository requires tenantId.')
  }
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory repository requires ${label}.`)
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

  throw new Error(`Executive memory repository returned invalid ${label}.`)
}

function parseProjectionJson<T>(value: unknown, label: string): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }

  if (value && typeof value === 'object') {
    return value as T
  }

  throw new Error(`Executive memory repository returned invalid ${label}.`)
}

function mapSnapshotRow(row?: ExecutiveMemorySnapshotRow): ExecutiveMemorySnapshotRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    officeId: row.office_id,
    projectionVersion: row.projection_version,
    capturedAt: normalizeTimestamp(row.captured_at, 'capturedAt'),
    sourceGrowthGeneratedAt: normalizeTimestamp(
      row.source_growth_generated_at,
      'sourceGrowthGeneratedAt',
    ),
    sourceOperationalGeneratedAt: normalizeTimestamp(
      row.source_operational_generated_at,
      'sourceOperationalGeneratedAt',
    ),
    contentFingerprint: row.content_fingerprint,
    sourceFingerprint: row.source_fingerprint,
    officeHealth: parseProjectionJson<ExecutiveMemoryOfficeHealthProjection>(
      row.office_health_json,
      'officeHealth',
    ),
    decisionCenter: parseProjectionJson<ExecutiveMemoryDecisionCenterProjection>(
      row.decision_center_json,
      'decisionCenter',
    ),
    executiveTimeline: parseProjectionJson<ExecutiveMemoryTimelineProjection>(
      row.executive_timeline_json,
      'executiveTimeline',
    ),
    createdAt: normalizeTimestamp(row.created_at, 'createdAt'),
  }
}

function validateLookupInput(input: ExecutiveMemorySnapshotLookupInput) {
  assertTenantId(input.tenantId)
  assertNonEmptyString(input.officeId, 'officeId')
}

function validateProjection(projection: ExecutiveMemoryProjection) {
  assertTenantId(projection.tenantId)
  assertNonEmptyString(projection.officeId, 'officeId')
  assertNonEmptyString(projection.capturedAt, 'capturedAt')
  assertNonEmptyString(projection.sourceGrowthGeneratedAt, 'sourceGrowthGeneratedAt')
  assertNonEmptyString(projection.sourceOperationalGeneratedAt, 'sourceOperationalGeneratedAt')
  assertNonEmptyString(projection.contentFingerprint, 'contentFingerprint')
  assertNonEmptyString(projection.sourceFingerprint, 'sourceFingerprint')
}

export function buildExecutiveMemorySnapshotId(
  tenantId: number,
  officeId: string,
  contentFingerprint: string,
) {
  assertTenantId(tenantId)
  assertNonEmptyString(officeId, 'officeId')
  assertNonEmptyString(contentFingerprint, 'contentFingerprint')

  return `executive_memory_snapshot:${tenantId}:${officeId}:${contentFingerprint}`
}

export class ExecutiveMemoryRepository {
  constructor(private readonly db: BackendDatabase) {}

  private async findByContentFingerprint(args: {
    tenantId: number
    officeId: string
    contentFingerprint: string
  }) {
    validateLookupInput(args)
    assertNonEmptyString(args.contentFingerprint, 'contentFingerprint')

    const row = await this.db.get<ExecutiveMemorySnapshotRow>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          captured_at,
          source_growth_generated_at,
          source_operational_generated_at,
          content_fingerprint,
          source_fingerprint,
          office_health_json,
          decision_center_json,
          executive_timeline_json,
          created_at
        FROM executive_memory_snapshots
        WHERE tenant_id = ?
          AND office_id = ?
          AND content_fingerprint = ?
        LIMIT 1
      `,
      args.tenantId,
      args.officeId,
      args.contentFingerprint,
    )

    return mapSnapshotRow(row)
  }

  async saveSnapshot(projection: ExecutiveMemoryProjection): Promise<SaveExecutiveMemorySnapshotResult> {
    validateProjection(projection)

    const snapshotId = buildExecutiveMemorySnapshotId(
      projection.tenantId,
      projection.officeId,
      projection.contentFingerprint,
    )

    const result = await this.db.run(
      `
        INSERT INTO executive_memory_snapshots (
          id,
          tenant_id,
          office_id,
          projection_version,
          captured_at,
          source_growth_generated_at,
          source_operational_generated_at,
          content_fingerprint,
          source_fingerprint,
          office_health_json,
          decision_center_json,
          executive_timeline_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, office_id, content_fingerprint) DO NOTHING
      `,
      snapshotId,
      projection.tenantId,
      projection.officeId,
      projection.projectionVersion,
      projection.capturedAt,
      projection.sourceGrowthGeneratedAt,
      projection.sourceOperationalGeneratedAt,
      projection.contentFingerprint,
      projection.sourceFingerprint,
      JSON.stringify(projection.officeHealth),
      JSON.stringify(projection.decisionCenter),
      JSON.stringify(projection.executiveTimeline),
    )

    const record = await this.findByContentFingerprint({
      tenantId: projection.tenantId,
      officeId: projection.officeId,
      contentFingerprint: projection.contentFingerprint,
    })

    if (!record) {
      throw new Error('Executive memory repository failed to load persisted snapshot.')
    }

    return {
      record,
      created: (result.changes ?? 0) > 0,
    }
  }

  async getLatestSnapshot(input: ExecutiveMemorySnapshotLookupInput): Promise<ExecutiveMemorySnapshotRecord | null> {
    validateLookupInput(input)

    const row = await this.db.get<ExecutiveMemorySnapshotRow>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          captured_at,
          source_growth_generated_at,
          source_operational_generated_at,
          content_fingerprint,
          source_fingerprint,
          office_health_json,
          decision_center_json,
          executive_timeline_json,
          created_at
        FROM executive_memory_snapshots
        WHERE tenant_id = ?
          AND office_id = ?
        ORDER BY captured_at DESC, created_at DESC, id ASC
        LIMIT 1
      `,
      input.tenantId,
      input.officeId,
    )

    return mapSnapshotRow(row)
  }

  async listSnapshots(input: ExecutiveMemorySnapshotListInput): Promise<ExecutiveMemorySnapshotRecord[]> {
    validateLookupInput(input)
    const limit = normalizeListLimit(input.limit)

    const rows = await this.db.all<ExecutiveMemorySnapshotRow[]>(
      `
        SELECT
          id,
          tenant_id,
          office_id,
          projection_version,
          captured_at,
          source_growth_generated_at,
          source_operational_generated_at,
          content_fingerprint,
          source_fingerprint,
          office_health_json,
          decision_center_json,
          executive_timeline_json,
          created_at
        FROM executive_memory_snapshots
        WHERE tenant_id = ?
          AND office_id = ?
        ORDER BY captured_at DESC, created_at DESC, id ASC
        LIMIT ?
      `,
      input.tenantId,
      input.officeId,
      limit,
    )

    return rows.map((row) => mapSnapshotRow(row)).filter((row): row is ExecutiveMemorySnapshotRecord => row !== null)
  }
}

export function createExecutiveMemoryRepository(db: BackendDatabase) {
  return new ExecutiveMemoryRepository(db)
}
