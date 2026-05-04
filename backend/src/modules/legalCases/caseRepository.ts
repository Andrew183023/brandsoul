import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'

import type {
  AddCaseMessageInput,
  CaseAssignmentStatus,
  AssignmentResponseStatus,
  CaseAssignmentRecord,
  CaseDispatchRecord,
  CaseDispatchStatus,
  CaseMessageRecord,
  CaseRecord,
  CaseStatus,
  CaseTimelineEventInput,
  CaseTimelineEventRecord,
  CreateCaseInput,
  DispatchCaseInput,
  JsonObject,
  NotificationRecord,
} from './caseTypes.js'

type CaseAcceptIdempotencyRow = {
  tenant_id: number
  case_id: string
  professional_id: string
  idempotency_key: string
  response_status_code: number | null
  response_body: unknown
  created_at: string | Date
  updated_at: string | Date
}

type CaseAcceptIdempotencyRecord = {
  tenantId: number
  caseId: string
  professionalId: string
  idempotencyKey: string
  responseStatusCode?: number
  responseBody?: JsonObject
  createdAt: string
  updatedAt: string
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

function parseJsonObject(value: unknown): JsonObject {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JsonObject
      }
      return {}
    } catch {
      return {}
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject
  }

  return {}
}

function parseJsonArray(value: unknown): unknown[] {
  if (!value) {
    return []
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  if (Array.isArray(value)) {
    return value
  }

  return []
}

function mapCaseAcceptIdempotencyRow(row?: CaseAcceptIdempotencyRow): CaseAcceptIdempotencyRecord | null {
  if (!row) {
    return null
  }

  return {
    tenantId: row.tenant_id,
    caseId: row.case_id,
    professionalId: row.professional_id,
    idempotencyKey: row.idempotency_key,
    responseStatusCode: typeof row.response_status_code === 'number' ? row.response_status_code : undefined,
    responseBody: row.response_body ? parseJsonObject(row.response_body) : undefined,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  }
}

function mapCaseRow(row?: {
  id: string
  tenant_id: number
  case_number: string | null
  entity_id: string | null
  created_by_user_id: number | null
  title: string
  description: string | null
  status: CaseStatus
  priority: CaseRecord['priority']
  practice_area: string | null
  source: string | null
  opened_at: string | Date
  closed_at: string | Date | null
  archived_at: string | Date | null
  resolution_reason: string | null
  lead_professional_id: string | null
  centelha_context: unknown
  metadata: unknown
  created_at: string | Date
  updated_at: string | Date
}): CaseRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseNumber: row.case_number ?? undefined,
    entityId: row.entity_id ?? undefined,
    createdByUserId: row.created_by_user_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    practiceArea: row.practice_area ?? undefined,
    source: row.source ?? undefined,
    openedAt: normalizeTimestamp(row.opened_at),
    closedAt: row.closed_at ? normalizeTimestamp(row.closed_at) : undefined,
    archivedAt: row.archived_at ? normalizeTimestamp(row.archived_at) : undefined,
    resolutionReason: row.resolution_reason ?? undefined,
    leadProfessionalId: row.lead_professional_id ?? undefined,
    centelhaContext: parseJsonObject(row.centelha_context),
    metadata: parseJsonObject(row.metadata),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  }
}

function mapCaseMessageRow(row?: {
  id: string
  tenant_id: number
  case_id: string
  author_professional_id: string | null
  message_type: CaseMessageRecord['messageType']
  message_status: CaseMessageRecord['messageStatus']
  direction: CaseMessageRecord['direction']
  channel: string | null
  subject: string | null
  body: string
  content: unknown
  attachments: unknown
  sequence_no: number
  sent_at: string | Date
  created_at: string | Date
  updated_at: string | Date
}): CaseMessageRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    authorProfessionalId: row.author_professional_id ?? undefined,
    messageType: row.message_type,
    messageStatus: row.message_status,
    direction: row.direction,
    channel: row.channel ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body,
    content: parseJsonObject(row.content),
    attachments: parseJsonArray(row.attachments),
    sequenceNo: row.sequence_no,
    sentAt: normalizeTimestamp(row.sent_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  }
}

function mapCaseTimelineRow(row?: {
  id: string
  tenant_id: number
  case_id: string
  event_type: CaseTimelineEventRecord['eventType']
  actor_professional_id: string | null
  actor_user_id: number | null
  occurred_at: string | Date
  payload: unknown
  created_at: string | Date
  updated_at: string | Date
}): CaseTimelineEventRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    eventType: row.event_type,
    actorProfessionalId: row.actor_professional_id ?? undefined,
    actorUserId: row.actor_user_id ?? undefined,
    occurredAt: normalizeTimestamp(row.occurred_at),
    payload: parseJsonObject(row.payload),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  }
}

