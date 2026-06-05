import { createHmac, randomBytes } from 'node:crypto'

import type { EntityBusinessConfig } from '../../domain/entityBusinessConfig.js'
import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import type { CaseMessageRecord, CaseRecord, CaseTimelineEventRecord, CaseStatus } from '../../modules/legalCases/caseTypes.js'
import { getJwtSecret } from '../../config/env.js'

type JsonRecord = Record<string, unknown>

export type OfficeProfessionalProjection = {
  id: string
  tenantId: number
  userId?: number
  displayName: string
  email?: string
  phone?: string
  status: 'active' | 'inactive' | 'suspended'
  officeId?: string
  photoUrl?: string
  oabCredential?: string
  specialties: string[]
  bio?: string
  isResponsible: boolean
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export type CasePortalAccessTokenRecord = {
  id: string
  tenant_id: number
  case_id: string
  token_hash: string
  status: 'active' | 'revoked' | 'expired'
  issued_at: string | Date
  expires_at: string | Date
  revoked_at: string | Date | null
  last_used_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

export function safeJsonObject(value: unknown): JsonRecord {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }

  return asRecord(value)
}

export function readRecordString(record: JsonRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMergeRecord<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'undefined') {
      continue
    }

    if (Array.isArray(value)) {
      next[key] = value
      continue
    }

    const current = next[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      next[key] = deepMergeRecord(current, value)
      continue
    }

    next[key] = value
  }

  return next as T
}

export function readEntityBusinessConfig(entityProfile: EntityProfile): EntityBusinessConfig | undefined {
  const metadata = asRecord(entityProfile.metadata)
  const businessConfig = metadata.businessConfig
  return businessConfig && typeof businessConfig === 'object' && !Array.isArray(businessConfig)
    ? businessConfig as EntityBusinessConfig
    : undefined
}

