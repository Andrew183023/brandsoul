import type { BackendDatabase } from '../../db/index.js'
import type { SigningKeyRecord, SigningKeyStatus } from '../authTypes.js'

type SigningKeyRow = {
  id: string
  kid: string
  algorithm: 'RS256'
  status: SigningKeyStatus
  public_key_pem: string
  private_key_ref: string
  not_before: string
  activates_at: string
  retires_at: string | null
  expires_at: string | null
  issued_token_count: number
  created_by: string | null
  rotation_reason: string | null
  created_at: string
  updated_at: string
}

type UpsertSigningKeyInput = Omit<SigningKeyRecord, 'issuedTokenCount' | 'createdAt' | 'updatedAt'> & {
  issuedTokenCount?: number
  createdAt?: string
  updatedAt?: string
}

function mapRow(row?: SigningKeyRow): SigningKeyRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    kid: row.kid,
    algorithm: row.algorithm,
    status: row.status,
    publicKeyPem: row.public_key_pem,
    privateKeyRef: row.private_key_ref,
    notBefore: row.not_before,
    activatesAt: row.activates_at,
    retiresAt: row.retires_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    issuedTokenCount: row.issued_token_count,
    createdBy: row.created_by ?? undefined,
    rotationReason: row.rotation_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SigningKeyRepository {
  constructor(private readonly db: BackendDatabase) {}

  async findByKid(kid: string) {
    const row = await this.db.get<SigningKeyRow>(
      `SELECT * FROM auth_signing_key WHERE kid = ?`,
      kid,
    )

    return mapRow(row)
  }

  async upsertConfiguredKey(input: UpsertSigningKeyInput) {
    const existing = await this.findByKid(input.kid)
    const now = input.updatedAt ?? new Date().toISOString()

    if (existing) {
      await this.db.run(
        `
          UPDATE auth_signing_key
          SET algorithm = ?, status = ?, public_key_pem = ?, private_key_ref = ?, not_before = ?,
              activates_at = ?, retires_at = ?, expires_at = ?, created_by = ?, rotation_reason = ?, updated_at = ?
          WHERE kid = ?
        `,
        input.algorithm,
        input.status,
        input.publicKeyPem,
        input.privateKeyRef,
        input.notBefore,
        input.activatesAt,
        input.retiresAt ?? null,
        input.expiresAt ?? null,
        input.createdBy ?? null,
        input.rotationReason ?? null,
        now,
        input.kid,
      )

      return (await this.findByKid(input.kid))!
    }

    const createdAt = input.createdAt ?? now
    await this.db.run(
      `
        INSERT INTO auth_signing_key (
          id, kid, algorithm, status, public_key_pem, private_key_ref,
          not_before, activates_at, retires_at, expires_at, issued_token_count,
          created_by, rotation_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.id,
      input.kid,
      input.algorithm,
      input.status,
      input.publicKeyPem,
      input.privateKeyRef,
      input.notBefore,
      input.activatesAt,
      input.retiresAt ?? null,
      input.expiresAt ?? null,
      input.issuedTokenCount ?? 0,
      input.createdBy ?? null,
      input.rotationReason ?? null,
      createdAt,
      now,
    )

    return (await this.findByKid(input.kid))!
  }

  async getActiveKey(at: string) {
    const row = await this.db.get<SigningKeyRow>(
      `
        SELECT *
        FROM auth_signing_key
        WHERE status = 'active'
          AND activates_at <= ?
          AND (retires_at IS NULL OR retires_at > ?)
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY activates_at DESC
        LIMIT 1
      `,
      at,
      at,
      at,
    )

    return mapRow(row)
  }

  async listValidationKeys(at: string) {
    const rows = await this.db.all<SigningKeyRow[]>(
      `
        SELECT *
        FROM auth_signing_key
        WHERE status IN ('active', 'verifying')
          AND not_before <= ?
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY activates_at DESC
      `,
      at,
      at,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is SigningKeyRecord => Boolean(row))
  }

  async incrementIssuedTokenCount(id: string) {
    await this.db.run(
      `UPDATE auth_signing_key SET issued_token_count = issued_token_count + 1, updated_at = ? WHERE id = ?`,
      new Date().toISOString(),
      id,
    )
  }
}

export function createSigningKeyRepository(db: BackendDatabase) {
  return new SigningKeyRepository(db)
}