function mapCaseAssignmentRow(row?: {
  id: string
  tenant_id: number
  case_id: string
  professional_id: string
  role: string
  status: CaseAssignmentRecord['status']
  assigned_by_professional_id: string | null
  assigned_at: string | Date
  unassigned_at: string | Date | null
  metadata: unknown
  created_at: string | Date
  updated_at: string | Date
}): CaseAssignmentRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    professionalId: row.professional_id,
    role: row.role,
    status: row.status,
    assignedByProfessionalId: row.assigned_by_professional_id ?? undefined,
    assignedAt: normalizeTimestamp(row.assigned_at),
    unassignedAt: row.unassigned_at ? normalizeTimestamp(row.unassigned_at) : undefined,
    metadata: parseJsonObject(row.metadata),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  }
}

function mapCaseDispatchRow(row?: {
  id: string
  tenant_id: number
  case_id: string
  professional_id: string
  status: CaseDispatchStatus
  created_at: string | Date
  updated_at: string | Date
  expires_at: string | Date
  accepted_at: string | Date | null
  rejected_at: string | Date | null
  expired_at: string | Date | null
  metadata: unknown
}): CaseDispatchRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    professionalId: row.professional_id,
    status: row.status,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
    expiresAt: normalizeTimestamp(row.expires_at),
    acceptedAt: row.accepted_at ? normalizeTimestamp(row.accepted_at) : undefined,
    rejectedAt: row.rejected_at ? normalizeTimestamp(row.rejected_at) : undefined,
    expiredAt: row.expired_at ? normalizeTimestamp(row.expired_at) : undefined,
    metadata: parseJsonObject(row.metadata),
  }
}

function mapNotificationRow(row?: {
  id: string
  tenant_id: number
  case_id: string
  professional_id: string
  event_type: string
  occurred_at: string | Date
  payload: unknown
  case_title: string | null
}): NotificationRecord | null {
  if (!row) {
    return null
  }

  const payload = parseJsonObject(row.payload)
  const readAt = typeof payload.readAt === 'string' && payload.readAt.trim().length > 0
    ? payload.readAt
    : undefined
  const title = typeof row.case_title === 'string' && row.case_title.trim().length > 0
    ? row.case_title
    : `Caso ${row.case_id}`
  const priority = row.event_type === 'assigned'
    ? 'high'
    : row.event_type === 'message_added'
      ? 'medium'
      : 'low'
  const message = row.event_type === 'assigned'
    ? 'Novo caso atribuido para sua fila.'
    : row.event_type === 'message_added'
      ? 'Nova mensagem recebida no caso.'
      : 'Nova atualizacao no caso.'

  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    professionalId: row.professional_id,
    eventType: row.event_type,
    title,
    message,
    priority,
    isRead: Boolean(readAt),
    readAt,
    occurredAt: normalizeTimestamp(row.occurred_at),
    payload,
  }
}

export type LawyerInboxAssignmentRecord = {
  assignmentId: string
  caseId: string
  entityId?: string
  title: string
  practiceArea?: string
  priority: string
  status: string
  assignedAt: string
  dispatchExpiresAt?: string
  caseStatus: string
  city?: string
  state?: string
}

export class CaseRepository {
  constructor(private readonly db: BackendDatabase) {}

