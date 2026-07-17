import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'

export interface ExecutiveMemoryOfficeDiscoveryItem {
  tenantId: number
  officeId: string
}

export interface ExecutiveMemoryOfficeDiscoveryInput {
  tenantId: number
  cursor?: string
  limit?: number
}

export interface ExecutiveMemoryOfficeDiscoveryPage {
  items: ExecutiveMemoryOfficeDiscoveryItem[]
  nextCursor?: string
}

type ExecutiveMemoryOfficeDiscoveryRow = {
  office_id: string
  tenant_id: number
  entity_profile: string
}

const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 100
const SCAN_BATCH_MULTIPLIER = 4
const MIN_SCAN_BATCH = 50
const INELIGIBLE_LIFECYCLE_STATUSES = new Set(['archived', 'deleted', 'invalid'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    return DEFAULT_LIMIT
  }

  if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
    return DEFAULT_LIMIT
  }

  return limit
}

function normalizeCursor(cursor?: string) {
  if (typeof cursor !== 'string') {
    return undefined
  }

  const trimmed = cursor.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Executive memory office discovery requires ${label}.`)
  }
}

function readEntityProfile(value: string): EntityProfile | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? (parsed as EntityProfile) : null
  } catch {
    return null
  }
}

function readLifecycleStatus(entityProfile: EntityProfile) {
  const metadata: Record<string, unknown> = isRecord(entityProfile.metadata) ? entityProfile.metadata : {}
  const lifecycle: Record<string, unknown> = isRecord(metadata.lifecycle) ? metadata.lifecycle : {}
  return typeof lifecycle.status === 'string' ? lifecycle.status : undefined
}

function readBusinessType(entityProfile: EntityProfile) {
  const metadata: Record<string, unknown> = isRecord(entityProfile.metadata) ? entityProfile.metadata : {}
  const businessConfig: Record<string, unknown> = isRecord(metadata.businessConfig) ? metadata.businessConfig : {}
  return typeof businessConfig.businessType === 'string' ? businessConfig.businessType : undefined
}

function isEligibleLegalOffice(entityProfile: EntityProfile | null) {
  if (!entityProfile) {
    return false
  }

  if (readBusinessType(entityProfile) !== 'legal') {
    return false
  }

  const lifecycleStatus = readLifecycleStatus(entityProfile)
  return !INELIGIBLE_LIFECYCLE_STATUSES.has(lifecycleStatus ?? '')
}

function buildScanBatchSize(limit: number) {
  return Math.max(MIN_SCAN_BATCH, limit * SCAN_BATCH_MULTIPLIER)
}

export class ExecutiveMemoryOfficeDiscoveryService {
  constructor(private readonly db: BackendDatabase) {}

  async listEligibleOffices(
    input: ExecutiveMemoryOfficeDiscoveryInput,
  ): Promise<ExecutiveMemoryOfficeDiscoveryPage> {
    requirePositiveInteger(input.tenantId, 'tenantId')
    const limit = normalizeLimit(input.limit)
    const scanBatchSize = buildScanBatchSize(limit)
    const items: ExecutiveMemoryOfficeDiscoveryItem[] = []
    let cursor = normalizeCursor(input.cursor)

    while (items.length < limit) {
      const rows = await this.db.all<ExecutiveMemoryOfficeDiscoveryRow[]>(
        `
          SELECT DISTINCT
            entities.id AS office_id,
            entities.owner_tenant_id AS tenant_id,
            entities.entity_profile AS entity_profile
          FROM entity_profile AS entities
          INNER JOIN flow_auth_user AS users
            ON users.id = entities.owner_user_id
           AND users.is_active = 1
          INNER JOIN flow_auth_tenant AS tenants
            ON tenants.id = entities.owner_tenant_id
           AND tenants.is_active = 1
          INNER JOIN flow_auth_membership AS memberships
            ON memberships.user_id = entities.owner_user_id
           AND memberships.tenant_id = entities.owner_tenant_id
           AND memberships.is_active = 1
          WHERE entities.owner_user_id IS NOT NULL
            AND entities.owner_tenant_id IS NOT NULL
            AND entities.owner_tenant_id = ?
            AND (? IS NULL OR entities.id > ?)
          ORDER BY entities.id ASC
          LIMIT ?
        `,
        input.tenantId,
        cursor ?? null,
        cursor ?? null,
        scanBatchSize,
      )

      if (rows.length === 0) {
        return { items }
      }

      let scannedCursor = cursor
      for (const row of rows) {
        scannedCursor = row.office_id

        if (!isEligibleLegalOffice(readEntityProfile(row.entity_profile))) {
          continue
        }

        items.push({
          tenantId: row.tenant_id,
          officeId: row.office_id,
        })

        if (items.length === limit) {
          return {
            items,
            nextCursor: scannedCursor,
          }
        }
      }

      if (rows.length < scanBatchSize) {
        return { items }
      }

      cursor = scannedCursor
    }

    return { items }
  }
}

export function createExecutiveMemoryOfficeDiscoveryService(db: BackendDatabase) {
  return new ExecutiveMemoryOfficeDiscoveryService(db)
}
