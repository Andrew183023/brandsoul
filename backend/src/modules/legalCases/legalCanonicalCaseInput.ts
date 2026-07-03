import type {
  CaseMessageDirection,
  CaseMessageStatus,
  CaseMessageType,
  CasePriority,
  CaseStatus,
  JsonObject,
} from './caseTypes.js'

import type {
  CanonicalContactIdentity,
  LegalCanonicalProfessionalIdentity,
} from './legalCanonicalTypes.js'
import { buildCanonicalContactIdentity } from './legalContactNormalization.js'

type PublicTriageUrgency = 'critical' | 'priority' | 'planned'

export type CanonicalCaseInput = {
  caseNumber?: string
  clientName?: string
  contact?: string
  contactPreference?: string
  city?: string
  contactIdentity?: CanonicalContactIdentity
  practiceArea?: string
  priority: CasePriority
  status: CaseStatus
  openedAt: string
  lastInteractionAt: string
  responsibleProfessional?: LegalCanonicalProfessionalIdentity | null
  checklist: unknown[]
  summary?: string
  metadata: JsonObject
  initialMessage: {
    body: string
    direction: CaseMessageDirection
    messageType: CaseMessageType
    messageStatus: CaseMessageStatus
    channel?: string
    subject?: string
    content?: JsonObject
    attachments?: unknown[]
    sentAt?: string
  }
}

type CanonicalCaseInputSnapshot = Omit<CanonicalCaseInput, 'metadata'> & {
  metadata: JsonObject
}

export type CanonicalCaseInputContactSnapshot = {
  clientName?: string
  contact?: string
  contactPreference?: string
  city?: string
  contactIdentity?: CanonicalContactIdentity
}

type PublicTriageBuilderArgs = {
  requestId: string
  userMessage: string
  leadId: string
  intakeId: string
  openedAt?: string
  attribution?: JsonObject
  triage?: {
    context: string
    urgency: PublicTriageUrgency
    objective: string
    contactPreference: string
    contactValue: string
    clientName?: string
    preferredName?: string
    practiceArea?: string
    city?: string
  }
  businessContext?: {
    officeName?: string
  }
}

function asRecord(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as JsonObject
}