  async createCase(input: CreateCaseInput): Promise<CaseRecord> {
    const id = randomUUID()
    const openedAt = input.openedAt ?? new Date().toISOString()

    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO cases (
            id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
            practice_area, source, opened_at, lead_professional_id, centelha_context, metadata, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
        `
      : `
          INSERT INTO cases (
            id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
            practice_area, source, opened_at, lead_professional_id, centelha_context, metadata, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `

    await this.db.run(
      insertSql,
      id,
      input.tenantId,
      input.caseNumber ?? null,
      input.entityId,
      input.createdByUserId ?? null,
      input.title,
      input.description ?? null,
      input.status ?? 'open',
      input.priority ?? 'normal',
      input.practiceArea ?? null,
      input.source ?? null,
      openedAt,
      input.leadProfessionalId ?? null,
      JSON.stringify(input.centelhaContext ?? {}),
      JSON.stringify(input.metadata ?? {}),
      openedAt,
      openedAt,
    )

    const record = await this.getCaseById(input.tenantId, id)
    if (!record) {
      throw new Error(`Failed to create case ${id}.`)
    }

    return record
  }

  async getCaseById(tenantId: number, caseId: string): Promise<CaseRecord | null> {
    const row = await this.db.get<Parameters<typeof mapCaseRow>[0]>(
      `
        SELECT
          id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
          practice_area, source, opened_at, closed_at, archived_at, resolution_reason, lead_professional_id,
          centelha_context, metadata, created_at, updated_at
        FROM cases
        WHERE tenant_id = ? AND id = ?
      `,
      tenantId,
      caseId,
    )

    return mapCaseRow(row)
  }

  async getCaseByIdForUpdate(tenantId: number, caseId: string): Promise<CaseRecord | null> {
    const row = await this.db.get<Parameters<typeof mapCaseRow>[0]>(
      this.db.dialect === 'postgres'
        ? `
            SELECT
              id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
              practice_area, source, opened_at, closed_at, archived_at, resolution_reason, lead_professional_id,
              centelha_context, metadata, created_at, updated_at
            FROM cases
            WHERE tenant_id = ? AND id = ?
            FOR UPDATE
          `
        : `
            SELECT
              id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
              practice_area, source, opened_at, closed_at, archived_at, resolution_reason, lead_professional_id,
              centelha_context, metadata, created_at, updated_at
            FROM cases
            WHERE tenant_id = ? AND id = ?
          `,
      tenantId,
      caseId,
    )

    return mapCaseRow(row)
  }

  async getCaseAcceptIdempotencyRecord(
    tenantId: number,
    caseId: string,
    professionalId: string,
    idempotencyKey: string,
  ): Promise<CaseAcceptIdempotencyRecord | null> {
    const row = await this.db.get<CaseAcceptIdempotencyRow>(
      `
        SELECT
          tenant_id, case_id, professional_id, idempotency_key, response_status_code, response_body, created_at, updated_at
        FROM case_accept_idempotency
        WHERE tenant_id = ? AND case_id = ? AND professional_id = ? AND idempotency_key = ?
      `,
      tenantId,
      caseId,
      professionalId,
      idempotencyKey,
    )

    return mapCaseAcceptIdempotencyRow(row)
  }

  async createCaseAcceptIdempotencyRecord(
    tenantId: number,
    caseId: string,
    professionalId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const now = new Date().toISOString()
    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO case_accept_idempotency (
            tenant_id, case_id, professional_id, idempotency_key, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id, case_id, professional_id, idempotency_key) DO NOTHING
        `
      : `
          INSERT OR IGNORE INTO case_accept_idempotency (
            tenant_id, case_id, professional_id, idempotency_key, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `

    const result = await this.db.run(
      insertSql,
      tenantId,
      caseId,
      professionalId,
      idempotencyKey,
      now,
      now,
    )

    return Number(result.changes ?? 0) > 0
  }

  async completeCaseAcceptIdempotencyRecord(
    tenantId: number,
    caseId: string,
    professionalId: string,
    idempotencyKey: string,
    responseStatusCode: number,
    responseBody: JsonObject,
  ): Promise<void> {
    const now = new Date().toISOString()

    await this.db.run(
      `
        UPDATE case_accept_idempotency
        SET response_status_code = ?, response_body = ?, updated_at = ?
        WHERE tenant_id = ? AND case_id = ? AND professional_id = ? AND idempotency_key = ?
      `,
      responseStatusCode,
      JSON.stringify(responseBody),
      now,
      tenantId,
      caseId,
      professionalId,
      idempotencyKey,
    )
  }

  async getCaseByIdAnyTenant(caseId: string): Promise<CaseRecord | null> {
    const row = await this.db.get<Parameters<typeof mapCaseRow>[0]>(
      `
        SELECT
          id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
          practice_area, source, opened_at, closed_at, archived_at, resolution_reason, lead_professional_id,
          centelha_context, metadata, created_at, updated_at
        FROM cases
        WHERE id = ?
      `,
      caseId,
    )

    return mapCaseRow(row)
  }

  async listCasesByEntity(tenantId: number, entityId: string): Promise<CaseRecord[]> {
    const rows = await this.db.all<Array<NonNullable<Parameters<typeof mapCaseRow>[0]>>>(
      `
        SELECT
          id, tenant_id, case_number, entity_id, created_by_user_id, title, description, status, priority,
          practice_area, source, opened_at, closed_at, archived_at, resolution_reason, lead_professional_id,
          centelha_context, metadata, created_at, updated_at
        FROM cases
        WHERE tenant_id = ? AND entity_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      tenantId,
      entityId,
    )

    return rows.map((row) => mapCaseRow(row)).filter((row): row is CaseRecord => Boolean(row))
  }

  async getProfessionalById(tenantId: number, professionalId: string): Promise<{ id: string } | null> {
    const row = await this.db.get<{ id: string }>(
      `
        SELECT id
        FROM professionals
        WHERE tenant_id = ? AND id = ?
      `,
      tenantId,
      professionalId,
    )

    return row ?? null
  }

  async getProfessionalByUserId(tenantId: number, userId: number): Promise<{ id: string } | null> {
    const row = await this.db.get<{ id: string }>(
      `
        SELECT id
        FROM professionals
        WHERE tenant_id = ? AND user_id = ?
      `,
      tenantId,
      userId,
    )

    return row ?? null
  }

  async addMessage(input: AddCaseMessageInput): Promise<CaseMessageRecord> {
    const id = randomUUID()
    const createdAt = input.sentAt ?? new Date().toISOString()
    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO case_messages (
            id, tenant_id, case_id, author_professional_id, message_type, message_status, direction, channel,
            subject, body, content, attachments, sent_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)
        `
      : `
          INSERT INTO case_messages (
            id, tenant_id, case_id, author_professional_id, message_type, message_status, direction, channel,
            subject, body, content, attachments, sent_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `

    await this.db.run(
      insertSql,
      id,
      input.tenantId,
      input.caseId,
      input.authorProfessionalId ?? null,
      input.messageType ?? 'note',
      input.messageStatus ?? 'sent',
      input.direction ?? 'internal',
      input.channel ?? null,
      input.subject ?? null,
      input.body,
      JSON.stringify(input.content ?? {}),
      JSON.stringify(input.attachments ?? []),
      input.sentAt ?? createdAt,
      createdAt,
      createdAt,
    )

    const row = await this.db.get<Parameters<typeof mapCaseMessageRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, author_professional_id, message_type, message_status, direction, channel,
          subject, body, content, attachments, sequence_no, sent_at, created_at, updated_at
        FROM case_messages
        WHERE tenant_id = ? AND case_id = ? AND id = ?
      `,
      input.tenantId,
      input.caseId,
      id,
    )

    const record = mapCaseMessageRow(row)
    if (!record) {
      throw new Error(`Failed to create case message ${id}.`)
    }

    return record
  }

  async createAssignment(input: DispatchCaseInput): Promise<CaseAssignmentRecord> {
    const id = randomUUID()
    const assignedAt = input.assignedAt ?? new Date().toISOString()
    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO case_assignments (
            id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id, assigned_at, metadata, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
        `
      : `
          INSERT INTO case_assignments (
            id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id, assigned_at, metadata, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `

    await this.db.run(
      insertSql,
      id,
      input.tenantId,
      input.caseId,
      input.professionalId,
      'responsible',
      'active',
      input.assignedByProfessionalId ?? null,
      assignedAt,
      JSON.stringify(input.metadata ?? {}),
      assignedAt,
      assignedAt,
    )

    const row = await this.db.get<Parameters<typeof mapCaseAssignmentRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id,
          assigned_at, unassigned_at, metadata, created_at, updated_at
        FROM case_assignments
        WHERE tenant_id = ? AND case_id = ? AND id = ?
      `,
      input.tenantId,
      input.caseId,
      id,
    )

    const record = mapCaseAssignmentRow(row)
    if (!record) {
      throw new Error(`Failed to create case assignment ${id}.`)
    }

    return record
  }

  async createCaseDispatch(input: {
    tenantId: number
    caseId: string
    professionalId: string
    expiresAt: string
    metadata?: JsonObject
  }): Promise<CaseDispatchRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO case_dispatches (
            id, tenant_id, case_id, professional_id, status, created_at, updated_at, expires_at, metadata
          )
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?::jsonb)
        `
      : `
          INSERT INTO case_dispatches (
            id, tenant_id, case_id, professional_id, status, created_at, updated_at, expires_at, metadata
          )
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
        `

    await this.db.run(
      insertSql,
      id,
      input.tenantId,
      input.caseId,
      input.professionalId,
      now,
      now,
      input.expiresAt,
      JSON.stringify(input.metadata ?? {}),
    )

    const row = await this.db.get<Parameters<typeof mapCaseDispatchRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, status, created_at, updated_at, expires_at,
          accepted_at, rejected_at, expired_at, metadata
        FROM case_dispatches
        WHERE tenant_id = ? AND id = ?
      `,
      input.tenantId,
      id,
    )
    const record = mapCaseDispatchRow(row)
    if (!record) {
      throw new Error(`Failed to create case dispatch ${id}.`)
    }
    return record
  }

  async getCaseDispatchById(tenantId: number, dispatchId: string): Promise<CaseDispatchRecord | null> {
    const row = await this.db.get<Parameters<typeof mapCaseDispatchRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, status, created_at, updated_at, expires_at,
          accepted_at, rejected_at, expired_at, metadata
        FROM case_dispatches
        WHERE tenant_id = ? AND id = ?
      `,
      tenantId,
      dispatchId,
    )
    return mapCaseDispatchRow(row)
  }

  async listCaseDispatchesByCase(tenantId: number, caseId: string): Promise<CaseDispatchRecord[]> {
    const rows = await this.db.all<Array<NonNullable<Parameters<typeof mapCaseDispatchRow>[0]>>>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, status, created_at, updated_at, expires_at,
          accepted_at, rejected_at, expired_at, metadata
        FROM case_dispatches
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY created_at ASC, id ASC
      `,
      tenantId,
      caseId,
    )
    return rows.map((row) => mapCaseDispatchRow(row)).filter((row): row is CaseDispatchRecord => Boolean(row))
  }

  async updateCaseDispatchStatus(
    tenantId: number,
    dispatchId: string,
    status: CaseDispatchStatus,
  ): Promise<CaseDispatchRecord | null> {
    const now = new Date().toISOString()
    await this.db.run(
      `
        UPDATE case_dispatches
        SET
          status = ?,
          accepted_at = CASE WHEN ? = 'accepted' THEN ? ELSE accepted_at END,
          rejected_at = CASE WHEN ? = 'rejected' THEN ? ELSE rejected_at END,
          expired_at = CASE WHEN ? = 'expired' THEN ? ELSE expired_at END,
          updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      status,
      status,
      now,
      status,
      now,
      status,
      now,
      now,
      tenantId,
      dispatchId,
    )

    return this.getCaseDispatchById(tenantId, dispatchId)
  }

  async expirePendingDispatchesForCaseExcept(
    tenantId: number,
    caseId: string,
    exceptDispatchId: string,
  ): Promise<void> {
    const now = new Date().toISOString()
    await this.db.run(
      `
        UPDATE case_dispatches
        SET status = 'expired', expired_at = ?, updated_at = ?
        WHERE tenant_id = ?
          AND case_id = ?
          AND status = 'pending'
          AND id <> ?
      `,
      now,
      now,
      tenantId,
      caseId,
      exceptDispatchId,
    )
  }

  async getAssignmentById(tenantId: number, assignmentId: string): Promise<CaseAssignmentRecord | null> {
    const row = await this.db.get<Parameters<typeof mapCaseAssignmentRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id,
          assigned_at, unassigned_at, metadata, created_at, updated_at
        FROM case_assignments
        WHERE tenant_id = ? AND id = ?
      `,
      tenantId,
      assignmentId,
    )

    return mapCaseAssignmentRow(row)
  }

  async getLatestAssignmentForCaseProfessional(
    tenantId: number,
    caseId: string,
    professionalId: string,
  ): Promise<CaseAssignmentRecord | null> {
    const row = await this.db.get<Parameters<typeof mapCaseAssignmentRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id,
          assigned_at, unassigned_at, metadata, created_at, updated_at
        FROM case_assignments
        WHERE tenant_id = ? AND case_id = ? AND professional_id = ?
        ORDER BY assigned_at DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      tenantId,
      caseId,
      professionalId,
    )

    return mapCaseAssignmentRow(row)
  }

  async listAssignmentsByCase(tenantId: number, caseId: string): Promise<CaseAssignmentRecord[]> {
    const rows = await this.db.all<Array<NonNullable<Parameters<typeof mapCaseAssignmentRow>[0]>>>(
      `
        SELECT
          id, tenant_id, case_id, professional_id, role, status, assigned_by_professional_id,
          assigned_at, unassigned_at, metadata, created_at, updated_at
        FROM case_assignments
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY assigned_at DESC, created_at DESC, id DESC
      `,
      tenantId,
      caseId,
    )

    return rows.map((row) => mapCaseAssignmentRow(row)).filter((row): row is CaseAssignmentRecord => Boolean(row))
  }

  async countAssignmentsForCase(tenantId: number, caseId: string): Promise<number> {
    const row = await this.db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM case_assignments
        WHERE tenant_id = ? AND case_id = ?
      `,
      tenantId,
      caseId,
    )

    return Number(row?.total ?? 0)
  }