export function writeEntityBusinessConfig(entityProfile: EntityProfile, businessConfig: EntityBusinessConfig): EntityProfile {
  const metadata = asRecord(entityProfile.metadata)
  return {
    ...entityProfile,
    metadata: {
      createdAt: readString(metadata.createdAt) ?? new Date().toISOString(),
      ...metadata,
      businessConfig,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function mergeBusinessConfig(current: EntityBusinessConfig | undefined, patch: Partial<EntityBusinessConfig>) {
  const base: EntityBusinessConfig = current ?? { businessType: 'legal' }
  return deepMergeRecord(base as unknown as Record<string, unknown>, patch as Record<string, unknown>) as EntityBusinessConfig
}

export function validateBusinessConfig(config: EntityBusinessConfig) {
  if (config.businessType !== 'legal') {
    return 'businessType must be "legal".'
  }

  if (typeof config.officeName !== 'undefined' && config.officeName.trim().length === 0) {
    return 'officeName is invalid.'
  }

  return null
}

export function buildOfficeBusinessConfigProjection(
  businessConfig: EntityBusinessConfig | undefined,
  professionals: OfficeProfessionalProjection[],
  officeId: string,
) {
  const projectedTeam = professionals
    .filter((professional) => professional.officeId === officeId || typeof professional.officeId === 'undefined')
    .map((professional) => ({
      id: professional.id,
      name: professional.displayName,
      oabCredential: professional.oabCredential,
      photoUrl: professional.photoUrl,
      specialties: professional.specialties.length > 0 ? professional.specialties : undefined,
      shortBio: professional.bio,
      email: professional.email,
      phone: professional.phone,
      status: professional.status,
      isResponsible: professional.isResponsible,
      isPublic: professional.isPublic,
    }))

  return {
    ...(businessConfig ?? { businessType: 'legal' as const }),
    team: projectedTeam,
  }
}

export function buildPublicOfficeProfile(entityId: string, entityProfile: EntityProfile) {
  const businessConfig = readEntityBusinessConfig(entityProfile)
  const social = asRecord(entityProfile.social)
  const finalForm = asRecord(entityProfile.finalForm)
  const identity = asRecord(finalForm.identity)
  const canonicalIdentity = asRecord(asRecord(entityProfile.canonicalIdentity).identity)
  const canonicalSpark = asRecord(asRecord(entityProfile.canonicalIdentity).spark)

  const name = businessConfig?.officeName
    ?? readString(canonicalIdentity.canonicalName)
    ?? readString(identity.name)
    ?? readString(social.publicName)
    ?? entityId

  const tagline = businessConfig?.publicMessages?.heroMessage
    ?? businessConfig?.description
    ?? businessConfig?.institutionalDescription
    ?? readString(identity.socialLine)
    ?? readString(identity.manifesto)

  return {
    id: entityId,
    name,
    tagline,
    species: readString(canonicalSpark.sparkArchetype) ?? readString(asRecord(entityProfile.manifestation).mode) ?? 'legal',
    avatarExportRef: undefined,
  }
}

export function buildPublicPresencePayload(entityId: string, entityProfile: EntityProfile) {
  const publicProfile = buildPublicOfficeProfile(entityId, entityProfile)
  const businessConfig = readEntityBusinessConfig(entityProfile)
  const legalAreas = businessConfig?.legalAreas ?? []
  const servedCities = businessConfig?.servedCities ?? []
  const activitySummary = legalAreas.length > 0
    ? `Atuação em ${legalAreas.slice(0, 2).join(' e ')}.`
    : 'Perfil público do escritório disponível.'

  return {
    entity: {
      id: entityId,
      name: publicProfile.name,
      tagline: publicProfile.tagline,
      avatarExportRef: publicProfile.avatarExportRef,
      species: publicProfile.species,
    },
    visual: {
      intensity: 0.62,
      presenceHealth: {
        trend: 'stable',
        intensity: 'medium',
        summary: 'Perfil público disponível para triagem inicial.',
        recentSignals: [
          { label: 'Áreas jurídicas', value: legalAreas.length },
          { label: 'Cidades atendidas', value: servedCities.length },
        ],
      },
    },
    relational: {
      relationshipLabel: 'presença jurídica disponível',
      tier: 'growing',
      relationalProjection: {
        summary: 'O escritório mantém presença pública ativa para receber triagens.',
        status: 'active',
        level: 'public-beta',
      },
    },
    trajectory: [
      {
        summary: activitySummary,
        occurredAt: entityProfile.metadata.updatedAt ?? entityProfile.metadata.createdAt,
      },
    ],
    exports: [],
    cta: {
      type: 'interact' as const,
      label: 'Iniciar triagem',
    },
    deprecatedFallbacks: [],
  }
}

export function validateOfficeProfessionalPayload(professional: Record<string, unknown> | undefined) {
  if (!professional) {
    return 'professional is required.'
  }

  if (!readString(professional.displayName)) {
    return 'professional.displayName is invalid.'
  }

  if (typeof professional.specialties !== 'undefined' && !Array.isArray(professional.specialties)) {
    return 'professional.specialties contains invalid entries.'
  }

  if (typeof professional.status !== 'undefined' && !['active', 'inactive', 'suspended'].includes(String(professional.status))) {
    return 'professional.status is invalid.'
  }

  return null
}

export function parseDataUrlPayload(dataUrl: string, acceptedPrefix: 'image' | 'video') {
  const match = dataUrl.match(new RegExp(`^data:(${acceptedPrefix}\\/[a-zA-Z0-9.+-]+);base64,(.+)$`))
  if (!match) {
    return undefined
  }

  const [, contentType, base64Payload] = match
  const content = Buffer.from(base64Payload, 'base64')
  if (content.byteLength === 0) {
    return undefined
  }

  return {
    contentType,
    content,
  }
}

export function hashCasePortalAccessToken(token: string) {
  return createHmac('sha256', getJwtSecret())
    .update(`case-portal:${token}`, 'utf-8')
    .digest('hex')
}

export async function issueCasePortalAccessToken(args: {
  db: BackendDatabase
  tenantId: number
  caseId: string
}) {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24 * 30)).toISOString()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tokenId = randomBytes(12).toString('hex')
    const rawToken = randomBytes(24).toString('base64url')
    const tokenHash = hashCasePortalAccessToken(rawToken)

    try {
      await args.db.run(
        `
          INSERT INTO case_portal_access_tokens (
            id,
            tenant_id,
            case_id,
            token_hash,
            status,
            issued_at,
            expires_at,
            revoked_at,
            last_used_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        tokenId,
        args.tenantId,
        args.caseId,
        tokenHash,
        'active',
        now,
        expiresAt,
        null,
        null,
        now,
        now,
      )

      return {
        tokenId,
        rawToken,
        issuedAt: now,
        expiresAt,
        portalUrl: `/portal/${args.caseId}/${rawToken}`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (attempt < 2 && (message.includes('unique') || message.includes('constraint'))) {
        continue
      }
      throw error
    }
  }

  throw new Error('Failed to issue case portal access token.')
}

export function normalizeTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return undefined
  }

  return typeof value === 'string' ? value : value.toISOString()
}

export function readCaseOutcomeMetadata(metadata: Record<string, unknown>) {
  const outcome = safeJsonObject(metadata.outcome)
  const rating = outcome.rating
  const closedBy = readRecordString(outcome, 'closedBy')
  const closedAt = readRecordString(outcome, 'closedAt')
  const feedback = readRecordString(outcome, 'feedback')
  const firstName = readRecordString(outcome, 'firstName')
  const verifiedClientFeedback = outcome.verifiedClientFeedback === true

  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 || !closedBy || !closedAt) {
    return undefined
  }

  return {
    rating,
    feedback,
    closedBy,
    closedAt,
    verifiedClientFeedback,
    firstName,
  }
}

export function mapPostgresCaseStatus(record: CaseRecord) {
  if (record.status === 'closed' || record.status === 'archived') return 'closed'
  if (record.status === 'pending') return 'pending'
  if (record.status === 'on_hold') return 'on_hold'
  if (record.status === 'dispatched') return 'dispatched'
  if (record.status === 'accepted') return 'accepted'
  if (record.status === 'in_progress' || record.status === 'resolved') return 'in_progress'
  return 'open'
}

export function mapPostgresMessageRole(message: CaseMessageRecord) {
  if (message.direction === 'inbound') return 'user' as const
  if (message.authorProfessionalId || message.direction === 'outbound') return 'lawyer' as const
  return 'system' as const
}

function resolveTimelineStatusSnapshot(payload: JsonRecord, key: 'from' | 'to') {
  const direct = readRecordString(payload, key)
  if (direct) {
    return direct
  }

  const nested = safeJsonObject(payload.status)
  return readRecordString(nested, key)
}

export function mapTimelineEventTypeToLegacyType(eventType: string) {
  if (eventType === 'created') return 'case_opened' as const
  if (eventType === 'message_added') return 'message_added' as const
  if (eventType === 'closed') return 'case_closed' as const
  return 'status_changed' as const
}

export function buildTimelineSummary(event: CaseTimelineEventRecord) {
  const payload = safeJsonObject(event.payload)

  if (event.eventType === 'message_added') {
    return 'Mensagem registrada no caso.'
  }

  if (event.eventType === 'assigned') {
    return 'Caso atribuído.'
  }

  if (event.eventType === 'closed') {
    return 'Caso encerrado.'
  }

  if (event.eventType === 'created') {
    return 'Caso aberto.'
  }

  if (event.eventType === 'status_changed') {
    const fromStatus = resolveTimelineStatusSnapshot(payload, 'from')
    const toStatus = resolveTimelineStatusSnapshot(payload, 'to')
    if (fromStatus && toStatus) {
      return `Status alterado de ${fromStatus} para ${toStatus}.`
    }
    return 'Status do caso atualizado.'
  }

  return `Evento ${event.eventType} registrado.`
}

export function mapTimelineEventToClientLabel(event: CaseTimelineEventRecord) {
  if (event.eventType === 'created') return 'Triagem recebida'
  if (event.eventType === 'assigned') return 'Responsável definido'
  if (event.eventType === 'closed') return 'Caso encerrado'

  if (event.eventType === 'status_changed') {
    const payload = safeJsonObject(event.payload)
    const toStatus = resolveTimelineStatusSnapshot(payload, 'to')

    if (toStatus === 'in_progress' || toStatus === 'accepted' || toStatus === 'resolved') return 'Caso em atendimento'
    if (toStatus === 'pending') return 'Aguardando informações'
    if (toStatus === 'on_hold') return 'Atendimento pausado'
    if (toStatus === 'closed' || toStatus === 'archived') return 'Caso encerrado'
  }

  return undefined
}

export function buildClientPortalTimelineProjection(timeline: CaseTimelineEventRecord[]) {
  return timeline
    .map((event) => {
      const label = mapTimelineEventToClientLabel(event)
      if (!label) {
        return null
      }

      return {
        type: event.eventType,
        label,
        occurredAt: event.occurredAt,
      }
    })
    .filter((event) => Boolean(event))
    .slice(-5)
}

export function resolveCaseAssignmentState(record: CaseRecord) {
  if (record.status === 'closed' || record.status === 'archived') return 'none' as const
  if (!record.leadProfessionalId && record.status === 'dispatched') return 'dispatched' as const
  if (!record.leadProfessionalId) return 'unassigned' as const
  if (record.status === 'accepted') return 'accepted' as const
  if (record.status === 'in_progress' || record.status === 'resolved') return 'active' as const
  if (record.status === 'dispatched') return 'dispatched' as const
  return 'active' as const
}

export function resolveCaseResponseState(record: CaseRecord, messages: CaseMessageRecord[]) {
  if (record.status === 'closed' || record.status === 'archived') return 'closed' as const
  if (record.status === 'open' || record.status === 'pending' || record.status === 'dispatched') return 'waiting_office' as const

  const latestMessage = messages
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]

  if (latestMessage?.direction === 'outbound' || latestMessage?.authorProfessionalId) {
    return 'waiting_client' as const
  }

  return 'active' as const
}

export function normalizeLegacyCase(args: {
  tenantId: number
  caseRecord: CaseRecord
  messages: CaseMessageRecord[]
  timeline: CaseTimelineEventRecord[]
  projectionAssignedProfessionalId?: string
}) {
  const projectionAssignedProfessionalId = args.projectionAssignedProfessionalId ?? args.caseRecord.leadProfessionalId
  const metadata = safeJsonObject(args.caseRecord.metadata)
  const metadataLocation = safeJsonObject(metadata.location)
  const contact = readRecordString(metadata, 'contact')
    ?? readRecordString(safeJsonObject(metadata.contact), 'value')
    ?? readRecordString(safeJsonObject(metadata.contact), 'whatsapp')
    ?? readRecordString(safeJsonObject(metadata.contact), 'phone')
    ?? readRecordString(safeJsonObject(metadata.contact), 'email')
  const city = readRecordString(metadata, 'city') ?? readRecordString(metadataLocation, 'city')

  return {
    id: args.caseRecord.id,
    entityId: args.caseRecord.entityId ?? '',
    status: mapPostgresCaseStatus(args.caseRecord),
    createdAt: args.caseRecord.createdAt,
    updatedAt: args.caseRecord.updatedAt,
    assignedProfessionalId: projectionAssignedProfessionalId,
    assignedLawyerId: projectionAssignedProfessionalId,
    leadProfessionalId: projectionAssignedProfessionalId,
    assignmentState: resolveCaseAssignmentState(args.caseRecord),
    responseState: resolveCaseResponseState(args.caseRecord, args.messages),
    isAssigned: Boolean(projectionAssignedProfessionalId),
    description: args.caseRecord.description?.trim() || args.caseRecord.title,
    practiceArea: args.caseRecord.practiceArea,
    city,
    contact,
    source: 'public-interaction' as const,
    messages: args.messages.map((message) => ({
      id: message.id,
      role: mapPostgresMessageRole(message),
      text: message.body,
      actorId: message.authorProfessionalId,
      createdAt: message.createdAt,
    })),
    timeline: args.timeline.map((event) => ({
      id: event.id,
      type: mapTimelineEventTypeToLegacyType(event.eventType),
      createdAt: event.occurredAt,
      summary: buildTimelineSummary(event),
    })),
    outcome: readCaseOutcomeMetadata(metadata),
    monetization: safeJsonObject(metadata.monetization),
  }
}

export function buildStructuredPublicTriageMessage(request: {
  userMessage: string
  triage?: {
    context: string
    urgency: 'critical' | 'priority' | 'planned'
    objective: string
    contactPreference: string
    contactValue: string
  }
}) {
  if (!request.triage) {
    return request.userMessage.trim()
  }

  return [
    'Triagem pública:',
    `- Contexto: ${request.triage.context.trim()}`,
    `- Urgência: ${request.triage.urgency}`,
    `- Objetivo: ${request.triage.objective.trim()}`,
    `- Contato preferencial: ${request.triage.contactPreference.trim()} - ${request.triage.contactValue.trim()}`,
  ].join('\n')
}

export function buildStructuredPublicTriageTitle(request: {
  businessContext?: { officeName?: string }
  triage?: { practiceArea?: string }
}) {
  const officeName = request.businessContext?.officeName?.trim()
  const practiceArea = request.triage?.practiceArea?.trim()

  if (practiceArea && officeName) return `Triagem pública - ${practiceArea} - ${officeName}`
  if (practiceArea) return `Triagem pública - ${practiceArea}`
  if (officeName) return `Triagem pública - ${officeName}`
  return 'Triagem pública inicial'
}

export function resolvePublicTriagePriority(urgency: 'critical' | 'priority' | 'planned') {
  if (urgency === 'critical') return 'urgent' as const
  if (urgency === 'priority') return 'high' as const
  return 'normal' as const
}

export function buildCaseOutcome(args: {
  currentStatus: CaseStatus
  rating: number
  feedback?: string
  closedBy: string
}) {
  return {
    rating: args.rating,
    feedback: args.feedback,
    closedBy: args.closedBy,
    closedAt: new Date().toISOString(),
    verifiedClientFeedback: false,
    firstName: undefined,
    previousStatus: args.currentStatus,
  }
}
