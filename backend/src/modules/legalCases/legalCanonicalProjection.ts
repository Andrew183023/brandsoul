import type {
  LegalCanonicalProfessionalIdentity,
  LegalCaseIdentity,
  LegalOfficeIdentity,
} from './legalCanonicalTypes.js'

export type LegalCanonicalOfficeProjection = {
  office: {
    officeId: string
    tenantId: number
    name: string
    logoUrl?: string
    description?: string
    areas: string[]
    oab?: string
    cities: string[]
    coverage?: string
    businessHours?: string
    contacts: {
      phone?: string
      whatsapp?: string
      email?: string
      website?: string
      instagram?: string
    }
    responsibleProfessional?: LegalCanonicalProfessionalIdentity | null
    professionals: LegalCanonicalProfessionalIdentity[]
  }
}

export type LegalCanonicalCaseProjectionSource<
  ChecklistItem = unknown,
  TimelineItem = unknown,
  MessageItem = unknown,
> = LegalCaseIdentity & {
  checklist?: ChecklistItem[]
  timeline?: TimelineItem[]
  messages?: MessageItem[]
}

export type LegalCanonicalCaseProjection<
  ChecklistItem = unknown,
  TimelineItem = unknown,
  MessageItem = unknown,
> = {
  case: {
    caseNumber: string
    caseId: string
    entityId: string
    clientName?: string
    contact?: string
    practiceArea?: string
    city?: string
    priority: LegalCaseIdentity['priority']
    status: LegalCaseIdentity['status']
    sla?: LegalCaseIdentity['sla']
    openedAt: string
    lastInteractionAt?: string
    responsibleProfessional?: LegalCanonicalProfessionalIdentity | null
    checklist: ChecklistItem[]
    timeline: TimelineItem[]
    messages: MessageItem[]
  }
}

function cloneProfessionalIdentity(
  professional: LegalCanonicalProfessionalIdentity | null | undefined,
) {
  if (typeof professional === 'undefined') {
    return undefined
  }

  if (professional === null) {
    return null
  }

  return {
    ...professional,
    specialties: [...professional.specialties],
  }
}

function cloneProfessionalList(professionals: LegalCanonicalProfessionalIdentity[]) {
  return professionals.map((professional) => ({
    ...professional,
    specialties: [...professional.specialties],
  }))
}

export function buildCanonicalOfficeProjection(identity: LegalOfficeIdentity): LegalCanonicalOfficeProjection {
  return {
    office: {
      officeId: identity.officeId,
      tenantId: identity.tenantId,
      name: identity.name,
      logoUrl: identity.logoUrl,
      description: identity.description,
      areas: [...identity.areas],
      oab: identity.oab,
      cities: [...identity.cities],
      coverage: identity.coverage,
      businessHours: identity.businessHours,
      contacts: {
        ...identity.contacts,
      },
      responsibleProfessional: cloneProfessionalIdentity(identity.responsibleProfessional),
      professionals: cloneProfessionalList(identity.professionals),
    },
  }
}

export function buildCanonicalCaseProjection<
  ChecklistItem = unknown,
  TimelineItem = unknown,
  MessageItem = unknown,
>(
  identity: LegalCanonicalCaseProjectionSource<ChecklistItem, TimelineItem, MessageItem>,
): LegalCanonicalCaseProjection<ChecklistItem, TimelineItem, MessageItem> {
  return {
    case: {
      caseNumber: identity.caseNumber,
      caseId: identity.caseId,
      entityId: identity.entityId,
      clientName: identity.client.name,
      contact: identity.client.contact,
      practiceArea: identity.practiceArea,
      city: identity.city,
      priority: identity.priority,
      status: identity.status,
      sla: identity.sla
        ? {
            ...identity.sla,
          }
        : undefined,
      openedAt: identity.openedAt,
      lastInteractionAt: identity.lastInteractionAt,
      responsibleProfessional: cloneProfessionalIdentity(identity.responsibleProfessional),
      checklist: identity.checklist ? [...identity.checklist] : [],
      timeline: identity.timeline ? [...identity.timeline] : [],
      messages: identity.messages ? [...identity.messages] : [],
    },
  }
}