  async countAssignmentsForProfessional(tenantId: number, professionalId: string): Promise<number> {
    const row = await this.db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM case_assignments
        WHERE tenant_id = ? AND professional_id = ? AND status = 'active'
      `,
      tenantId,
      professionalId,
    )

    return Number(row?.total ?? 0)
  }

  async listAssignmentsForProfessionalInbox(tenantId: number, professionalId: string): Promise<LawyerInboxAssignmentRecord[]> {
    const rows = await this.db.all<Array<{
      assignment_id: string
      case_id: string
      entity_id: string | null
      case_title: string
      case_practice_area: string | null
      case_priority: string
      assignment_status: string
      assigned_at: string | Date
      dispatch_expires_at: string | Date | null
      case_status: string
      case_metadata: unknown
    }>>(
      `
        SELECT
          assignments.id AS assignment_id,
          assignments.case_id AS case_id,
          cases.entity_id AS entity_id,
          cases.title AS case_title,
          cases.practice_area AS case_practice_area,
          cases.priority AS case_priority,
          assignments.status AS assignment_status,
          assignments.assigned_at AS assigned_at,
          (
            SELECT dispatches.expires_at
            FROM case_dispatches AS dispatches
            WHERE dispatches.tenant_id = assignments.tenant_id
              AND dispatches.case_id = assignments.case_id
              AND dispatches.professional_id = assignments.professional_id
              AND dispatches.status = 'pending'
            ORDER BY dispatches.created_at DESC, dispatches.id DESC
            LIMIT 1
          ) AS dispatch_expires_at,
          cases.status AS case_status,
          cases.metadata AS case_metadata
        FROM case_assignments AS assignments
        INNER JOIN cases
          ON cases.tenant_id = assignments.tenant_id
          AND cases.id = assignments.case_id
        WHERE assignments.tenant_id = ?
          AND assignments.professional_id = ?
        ORDER BY
          CASE
            WHEN assignments.status = 'active' THEN 0
            WHEN assignments.status = 'accepted' THEN 1
            WHEN assignments.status = 'rejected' THEN 2
            ELSE 3
          END ASC,
          assignments.assigned_at DESC,
          assignments.id DESC
      `,
      tenantId,
      professionalId,
    )

    return rows.map((row) => {
      const metadata = parseJsonObject(row.case_metadata)
      const nestedLocation = parseJsonObject(metadata.location)
      const city = typeof metadata.city === 'string'
        ? metadata.city.trim()
        : (typeof nestedLocation.city === 'string' ? nestedLocation.city.trim() : '')
      const state = typeof metadata.state === 'string'
        ? metadata.state.trim()
        : (typeof nestedLocation.state === 'string' ? nestedLocation.state.trim() : '')

      return {
        assignmentId: row.assignment_id,
        caseId: row.case_id,
        entityId: row.entity_id ?? undefined,
        title: row.case_title,
        practiceArea: row.case_practice_area ?? undefined,
        priority: row.case_priority,
        status: row.assignment_status,
        assignedAt: normalizeTimestamp(row.assigned_at),
        dispatchExpiresAt: row.dispatch_expires_at ? normalizeTimestamp(row.dispatch_expires_at) : undefined,
        caseStatus: row.case_status,
        city: city || undefined,
        state: state || undefined,
      }
    })
  }

  async listMessages(tenantId: number, caseId: string): Promise<CaseMessageRecord[]> {
    const rows = await this.db.all<Array<NonNullable<Parameters<typeof mapCaseMessageRow>[0]>>>(
      `
        SELECT
          id, tenant_id, case_id, author_professional_id, message_type, message_status, direction, channel,
          subject, body, content, attachments, sequence_no, sent_at, created_at, updated_at
        FROM case_messages
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY sequence_no ASC, created_at ASC, id ASC
      `,
      tenantId,
      caseId,
    )

    return rows.map((row) => mapCaseMessageRow(row)).filter((row): row is CaseMessageRecord => Boolean(row))
  }

  async addTimelineEvent(input: CaseTimelineEventInput): Promise<CaseTimelineEventRecord> {
    const id = randomUUID()
    const occurredAt = input.occurredAt ?? new Date().toISOString()
    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO case_timeline (
            id, tenant_id, case_id, event_type, actor_professional_id, occurred_at, payload, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
        `
      : `
          INSERT INTO case_timeline (
            id, tenant_id, case_id, event_type, actor_professional_id, occurred_at, payload, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `

    await this.db.run(
      insertSql,
      id,
      input.tenantId,
      input.caseId,
      input.eventType,
      input.actorProfessionalId ?? null,
      occurredAt,
      JSON.stringify(input.payload ?? {}),
      occurredAt,
      occurredAt,
    )

    const row = await this.db.get<Parameters<typeof mapCaseTimelineRow>[0]>(
      `
        SELECT
          id, tenant_id, case_id, event_type, actor_professional_id, actor_user_id, occurred_at, payload, created_at, updated_at
        FROM case_timeline
        WHERE tenant_id = ? AND case_id = ? AND id = ?
      `,
      input.tenantId,
      input.caseId,
      id,
    )

    const record = mapCaseTimelineRow(row)
    if (!record) {
      throw new Error(`Failed to create case timeline event ${id}.`)
    }

    return record
  }

