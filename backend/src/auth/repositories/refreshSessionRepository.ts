import type { BackendDatabase } from '../../db/index.js'
import type { AuthRefreshRevokeReason, AuthRefreshSessionStatus, RefreshSessionRecord } from '../authTypes.js'

type RefreshSessionRow = {
  id: string
  family_id: string
  parent_session_id: string | null
  user_id: number
  tenant_id: number
  token_hash: string
  token_fingerprint: string
  status: AuthRefreshSessionStatus
  revoke_reason: AuthRefreshRevokeReason | null
  issued_at: string
  expires_at: string
  last_used_at: string | null
  rotated_at: string | null
  revoked_at: string | null
  created_by_ip: string | null
  created_by_user_agent: string | null
  last_used_ip: string | null
  last_used_user_agent: string | null
  replaced_by_session_id: string | null
  auth_version: number
  created_at: string
  updated_at: string
}

type CreateRefreshSessionInput = Omit<RefreshSessionRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function mapRow(row?: RefreshSessionRow): RefreshSessionRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    familyId: row.family_id,
    parentSessionId: row.parent_session_id ?? undefined,
    userId: row.user_id,
    tenantId: row.tenant_id,
    tokenHash: row.token_hash,
    tokenFingerprint: row.token_fingerprint,
    status: row.status,
    revokeReason: row.revoke_reason ?? undefined,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at ?? undefined,
    rotatedAt: row.rotated_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    createdByIp: row.created_by_ip ?? undefined,
    createdByUserAgent: row.created_by_user_agent ?? undefined,
    lastUsedIp: row.last_used_ip ?? undefined,
    lastUsedUserAgent: row.last_used_user_agent ?? undefined,
    replacedBySessionId: row.replaced_by_session_id ?? undefined,
    authVersion: row.auth_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class RefreshSessionRepository {
  constructor(private readonly db: BackendDatabase) {}

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? createdAt

    await this.db.run(
      `
        INSERT INTO auth_refresh_session (
          id, family_id, parent_session_id, user_id, tenant_id, token_hash, token_fingerprint,
          status, revoke_reason, issued_at, expires_at, last_used_at, rotated_at, revoked_at,
          created_by_ip, created_by_user_agent, last_used_ip, last_used_user_agent,
          replaced_by_session_id, auth_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.id,
      input.familyId,
      input.parentSessionId ?? null,
      input.userId,
      input.tenantId,
      input.tokenHash,
      input.tokenFingerprint,
      input.status,
      input.revokeReason ?? null,
      input.issuedAt,
      input.expiresAt,
      input.lastUsedAt ?? null,
      input.rotatedAt ?? null,
      input.revokedAt ?? null,
      input.createdByIp ?? null,
      input.createdByUserAgent ?? null,
      input.lastUsedIp ?? null,
      input.lastUsedUserAgent ?? null,
      input.replacedBySessionId ?? null,
      input.authVersion,
      createdAt,
      updatedAt,
    )

    return {
      ...input,
      createdAt,
      updatedAt,
    }
  }

  async findByTokenHash(tokenHash: string) {
    const row = await this.db.get<RefreshSessionRow>(
      `SELECT * FROM auth_refresh_session WHERE token_hash = ?`,
      tokenHash,
    )

    return mapRow(row)
  }

  async findById(id: string) {
    const row = await this.db.get<RefreshSessionRow>(
      `SELECT * FROM auth_refresh_session WHERE id = ?`,
      id,
    )

    return mapRow(row)
  }

  async markRotated(id: string, args: {
    replacedBySessionId: string
    rotatedAt: string
    lastUsedAt: string
    lastUsedIp?: string
    lastUsedUserAgent?: string
  }) {
    await this.db.run(
      `
        UPDATE auth_refresh_session
        SET status = ?, revoke_reason = ?, rotated_at = ?, last_used_at = ?,
            last_used_ip = ?, last_used_user_agent = ?, replaced_by_session_id = ?, updated_at = ?
        WHERE id = ?
      `,
      'rotated',
      'rotated',
      args.rotatedAt,
      args.lastUsedAt,
      args.lastUsedIp ?? null,
      args.lastUsedUserAgent ?? null,
      args.replacedBySessionId,
      args.rotatedAt,
      id,
    )
  }

  async attachParentSession(id: string, parentSessionId: string) {
    await this.db.run(
      `UPDATE auth_refresh_session SET parent_session_id = ?, updated_at = ? WHERE id = ?`,
      parentSessionId,
      new Date().toISOString(),
      id,
    )
  }

  async markExpired(id: string, at: string) {
    await this.db.run(
      `
        UPDATE auth_refresh_session
        SET status = ?, revoke_reason = ?, revoked_at = COALESCE(revoked_at, ?), updated_at = ?
        WHERE id = ?
      `,
      'expired',
      'expired',
      at,
      at,
      id,
    )
  }

  async revokeSession(id: string, reason: AuthRefreshRevokeReason, revokedAt: string) {
    await this.db.run(
      `
        UPDATE auth_refresh_session
        SET status = ?, revoke_reason = ?, revoked_at = COALESCE(revoked_at, ?), updated_at = ?
        WHERE id = ?
      `,
      reason === 'reuse_detected' ? 'reuse_detected' : 'revoked',
      reason,
      revokedAt,
      revokedAt,
      id,
    )
  }

  async revokeFamily(familyId: string, reason: AuthRefreshRevokeReason, revokedAt: string) {
    const nextStatus = reason === 'reuse_detected' ? 'reuse_detected' : 'revoked'
    await this.db.run(
      `
        UPDATE auth_refresh_session
        SET status = ?, revoke_reason = ?, revoked_at = COALESCE(revoked_at, ?), updated_at = ?
        WHERE family_id = ?
          AND status IN ('active', 'rotated', 'revoked', 'reuse_detected')
      `,
      nextStatus,
      reason,
      revokedAt,
      revokedAt,
      familyId,
    )
  }

  async revokeAllForUser(userId: number, tenantId: number, reason: AuthRefreshRevokeReason, revokedAt: string) {
    await this.db.run(
      `
        UPDATE auth_refresh_session
        SET status = 'revoked', revoke_reason = ?, revoked_at = COALESCE(revoked_at, ?), updated_at = ?
        WHERE user_id = ?
          AND tenant_id = ?
          AND status IN ('active', 'rotated')
      `,
      reason,
      revokedAt,
      revokedAt,
      userId,
      tenantId,
    )
  }
}

export function createRefreshSessionRepository(db: BackendDatabase) {
  return new RefreshSessionRepository(db)
}