function readString(record: JsonObject, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function resolvePriority(urgency: PublicTriageUrgency | undefined): CasePriority {
  if (urgency === 'critical') {
    return 'urgent'
  }

  if (urgency === 'priority') {
    return 'high'
  }

  return 'normal'
}

function buildCanonicalSummary(args: {
  userMessage: string
  triage?: PublicTriageBuilderArgs['triage']
}) {
  const context = args.triage?.context?.trim()
  if (context) {
    return context
  }

  const message = args.userMessage.trim()
  return message || undefined
}

export function readCanonicalCaseInput(value: unknown): CanonicalCaseInput | undefined {
  const record = asRecord(value)
  const metadata = asRecord(record.metadata)
  const initialMessage = asRecord(record.initialMessage)
  const responsibleProfessionalRecord = asRecord(record.responsibleProfessional)

  const status = readString(record, 'status')
  const priority = readString(record, 'priority')
  const openedAt = readString(record, 'openedAt')
  const lastInteractionAt = readString(record, 'lastInteractionAt')
  const initialMessageBody = readString(initialMessage, 'body')
  const initialMessageDirection = readString(initialMessage, 'direction')
  const initialMessageType = readString(initialMessage, 'messageType')
  const initialMessageStatus = readString(initialMessage, 'messageStatus')

  if (!status || !priority || !openedAt || !lastInteractionAt || !initialMessageBody || !initialMessageDirection || !initialMessageType || !initialMessageStatus) {
    return undefined
  }

  const checklist = Array.isArray(record.checklist) ? record.checklist : []

  const responsibleProfessional = Object.keys(responsibleProfessionalRecord).length > 0
    ? {
        id: readString(responsibleProfessionalRecord, 'id') ?? '',
        displayName: readString(responsibleProfessionalRecord, 'displayName') ?? '',
        oabCredential: readString(responsibleProfessionalRecord, 'oabCredential'),
        email: readString(responsibleProfessionalRecord, 'email'),
        phone: readString(responsibleProfessionalRecord, 'phone'),
        photoUrl: readString(responsibleProfessionalRecord, 'photoUrl'),
        specialty: readString(responsibleProfessionalRecord, 'specialty'),
        specialties: Array.isArray(responsibleProfessionalRecord.specialties)
          ? responsibleProfessionalRecord.specialties.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
          : [],
        isResponsible: responsibleProfessionalRecord.isResponsible === true,
        isPublic: responsibleProfessionalRecord.isPublic === true,
        status: readString(responsibleProfessionalRecord, 'status') ?? 'active',
      }
    : null

  return {
    caseNumber: readString(record, 'caseNumber'),
    ...readCanonicalCaseInputContactSnapshot(record),
    practiceArea: readString(record, 'practiceArea'),
    priority: priority as CasePriority,
    status: status as CaseStatus,
    openedAt,
    lastInteractionAt,
    responsibleProfessional,
    checklist,
    summary: readString(record, 'summary'),
    metadata,
    initialMessage: {
      body: initialMessageBody,
      direction: initialMessageDirection as CaseMessageDirection,
      messageType: initialMessageType as CaseMessageType,
      messageStatus: initialMessageStatus as CaseMessageStatus,
      channel: readString(initialMessage, 'channel'),
      subject: readString(initialMessage, 'subject'),
      content: asRecord(initialMessage.content),
      attachments: Array.isArray(initialMessage.attachments) ? initialMessage.attachments : [],
      sentAt: readString(initialMessage, 'sentAt'),
    },
  }
}

export function readCanonicalCaseInputContactSnapshot(value: unknown): CanonicalCaseInputContactSnapshot | undefined {
  const record = asRecord(value)
  const clientName = readString(record, 'clientName')
  const contact = readString(record, 'contact')
  const contactPreference = readString(record, 'contactPreference')
  const city = readString(record, 'city')
  const contactIdentity = buildCanonicalContactIdentity({
    name: readString(asRecord(record.contactIdentity), 'displayName', 'canonicalName') ?? clientName,
    whatsapp:
      readString(asRecord(record.contactIdentity), 'displayWhatsapp', 'canonicalWhatsapp')
      ?? (contactPreference?.toLowerCase() === 'whatsapp' ? contact : undefined),
    phone:
      readString(asRecord(record.contactIdentity), 'displayPhone', 'canonicalPhone')
      ?? (['telefone', 'phone'].includes(contactPreference?.toLowerCase() ?? '') ? contact : undefined),
    email:
      readString(asRecord(record.contactIdentity), 'displayEmail', 'canonicalEmail')
      ?? (contactPreference?.toLowerCase() === 'email' ? contact : undefined),
    city: readString(asRecord(record.contactIdentity), 'displayCity', 'canonicalCity') ?? city,
  })

  if (!clientName && !contact && !contactPreference && !city && !contactIdentity) {
    return undefined
  }

  return {
    clientName,
    contact,
    contactPreference,
    city,
    contactIdentity,
  }
}

export function buildCanonicalCaseInputFromPublicTriage(args: PublicTriageBuilderArgs): CanonicalCaseInput {
  const openedAt = args.openedAt ?? new Date().toISOString()
  const contact = args.triage?.contactValue?.trim() || undefined
  const contactPreference = args.triage?.contactPreference?.trim() || undefined
  const clientName = args.triage?.clientName?.trim() || undefined
  const preferredName = args.triage?.preferredName?.trim() || undefined
  const city = args.triage?.city?.trim() || undefined
  const practiceArea = args.triage?.practiceArea?.trim() || undefined
  const urgency = args.triage?.urgency ?? 'planned'
  const summary = buildCanonicalSummary(args)
  const contactIdentity = buildCanonicalContactIdentity({
    name: clientName,
    whatsapp: contactPreference?.toLowerCase() === 'whatsapp' ? contact : undefined,
    phone: ['telefone', 'phone'].includes(contactPreference?.toLowerCase() ?? '') ? contact : undefined,
    email: contactPreference?.toLowerCase() === 'email' ? contact : undefined,
    city,
  })

  const canonicalCaseInput: CanonicalCaseInput = {
    caseNumber: undefined,
    clientName,
    contact,
    contactPreference,
    city,
    contactIdentity,
    practiceArea,
    priority: resolvePriority(urgency),
    status: 'open',
    openedAt,
    lastInteractionAt: openedAt,
    responsibleProfessional: null,
    checklist: [],
    summary,
    metadata: {},
    initialMessage: {
      body: args.userMessage.trim(),
      direction: 'inbound',
      messageType: 'note',
      messageStatus: 'sent',
      channel: 'public_triage',
      content: {
        source: 'public_triage',
        requestId: args.requestId,
        leadId: args.leadId,
        intakeId: args.intakeId,
      },
    },
  }

  const rootMetadata: JsonObject = {
    source: 'public-triage',
    leadId: args.leadId,
    intakeId: args.intakeId,
    city,
    contact,
    clientName,
    preferredName,
    publicTriage: {
      requestId: args.requestId,
      userMessage: args.userMessage.trim(),
      context: args.triage?.context?.trim() || undefined,
      objective: args.triage?.objective?.trim() || undefined,
      city,
      practiceArea,
      contactPreference,
      contactValue: contact,
      clientName,
      preferredName,
      urgency,
      officeName: args.businessContext?.officeName?.trim() || undefined,
      leadId: args.leadId,
      intakeId: args.intakeId,
      attribution: args.attribution,
    },
  }

  const canonicalCaseInputSnapshot: CanonicalCaseInputSnapshot = {
    ...canonicalCaseInput,
    metadata: rootMetadata,
  }

  canonicalCaseInput.metadata = {
    ...rootMetadata,
    canonicalCaseInput: canonicalCaseInputSnapshot,
  }

  return canonicalCaseInput
}
