import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityRepository } from '../repositories/entityRepository.js'

type PublicInteractionBusinessContext = {
  businessType?: string
  description?: string
  catalogSummary?: {
    categories: string[]
    featuredItems: string[]
  }
  servicesSummary?: {
    names: string[]
  }
}

export type LegalCaseMessageRole = 'user' | 'lawyer' | 'system'

export type LegalCaseMessage = {
  id: string
  role: LegalCaseMessageRole
  text: string
  actorId?: string
  createdAt: string
}

export type LegalCaseTimelineEntry = {
  id: string
  type: 'case_opened' | 'message_added' | 'status_changed' | 'case_closed'
  createdAt: string
  summary: string
}

export type LegalCaseOutcome = {
  rating: number
  feedback?: string
  closedBy: string
  closedAt: string
}

export type LegalCaseMonetization = {
  amountCents: number
  currency: 'BRL'
  status: 'pending' | 'paid'
  paymentMode: 'mock-fixed-fee'
  initiatedAt: string
  paidAt?: string
}

export type LegalCaseRecord = {
  id: string
  entityId: string
  status: 'open' | 'assigned' | 'pending' | 'closed'
  createdAt: string
  updatedAt: string
  creatorActorId?: string
  creatorUserId?: number
  creatorTenantId?: number
  assignedLawyerId?: string
  description: string
  city?: string
  contact?: string
  source: 'public-interaction'
  messages: LegalCaseMessage[]
  timeline: LegalCaseTimelineEntry[]
  outcome?: LegalCaseOutcome
  monetization?: LegalCaseMonetization
}

export type LawyerReputationMetrics = {
  lawyerId: string
  assignedCases: number
  closedCases: number
  averageRating: number | null
  ratingCount: number
  averageFirstResponseMinutes: number | null
  mockRevenueCents: number
  closureRate: number
}

export type PublicInteractionActionDecision = {
  intent: 'legal_case' | 'none'
  confidence: number
  slots: {
    description?: string
    city?: string
    contact?: string
  }
  missingFields: Array<'descricao' | 'cidade' | 'contato'>
}

export type PublicInteractionActionResult =
  | {
    actionType: 'create_legal_case'
    status: 'created'
    caseId: string
    missingFields: Array<'descricao' | 'cidade' | 'contato'>
  }
  | {
    actionType: 'create_legal_case'
    status: 'needs_input'
    missingFields: Array<'descricao' | 'cidade' | 'contato'>
  }
  | {
    actionType: 'none'
    status: 'skipped'
  }

const LEGAL_CASE_NOTE_PREFIX = 'legal:case:'
const LEGAL_CASE_ASSIGNMENT_FEE_CENTS = 2_000

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function includesAnyTerm(value: string, terms: string[]) {
  const normalized = normalizeText(value)
  return terms.some((term) => normalized.includes(term))
}

