import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'

type PublicTriageFingerprintStatus =
  | 'pending'
  | 'case_created'
  | 'reused'
  | 'expired'
  | 'failed'

type PublicTriageFingerprintRecord = {
  id: string
  tenantId: number
  entityId: string
  fingerprint: string
  fingerprintVersion: string
  source: string
  timeBucket: string
  requestId: string
  caseId?: string
  status: PublicTriageFingerprintStatus
  expiresAt: string
  createdAt: string
  updatedAt: string
  metadata: Record<string, unknown>
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : ''
  const message = typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : ''

  return code === '23505'
    || message.includes('UNIQUE constraint failed')
    || message.includes('unique constraint')
    || message.includes('duplicate key value violates unique constraint')
}

type PublicTriageFingerprintRow = {
  id: string
  tenant_id: number
  entity_id: string
  fingerprint: string
  fingerprint_version: string
  source: string
  time_bucket: string
  request_id: string
  case_id: string | null
  status: PublicTriageFingerprintStatus
  expires_at: string | Date
  created_at: string | Date
  updated_at: string | Date
  metadata: unknown
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date().toISOString()
}

function parseJsonObject(value: unknown) {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }

  return typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function mapFingerprintRow(row?: PublicTriageFingerprintRow): PublicTriageFingerprintRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    fingerprint: row.fingerprint,
    fingerprintVersion: row.fingerprint_version,
    source: row.source,
    timeBucket: row.time_bucket,
    requestId: row.request_id,
    caseId: row.case_id ?? undefined,
    status: row.status,
    expiresAt: normalizeTimestamp(row.expires_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
    metadata: parseJsonObject(row.metadata),
  }
}

export class LegalIntakeFingerprintRepository {
  constructor(private readonly db: BackendDatabase) {}

  async findActiveFingerprint(args: {
    tenantId: number
    entityId: string
    fingerprint: string
    now?: string
  }) {
    const now = args.now ?? new Date().toISOString()
    const row = await this.db.get<PublicTriageFingerprintRow>(
      `
        SELECT *
        FROM public_triage_fingerprints
        WHERE tenant_id = ?
          AND entity_id = ?
          AND fingerprint = ?
          AND status IN ('pending', 'case_created', 'reused')
          AND expires_at > ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      args.tenantId,
      args.entityId,
      args.fingerprint,
      now,
    )

    return mapFingerprintRow(row)
  }

  async createFingerprintReservation(args: {
    tenantId: number
    entityId: string
    fingerprint: string
    fingerprintVersion: string
    source: string
    timeBucket: string
    requestId: string
    expiresAt: string
    metadata?: Record<string, unknown>
  }) {
    const id = randomUUID()
    const now = new Date().toISOString()

    let outcome: 'created' | 'conflict' = 'created'

    try {
      await this.db.run(
        `
          INSERT INTO public_triage_fingerprints (
            id,
            tenant_id,
            entity_id,
            fingerprint,
            fingerprint_version,
            source,
            time_bucket,
            request_id,
            case_id,
            status,
            expires_at,
            created_at,
            updated_at,
            metadata
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        id,
        args.tenantId,
        args.entityId,
        args.fingerprint,
        args.fingerprintVersion,
        args.source,
        args.timeBucket,
        args.requestId,
        null,
        'pending',
        args.expiresAt,
        now,
        now,
        JSON.stringify(args.metadata ?? {}),
      )
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }
      outcome = 'conflict'
    }

    const fingerprint = await this.findActiveFingerprint({
      tenantId: args.tenantId,
      entityId: args.entityId,
      fingerprint: args.fingerprint,
      now,
    })

    return {
      fingerprint,
      outcome,
    }
  }

  async markFingerprintCaseCreated(args: {
    id: string
    caseId: string
  }) {
    await this.db.run(
      `
        UPDATE public_triage_fingerprints
        SET case_id = ?,
            status = 'case_created',
            updated_at = ?
        WHERE id = ?
      `,
      args.caseId,
      new Date().toISOString(),
      args.id,
    )
  }

  async markFingerprintReused(args: {
    id: string
    caseId: string
  }) {
    await this.db.run(
      `
        UPDATE public_triage_fingerprints
        SET case_id = ?,
            status = 'reused',
            updated_at = ?
        WHERE id = ?
      `,
      args.caseId,
      new Date().toISOString(),
      args.id,
    )
  }

  async markFingerprintFailed(args: {
    id: string
  }) {
    await this.db.run(
      `
        UPDATE public_triage_fingerprints
        SET status = 'failed',
            updated_at = ?
        WHERE id = ?
      `,
      new Date().toISOString(),
      args.id,
    )
  }
}

export function createLegalIntakeFingerprintRepository(db: BackendDatabase) {
  return new LegalIntakeFingerprintRepository(db)
}