  async updateCaseStatus(
    tenantId: number,
    caseId: string,
    status: CaseStatus,
    resolutionReason?: string,
  ): Promise<CaseRecord | null> {
    const now = new Date().toISOString()
    const closedAt = status === 'closed' ? now : null

    await this.db.run(
      `
        UPDATE cases
        SET status = ?, resolution_reason = ?, closed_at = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      status,
      resolutionReason ?? null,
      closedAt,
      now,
      tenantId,
      caseId,
    )

    return this.getCaseById(tenantId, caseId)
  }

  async closeCase(tenantId: number, caseId: string, resolutionReason?: string): Promise<CaseRecord | null> {
    return this.updateCaseStatus(tenantId, caseId, 'closed', resolutionReason)
  }

  async updateAssignmentStatus(
    tenantId: number,
    assignmentId: string,
    status: AssignmentResponseStatus | Extract<CaseAssignmentStatus, 'expired' | 'completed' | 'revoked'>,
  ): Promise<CaseAssignmentRecord | null> {
    const now = new Date().toISOString()

    await this.db.run(
      `
        UPDATE case_assignments
        SET
          status = ?,
          unassigned_at = CASE WHEN ? IN ('rejected', 'revoked', 'expired', 'completed') THEN COALESCE(unassigned_at, ?) ELSE unassigned_at END,
          updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      status,
      status,
      now,
      now,
      tenantId,
      assignmentId,
    )

    return this.getAssignmentById(tenantId, assignmentId)
  }