function createLegalCaseId() {
  return `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createMessageId() {
  return `case-msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createTimelineEntryId() {
  return `case-tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function serializeLegalCase(caseRecord: LegalCaseRecord) {
  return `${LEGAL_CASE_NOTE_PREFIX}${JSON.stringify(caseRecord)}`
}

function readLegalCaseNote(note: string): LegalCaseRecord | undefined {
  if (!note.startsWith(LEGAL_CASE_NOTE_PREFIX)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(note.slice(LEGAL_CASE_NOTE_PREFIX.length)) as Partial<LegalCaseRecord>
    if (
      typeof parsed.id === 'string'
      && typeof parsed.entityId === 'string'
      && typeof parsed.status === 'string'
      && typeof parsed.createdAt === 'string'
      && typeof parsed.updatedAt === 'string'
      && typeof parsed.description === 'string'
      && Array.isArray(parsed.messages)
      && Array.isArray(parsed.timeline)
    ) {
      return parsed as LegalCaseRecord
    }
  } catch {
    return undefined
  }

  return undefined
}

function writeLegalCase(entityProfile: EntityProfile, legalCase: LegalCaseRecord): EntityProfile {
  const notes = entityProfile.metadata.notes ?? []
  const filteredNotes = notes.filter((note) => readLegalCaseNote(note)?.id !== legalCase.id)

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      updatedAt: legalCase.updatedAt,
      notes: [
        serializeLegalCase(legalCase),
        ...filteredNotes,
      ].slice(0, 128),
    },
  }
}

function isLegalEntity(entityProfile: EntityProfile, businessContext?: PublicInteractionBusinessContext) {
  return entityProfile.metadata.businessConfig?.businessType === 'legal'
    || entityProfile.metadata.businessConfig?.legalMode?.enabled === true
    || businessContext?.businessType === 'legal'
}

function extractContact(userMessage: string) {
  const emailMatch = userMessage.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (emailMatch?.[0]) {
    return emailMatch[0]
  }

  const phoneMatch = userMessage.match(/(?:\+?\d{2,3}\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/)
  if (phoneMatch?.[0]) {
    return phoneMatch[0].trim()
  }

  const whatsappCue = userMessage.match(/whatsapp[:\s]+([^\n,.]+)/i)
  if (whatsappCue?.[1]) {
    return whatsappCue[1].trim()
  }

  return undefined
}

function extractCity(userMessage: string) {
  const patterns = [
    /\bcidade\s+de\s+([A-Za-zÀ-ÿ'\-\s]{2,40})/i,
    /\bem\s+([A-Za-zÀ-ÿ'\-\s]{2,40})/i,
    /\bmoro\s+em\s+([A-Za-zÀ-ÿ'\-\s]{2,40})/i,
  ]

  for (const pattern of patterns) {
    const match = userMessage.match(pattern)
    const city = match?.[1]?.trim()
    if (city) {
      return city.replace(/[.,;:!?]+$/, '')
    }
  }

  return undefined
}

function extractDescription(userMessage: string) {
  const trimmed = userMessage.trim()
  if (trimmed.length < 16) {
    return undefined
  }

  return trimmed
}

function buildTimelineEntry(type: LegalCaseTimelineEntry['type'], summary: string, createdAt: string): LegalCaseTimelineEntry {
  return {
    id: createTimelineEntryId(),
    type,
    createdAt,
    summary,
  }
}

export function listLegalCases(entityProfile: EntityProfile) {
  return (entityProfile.metadata.notes ?? [])
    .map((note) => readLegalCaseNote(note))
    .filter((legalCase): legalCase is LegalCaseRecord => Boolean(legalCase))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function getLegalCase(entityProfile: EntityProfile, caseId: string) {
  return listLegalCases(entityProfile).find((legalCase) => legalCase.id === caseId)
}

export function buildLawyerReputationMetrics(cases: LegalCaseRecord[], lawyerId: string): LawyerReputationMetrics {
  const assignedCases = cases.filter((legalCase) => legalCase.assignedLawyerId === lawyerId)
  const closedCases = assignedCases.filter((legalCase) => legalCase.status === 'closed')
  const ratedCases = closedCases.filter((legalCase) => typeof legalCase.outcome?.rating === 'number')
  const ratingCount = ratedCases.length
  const mockRevenueCents = assignedCases.reduce((total, legalCase) => total + (legalCase.monetization?.amountCents ?? 0), 0)

  const responseTimesInMinutes = assignedCases.flatMap((legalCase) => {
    const firstUserMessage = legalCase.messages.find((message) => message.role === 'user')
    if (!firstUserMessage) {
      return []
    }

    const firstLawyerReply = legalCase.messages.find((message) => {
      return message.role === 'lawyer' && Date.parse(message.createdAt) > Date.parse(firstUserMessage.createdAt)
    })

    if (!firstLawyerReply) {
      return []
    }

    const firstUserTimestamp = Date.parse(firstUserMessage.createdAt)
    const firstLawyerTimestamp = Date.parse(firstLawyerReply.createdAt)

    if (Number.isNaN(firstUserTimestamp) || Number.isNaN(firstLawyerTimestamp) || firstLawyerTimestamp <= firstUserTimestamp) {
      return []
    }

    return [(firstLawyerTimestamp - firstUserTimestamp) / 60_000]
  })

  return {
    lawyerId,
    assignedCases: assignedCases.length,
    closedCases: closedCases.length,
    averageRating: ratingCount > 0
      ? ratedCases.reduce((total, legalCase) => total + (legalCase.outcome?.rating ?? 0), 0) / ratingCount
      : null,
    ratingCount,
    averageFirstResponseMinutes: responseTimesInMinutes.length > 0
      ? responseTimesInMinutes.reduce((total, minutes) => total + minutes, 0) / responseTimesInMinutes.length
      : null,
    mockRevenueCents,
    closureRate: assignedCases.length > 0 ? closedCases.length / assignedCases.length : 0,
  }
}

export async function getEntityLegalCases(args: {
  repository: EntityRepository
  entityId: string
}) {
  const entity = await args.repository.getEntityById<EntityProfile>(args.entityId)
  if (!entity) {
    return undefined
  }

  return {
    entity,
    cases: listLegalCases(entity.entityProfile as EntityProfile),
  }
}

export async function findLegalCaseById(args: {
  repository: EntityRepository
  caseId: string
}) {
  const entities = await args.repository.listEntities<EntityProfile>(1000)

  for (const entity of entities) {
    const legalCase = getLegalCase(entity.entityProfile as EntityProfile, args.caseId)
    if (legalCase) {
      return {
        entity,
        legalCase,
      }
    }
  }

  return undefined
}

export function decidePublicInteractionAction(args: {
  entityProfile: EntityProfile
  userMessage: string
  businessContext?: PublicInteractionBusinessContext
}): PublicInteractionActionDecision {
  const { entityProfile, userMessage, businessContext } = args
  const description = extractDescription(userMessage)
  const city = extractCity(userMessage)
  const contact = extractContact(userMessage)
  const legalCue = includesAnyTerm(userMessage, [
    'processo',
    'advogado',
    'direito',
    'contrato',
    'indenizacao',
    'indenização',
    'trabalho',
    'demissao',
    'demissão',
    'consumidor',
    'crime',
    'prisao',
    'prisão',
    'guarda',
    'pensao',
    'pensão',
    'cobranca',
    'cobrança',
    'audiencia',
    'audiência',
    'urgente',
    'emergencia',
    'emergência',
    'ajuda agora',
    'fui',
    'recebi',
    'preciso de ajuda',
  ])
  const legalEntity = isLegalEntity(entityProfile, businessContext)
  const confidence = clamp((legalEntity ? 0.46 : 0.1) + (legalCue ? 0.34 : 0) + (description ? 0.16 : 0))
  const missingFields: Array<'descricao' | 'cidade' | 'contato'> = []

  if (!description) {
    missingFields.push('descricao')
  }

  if (!city) {
    missingFields.push('cidade')
  }

  if (!contact) {
    missingFields.push('contato')
  }

  if (!legalEntity || !legalCue) {
    return {
      intent: 'none',
      confidence,
      slots: {
        description,
        city,
        contact,
      },
      missingFields,
    }
  }

  return {
    intent: 'legal_case',
    confidence,
    slots: {
      description,
      city,
      contact,
    },
    missingFields,
  }
}

export async function createLegalCase(args: {
  entityId: string
  entityProfile: EntityProfile
  repository: EntityRepository
  slots: {
    description: string
    city?: string
    contact?: string
  }
  initialUserMessage?: string
  creatorActorId?: string
  creatorUserId?: number
  creatorTenantId?: number
  now?: string
}) {
  const createdAt = args.now ?? new Date().toISOString()
  const userText = args.initialUserMessage?.trim() || args.slots.description
  const legalCase: LegalCaseRecord = {
    id: createLegalCaseId(),
    entityId: args.entityId,
    status: 'open',
    createdAt,
    updatedAt: createdAt,
    creatorActorId: args.creatorActorId,
    creatorUserId: args.creatorUserId,
    creatorTenantId: args.creatorTenantId,
    assignedLawyerId: undefined,
    description: args.slots.description,
    city: args.slots.city,
    contact: args.slots.contact,
    source: 'public-interaction',
    messages: [
      {
        id: createMessageId(),
        role: 'user',
        text: userText,
        createdAt,
      },
      {
        id: createMessageId(),
        role: 'system',
        text: `Caso ${args.entityId} aberto com identificador interno. Aguarde o proximo atendimento dentro da plataforma.`,
        createdAt,
      },
    ],
    timeline: [
      buildTimelineEntry('case_opened', 'Caso juridico aberto a partir de interacao publica.', createdAt),
      buildTimelineEntry('message_added', 'Mensagem inicial registrada no caso.', createdAt),
    ],
  }

  const updatedEntityProfile = writeLegalCase(args.entityProfile, legalCase)
  await args.repository.updateEntity({
    id: args.entityId,
    entityProfile: updatedEntityProfile,
    updatedAt: createdAt,
  })

  return legalCase
}

export async function appendLegalCaseMessage(args: {
  repository: EntityRepository
  caseId: string
  role: LegalCaseMessageRole
  text: string
  actorId?: string
  now?: string
}) {
  const found = await findLegalCaseById({
    repository: args.repository,
    caseId: args.caseId,
  })

  if (!found) {
    return undefined
  }

  const createdAt = args.now ?? new Date().toISOString()
  const nextMessage: LegalCaseMessage = {
    id: createMessageId(),
    role: args.role,
    text: args.text.trim(),
    actorId: args.actorId,
    createdAt,
  }
  const updatedCase: LegalCaseRecord = {
    ...found.legalCase,
    updatedAt: createdAt,
    messages: [
      ...found.legalCase.messages,
      nextMessage,
    ],
    timeline: [
      ...found.legalCase.timeline,
      buildTimelineEntry('message_added', `Mensagem ${args.role} adicionada ao caso.`, createdAt),
    ],
  }

  const updatedEntityProfile = writeLegalCase(found.entity.entityProfile as EntityProfile, updatedCase)
  await args.repository.updateEntity({
    id: found.entity.id,
    entityProfile: updatedEntityProfile,
    updatedAt: createdAt,
  })

  return {
    entityId: found.entity.id,
    legalCase: updatedCase,
    message: nextMessage,
  }
}

export async function assignLegalCase(args: {
  repository: EntityRepository
  caseId: string
  lawyerId: string
  now?: string
}) {
  const found = await findLegalCaseById({
    repository: args.repository,
    caseId: args.caseId,
  })

  if (!found) {
    return {
      status: 'not_found' as const,
    }
  }

  if (found.legalCase.status !== 'open') {
    return {
      status: 'invalid_state' as const,
      legalCase: found.legalCase,
    }
  }

  const changedAt = args.now ?? new Date().toISOString()
  const nextMonetization: LegalCaseMonetization = {
    amountCents: LEGAL_CASE_ASSIGNMENT_FEE_CENTS,
    currency: 'BRL',
    status: 'paid',
    paymentMode: 'mock-fixed-fee',
    initiatedAt: changedAt,
    paidAt: changedAt,
  }
  const updatedCase: LegalCaseRecord = {
    ...found.legalCase,
    status: 'assigned',
    assignedLawyerId: args.lawyerId,
    updatedAt: changedAt,
    monetization: nextMonetization,
    timeline: [
      ...found.legalCase.timeline,
      buildTimelineEntry('status_changed', `Caso atribuido ao advogado ${args.lawyerId}.`, changedAt),
      buildTimelineEntry('status_changed', 'Monetizacao mock registrada no valor fixo de R$20,00 (pending -> paid).', changedAt),
    ],
  }

  const updatedEntityProfile = writeLegalCase(found.entity.entityProfile as EntityProfile, updatedCase)
  await args.repository.updateEntity({
    id: found.entity.id,
    entityProfile: updatedEntityProfile,
    updatedAt: changedAt,
  })

  return {
    status: 'assigned' as const,
    entityId: found.entity.id,
    legalCase: updatedCase,
  }
}

export async function closeLegalCase(args: {
  repository: EntityRepository
  caseId: string
  rating: number
  feedback?: string
  closedBy: string
  now?: string
}) {
  const found = await findLegalCaseById({
    repository: args.repository,
    caseId: args.caseId,
  })

  if (!found) {
    return {
      status: 'not_found' as const,
    }
  }

  if (found.legalCase.status === 'closed') {
    return {
      status: 'invalid_state' as const,
      legalCase: found.legalCase,
    }
  }

  const closedAt = args.now ?? new Date().toISOString()
  const updatedCase: LegalCaseRecord = {
    ...found.legalCase,
    status: 'closed',
    updatedAt: closedAt,
    outcome: {
      rating: args.rating,
      feedback: args.feedback?.trim() || undefined,
      closedBy: args.closedBy,
      closedAt,
    },
    timeline: [
      ...found.legalCase.timeline,
      buildTimelineEntry('case_closed', `Caso finalizado por ${args.closedBy}.`, closedAt),
    ],
  }

  const updatedEntityProfile = writeLegalCase(found.entity.entityProfile as EntityProfile, updatedCase)
  await args.repository.updateEntity({
    id: found.entity.id,
    entityProfile: updatedEntityProfile,
    updatedAt: closedAt,
  })

  return {
    status: 'closed' as const,
    entityId: found.entity.id,
    legalCase: updatedCase,
  }
}

export async function executePublicInteractionAction(args: {
  entityId: string
  entityProfile: EntityProfile
  repository: EntityRepository
  decision: PublicInteractionActionDecision
  initialUserMessage?: string
  creatorActorId?: string
  creatorUserId?: number
  creatorTenantId?: number
  now?: string
}): Promise<PublicInteractionActionResult> {
  if (args.decision.intent !== 'legal_case') {
    return {
      actionType: 'none',
      status: 'skipped',
    }
  }

  if (!args.decision.slots.description) {
    return {
      actionType: 'create_legal_case',
      status: 'needs_input',
      missingFields: args.decision.missingFields,
    }
  }

  const legalCase = await createLegalCase({
    entityId: args.entityId,
    entityProfile: args.entityProfile,
    repository: args.repository,
    slots: {
      description: args.decision.slots.description,
      city: args.decision.slots.city,
      contact: args.decision.slots.contact,
    },
    initialUserMessage: args.initialUserMessage,
    creatorActorId: args.creatorActorId,
    creatorUserId: args.creatorUserId,
    creatorTenantId: args.creatorTenantId,
    now: args.now,
  })

  return {
    actionType: 'create_legal_case',
    status: 'created',
    caseId: legalCase.id,
    missingFields: args.decision.missingFields.filter((field) => field !== 'descricao'),
  }
}

export function buildPublicInteractionActionResponseText(args: {
  entityName: string
  baseResponseText: string
  actionDecision: PublicInteractionActionDecision
  actionResult: PublicInteractionActionResult
}) {
  if (args.actionDecision.intent !== 'legal_case') {
    return args.baseResponseText
  }

  if (args.actionResult.actionType === 'create_legal_case' && args.actionResult.status === 'needs_input') {
    return `Consigo abrir seu caso em ${args.entityName}, mas ainda preciso que voce descreva brevemente o problema para registrar com seguranca.`
  }

  if (args.actionResult.actionType === 'create_legal_case' && args.actionResult.status === 'created') {
    const missingSuffix = args.actionResult.missingFields.length > 0
      ? ` Ainda preciso de ${args.actionResult.missingFields.join(' e ')} para complementar o atendimento.`
      : ''

    return `Seu caso foi registrado em ${args.entityName} com o identificador ${args.actionResult.caseId}.${missingSuffix}`.trim()
  }

  return args.baseResponseText
}
