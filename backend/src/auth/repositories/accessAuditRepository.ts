import type { BackendDatabase } from '../../db/index.js'
import type { AccessAuditRecord } from '../authTypes.js'

type CreateAccessAuditInput = Omit<AccessAuditRecord, 'createdAt'> & {
  createdAt?: string
}

export class AccessAuditRepository {
  constructor(private readonly db: BackendDatabase) {}

  async create(input: CreateAccessAuditInput) {
    const createdAt = input.createdAt ?? new Date().toISOString()

    await this.db.run(
      `
        INSERT INTO auth_access_audit (
          id, jti, session_id, user_id, tenant_id, kid, token_version, issued_at, expires_at,
          audience, issuer, issued_by_flow, issued_by_ip, issued_by_user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.id,
      input.jti,
      input.sessionId ?? null,
      input.userId,
      input.tenantId,
      input.kid,
      input.tokenVersion,
      input.issuedAt,
      input.expiresAt,
      input.audience,
      input.issuer,
      input.issuedByFlow,
      input.issuedByIp ?? null,
      input.issuedByUserAgent ?? null,
      createdAt,
    )
  }
}

export function createAccessAuditRepository(db: BackendDatabase) {
  return new AccessAuditRepository(db)
}