  async expireAssignmentsForCaseExcept(
    tenantId: number,
    caseId: string,
    professionalId: string,
  ): Promise<void> {
    const now = new Date().toISOString()

    await this.db.run(
      `
        UPDATE case_assignments
        SET status = 'expired', unassigned_at = COALESCE(unassigned_at, ?), updated_at = ?
        WHERE tenant_id = ?
          AND case_id = ?
          AND professional_id <> ?
          AND status = 'active'
      `,
      now,
      now,
      tenantId,
      caseId,
      professionalId,
    )
  }

  async expireAssignmentsPastDispatchExpiry(tenantId: number, professionalId?: string): Promise<number> {
    const now = new Date().toISOString()
    const filterByProfessional = typeof professionalId === 'string' && professionalId.length > 0

    const result = await this.db.run(
      `
        UPDATE case_assignments
        SET status = 'expired', unassigned_at = COALESCE(unassigned_at, ?), updated_at = ?
        WHERE tenant_id = ?
          AND status = 'active'
          ${filterByProfessional ? 'AND professional_id = ?' : ''}
          AND EXISTS (
            SELECT 1
            FROM case_dispatches
            WHERE case_dispatches.tenant_id = case_assignments.tenant_id
              AND case_dispatches.case_id = case_assignments.case_id
              AND case_dispatches.professional_id = case_assignments.professional_id
              AND case_dispatches.status = 'pending'
              AND case_dispatches.expires_at < ?
          )
      `,
      ...(filterByProfessional
        ? [now, now, tenantId, professionalId, now]
        : [now, now, tenantId, now]),
    )

    return Number(result.changes ?? 0)
  }

