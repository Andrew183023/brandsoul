import type {
  CaseMessageDirection,
  CaseMessageStatus,
  CaseMessageType,
  CasePriority,
  CaseStatus,
  JsonObject,
} from './caseTypes.js'

import type { LegalCanonicalProfessionalIdentity } from './legalCanonicalTypes.js'

type PublicTriageUrgency = 'critical' | 'priority' | 'planned'

export type CanonicalCaseInput = {
  caseNumber?: string
  clientName?: string
  contact?: string
  contactPreference?: string
  city?: string
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
  }
}

type CanonicalCaseInputSnapshot = Omit<CanonicalCaseInput, 'metadata'> & {
  metadata: JsonObject
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
    clientName: readString(record, 'clientName'),
    contact: readString(record, 'contact'),
    contactPreference: readString(record, 'contactPreference'),
    city: readString(record, 'city'),
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
    },
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

  const canonicalCaseInput: CanonicalCaseInput = {
    caseNumber: undefined,
    clientName,
    contact,
    contactPreference,
    city,
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