  async updateCaseLeadProfessional(
    tenantId: number,
    caseId: string,
    professionalId: string | null,
  ): Promise<CaseRecord | null> {
    const now = new Date().toISOString()

    await this.db.run(
      `
        UPDATE cases
        SET lead_professional_id = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      professionalId,
      now,
      tenantId,
      caseId,
    )

    return this.getCaseById(tenantId, caseId)
  }

  async assignCaseLeadProfessionalIfUnassigned(
    tenantId: number,
    caseId: string,
    professionalId: string,
  ): Promise<number> {
    const now = new Date().toISOString()
    const result = await this.db.run(
      `
        UPDATE cases
        SET lead_professional_id = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
          AND lead_professional_id IS NULL
      `,
      professionalId,
      now,
      tenantId,
      caseId,
    )

    return Number(result.changes ?? 0)
  }

  async updateCaseCreatorOwnership(
    tenantId: number,
    caseId: string,
    createdByUserId: number,
  ): Promise<CaseRecord | null> {
    const now = new Date().toISOString()

    await this.db.run(
      `
        UPDATE cases
        SET created_by_user_id = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ? AND created_by_user_id IS NULL
      `,
      createdByUserId,
      now,
      tenantId,
      caseId,
    )

    return this.getCaseById(tenantId, caseId)
  }

  async updateCaseMetadata(
    tenantId: number,
    caseId: string,
    metadata: JsonObject,
  ): Promise<CaseRecord | null> {
    const now = new Date().toISOString()
    const updateSql = this.db.dialect === 'postgres'
      ? `
          UPDATE cases
          SET metadata = ?::jsonb, updated_at = ?
          WHERE tenant_id = ? AND id = ?
        `
      : `
          UPDATE cases
          SET metadata = ?, updated_at = ?
          WHERE tenant_id = ? AND id = ?
        `

    await this.db.run(
      updateSql,
      JSON.stringify(metadata),
      now,
      tenantId,
      caseId,
    )

    return this.getCaseById(tenantId, caseId)
  }

  async addLearningEvent(input: {
    tenantId: number
    professionalId?: string
    caseId?: string
    eventType: string
    source: string
    impactScore?: number
    payload?: JsonObject
    occurredAt?: string
  }): Promise<void> {
    const id = randomUUID()
    const occurredAt = input.occurredAt ?? new Date().toISOString()
    const insertSql = this.db.dialect === 'postgres'
      ? `
          INSERT INTO learning_events (
            id, tenant_id, professional_id, case_id, event_type, source, impact_score, payload, occurred_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
        `
      : `
          INSERT INTO learning_events (
            id, tenant_id, professional_id, case_id, event_type, source, impact_score, payload, occurred_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `

    await this.db.run(
      insertSql,
      id,
      input.tenantId,
      input.professionalId ?? null,
      input.caseId ?? null,
      input.eventType,
      input.source,
      input.impactScore ?? null,
      JSON.stringify(input.payload ?? {}),
      occurredAt,
      occurredAt,
      occurredAt,
    )
  }

  async listAssignmentNotifications(tenantId: number, professionalId: string): Promise<NotificationRecord[]> {
    const rows = await this.db.all<Array<{
      id: string
      tenant_id: number
      case_id: string
      professional_id: string
      event_type: string
      occurred_at: string | Date
      payload: unknown
      case_title: string | null
    }>>(
      `
        SELECT
          events.id,
          events.tenant_id,
          events.case_id,
          events.professional_id,
          events.event_type,
          events.occurred_at,
          events.payload,
          cases.title AS case_title
        FROM learning_events AS events
        LEFT JOIN cases ON cases.tenant_id = events.tenant_id AND cases.id = events.case_id
        WHERE events.tenant_id = ?
          AND events.professional_id = ?
        ORDER BY
          CASE
            WHEN events.event_type = 'assigned' THEN 3
            WHEN events.event_type = 'message_added' THEN 2
            ELSE 1
          END DESC,
          events.occurred_at DESC,
          events.id DESC
      `,
      tenantId,
      professionalId,
    )

    return rows.map((row) => mapNotificationRow(row)).filter((row): row is NotificationRecord => Boolean(row))
  }

  async getAssignmentNotificationById(
    tenantId: number,
    professionalId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null> {
    const row = await this.db.get<{
      id: string
      tenant_id: number
      case_id: string
      professional_id: string
      event_type: string
      occurred_at: string | Date
      payload: unknown
      case_title: string | null
    }>(
      `
        SELECT
          events.id,
          events.tenant_id,
          events.case_id,
          events.professional_id,
          events.event_type,
          events.occurred_at,
          events.payload,
          cases.title AS case_title
        FROM learning_events AS events
        LEFT JOIN cases ON cases.tenant_id = events.tenant_id AND cases.id = events.case_id
        WHERE events.tenant_id = ?
          AND events.professional_id = ?
          AND events.id = ?
      `,
      tenantId,
      professionalId,
      notificationId,
    )

    return mapNotificationRow(row)
  }

  async markAssignmentNotificationRead(
    tenantId: number,
    professionalId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null> {
    const notification = await this.getAssignmentNotificationById(tenantId, professionalId, notificationId)
    if (!notification) {
      return null
    }

    if (notification.isRead) {
      return notification
    }

    const now = new Date().toISOString()
    const nextPayload = {
      ...notification.payload,
      readAt: now,
    }

    const updateSql = this.db.dialect === 'postgres'
      ? `
          UPDATE learning_events
          SET payload = ?::jsonb, updated_at = ?
          WHERE tenant_id = ? AND professional_id = ? AND id = ?
        `
      : `
          UPDATE learning_events
          SET payload = ?, updated_at = ?
          WHERE tenant_id = ? AND professional_id = ? AND id = ?
        `

    await this.db.run(
      updateSql,
      JSON.stringify(nextPayload),
      now,
      tenantId,
      professionalId,
      notificationId,
    )

    return this.getAssignmentNotificationById(tenantId, professionalId, notificationId)
  }
}

export function createCaseRepository(db: BackendDatabase) {
  return new CaseRepository(db)
}
